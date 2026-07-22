import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { MAX_VIEWING_KEY } from "@starkware-libs/starknet-privacy-sdk";
import { generateVeilViewingKey } from "../../../tools/generate-veil-viewing-key.ts";
import {
  collectVeilPocIdentitySensitiveValues,
  loadVeilPocIdentityConfig,
} from "../../../tools/veil-poc-identity.ts";
import {
  loadVeilOfficialRegisterPocConfig,
  runVeilOfficialRegisterPoc,
} from "../../../tools/veil-official-register-poc.ts";
import {
  createShieldedMessageIdentityContext,
  loadVeilShieldedMessagePocConfig,
  verifyShieldedMessageRegisteredIdentity,
} from "../../../tools/veil-official-shielded-message-poc.ts";

const ACCOUNT_ADDRESS = "0x123";
const PRIVATE_KEY = "0x456";
const VIEWING_KEY = "0x789";

function identityEnv(overrides = {}) {
  return {
    VEIL_POC_ACCOUNT_ADDRESS: ACCOUNT_ADDRESS,
    VEIL_POC_ACCOUNT_PRIVATE_KEY: PRIVATE_KEY,
    VEIL_POC_VIEWING_KEY: VIEWING_KEY,
    STARKNET_SEPOLIA_RPC_URL: "https://rpc.example",
    VEIL_POC_PROVER_URL: "http://127.0.0.1:3000",
    ...overrides,
  };
}

test("missing VEIL_POC_VIEWING_KEY fails closed", () => {
  const env = identityEnv();
  delete env.VEIL_POC_VIEWING_KEY;
  assert.throws(
    () => loadVeilPocIdentityConfig(env),
    /VEIL_POC_VIEWING_KEY is required/u,
  );
});

test("missing viewing key stops before account preflight or prover creation", async () => {
  const env = identityEnv();
  delete env.VEIL_POC_VIEWING_KEY;
  let proverCreations = 0;
  await assert.rejects(
    () => runVeilOfficialRegisterPoc(env, {
      createProvingProvider() {
        proverCreations += 1;
        throw new Error("must not create prover");
      },
    }),
    /VEIL_POC_VIEWING_KEY is required/u,
  );
  assert.equal(proverCreations, 0);
});

test("zero and out-of-range viewing keys fail closed", () => {
  assert.throws(
    () => loadVeilPocIdentityConfig(identityEnv({ VEIL_POC_VIEWING_KEY: "0x0" })),
    /outside the official SDK viewing-key range/u,
  );
  assert.throws(
    () => loadVeilPocIdentityConfig(identityEnv({
      VEIL_POC_VIEWING_KEY: (MAX_VIEWING_KEY + 1n).toString(),
    })),
    /outside the official SDK viewing-key range/u,
  );
});

test("valid viewing key is forwarded without modulo or derivation", () => {
  const first = loadVeilPocIdentityConfig(identityEnv());
  const second = loadVeilPocIdentityConfig(identityEnv({
    VEIL_POC_ACCOUNT_PRIVATE_KEY: "0x999",
  }));
  assert.equal(first.viewingKey, BigInt(VIEWING_KEY));
  assert.equal(second.viewingKey, BigInt(VIEWING_KEY));
  assert.equal(first.accountPrivateKey, PRIVATE_KEY);
});

test("register and shielded-message configs share one persistent CI identity", () => {
  const env = identityEnv();
  const register = loadVeilOfficialRegisterPocConfig(env);
  const message = loadVeilShieldedMessagePocConfig(env);
  const context = createShieldedMessageIdentityContext(message);

  assert.equal(register.accountAddress, message.identity.accountAddress);
  assert.equal(register.accountPrivateKey, message.identity.accountPrivateKey);
  assert.equal(register.viewingKey, message.identity.viewingKey);
  assert.equal(context.viewingKey, register.viewingKey);
  assert.equal(context.encryptionViewingKey, register.viewingKey);
  assert.equal(context.decryptionViewingKey, register.viewingKey);
});

test("identity sensitive-values list includes raw and canonical viewing key forms", () => {
  const env = identityEnv({ VEIL_POC_VIEWING_KEY: "0x0789" });
  const identity = loadVeilPocIdentityConfig(env);
  const sensitive = collectVeilPocIdentitySensitiveValues(env, identity);
  assert.equal(sensitive.includes("0x0789"), true);
  assert.equal(sensitive.includes("1929"), true);
  assert.equal(sensitive.includes("0x789"), true);
  assert.equal(sensitive.includes(PRIVATE_KEY), true);
});

test("register source has no random viewing-key fallback or account-key derivation", async () => {
  const registerSource = await readFile("tools/veil-official-register-poc.ts", "utf8");
  const identitySource = await readFile("tools/veil-poc-identity.ts", "utf8");
  assert.equal(registerSource.includes("createEphemeralViewingKey"), false);
  assert.equal(registerSource.includes("viewingKey: config.viewingKey"), true);
  assert.equal(identitySource.includes("randomBytes"), false);
  assert.equal(identitySource.includes("getPubKey"), false);
  assert.equal(identitySource.includes("% MAX_VIEWING_KEY"), false);
});

test("shielded-message identity preflight matches the registered public key", async () => {
  const config = loadVeilShieldedMessagePocConfig(identityEnv());
  const context = createShieldedMessageIdentityContext(config);
  const { ec } = await import("starknet");
  const publicKey = ec.starkCurve.getStarkKey(`0x${context.viewingKey.toString(16)}`);
  let call;
  await verifyShieldedMessageRegisteredIdentity({
    config,
    provider: {
      async callContract(input) {
        call = input;
        return [publicKey];
      },
    },
  });
  assert.equal(call.entrypoint, "get_public_key");
  assert.deepEqual(call.calldata, [ACCOUNT_ADDRESS]);

  await assert.rejects(
    () => verifyShieldedMessageRegisteredIdentity({
      config,
      provider: { async callContract() { return ["0x1"]; } },
    }),
    /not registered with the configured viewing key/u,
  );
});

test("viewing-key generator returns a nonzero official-SDK-range value", () => {
  const viewingKey = generateVeilViewingKey();
  assert.equal(viewingKey >= 1n, true);
  assert.equal(viewingKey <= MAX_VIEWING_KEY, true);
});

test("viewing-key generator function does not write files", async () => {
  const directory = await mkdtemp(`${tmpdir()}/veil-viewing-key-generator-`);
  const moduleUrl = pathToFileURL(resolve("tools/generate-veil-viewing-key.ts")).href;
  try {
    execFileSync(process.execPath, [
      "--experimental-strip-types",
      "--input-type=module",
      "--eval",
      `import { generateVeilViewingKey } from ${JSON.stringify(moduleUrl)}; generateVeilViewingKey();`,
    ], {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("workflows validate persistent viewing key before expensive or transactional stages", async () => {
  const registerWorkflow = await readFile(
    ".github/workflows/prover-generic-build-test.yml",
    "utf8",
  );
  const messageWorkflow = await readFile(
    ".github/workflows/veil-official-shielded-message-poc.yml",
    "utf8",
  );
  const validationIndex = registerWorkflow.indexOf("Validate VEIL account inputs");
  const proverBuildIndex = registerWorkflow.indexOf("Build x86-64-v3 transaction prover");
  assert.ok(validationIndex >= 0 && validationIndex < proverBuildIndex);
  assert.equal(
    registerWorkflow.includes("VIEWING_KEY: ${{ secrets.VEIL_POC_VIEWING_KEY }}"),
    true,
  );
  assert.equal(
    registerWorkflow.includes("VEIL_POC_VIEWING_KEY: ${{ secrets.VEIL_POC_VIEWING_KEY }}"),
    true,
  );
  assert.equal(
    messageWorkflow.includes("VEIL_POC_VIEWING_KEY: ${{ secrets.VEIL_POC_VIEWING_KEY }}"),
    true,
  );
  assert.ok(
    messageWorkflow.indexOf("Validate VEIL identity secrets before setup")
      < messageWorkflow.indexOf("Install pinned dependencies"),
  );
  const submissionPreflightIndex = messageWorkflow.indexOf(
    "Preflight shielded-message submission without a transaction",
  );
  assert.ok(submissionPreflightIndex >= 0);
  assert.ok(
    submissionPreflightIndex
      < messageWorkflow.indexOf("Build x86-64-v3 transaction prover"),
  );
  const submissionPreflightStep = messageWorkflow.slice(
    submissionPreflightIndex,
    messageWorkflow.indexOf("Checkout official sequencer release"),
  );
  assert.equal(
    submissionPreflightStep.includes('VEIL_POC_SUBMIT_ONCHAIN: "false"'),
    true,
  );
  assert.equal(
    submissionPreflightStep.includes('VEIL_POC_PREFLIGHT_SUBMISSION: "true"'),
    true,
  );
  assert.equal(messageWorkflow.includes("proof and submission remain disabled"), false);
  assert.equal(
    messageWorkflow.includes(
      'if [ "$GENERATE_PROOF" = "true" ] || [ "$SUBMIT_ONCHAIN" = "true" ]',
    ),
    false,
  );
  assert.equal(messageWorkflow.includes("generate-veil-viewing-key"), false);
  assert.equal(registerWorkflow.includes("generate-veil-viewing-key"), false);
});

test("shielded-message workflow accepts true/true after persistent identity validation", async () => {
  const workflow = await readFile(
    ".github/workflows/veil-official-shielded-message-poc.yml",
    "utf8",
  );
  const extractRunScript = (stepName) => {
    const stepMarker = `      - name: ${stepName}\n`;
    const stepStart = workflow.indexOf(stepMarker);
    assert.ok(stepStart >= 0, `missing workflow step: ${stepName}`);
    const nextStep = workflow.indexOf("\n      - name:", stepStart + stepMarker.length);
    const step = workflow.slice(stepStart, nextStep < 0 ? workflow.length : nextStep);
    const runMarker = "        run: |\n";
    const runStart = step.indexOf(runMarker);
    assert.ok(runStart >= 0, `missing run block: ${stepName}`);
    return step
      .slice(runStart + runMarker.length)
      .split("\n")
      .map((line) => line.startsWith("          ") ? line.slice(10) : line)
      .join("\n");
  };

  const modeOutput = execFileSync(
    "bash",
    ["-c", extractRunScript("Validate shielded-message workflow inputs")],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        GENERATE_PROOF: "true",
        SUBMIT_ONCHAIN: "true",
      },
    },
  );
  assert.equal(modeOutput, "");
  assert.throws(
    () => execFileSync(
      "bash",
      ["-c", extractRunScript("Validate shielded-message workflow inputs")],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GENERATE_PROOF: "false",
          SUBMIT_ONCHAIN: "true",
        },
      },
    ),
    (error) => error.status === 1
      && error.stdout.includes("submit_onchain=true requires generate_proof=true"),
  );

  const syntheticSecrets = {
    ACCOUNT_ADDRESS: "synthetic-account-address",
    ACCOUNT_PRIVATE_KEY: "synthetic-account-private-key",
    VIEWING_KEY: "synthetic-viewing-key",
    RPC_URL: "synthetic-rpc-url",
  };
  const identityOutput = execFileSync(
    "bash",
    ["-c", extractRunScript("Validate VEIL identity secrets before setup")],
    {
      encoding: "utf8",
      env: { ...process.env, ...syntheticSecrets },
    },
  );
  for (const secret of Object.values(syntheticSecrets)) {
    assert.equal(identityOutput.includes(secret), false);
  }
  assert.equal(workflow.includes("secrets.VEIL_POC_PROVER_URL"), false);
  assert.equal(
    workflow.includes("VEIL_POC_PROVER_URL: http://127.0.0.1:3000"),
    true,
  );
});

test("historical write-once account is documented as excluded from message PoCs", async () => {
  const documentation = await readFile(
    "docs/internal/testing/VEIL_POC_IDENTITY_LIFECYCLE.md",
    "utf8",
  );
  assert.equal(
    documentation.includes(
      "0x7bae8c979b6aa680515da41568332952c96e3654805dd2bd1db2a6cc932f4b3",
    ),
    true,
  );
  assert.equal(documentation.includes("write-once"), true);
  assert.equal(documentation.includes("excluded from shielded-message"), true);
});
