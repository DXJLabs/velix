import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createEmptyRegistry } from "@starkware-libs/starknet-privacy-sdk";
import { constants, ec, hash, shortString } from "starknet";

import {
  SEPOLIA_HELPER_ADDRESS,
  SEPOLIA_HELPER_CLASS_HASH,
  assertMessageCommittedEvent,
  assertShieldedMessageSummarySafe,
  createShieldedMessageProofSummary,
  createShieldedMessageProvingResourceBounds,
  createShieldedMessageResourceEstimator,
  createShieldedMessageSubmissionResourceBounds,
  loadVeilShieldedMessagePocConfig,
  officialShieldedMessageProofExecutor,
  prepareShieldedMessage,
  runVeilOfficialShieldedMessagePoc,
  submitShieldedMessage,
  verifyLocalShieldedMessageDecrypt,
  verifyShieldedMessageDeployment,
  verifyShieldedMessageStorage,
} from "../../../tools/veil-official-shielded-message-poc.ts";
import {
  createOfficialProvingProvider,
  createStandardPocSigner,
} from "../../../tools/veil-official-register-poc.ts";

const ACCOUNT_ADDRESS = 0x123n;
const PRIVATE_KEY = "0x123456789abcdef";
const VIEWING_KEY = "0x777";
const POOL_ADDRESS =
  "0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5";
const CURRENT_BLOCK = 123;
const PROVING_BLOCK = CURRENT_BLOCK - 10;
const ACCOUNT_CLASS_HASH = "0xdef";
const PLAINTEXT = "VEIL_PRIVATE_MESSAGE_POC_V1";
const RESOURCE_BOUNDS = {
  l1_gas: { max_amount: 1n, max_price_per_unit: 2n },
  l2_gas: { max_amount: 3n, max_price_per_unit: 4n },
  l1_data_gas: { max_amount: 5n, max_price_per_unit: 6n },
};
const RAW_RESOURCE_ESTIMATE = {
  l1_gas: { max_amount: 101n, max_price_per_unit: 11n },
  l1_data_gas: { max_amount: 725n, max_price_per_unit: 13n },
  l2_gas: { max_amount: 1_001n, max_price_per_unit: 17n },
};
const MARGINED_RESOURCE_BOUNDS = {
  l1_gas: { max_amount: 152n, max_price_per_unit: 17n },
  l1_data_gas: { max_amount: 2_175n, max_price_per_unit: 20n },
  l2_gas: { max_amount: 1_502n, max_price_per_unit: 26n },
};
const DEFAULT_PROVING_RESOURCE_BOUNDS = {
  l1_gas: { max_amount: 1n, max_price_per_unit: 0n },
  l1_data_gas: { max_amount: 1n, max_price_per_unit: 0n },
  l2_gas: { max_amount: 100_000_000n, max_price_per_unit: 0n },
};
const PROVING_RESOURCE_BOUNDS = {
  l1_gas: { max_amount: 152n, max_price_per_unit: 0n },
  l1_data_gas: { max_amount: 2_175n, max_price_per_unit: 0n },
  l2_gas: { max_amount: 100_000_000n, max_price_per_unit: 0n },
};
const LATEST_ACCOUNT_NONCE = 9n;

function pocEnv(overrides = {}) {
  return {
    VEIL_POC_ACCOUNT_ADDRESS: `0x${ACCOUNT_ADDRESS.toString(16)}`,
    VEIL_POC_ACCOUNT_PRIVATE_KEY: PRIVATE_KEY,
    VEIL_POC_VIEWING_KEY: VIEWING_KEY,
    STARKNET_SEPOLIA_RPC_URL: "https://rpc.example",
    VEIL_POC_PROVER_URL: "http://127.0.0.1:3000",
    VEIL_POC_GENERATE_PROOF: "false",
    VEIL_POC_SUBMIT_ONCHAIN: "false",
    ...overrides,
  };
}

function executeResult(proofFacts = ["0x2"]) {
  return {
    callAndProof: {
      call: {
        contractAddress: POOL_ADDRESS,
        entrypoint: "apply_actions",
        calldata: ["0xabc"],
      },
      proof: {
        data: Buffer.from("shielded-message-proof").toString("base64"),
        output: ["0x1"],
        proofFacts,
      },
    },
    registry: createEmptyRegistry(),
    warnings: [],
  };
}

function successfulReceipt() {
  return {
    finality_status: "ACCEPTED_ON_L2",
    execution_status: "SUCCEEDED",
    isSuccess() { return true; },
    isReverted() { return false; },
  };
}

async function captureConsoleLog(action) {
  const original = console.log;
  const lines = [];
  console.log = (...values) => {
    lines.push(values.join(" "));
  };
  try {
    return { value: await action(), lines };
  } finally {
    console.log = original;
  }
}

async function preparedFixture(overrides = {}) {
  const config = loadVeilShieldedMessagePocConfig(pocEnv(overrides));
  return { config, prepared: await prepareShieldedMessage({ config }) };
}

function storageProvider(prepared, overrides = {}) {
  return {
    async getClassHashAt() { return SEPOLIA_HELPER_CLASS_HASH; },
    async getTransactionReceipt() {
      return {
        block_number: 321,
        events: [{
          from_address: SEPOLIA_HELPER_ADDRESS,
          keys: [
            hash.getSelectorFromName("MessageCommitted"),
            prepared.messageLocator,
          ],
          data: [prepared.payloadCommitment],
        }],
      };
    },
    async callContract(call) {
      if (overrides.callContract) return overrides.callContract(call);
      if (call.entrypoint === "message_exists") return ["0x1"];
      if (call.entrypoint === "get_message") {
        return [...prepared.helperCalldata.slice(0, 4)];
      }
      if (call.entrypoint === "get_payload_chunk") {
        return [prepared.ciphertextChunks[Number(call.calldata[1])]];
      }
      if (call.entrypoint === "get_privacy_pool") return [POOL_ADDRESS];
      throw new Error(`unexpected entrypoint ${call.entrypoint}`);
    },
  };
}

test("submission without proof generation is rejected", () => {
  assert.throws(
    () => loadVeilShieldedMessagePocConfig(pocEnv({
      VEIL_POC_GENERATE_PROOF: "false",
      VEIL_POC_SUBMIT_ONCHAIN: "true",
    })),
    /submit_onchain=true requires generate_proof=true/u,
  );
});

test("deployed class hash and helper Privacy Pool mismatches fail closed", async () => {
  const { config } = await preparedFixture();
  await assert.rejects(
    () => verifyShieldedMessageDeployment({
      config,
      provingBlockId: PROVING_BLOCK,
      provider: {
        async getClassHashAt() { return "0x1"; },
        async callContract() { return [POOL_ADDRESS]; },
        async getTransactionReceipt() { return {}; },
      },
    }),
    /class hash mismatch/u,
  );
  await assert.rejects(
    () => verifyShieldedMessageDeployment({
      config,
      provingBlockId: PROVING_BLOCK,
      provider: {
        async getClassHashAt() { return SEPOLIA_HELPER_CLASS_HASH; },
        async callContract() { return ["0x1"]; },
        async getTransactionReceipt() { return {}; },
      },
    }),
    /Privacy Pool address mismatch/u,
  );
});

test("canonical envelope matches the Cairo fixture layout and commitment", async () => {
  const { prepared } = await preparedFixture();
  assert.equal(prepared.helperCalldata[0], "1");
  assert.equal(prepared.helperCalldata[1], prepared.messageLocator);
  assert.equal(prepared.helperCalldata[2], prepared.payloadCommitment);
  assert.equal(
    BigInt(prepared.helperCalldata[3]),
    BigInt(prepared.ciphertextChunks.length),
  );
  assert.deepEqual(
    prepared.helperCalldata.slice(4),
    prepared.ciphertextChunks,
  );
  const expected = hash.computePoseidonHashOnElements([
    shortString.encodeShortString("VEIL_MSG_COMMIT_V1"),
    "1",
    prepared.messageLocator,
    String(prepared.ciphertextChunks.length),
    ...prepared.ciphertextChunks,
  ]);
  assert.equal(BigInt(expected), BigInt(prepared.payloadCommitment));
  assert.equal(JSON.stringify(prepared.helperCalldata).includes(PLAINTEXT), false);
});

test("local decrypt succeeds only with the original identity-derived material", async () => {
  const { prepared } = await preparedFixture();
  await verifyLocalShieldedMessageDecrypt({ prepared });
  const tampered = {
    ...prepared,
    sharedSecret: Uint8Array.from(prepared.sharedSecret, (byte, index) =>
      index === 0 ? byte ^ 1 : byte),
  };
  await assert.rejects(
    () => verifyLocalShieldedMessageDecrypt({ prepared: tampered }),
    /authentication failed/u,
  );
});

test("dry-run sends no proof, estimate, or submission request", async () => {
  const directory = await mkdtemp(`${tmpdir()}/veil-shielded-dry-run-`);
  const accountSigner = createStandardPocSigner(PRIVATE_KEY);
  const ownerPublicKey = await accountSigner.getPubKey();
  const viewingPublicKey = ec.starkCurve.getStarkKey(VIEWING_KEY);
  let provingProviders = 0;
  let estimators = 0;
  let submissions = 0;
  const summaryPath = join(directory, "summary.json");
  try {
    const summary = await runVeilOfficialShieldedMessagePoc(pocEnv({
      VEIL_POC_SHIELDED_MESSAGE_SUMMARY_PATH: summaryPath,
    }), {
      accountPreflightPath: join(directory, "preflight.json"),
      accountPreflightProvider: {
        async getBlockNumber() { return CURRENT_BLOCK; },
        async getNonceForAddress() { return "0x1"; },
        async getClassHashAt() { return ACCOUNT_CLASS_HASH; },
        async getClass() {
          return { abi: [{
            type: "function",
            name: "get_public_key",
            inputs: [],
            outputs: [{ type: "core::felt252" }],
          }] };
        },
        async callContract() { return [ownerPublicKey]; },
      },
      chainProvider: {
        async getClassHashAt() { return SEPOLIA_HELPER_CLASS_HASH; },
        async callContract(call) {
          if (call.entrypoint === "get_privacy_pool") return [POOL_ADDRESS];
          if (call.entrypoint === "get_public_key") return [viewingPublicKey];
          throw new Error(`unexpected call ${call.entrypoint}`);
        },
        async getTransactionReceipt() { return {}; },
      },
      createProvingProvider() {
        provingProviders += 1;
        throw new Error("dry-run must not create a proving provider");
      },
      createResourceEstimator() {
        estimators += 1;
        throw new Error("dry-run must not create an estimator");
      },
      createSubmissionAccount() {
        submissions += 1;
        throw new Error("dry-run must not create a submission account");
      },
    });
    assert.equal(summary, null);
    assert.equal(provingProviders, 0);
    assert.equal(estimators, 0);
    assert.equal(submissions, 0);
    await assert.rejects(() => readFile(summaryPath), /ENOENT/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("proof-only uses current block minus ten consistently and sends no transaction", async () => {
  const directory = await mkdtemp(`${tmpdir()}/veil-shielded-proof-only-`);
  const accountSigner = createStandardPocSigner(PRIVATE_KEY);
  const ownerPublicKey = await accountSigner.getPubKey();
  const viewingPublicKey = ec.starkCurve.getStarkKey(VIEWING_KEY);
  const blockReads = [];
  let proofInput;
  let submissionAccounts = 0;
  try {
    const summary = await runVeilOfficialShieldedMessagePoc(pocEnv({
      VEIL_POC_GENERATE_PROOF: "true",
      VEIL_POC_SHIELDED_MESSAGE_SUMMARY_PATH: join(directory, "summary.json"),
    }), {
      accountPreflightPath: join(directory, "preflight.json"),
      accountPreflightProvider: {
        async getBlockNumber() { return CURRENT_BLOCK; },
        async getNonceForAddress(_address, blockId) {
          blockReads.push(blockId);
          return "0x1";
        },
        async getClassHashAt(_address, blockId) {
          blockReads.push(blockId);
          return ACCOUNT_CLASS_HASH;
        },
        async getClass(_classHash, blockId) {
          blockReads.push(blockId);
          return { abi: [{
            type: "interface",
            name: "account",
            items: [{
              type: "function",
              name: "get_public_key",
              inputs: [],
              outputs: [{ type: "core::felt252" }],
            }],
          }] };
        },
        async callContract(_call, blockId) {
          blockReads.push(blockId);
          return [ownerPublicKey];
        },
      },
      chainProvider: {
        async getClassHashAt(_address, blockId) {
          blockReads.push(blockId);
          return SEPOLIA_HELPER_CLASS_HASH;
        },
        async callContract(call, blockId) {
          blockReads.push(blockId);
          if (call.entrypoint === "get_privacy_pool") return [POOL_ADDRESS];
          if (call.entrypoint === "get_public_key") return [viewingPublicKey];
          throw new Error("unexpected call");
        },
        async getTransactionReceipt() { return {}; },
      },
      createProvingProvider(config) {
        assert.equal(config.provingBlockId, PROVING_BLOCK);
        return { invalidateNonceCache() {} };
      },
      proofExecutor: {
        async execute(input) {
          proofInput = input;
          return {
            result: executeResult(),
            provingResourceBounds: PROVING_RESOURCE_BOUNDS,
          };
        },
      },
      createResourceEstimator() {
        return {
          async estimateInvokeV3() { return RAW_RESOURCE_ESTIMATE; },
        };
      },
      createSubmissionAccount() {
        submissionAccounts += 1;
        throw new Error("must not submit");
      },
    });
    assert.equal(summary.provingBlockId, String(PROVING_BLOCK));
    assert.equal(proofInput.provingBlockId, PROVING_BLOCK);
    assert.equal(blockReads.every((value) => value === PROVING_BLOCK), true);
    assert.equal(submissionAccounts, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("official prover serializes the finalized number as block_number", async () => {
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
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const provider = createOfficialProvingProvider({
      proverUrl: "http://127.0.0.1:3000",
      rpcUrl: "https://rpc.example",
      poolAddress: BigInt(POOL_ADDRESS),
      provingBlockId: PROVING_BLOCK,
    });
    await provider.prove({ sender_address: POOL_ADDRESS });
    assert.deepEqual(request.params.block_id, { block_number: PROVING_BLOCK });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("official SDK compiles OpenChannel before InvokeExternal for the first self message", async () => {
  const { config, prepared } = await preparedFixture();
  let provedBlock;
  let invocation;
  let invalidations = 0;
  const lifecycle = [];
  const { value: execution, lines: diagnostics } = await captureConsoleLog(
    () => officialShieldedMessageProofExecutor.execute({
    config,
    signer: createStandardPocSigner(PRIVATE_KEY),
    provingBlockId: PROVING_BLOCK,
    prepared,
    provider: {
      async getClassHashAt() { return SEPOLIA_HELPER_CLASS_HASH; },
      async getTransactionReceipt() { return {}; },
      async callContract(call, blockId) {
        assert.equal(blockId, PROVING_BLOCK);
        if (call.entrypoint === "get_num_of_channels") return ["0x0"];
        if (call.entrypoint === "get_public_key") {
          return [ec.starkCurve.getStarkKey(VIEWING_KEY)];
        }
        throw new Error(`unexpected discovery call ${call.entrypoint}`);
      },
    },
    provingProvider: {
      invalidateNonceCache() {
        invalidations += 1;
        lifecycle.push("invalidate");
      },
      async getDefaultDetails() {
        lifecycle.push("details");
        return {
          versions: ["0x3"],
          nonce: 0n,
          skipValidate: true,
          resourceBounds: DEFAULT_PROVING_RESOURCE_BOUNDS,
          tip: 0n,
          paymasterData: [],
          accountDeploymentData: [],
          nonceDataAvailabilityMode: "L1",
          feeDataAvailabilityMode: "L1",
          version: "0x3",
          chainId: constants.StarknetChainId.SN_SEPOLIA,
        };
      },
      async prove(input, blockId) {
        lifecycle.push("prove");
        invocation = input;
        provedBlock = blockId;
        return executeResult().callAndProof.proof;
      },
    },
    resourceEstimator: {
      async estimateInvokeV3(input) {
        lifecycle.push("estimate");
        assert.equal(BigInt(input.sender_address), BigInt(POOL_ADDRESS));
        return RAW_RESOURCE_ESTIMATE;
      },
    },
    }),
  );
  const { result } = execution;
  assert.equal(invalidations, 1);
  assert.equal(lifecycle[0], "invalidate");
  assert.equal(lifecycle.indexOf("estimate") < lifecycle.indexOf("prove"), true);
  assert.deepEqual(
    execution.provingResourceBounds,
    PROVING_RESOURCE_BOUNDS,
  );
  assert.equal(
    diagnostics.includes("SHIELDED_MESSAGE_RESOURCE_ESTIMATE_VALID"),
    true,
  );
  assert.equal(
    diagnostics.includes("SHIELDED_MESSAGE_PROVING_ZERO_FEE_BOUNDS_VALID"),
    true,
  );
  const diagnosticOutput = diagnostics.join("\n");
  for (const sensitive of [
    PRIVATE_KEY,
    VIEWING_KEY,
    PLAINTEXT,
    executeResult().callAndProof.proof.data,
  ]) {
    assert.equal(diagnosticOutput.includes(sensitive), false);
  }
  assert.equal(diagnostics.some((line) => line.includes("l1_gas.max_amount")), true);
  assert.equal(
    diagnostics.some((line) => line.includes("l1_data_gas.max_amount")),
    true,
  );
  assert.equal(diagnostics.some((line) => line.includes("l2_gas.max_amount")), true);
  assert.equal(lifecycle.filter((event) => event === "prove").length, 1);
  assert.equal(provedBlock, PROVING_BLOCK);
  assert.equal(BigInt(invocation.sender_address), BigInt(POOL_ADDRESS));
  assert.equal(invocation.calldata.some((felt) => BigInt(felt) === BigInt(SEPOLIA_HELPER_ADDRESS)), true);
  assert.equal(invocation.calldata.some((felt) => BigInt(felt) === BigInt(prepared.messageLocator)), true);
  const expectedHelperSpan = [
    BigInt(prepared.helperCalldata.length),
    ...prepared.helperCalldata.map((felt) => BigInt(felt)),
  ];
  const invocationCalldata = invocation.calldata.map((felt) => BigInt(felt));
  assert.equal(invocationCalldata.some((_, start) =>
    expectedHelperSpan.every((felt, offset) =>
      invocationCalldata[start + offset] === felt)), true);
  for (const resource of ["l1_gas", "l1_data_gas", "l2_gas"]) {
    assert.equal(
      BigInt(invocation.resource_bounds[resource].max_amount),
      PROVING_RESOURCE_BOUNDS[resource].max_amount,
    );
    assert.equal(
      BigInt(invocation.resource_bounds[resource].max_price_per_unit),
      0n,
    );
  }
  assert.equal(BigInt(invocation.tip), 0n);
  assert.equal(result.callAndProof.call.entrypoint, "apply_actions");
  assert.throws(
    () => {
      execution.provingResourceBounds.l1_gas.max_amount = 999n;
    },
    TypeError,
  );
  let estimatedCall;
  let estimatedDetails;
  let submittedDetails;
  const { lines: submissionDiagnostics } = await captureConsoleLog(
    () => submitShieldedMessage({
      config,
      provider: storageProvider(prepared),
      account: {
        async getNonce(blockIdentifier) {
          lifecycle.push("account-nonce");
          assert.equal(blockIdentifier, "latest");
          return `0x${LATEST_ACCOUNT_NONCE.toString(16)}`;
        },
        async estimateInvokeFee(call, details) {
          lifecycle.push("outer-estimate");
          estimatedCall = call;
          estimatedDetails = details;
          return { resourceBounds: RAW_RESOURCE_ESTIMATE };
        },
        async execute(_call, details) {
          lifecycle.push("execute");
          submittedDetails = details;
          return { transaction_hash: "0x789" };
        },
        async waitForTransaction() { return successfulReceipt(); },
      },
      provingProvider: { invalidateNonceCache() {} },
      provingBlockId: PROVING_BLOCK,
      prepared,
      result,
    }),
  );
  assert.equal(
    lifecycle.indexOf("prove") < lifecycle.indexOf("account-nonce"),
    true,
  );
  assert.equal(
    lifecycle.indexOf("account-nonce") < lifecycle.indexOf("outer-estimate"),
    true,
  );
  assert.equal(
    lifecycle.indexOf("outer-estimate") < lifecycle.indexOf("execute"),
    true,
  );
  assert.equal(estimatedCall, result.callAndProof.call);
  assert.deepEqual(estimatedDetails, {
    tip: 0n,
    nonce: LATEST_ACCOUNT_NONCE,
    proof: result.callAndProof.proof.data,
    proofFacts: result.callAndProof.proof.proofFacts,
  });
  assert.deepEqual(submittedDetails.resourceBounds, MARGINED_RESOURCE_BOUNDS);
  assert.notDeepEqual(
    submittedDetails.resourceBounds,
    execution.provingResourceBounds,
  );
  assert.equal(
    submissionDiagnostics.includes(
      "SHIELDED_MESSAGE_SUBMISSION_RESOURCE_ESTIMATE_VALID",
    ),
    true,
  );
  const allDiagnostics = [...diagnostics, ...submissionDiagnostics].join("\n");
  for (const sensitive of [
    PRIVATE_KEY,
    VIEWING_KEY,
    PLAINTEXT,
    result.callAndProof.proof.data,
  ]) {
    assert.equal(allDiagnostics.includes(sensitive), false);
  }
});

test("submission uses tip zero and includes non-empty proof facts", async () => {
  const { config, prepared } = await preparedFixture();
  const calls = [];
  const provider = storageProvider(prepared);
  const summary = await submitShieldedMessage({
    config,
    provider,
    account: {
      async getNonce(blockIdentifier) {
        assert.equal(blockIdentifier, "latest");
        return `0x${LATEST_ACCOUNT_NONCE.toString(16)}`;
      },
      async estimateInvokeFee(call, details) {
        calls.push({ stage: "estimate", call, details });
        return { resourceBounds: RAW_RESOURCE_ESTIMATE };
      },
      async execute(call, details) {
        calls.push({ stage: "execute", call, details });
        return { transaction_hash: "0x789" };
      },
      async waitForTransaction() { return successfulReceipt(); },
    },
    provingProvider: { invalidateNonceCache() {} },
    provingBlockId: PROVING_BLOCK,
    prepared,
    result: executeResult(["0x2", "0x3"]),
  });
  assert.deepEqual(calls[0].details, {
    tip: 0n,
    nonce: LATEST_ACCOUNT_NONCE,
    proof: executeResult().callAndProof.proof.data,
    proofFacts: ["0x2", "0x3"],
  });
  assert.deepEqual(calls[1].details, {
    ...calls[0].details,
    resourceBounds: MARGINED_RESOURCE_BOUNDS,
  });
  assert.equal(calls[0].stage, "estimate");
  assert.equal(calls[1].stage, "execute");
  assert.notDeepEqual(calls[1].details.proofFacts, []);
  assert.equal(summary.messageEventFound, true);
  assert.equal(summary.storageVerified, true);
  assert.equal(summary.localDecryptVerified, true);
});

test("network estimate receives deterministic bigint margins without fixed fallbacks", () => {
  const submissionBounds = createShieldedMessageSubmissionResourceBounds(
    RAW_RESOURCE_ESTIMATE,
  );
  const provingBounds = createShieldedMessageProvingResourceBounds(
    RAW_RESOURCE_ESTIMATE,
    DEFAULT_PROVING_RESOURCE_BOUNDS,
  );
  assert.deepEqual(submissionBounds, MARGINED_RESOURCE_BOUNDS);
  assert.deepEqual(provingBounds, PROVING_RESOURCE_BOUNDS);
  assert.equal(
    submissionBounds.l1_data_gas.max_amount,
    RAW_RESOURCE_ESTIMATE.l1_data_gas.max_amount * 3n,
  );
  assert.equal(
    submissionBounds.l1_gas.max_amount
      > RAW_RESOURCE_ESTIMATE.l1_gas.max_amount,
    true,
  );
  assert.equal(
    submissionBounds.l2_gas.max_amount
      > RAW_RESOURCE_ESTIMATE.l2_gas.max_amount,
    true,
  );
  assert.equal(
    submissionBounds.l1_gas.max_price_per_unit
      > RAW_RESOURCE_ESTIMATE.l1_gas.max_price_per_unit,
    true,
  );
  assert.equal(
    submissionBounds.l1_data_gas.max_price_per_unit
      > RAW_RESOURCE_ESTIMATE.l1_data_gas.max_price_per_unit,
    true,
  );
  assert.equal(
    submissionBounds.l2_gas.max_price_per_unit
      > RAW_RESOURCE_ESTIMATE.l2_gas.max_price_per_unit,
    true,
  );
  assert.equal(
    provingBounds.l2_gas.max_amount,
    DEFAULT_PROVING_RESOURCE_BOUNDS.l2_gas.max_amount,
  );
  const estimateAboveDefault = {
    ...RAW_RESOURCE_ESTIMATE,
    l2_gas: {
      ...RAW_RESOURCE_ESTIMATE.l2_gas,
      max_amount: DEFAULT_PROVING_RESOURCE_BOUNDS.l2_gas.max_amount,
    },
  };
  const provingAboveDefault = createShieldedMessageProvingResourceBounds(
    estimateAboveDefault,
    DEFAULT_PROVING_RESOURCE_BOUNDS,
  );
  assert.equal(
    provingAboveDefault.l2_gas.max_amount,
    DEFAULT_PROVING_RESOURCE_BOUNDS.l2_gas.max_amount * 3n / 2n,
  );
  for (const resource of ["l1_gas", "l1_data_gas", "l2_gas"]) {
    assert.equal(provingBounds[resource].max_price_per_unit, 0n);
  }
  assert.equal(Object.isFrozen(submissionBounds), true);
  assert.equal(Object.isFrozen(provingBounds), true);
});

test("official proving estimator uses latest Invoke V3 state", async () => {
  const reads = [];
  const estimator = createShieldedMessageResourceEstimator(
    "https://rpc.example",
    {
      async getEstimateFeeBulk(invocations, options) {
        reads.push({ kind: "estimate", options });
        assert.equal(invocations.length, 1);
        assert.equal(invocations[0].type, "INVOKE");
        assert.equal(
          BigInt(invocations[0].contractAddress),
          BigInt(POOL_ADDRESS),
        );
        assert.deepEqual(invocations[0].paymasterData, []);
        assert.deepEqual(invocations[0].accountDeploymentData, []);
        return [{ resourceBounds: RAW_RESOURCE_ESTIMATE }];
      },
    },
  );
  const estimate = await estimator.estimateInvokeV3({
    type: "INVOKE",
    sender_address: POOL_ADDRESS,
    calldata: ["0x1"],
    signature: ["0x2", "0x3"],
    nonce: "0x4",
    resource_bounds: {
      l1_gas: { max_amount: "0x1", max_price_per_unit: "0x0" },
      l1_data_gas: { max_amount: "0x1", max_price_per_unit: "0x0" },
      l2_gas: { max_amount: "0x1", max_price_per_unit: "0x0" },
    },
    tip: "0x0",
    paymaster_data: [],
    account_deployment_data: [],
    nonce_data_availability_mode: "L1",
    fee_data_availability_mode: "L1",
    version: "0x3",
  });
  assert.equal(estimate, RAW_RESOURCE_ESTIMATE);
  assert.deepEqual(reads, [
    {
      kind: "estimate",
      options: { blockIdentifier: "latest", skipValidate: true },
    },
  ]);
});

test("estimation failure stops before proof generation", async () => {
  const { config, prepared } = await preparedFixture();
  let proveCalls = 0;
  await assert.rejects(
    () => officialShieldedMessageProofExecutor.execute({
      config,
      signer: createStandardPocSigner(PRIVATE_KEY),
      provingBlockId: PROVING_BLOCK,
      prepared,
      provider: {
        async getClassHashAt() { return SEPOLIA_HELPER_CLASS_HASH; },
        async getTransactionReceipt() { return {}; },
        async callContract(call) {
          if (call.entrypoint === "get_num_of_channels") return ["0x0"];
          if (call.entrypoint === "get_public_key") {
            return [ec.starkCurve.getStarkKey(VIEWING_KEY)];
          }
          throw new Error(`unexpected discovery call ${call.entrypoint}`);
        },
      },
      provingProvider: {
        invalidateNonceCache() {},
        async getDefaultDetails() {
          return {
            versions: ["0x3"],
            nonce: 7n,
            skipValidate: true,
            resourceBounds: RESOURCE_BOUNDS,
            tip: 0n,
            paymasterData: [],
            accountDeploymentData: [],
            nonceDataAvailabilityMode: "L1",
            feeDataAvailabilityMode: "L1",
            version: "0x3",
            chainId: constants.StarknetChainId.SN_SEPOLIA,
          };
        },
        async prove() {
          proveCalls += 1;
          return executeResult().callAndProof.proof;
        },
      },
      resourceEstimator: {
        async estimateInvokeV3() {
          throw new Error("network estimate unavailable");
        },
      },
    }),
    /network estimate unavailable/u,
  );
  assert.equal(proveCalls, 0);
});

test("proofFacts empty is never sent", async () => {
  const { config, prepared } = await preparedFixture();
  let estimateDetails;
  let details;
  await submitShieldedMessage({
    config,
    provider: storageProvider(prepared),
    account: {
      async getNonce() {
        return `0x${LATEST_ACCOUNT_NONCE.toString(16)}`;
      },
      async estimateInvokeFee(_call, input) {
        estimateDetails = input;
        return { resourceBounds: RAW_RESOURCE_ESTIMATE };
      },
      async execute(_call, input) {
        details = input;
        return { transaction_hash: "0x789" };
      },
      async waitForTransaction() { return successfulReceipt(); },
    },
    provingProvider: { invalidateNonceCache() {} },
    provingBlockId: PROVING_BLOCK,
    prepared,
    result: executeResult([]),
  });
  assert.deepEqual(estimateDetails, {
    tip: 0n,
    nonce: LATEST_ACCOUNT_NONCE,
  });
  assert.deepEqual(details, {
    ...estimateDetails,
    resourceBounds: MARGINED_RESOURCE_BOUNDS,
  });
  assert.equal(Object.hasOwn(estimateDetails, "proof"), false);
  assert.equal(Object.hasOwn(estimateDetails, "proofFacts"), false);
  assert.equal(Object.hasOwn(details, "proof"), false);
  assert.equal(Object.hasOwn(details, "proofFacts"), false);
});

test("reverted receipt fails and invalidates the official nonce cache", async () => {
  const { config, prepared } = await preparedFixture();
  let invalidations = 0;
  await assert.rejects(
    () => submitShieldedMessage({
      config,
      provider: storageProvider(prepared),
      account: {
        async getNonce() {
          return `0x${LATEST_ACCOUNT_NONCE.toString(16)}`;
        },
        async estimateInvokeFee() {
          return { resourceBounds: RAW_RESOURCE_ESTIMATE };
        },
        async execute() { return { transaction_hash: "0x789" }; },
        async waitForTransaction() {
          return {
            finality_status: "ACCEPTED_ON_L2",
            execution_status: "REVERTED",
            isSuccess() { return false; },
            isReverted() { return true; },
          };
        },
      },
      provingProvider: {
        invalidateNonceCache() { invalidations += 1; },
      },
      provingBlockId: PROVING_BLOCK,
      prepared,
      result: executeResult(),
    }),
    /not accepted and successful on L2/u,
  );
  assert.equal(invalidations, 1);
});

test("outer submission estimation failure sends no transaction", async () => {
  const { config, prepared } = await preparedFixture();
  let executeCalls = 0;
  let invalidations = 0;
  await assert.rejects(
    () => submitShieldedMessage({
      config,
      provider: storageProvider(prepared),
      account: {
        async getNonce(blockIdentifier) {
          assert.equal(blockIdentifier, "latest");
          return `0x${LATEST_ACCOUNT_NONCE.toString(16)}`;
        },
        async estimateInvokeFee(_call, details) {
          assert.deepEqual(details, {
            tip: 0n,
            nonce: LATEST_ACCOUNT_NONCE,
            proof: executeResult().callAndProof.proof.data,
            proofFacts: ["0x2"],
          });
          throw new Error("outer Invoke V3 estimate unavailable");
        },
        async execute() {
          executeCalls += 1;
          return { transaction_hash: "0x789" };
        },
        async waitForTransaction() { return successfulReceipt(); },
      },
      provingProvider: {
        invalidateNonceCache() { invalidations += 1; },
      },
      provingBlockId: PROVING_BLOCK,
      prepared,
      result: executeResult(),
    }),
    /outer Invoke V3 estimate unavailable/u,
  );
  assert.equal(executeCalls, 0);
  assert.equal(invalidations, 1);
});

test("missing event and storage chunk mismatch fail closed", async () => {
  const { prepared } = await preparedFixture();
  assert.throws(
    () => assertMessageCommittedEvent({
      receipt: { events: [] },
      helperAddress: BigInt(SEPOLIA_HELPER_ADDRESS),
      messageLocator: prepared.messageLocator,
      payloadCommitment: prepared.payloadCommitment,
    }),
    /event was not found/u,
  );
  await assert.rejects(
    () => verifyShieldedMessageStorage({
      provider: storageProvider(prepared, {
        callContract(call) {
          if (call.entrypoint === "message_exists") return ["0x1"];
          if (call.entrypoint === "get_message") {
            return [...prepared.helperCalldata.slice(0, 4)];
          }
          if (call.entrypoint === "get_payload_chunk") return ["0x1"];
          throw new Error("unexpected call");
        },
      }),
      helperAddress: BigInt(SEPOLIA_HELPER_ADDRESS),
      prepared,
    }),
    /ciphertext chunk mismatch/u,
  );
});

test("summary contains only allowed fields and no plaintext or secrets", async () => {
  const { config, prepared } = await preparedFixture();
  const summary = createShieldedMessageProofSummary({
    config,
    provingBlockId: PROVING_BLOCK,
    prepared,
    result: executeResult(),
  });
  assertShieldedMessageSummarySafe(summary, [PRIVATE_KEY, VIEWING_KEY]);
  assert.equal(summary.localDecryptVerified, true);
  assert.deepEqual(Object.keys(summary), [
    "result",
    "network",
    "helperAddress",
    "privacyPoolAddress",
    "accountAddress",
    "provingBlockId",
    "transactionHash",
    "finalityStatus",
    "executionStatus",
    "messageLocator",
    "payloadCommitment",
    "ciphertextChunkCount",
    "proofPresent",
    "proofFactsCount",
    "messageEventFound",
    "storageVerified",
    "localDecryptVerified",
  ]);
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes(PLAINTEXT), false);
  assert.equal(serialized.includes(PRIVATE_KEY), false);
  assert.equal(serialized.includes(VIEWING_KEY), false);
  assert.equal(Object.hasOwn(summary, "ciphertext"), false);
  assert.equal(Object.hasOwn(summary, "calldata"), false);
});

test("workflow keeps the official InvokeExternal path and has no direct fallback", async () => {
  const [source, workflow] = await Promise.all([
    readFile("tools/veil-official-shielded-message-poc.ts", "utf8"),
    readFile(
      ".github/workflows/veil-official-shielded-message-poc.yml",
      "utf8",
    ),
  ]);
  assert.equal(source.includes(".invoke(() =>"), true);
  assert.equal(source.includes("entrypoint: \"privacy_invoke\""), false);
  assert.equal(source.includes("direct/unshielded"), false);
  assert.equal(source.includes("DirectHelperTransport"), false);
  assert.equal(source.includes("SHIELDED_MESSAGE_L1_DATA_GAS_MAX_AMOUNT"), false);
  assert.equal(source.includes("SHIELDED_MESSAGE_L2_GAS_MAX_AMOUNT"), false);
  assert.equal(
    /\b(?:1024|3072|4096|4352|100000000)\b/u.test(source),
    false,
  );
  assert.equal(source.includes("blockIdentifier: \"latest\""), true);
  assert.equal(source.includes("executeWithInvocation("), true);
  assert.equal(
    source.includes("SHIELDED_MESSAGE_PROVING_SUBMISSION_BOUNDS_IDENTICAL"),
    false,
  );
  assert.equal(
    source.includes("SHIELDED_MESSAGE_PROVING_ZERO_FEE_BOUNDS_VALID"),
    true,
  );
  assert.equal(
    source.includes("SHIELDED_MESSAGE_SUBMISSION_RESOURCE_ESTIMATE_VALID"),
    true,
  );
  const estimateStep = workflow.indexOf(
    "Estimate shielded-message resources before prover start",
  );
  const proverPullStep = workflow.indexOf(
    "Pull saved transaction prover",
  );
  assert.equal(estimateStep >= 0, true);
  assert.equal(proverPullStep > estimateStep, true);
  assert.equal(
    workflow.includes("Build x86-64-v3 transaction prover"),
    false,
  );
  assert.equal(workflow.includes('docker pull "$PROVER_IMAGE"'), true);
  assert.equal(
    workflow.includes("VEIL_POC_RESOURCE_ESTIMATE_ONLY: \"true\""),
    true,
  );
});
