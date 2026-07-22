import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  AccountPreflightError,
  ISOLATED_POC_SIGNER_LABEL,
  LocalDiscoveryAccessError,
  LocalFailClosedDiscoveryProvider,
  assertAccountPreflightArtifactSafe,
  assertRegisterProofSummarySafe,
  createOfficialProvingProvider,
  createRegisterProofSummary,
  createStandardPocSigner,
  executeOfficialRegisterProof,
  formatSafeProvingServiceError,
  preflightVeilPocAccount,
  runVeilOfficialRegisterPoc,
  sanitizeProvingDiagnosticData,
  sanitizeProvingDiagnosticText,
  writeSafeProvingServiceError,
} from "../../../tools/veil-official-register-poc.ts";
import {
  ProvingServiceError,
  createEmptyRegistry,
} from "@starkware-libs/starknet-privacy-sdk";
import { constants, ec } from "starknet";

const ACCOUNT_ADDRESS = 0x123n;
const POOL_ADDRESS = 0x456n;
const PRIVATE_KEY = "0x123456789abcdef";
const CURRENT_BLOCK_NUMBER = 123;
const FINALIZED_BLOCK_NUMBER = CURRENT_BLOCK_NUMBER - 10;
const ACCOUNT_CLASS_HASH = "0xdef";

function accountAbi({ ownerGetter = false, signatureValidation = false } = {}) {
  const items = [];
  if (ownerGetter) {
    items.push({
      type: "function",
      name: "get_public_key",
      inputs: [],
      outputs: [{ name: "public_key", type: "core::felt252" }],
      state_mutability: "view",
    });
  }
  if (signatureValidation) {
    items.push({
      type: "function",
      name: "is_valid_signature",
      inputs: [
        { name: "hash", type: "core::felt252" },
        { name: "signature", type: "core::array::Span::<core::felt252>" },
      ],
      outputs: [{ type: "core::felt252" }],
      state_mutability: "view",
    });
  }
  return [{ type: "interface", name: "account", items }];
}

function mockAccountProvider(options = {}) {
  const calls = [];
  return {
    calls,
    async getBlockNumber() {
      calls.push({ method: "getBlockNumber" });
      return CURRENT_BLOCK_NUMBER;
    },
    async getClassHashAt(_address, blockId) {
      calls.push({ method: "getClassHashAt", blockId });
      if (options.notDeployed) throw { code: 20 };
      return ACCOUNT_CLASS_HASH;
    },
    async getNonceForAddress(_address, blockId) {
      calls.push({ method: "getNonceForAddress", blockId });
      return "0x7";
    },
    async getClass(classHash, blockId) {
      calls.push({ method: "getClass", classHash, blockId });
      return { abi: options.abi ?? accountAbi({ ownerGetter: true }) };
    },
    async callContract(call, blockId) {
      calls.push({ method: "callContract", call, blockId });
      if (options.callContract) return options.callContract(call, blockId);
      return [options.ownerPublicKey ?? "0x0"];
    },
  };
}

function mockProvingProvider(options = {}) {
  return {
    async getDefaultDetails() {
      return {
        versions: ["0x3"],
        nonce: 0n,
        skipValidate: true,
        resourceBounds: {
          l1_gas: { max_amount: 1n, max_price_per_unit: 0n },
          l2_gas: { max_amount: 100000000n, max_price_per_unit: 0n },
          l1_data_gas: { max_amount: 1n, max_price_per_unit: 0n },
        },
        tip: 0n,
        paymasterData: [],
        accountDeploymentData: [],
        nonceDataAvailabilityMode: "L1",
        feeDataAvailabilityMode: "L1",
        version: "0x3",
        chainId: constants.StarknetChainId.SN_SEPOLIA,
      };
    },
    async prove(invocation, provingBlockId) {
      assert.ok(invocation.signature.length > 0);
      options.onProve?.(provingBlockId);
      return {
        data: Buffer.from("isolated-register-proof").toString("base64"),
        output: ["0x1"],
        proofFacts: ["0x2"],
      };
    },
  };
}

test("account preflight pins current block minus ten across account state reads", async () => {
  const signer = createStandardPocSigner(PRIVATE_KEY);
  const publicKey = await signer.getPubKey();
  const provider = mockAccountProvider({ ownerPublicKey: publicKey });
  const result = await preflightVeilPocAccount({
    provider,
    accountAddress: ACCOUNT_ADDRESS,
    signer,
    sensitiveValues: [PRIVATE_KEY],
  });

  assert.equal(result.provingBlockId, FINALIZED_BLOCK_NUMBER);
  assert.deepEqual(result.artifact, {
    accountAddress: "0x123",
    blockId: String(FINALIZED_BLOCK_NUMBER),
    nonce: "0x7",
    classHash: ACCOUNT_CLASS_HASH,
    accountType: "SINGLE_OWNER_STARK_ACCOUNT",
    ownerMatch: true,
    signatureValidation: "VALID",
    verdict: "SIGNER_PREFLIGHT_VALID",
  });
  assertAccountPreflightArtifactSafe(result.artifact, [PRIVATE_KEY, publicKey]);
  const stateCalls = provider.calls.filter((call) => call.method !== "getBlockNumber");
  assert.equal(
    stateCalls.every((call) => call.blockId === FINALIZED_BLOCK_NUMBER),
    true,
  );
  assert.equal(
    provider.calls.filter((call) => call.method === "callContract").length,
    1,
  );
});

test("account preflight validates a random non-transaction challenge when no owner getter exists", async () => {
  const signer = createStandardPocSigner(PRIVATE_KEY);
  const publicKey = await signer.getPubKey();
  const fullPublicKey = ec.starkCurve.getPublicKey(PRIVATE_KEY);
  let challengeHash;
  let signatureFelts;
  const provider = mockAccountProvider({
    abi: accountAbi({ signatureValidation: true }),
    callContract(call) {
      assert.equal(call.entrypoint, "is_valid_signature");
      challengeHash = call.calldata[0];
      assert.equal(call.calldata[1], "0x2");
      signatureFelts = call.calldata.slice(2);
      const signature = new ec.starkCurve.Signature(
        BigInt(signatureFelts[0]),
        BigInt(signatureFelts[1]),
      );
      assert.equal(
        ec.starkCurve.verify(signature, challengeHash, fullPublicKey),
        true,
      );
      return ["0x1"];
    },
  });
  const result = await preflightVeilPocAccount({
    provider,
    accountAddress: ACCOUNT_ADDRESS,
    signer,
    sensitiveValues: [PRIVATE_KEY],
  });

  assert.equal(result.artifact.accountType, "SRC6_STARK_ACCOUNT");
  assert.equal(result.artifact.ownerMatch, true);
  assert.equal(result.artifact.signatureValidation, "VALID");
  assert.equal(result.artifact.verdict, "SIGNER_PREFLIGHT_VALID");
  const serialized = JSON.stringify(result.artifact);
  for (const secret of [PRIVATE_KEY, publicKey, challengeHash, ...signatureFelts]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("account preflight emits every fail-closed account verdict", async () => {
  const signer = createStandardPocSigner(PRIVATE_KEY);
  const publicKey = await signer.getPubKey();
  const cases = [
    [
      mockAccountProvider({ ownerPublicKey: `0x${(BigInt(publicKey) + 1n).toString(16)}` }),
      "PRIVATE_KEY_OWNER_MISMATCH",
    ],
    [
      mockAccountProvider({
        abi: accountAbi({ signatureValidation: true }),
        callContract() { return ["0x0"]; },
      }),
      "STANDARD_SIGNER_INCOMPATIBLE",
    ],
    [mockAccountProvider({ abi: accountAbi() }), "ACCOUNT_PREFLIGHT_UNSUPPORTED"],
    [mockAccountProvider({ notDeployed: true }), "ACCOUNT_NOT_DEPLOYED"],
  ];

  for (const [provider, verdict] of cases) {
    const result = await preflightVeilPocAccount({
      provider,
      accountAddress: ACCOUNT_ADDRESS,
      signer,
      sensitiveValues: [PRIVATE_KEY],
    });
    assert.equal(result.artifact.verdict, verdict);
    assert.notEqual(result.artifact.verdict, "SIGNER_PREFLIGHT_VALID");
  }
});

test("failed account preflight writes only the safe artifact and never creates the prover", async () => {
  const directory = await mkdtemp(join(tmpdir(), "veil-account-preflight-"));
  const preflightPath = join(directory, "veil-account-preflight.json");
  const summaryPath = join(directory, "veil-register-proof-summary.json");
  const signer = createStandardPocSigner(PRIVATE_KEY);
  const publicKey = await signer.getPubKey();
  let proverCreations = 0;
  try {
    await assert.rejects(
      () => runVeilOfficialRegisterPoc({
        VEIL_POC_ACCOUNT_PRIVATE_KEY: PRIVATE_KEY,
        VEIL_POC_ACCOUNT_ADDRESS: "0x123",
        VEIL_POC_PROVER_URL: "http://127.0.0.1:3000",
        STARKNET_SEPOLIA_RPC_URL: "https://rpc.example/rpc/v0_9/synthetic-api-key",
        VEIL_POC_SUMMARY_PATH: summaryPath,
      }, {
        accountPreflightProvider: mockAccountProvider({
          ownerPublicKey: `0x${(BigInt(publicKey) + 1n).toString(16)}`,
        }),
        accountPreflightPath: preflightPath,
        createProvingProvider() {
          proverCreations += 1;
          return mockProvingProvider();
        },
      }),
      (error) => error instanceof AccountPreflightError
        && error.artifact.verdict === "PRIVATE_KEY_OWNER_MISMATCH",
    );
    assert.equal(proverCreations, 0);
    const artifactText = await readFile(preflightPath, "utf8");
    const artifact = JSON.parse(artifactText);
    assert.deepEqual(Object.keys(artifact), [
      "accountAddress",
      "blockId",
      "nonce",
      "classHash",
      "accountType",
      "ownerMatch",
      "signatureValidation",
      "verdict",
    ]);
    assert.equal(artifact.verdict, "PRIVATE_KEY_OWNER_MISMATCH");
    for (const secret of [
      PRIVATE_KEY,
      publicKey,
      "synthetic-api-key",
      "https://rpc.example/rpc/v0_9/synthetic-api-key",
    ]) {
      assert.equal(artifactText.includes(secret), false);
    }
    await assert.rejects(() => readFile(summaryPath, "utf8"), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("valid account preflight passes the same finalized block number to the official proof", async () => {
  const directory = await mkdtemp(join(tmpdir(), "veil-account-proof-block-"));
  const preflightPath = join(directory, "veil-account-preflight.json");
  const summaryPath = join(directory, "veil-register-proof-summary.json");
  const signer = createStandardPocSigner(PRIVATE_KEY);
  const publicKey = await signer.getPubKey();
  let providerBlockId;
  let sdkExecuteBlockId;
  let proverCreations = 0;
  try {
    const summary = await runVeilOfficialRegisterPoc({
      VEIL_POC_ACCOUNT_PRIVATE_KEY: PRIVATE_KEY,
      VEIL_POC_ACCOUNT_ADDRESS: "0x123",
      VEIL_POC_PROVER_URL: "http://127.0.0.1:3000",
      STARKNET_SEPOLIA_RPC_URL: "https://rpc.example/rpc/v0_9/synthetic-api-key",
      VEIL_POC_SUMMARY_PATH: summaryPath,
    }, {
      accountPreflightProvider: mockAccountProvider({ ownerPublicKey: publicKey }),
      accountPreflightPath: preflightPath,
      createProvingProvider(config) {
        proverCreations += 1;
        providerBlockId = config.provingBlockId;
        return mockProvingProvider({
          onProve(blockId) {
            sdkExecuteBlockId = blockId;
          },
        });
      },
    });

    assert.equal(proverCreations, 1);
    assert.equal(providerBlockId, FINALIZED_BLOCK_NUMBER);
    assert.equal(sdkExecuteBlockId, FINALIZED_BLOCK_NUMBER);
    assert.equal(summary.provingBlockId, String(FINALIZED_BLOCK_NUMBER));
    const preflight = JSON.parse(await readFile(preflightPath, "utf8"));
    assert.equal(preflight.blockId, String(FINALIZED_BLOCK_NUMBER));
    assert.equal(preflight.verdict, "SIGNER_PREFLIGHT_VALID");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("LocalFailClosedDiscoveryProvider never performs a network request", async () => {
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => {
    networkCalls += 1;
    throw new Error("network must not be called");
  };
  try {
    const provider = new LocalFailClosedDiscoveryProvider();
    const calls = [
      ["discoverNotes", [1n, 2n]],
      ["discoverChannels", [1n, 2n, []]],
      ["discoverRequirement", [1n, 2n, 3n, 4n]],
    ];
    for (const [method, args] of calls) {
      await assert.rejects(
        () => provider[method](...args),
        (error) => error instanceof LocalDiscoveryAccessError
          && error.method === method,
      );
    }
    assert.equal(provider.discoveryCalls, 3);
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("official register builder path does not invoke discovery", async () => {
  const discoveryProvider = new LocalFailClosedDiscoveryProvider();
  const result = await executeOfficialRegisterProof({
    accountAddress: ACCOUNT_ADDRESS,
    signer: createStandardPocSigner(PRIVATE_KEY),
    viewingKey: 0x789n,
    provingProvider: mockProvingProvider(),
    discoveryProvider,
    registry: createEmptyRegistry(),
    poolAddress: POOL_ADDRESS,
    provingBlockId: FINALIZED_BLOCK_NUMBER,
  });

  assert.equal(result.callAndProof.proof.proofFacts.length, 1);
  assert.equal(discoveryProvider.discoveryCalls, 0);
  assert.equal(discoveryProvider.lastMethod, undefined);
});

test("missing standard signer fails closed", async () => {
  assert.throws(
    () => createStandardPocSigner(""),
    new RegExp(ISOLATED_POC_SIGNER_LABEL),
  );
  await assert.rejects(
    () => executeOfficialRegisterProof({
      accountAddress: ACCOUNT_ADDRESS,
      signer: undefined,
      viewingKey: 0x789n,
      provingProvider: mockProvingProvider(),
      discoveryProvider: new LocalFailClosedDiscoveryProvider(),
      registry: createEmptyRegistry(),
      poolAddress: POOL_ADDRESS,
      provingBlockId: FINALIZED_BLOCK_NUMBER,
    }),
    new RegExp(ISOLATED_POC_SIGNER_LABEL),
  );
});

test("missing official prover URL fails closed", () => {
  assert.throws(
    () => createOfficialProvingProvider({
      proverUrl: "",
      rpcUrl: "https://rpc.example/rpc/v0_9",
      poolAddress: POOL_ADDRESS,
      provingBlockId: FINALIZED_BLOCK_NUMBER,
    }),
    /Official prover URL is required/u,
  );
});

test("official prover request serializes the finalized number as block_number", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, init) => {
    request = JSON.parse(init.body);
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        proof: Buffer.from("proof").toString("base64"),
        proof_facts: [],
        l2_to_l1_messages: [],
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const provingProvider = createOfficialProvingProvider({
      proverUrl: "http://127.0.0.1:3000",
      rpcUrl: "https://rpc.example/rpc/v0_9",
      poolAddress: POOL_ADDRESS,
      provingBlockId: FINALIZED_BLOCK_NUMBER,
    });
    await provingProvider.prove({ sender_address: "0x456" });

    assert.equal(request.method, "starknet_proveTransaction");
    assert.deepEqual(request.params.block_id, {
      block_number: FINALIZED_BLOCK_NUMBER,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("register proof summary contains only safe metadata", () => {
  const sensitive = [PRIVATE_KEY, "viewing-material", "signature-material"];
  const summary = createRegisterProofSummary({
    result: {
      callAndProof: {
        call: { contractAddress: "0x456", entrypoint: "apply_actions", calldata: [] },
        proof: {
          data: Buffer.from("proof").toString("base64"),
          output: ["0x1", "0x2"],
          proofFacts: ["0x3"],
        },
      },
      registry: createEmptyRegistry(),
      warnings: [],
    },
    discoveryCalls: 0,
    accountAddress: ACCOUNT_ADDRESS,
    provingBlockId: String(FINALIZED_BLOCK_NUMBER),
  });
  assertRegisterProofSummarySafe(summary, sensitive);
  assert.deepEqual(Object.keys(summary), [
    "result",
    "proofPresent",
    "proofLength",
    "proofFactsCount",
    "l2ToL1OutputCount",
    "discoveryCalls",
    "accountAddress",
    "provingBlockId",
  ]);
  const serialized = JSON.stringify(summary);
  for (const value of sensitive) assert.equal(serialized.includes(value), false);
});

test("proving diagnostic sanitizer redacts URLs and sensitive material", () => {
  const sensitiveHex = `0x${"ab".repeat(32)}`;
  const rpcUrl = "https://rpc.example/v0_9/synthetic-api-key";
  const text = [
    `request failed at ${rpcUrl}`,
    "api_key=synthetic-api-key",
    "signature=synthetic-signature",
    'details={"apiKey":"quoted-synthetic-api-key"}',
    `felt=${sensitiveHex}`,
    `bare=${"ef".repeat(32)}`,
    "transactionPayload=[0x1,0x2,0x3]",
  ].join(" ");

  const sanitizedText = sanitizeProvingDiagnosticText(text);
  for (const sensitive of [
    rpcUrl,
    "synthetic-api-key",
    "synthetic-signature",
    "quoted-synthetic-api-key",
    sensitiveHex,
    "ef".repeat(32),
    "[0x1,0x2,0x3]",
  ]) {
    assert.equal(sanitizedText.includes(sensitive), false);
  }

  const sanitizedData = sanitizeProvingDiagnosticData({
    reason: "Account validation failed",
    rpcUrl,
    apiKey: "synthetic-api-key",
    clientApiKey: "nested-synthetic-api-key",
    privateKey: sensitiveHex,
    signature: [sensitiveHex, sensitiveHex],
    viewingKey: sensitiveHex,
    registry: { secret: sensitiveHex },
    transaction: { calldata: ["0x1", "0x2"] },
    nested: { longHex: sensitiveHex },
  });
  const serialized = JSON.stringify(sanitizedData);
  for (const sensitive of [
    rpcUrl,
    "synthetic-api-key",
    "nested-synthetic-api-key",
    sensitiveHex,
  ]) {
    assert.equal(serialized.includes(sensitive), false);
  }
  assert.equal(serialized.includes("Account validation failed"), true);
});

test("ProvingServiceError formatter and artifact expose only safe fields", async () => {
  const sensitiveHex = `0x${"cd".repeat(32)}`;
  const sensitiveUrl = "https://rpc.example/v0_9/synthetic-api-key";
  const errorData = JSON.stringify({
    reason: "Signature validation failed",
    rpcUrl: sensitiveUrl,
    apiKey: "synthetic-api-key",
    signature: sensitiveHex,
    transactionPayload: { calldata: ["0x1", "0x2"] },
    context: { expected: sensitiveHex, stage: "validate" },
  });
  const error = new ProvingServiceError(55, "Account validation failed", errorData);
  const diagnostic = formatSafeProvingServiceError(error);

  assert.deepEqual(Object.keys(diagnostic), ["name", "code", "message", "data"]);
  assert.equal(diagnostic.name, "ProvingServiceError");
  assert.equal(diagnostic.code, 55);
  assert.equal(diagnostic.message, "Account validation failed");
  assert.equal(diagnostic.data.reason, "Signature validation failed");

  const serialized = JSON.stringify(diagnostic);
  for (const sensitive of [sensitiveUrl, "synthetic-api-key", sensitiveHex, errorData]) {
    assert.equal(serialized.includes(sensitive), false);
  }

  const directory = await mkdtemp(join(tmpdir(), "veil-proving-error-"));
  const outputPath = join(directory, "veil-proving-error.json");
  try {
    const written = await writeSafeProvingServiceError(error, outputPath);
    const artifact = JSON.parse(await readFile(outputPath, "utf8"));
    assert.deepEqual(written, diagnostic);
    assert.deepEqual(artifact, diagnostic);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("removed indexer environment variable is absent from tracked tree", () => {
  const removedName = ["VEIL", "POC", "INDEXER", "URL"].join("_");
  assert.throws(
    () => execFileSync(
      "git",
      ["grep", "--fixed-strings", "--line-number", removedName, "--", "."],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
    (error) => error.status === 1 && error.stdout === "",
  );
});
