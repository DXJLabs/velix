import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ProvingServiceError } from "@starkware-libs/starknet-privacy-sdk";

import {
  createObservedShieldedMessageProofExecutor,
  createSafeShieldedMessageErrorDiagnostic,
  createShieldedMessageRunnerState,
  updateShieldedMessageRunnerStageFromLog,
  writeSafeShieldedMessageErrorDiagnostic,
} from "../../../tools/veil-official-shielded-message-runner.ts";

const PRIVATE_KEY = "0x123456789abcdef";
const VIEWING_KEY = "0x777";
const RPC_URL = "https://rpc.example/rpc/v0_9/synthetic-api-key";
const RAW_PROOF = Buffer.alloc(256, 7).toString("base64");

function fakeProvingServiceError() {
  return Object.assign(Object.create(ProvingServiceError.prototype), {
    name: "ProvingServiceError",
    message: `proof response failed through ${RPC_URL}`,
    code: -32001,
    data: {
      reason: "proof response could not be decoded",
      proof: RAW_PROOF,
      proofFacts: ["0x123"],
      calldata: ["0x456"],
      signature: ["0x789"],
      privateKey: PRIVATE_KEY,
      viewingKey: VIEWING_KEY,
    },
  });
}

test("safe shielded-message diagnostic preserves the useful error and redacts secrets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "veil-shielded-runner-"));
  const outputPath = join(directory, "error.json");
  try {
    const diagnostic = createSafeShieldedMessageErrorDiagnostic({
      error: fakeProvingServiceError(),
      stage: "PROVER_RESPONSE_RECEIVED",
      sensitiveValues: [PRIVATE_KEY, VIEWING_KEY, RPC_URL],
    });
    await writeSafeShieldedMessageErrorDiagnostic(diagnostic, outputPath);
    const text = await readFile(outputPath, "utf8");
    const parsed = JSON.parse(text);

    assert.equal(parsed.stage, "PROVER_RESPONSE_RECEIVED");
    assert.equal(parsed.name, "ProvingServiceError");
    assert.equal(parsed.code, -32001);
    assert.match(parsed.message, /\[REDACTED(?:_URL)?\]/u);
    assert.equal(parsed.data.reason, "proof response could not be decoded");
    for (const sensitive of [
      PRIVATE_KEY,
      VIEWING_KEY,
      RPC_URL,
      RAW_PROOF,
      "0x123",
      "0x456",
      "0x789",
    ]) {
      assert.equal(text.includes(sensitive), false);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("generic Error cause is sanitized without serializing proof material", () => {
  const error = new Error(`outer failure ${PRIVATE_KEY}`, {
    cause: {
      reason: "response shape mismatch",
      proof: RAW_PROOF,
      rpcUrl: RPC_URL,
    },
  });
  const diagnostic = createSafeShieldedMessageErrorDiagnostic({
    error,
    stage: "PROOF_RESULT_VALIDATING",
    sensitiveValues: [PRIVATE_KEY, RPC_URL],
  });
  const serialized = JSON.stringify(diagnostic);

  assert.equal(diagnostic.stage, "PROOF_RESULT_VALIDATING");
  assert.equal(diagnostic.cause.reason, "response shape mismatch");
  assert.equal(serialized.includes(PRIVATE_KEY), false);
  assert.equal(serialized.includes(RAW_PROOF), false);
  assert.equal(serialized.includes(RPC_URL), false);
});

test("observed proof executor distinguishes raw prover response from SDK validation", async () => {
  const state = createShieldedMessageRunnerState();
  const markers = [];
  const originalLog = console.log;
  console.log = (...values) => markers.push(values.join(" "));
  try {
    const observed = createObservedShieldedMessageProofExecutor(state, {
      async execute(input) {
        await input.provingProvider.prove({ sender_address: "0x1" }, 123);
        throw new Error("SDK proof response validation failed");
      },
    });
    await assert.rejects(
      () => observed.execute({
        provingProvider: {
          async prove() {
            return {
              data: RAW_PROOF,
              output: ["0x1"],
              proofFacts: ["0x2"],
            };
          },
        },
      }),
      /SDK proof response validation failed/u,
    );
    assert.equal(state.stage, "PROVER_RESPONSE_RECEIVED");
    assert.equal(
      markers.includes("SHIELDED_MESSAGE_PROVER_RESPONSE_RECEIVED"),
      true,
    );
  } finally {
    console.log = originalLog;
  }
});

test("runner stage markers follow proof and submission lifecycle", () => {
  const state = createShieldedMessageRunnerState();
  updateShieldedMessageRunnerStageFromLog(state, "SIGNER_PREFLIGHT_VALID", true);
  assert.equal(state.stage, "PREFLIGHT_VALID");
  updateShieldedMessageRunnerStageFromLog(
    state,
    "SHIELDED_MESSAGE_PROVING_ZERO_FEE_BOUNDS_VALID",
    true,
  );
  assert.equal(state.stage, "PROVING_INVOCATION_PREPARED");
  updateShieldedMessageRunnerStageFromLog(
    state,
    "OFFICIAL_SDK_SHIELDED_MESSAGE_PROOF_GENERATED",
    true,
  );
  assert.equal(state.stage, "SUBMISSION_ESTIMATING");
  updateShieldedMessageRunnerStageFromLog(
    state,
    "SHIELDED_MESSAGE_SUBMISSION_RESOURCE_ESTIMATE_VALID",
    true,
  );
  assert.equal(state.stage, "SUBMISSION_SENDING");
  updateShieldedMessageRunnerStageFromLog(
    state,
    "SHIELDED_MESSAGE_TRANSACTION_SUBMITTED",
    true,
  );
  assert.equal(state.stage, "WAITING_FOR_RECEIPT");
});
