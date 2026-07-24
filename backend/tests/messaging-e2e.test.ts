import assert from "node:assert/strict";
import test from "node:test";
import { hash } from "starknet";
import {
  buildCanonicalHelperPayload,
} from "#veil-sdk/canonical-payload";
import {
  VEIL_TRANSACTION_PROVER_PIN,
  type TransactionProofRequestInput,
} from "#veil-sdk/transaction-prover";
import { loadProverEnvironment } from "../config/backend-env.js";
import { computePayloadCommitment, verifyPayloadCommitment } from "../services/discovery/commitment-verifier.js";
import { RpcDiscoveryClient } from "../services/discovery/rpc-discovery.js";
import { createBackendProverClient } from "../services/prover/prover-client.js";
import { parseMessageProofRequest, requestMessageProof } from "../services/prover/proof-request.js";
import { getProverStatus } from "../services/prover/proof-status.js";

const POOL = "0x222";
const HELPER = "0x555";
const COMPILE_ACTIONS_SELECTOR = hash.getSelectorFromName("compile_actions");
const PROOF_PROGRAM = "0x5649525455414c5f534e4f53";
const PROOF_OUTPUT = "0x5649525455414c5f534e4f5330";

function backendEnv(): NodeJS.ProcessEnv {
  return {
    STARKNET_CHAIN_ID: "SN_SEPOLIA",
    STARKNET_RPC_URL: "https://rpc.example.test",
    VEIL_PRIVACY_POOL_ADDRESS: POOL,
    VEIL_CHANNEL_HELPER_ADDRESS: HELPER,
    VEIL_PROVER_URL: "http://127.0.0.1:3000",
    VEIL_PROVER_MODE: "local",
    VEIL_DISCOVERY_URL: "http://127.0.0.1:3000/api/indexer/messages",
    VEIL_PROVER_HEALTH_RETRIES: "0",
    VEIL_PROVER_JOB_RETRIES: "0",
    VEIL_PROVER_RETRY_BASE_MS: "0",
    VEIL_PROVER_RETRY_MAX_MS: "0",
  };
}

function validEnvelope() {
  return {
    version: 1,
    algorithm: "A256GCM",
    salt: Buffer.alloc(32, 1).toString("base64url"),
    nonce: Buffer.alloc(12, 2).toString("base64url"),
    ciphertext: Buffer.alloc(64, 3).toString("base64url"),
  };
}

function validCanonical() {
  return {
    messageReference: "message-backend-e2e-1",
    requestId: "backend-e2e-request-1",
    operation: "message",
    keyDomain: "VEIL_MESSAGE_KEY_V1",
    envelope: validEnvelope(),
    messageLocator: "0x77",
    applicationInvokes: [{ contractAddress: HELPER, selector: "privacy_invoke" }],
  };
}

function toHex(value: string | number | bigint): string {
  return `0x${BigInt(value).toString(16)}`;
}

function validTransaction(canonical = validCanonical()) {
  const payload = buildCanonicalHelperPayload(canonical);
  const helperCalldata = payload.calldata.map(toHex);
  const action = ["0x8", HELPER, toHex(helperCalldata.length), ...helperCalldata];
  const inner = ["0x123", "0x456", "0x1", ...action];
  return {
    type: "INVOKE",
    version: "0x3",
    sender_address: POOL,
    calldata: ["0x1", POOL, COMPILE_ACTIONS_SELECTOR, toHex(inner.length), ...inner],
    signature: ["0x1", "0x2"],
    nonce: "0x0",
    resource_bounds: {
      l1_gas: { max_amount: "0x1", max_price_per_unit: "0x0" },
      l2_gas: { max_amount: "0x5f5e100", max_price_per_unit: "0x0" },
      l1_data_gas: { max_amount: "0x1", max_price_per_unit: "0x0" },
    },
    tip: "0x0",
    paymaster_data: [],
    account_deployment_data: [],
    nonce_data_availability_mode: "L1",
    fee_data_availability_mode: "L1",
  };
}

function validProofResult() {
  const message = {
    from_address: POOL,
    to_address: "0x0",
    payload: ["0xabc", "0x1", "0x2"],
  };
  const messageHash = hash.computePoseidonHashOnElements([
    message.from_address,
    message.to_address,
    message.payload.length,
    ...message.payload,
  ]);
  return {
    proof: Buffer.from("backend-e2e-proof").toString("base64"),
    proof_facts: [
      "0x50524f4f4631",
      PROOF_PROGRAM,
      "0x111",
      PROOF_OUTPUT,
      "0x1",
      "0x2",
      "0x3",
      "0x1",
      messageHash,
    ],
    l2_to_l1_messages: [message],
  };
}

function proverFetch(): typeof fetch {
  return async (input, init = {}) => {
    const url = String(input);
    if (init.method === "GET" && url.endsWith("/health")) {
      return jsonResponse({ status: "ok" });
    }
    const request = JSON.parse(String(init.body)) as { id: string; method: string };
    if (request.method === "starknet_specVersion") {
      return jsonResponse({ jsonrpc: "2.0", id: request.id, result: VEIL_TRANSACTION_PROVER_PIN.rpcSpecVersion });
    }
    if (request.method === VEIL_TRANSACTION_PROVER_PIN.rpcMethod) {
      return jsonResponse({ jsonrpc: "2.0", id: request.id, result: validProofResult() });
    }
    return jsonResponse({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "unknown" } });
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("backend environment fails closed for insecure remote prover endpoints", () => {
  assert.throws(
    () => loadProverEnvironment({
      ...backendEnv(),
      VEIL_PROVER_URL: "http://prover.example.test",
      VEIL_PROVER_MODE: "live-unverified",
    }),
    (error: unknown) => error instanceof Error && error.message.includes("HTTPS"),
  );
});

test("messaging proof boundary reaches the pinned SDK prover client end to end", async () => {
  const client = createBackendProverClient({ env: backendEnv(), fetch: proverFetch() });
  const request: TransactionProofRequestInput = {
    canonical: validCanonical(),
    blockId: "latest",
    transaction: validTransaction(),
  };

  const health = await getProverStatus(client, "backend-e2e-health");
  assert.equal(health.status, "PROVER_READY_LOCAL");
  assert.equal(health.readyToAcceptProofJobs, true);

  const result = await requestMessageProof(client, request);
  assert.equal(result.schemaVersion, "veil-message-proof-v1");
  assert.equal(result.status, "LOCAL_PROVER_VERIFIED");
  assert.match(result.requestFingerprint, /^veil-proof-intent-v1:[0-9a-f]{64}$/u);
  assert.equal(result.broadcastEnabled, false);
  assert.equal(result.canonicalPrepared, false);
  assert.equal(result.liveVerified, false);
  assert.equal(result.shieldEnabled, false);
});

test("proof request rejects private material before contacting the prover", () => {
  assert.throws(
    () => parseMessageProofRequest({
      canonical: validCanonical(),
      blockId: "latest",
      transaction: validTransaction(),
      viewingKey: "never-send-this",
    }),
    /unsupported fields|Private field/u,
  );
});

test("transaction status is read through the bounded Starknet RPC boundary", async () => {
  const fetchMock: typeof fetch = async (_input, init = {}) => {
    const request = JSON.parse(String(init.body)) as { id: string; method: string; params: unknown[] };
    assert.equal(request.method, "starknet_getTransactionReceipt");
    return jsonResponse({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        transaction_hash: "0xabc",
        finality_status: "ACCEPTED_ON_L2",
        execution_status: "SUCCEEDED",
        block_number: 123,
        block_hash: "0xdef",
      },
    });
  };
  const rpc = new RpcDiscoveryClient({ rpcUrl: "https://rpc.example.test", fetch: fetchMock });
  const status = await rpc.transactionStatus("0xabc");
  assert.equal(status.finalityStatus, "ACCEPTED_ON_L2");
  assert.equal(status.executionStatus, "SUCCEEDED");
  assert.equal(status.blockNumber, 123);
});

test("canonical commitment verifier binds locator, chunk count, and ciphertext chunks", () => {
  const input = { messageLocator: "0x77", payloadChunks: ["0x1", "0x2", "0x3"] };
  const commitment = computePayloadCommitment(input);
  const verified = verifyPayloadCommitment({ ...input, claimedCommitment: commitment });
  assert.equal(verified.valid, true);
  assert.equal(verified.chunkCount, 3);
  assert.throws(
    () => verifyPayloadCommitment({ ...input, payloadChunks: ["0x1", "0x2", "0x4"], claimedCommitment: commitment }),
    /does not match/u,
  );
});
