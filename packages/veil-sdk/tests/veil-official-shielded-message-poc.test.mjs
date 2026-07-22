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
          return executeResult();
        },
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
  const result = await officialShieldedMessageProofExecutor.execute({
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
      async prove(input, blockId) {
        invocation = input;
        provedBlock = blockId;
        return executeResult().callAndProof.proof;
      },
    },
  });
  assert.equal(provedBlock, PROVING_BLOCK);
  assert.equal(BigInt(invocation.sender_address), BigInt(POOL_ADDRESS));
  assert.equal(invocation.calldata.some((felt) => BigInt(felt) === BigInt(SEPOLIA_HELPER_ADDRESS)), true);
  assert.equal(invocation.calldata.some((felt) => BigInt(felt) === BigInt(prepared.messageLocator)), true);
  assert.equal(result.callAndProof.call.entrypoint, "apply_actions");
});

test("submission uses tip zero and includes non-empty proof facts", async () => {
  const { config, prepared } = await preparedFixture();
  const calls = [];
  const provider = storageProvider(prepared);
  const summary = await submitShieldedMessage({
    config,
    provider,
    account: {
      async execute(call, details) {
        calls.push({ call, details });
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
    proof: executeResult().callAndProof.proof.data,
    proofFacts: ["0x2", "0x3"],
  });
  assert.notDeepEqual(calls[0].details.proofFacts, []);
  assert.equal(summary.messageEventFound, true);
  assert.equal(summary.storageVerified, true);
  assert.equal(summary.localDecryptVerified, true);
});

test("proofFacts empty is never sent", async () => {
  const { config, prepared } = await preparedFixture();
  let details;
  await submitShieldedMessage({
    config,
    provider: storageProvider(prepared),
    account: {
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
  assert.deepEqual(details, { tip: 0n });
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
  const source = await readFile(
    "tools/veil-official-shielded-message-poc.ts",
    "utf8",
  );
  assert.equal(source.includes(".invoke(() =>"), true);
  assert.equal(source.includes("entrypoint: \"privacy_invoke\""), false);
  assert.equal(source.includes("direct/unshielded"), false);
  assert.equal(source.includes("DirectHelperTransport"), false);
});
