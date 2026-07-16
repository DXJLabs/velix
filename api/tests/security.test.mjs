import assert from "node:assert/strict";
import test from "node:test";

import { hash, shortString } from "starknet";

import paymasterHandler from "../paymaster.js";
import signHandler from "../wallet/sign.js";
import indexerHandler, { validateQuery } from "../indexer/messages.js";
import {
  ApiError,
  createRequestContext,
  sanitizeForLog,
  sanitizeLogDetails,
} from "../_lib/privy.js";
import {
  assertJsonBodyWithinLimit,
  enforceRateLimit,
  resetRateLimitsForTest,
} from "../_lib/security.js";
import {
  decodeIndexerCursor,
  encodeIndexerCursor,
  indexerBindingHash,
} from "../indexer/_lib/cursor.js";
import { normalizeFelt } from "../indexer/_lib/starknet-rpc.js";
import { materializeTimeline } from "../indexer/_lib/timeline.js";

const ROUTE_CONTEXT = { route: "/api/test", requestId: "test-request" };
const CURSOR_SECRET = "test-only-indexer-cursor-secret-32-bytes-minimum";

test("recursive log sanitization removes nested secrets and embedded credentials", () => {
  const error = new Error("request failed with Bearer header.payload.signature");
  error.cause = {
    viewingKey: "0xprivate",
    nested: [{ claimSecret: "do-not-log", safe: "ok" }],
  };

  const sanitized = sanitizeForLog({
    safe: "https://example.test/?token=abc&mode=health",
    registry: { notes: ["private"] },
    error,
  });
  const serialized = JSON.stringify(sanitized);

  assert.doesNotMatch(serialized, /abc|0xprivate|do-not-log|header\.payload\.signature|private/);
  assert.match(serialized, /redacted/);
  assert.deepEqual(sanitizeLogDetails({
    status: 200,
    arbitraryObject: { secret: "hidden" },
    helperAddress: "0x123",
  }), {
    status: 200,
    helperAddress: "0x123",
  });
});

test("request context refuses attacker-controlled request ids", () => {
  const context = createRequestContext({
    headers: { "x-request-id": "bad\n{\"viewingKey\":\"leak\"}" },
  }, "/api/test");

  assert.match(context.requestId, /^[0-9a-f-]{36}$/);
});

test("body and per-instance rate boundaries fail closed", () => {
  assert.throws(
    () => assertJsonBodyWithinLimit({
      headers: { "content-type": "application/json", "content-length": "9999" },
      body: {},
    }, ROUTE_CONTEXT, 100),
    (error) => error.code === "REQUEST_BODY_TOO_LARGE" && error.status === 413,
  );

  resetRateLimitsForTest();
  const response = createResponse();
  const request = { headers: { "x-forwarded-for": "192.0.2.5" } };
  enforceRateLimit(request, response, ROUTE_CONTEXT, { limit: 1, windowMs: 60_000 });
  assert.throws(
    () => enforceRateLimit(request, response, ROUTE_CONTEXT, { limit: 1, windowMs: 60_000 }),
    (error) => error.code === "RATE_LIMITED" && error.status === 429,
  );
});

test("raw paymaster forwarding and arbitrary-hash signing are disabled", async () => {
  resetRateLimitsForTest();
  const originalInfo = console.info;
  const originalError = console.error;
  const logs = [];
  console.info = (line) => logs.push(String(line));
  console.error = (line) => logs.push(String(line));

  try {
    const paymasterResponse = createResponse();
    await paymasterHandler({
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.6" },
      body: { method: "paymaster_executeTransaction", secret: "never-log-this" },
    }, paymasterResponse);
    assert.equal(paymasterResponse.statusCode, 503);
    assert.equal(paymasterResponse.payload.code, "PAYMASTER_ROUTE_UNVERIFIED");

    const signResponse = createResponse();
    await signHandler({
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.7" },
      body: { walletId: "wallet-secret", hash: "0x123", purpose: "allowed-label" },
    }, signResponse);
    assert.equal(signResponse.statusCode, 503);
    assert.equal(signResponse.payload.code, "SERVER_SIGNING_DISABLED");

    const serializedLogs = logs.join("\n");
    assert.doesNotMatch(serializedLogs, /never-log-this|wallet-secret|0x123|allowed-label/);
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }
});

test("indexer query accepts only an opaque felt tag and bounded fields", () => {
  assert.throws(
    () => validateQuery({ channelId: "deal-alice-bob" }, ROUTE_CONTEXT),
    (error) => error.code === "RAW_CHANNEL_ID_FORBIDDEN",
  );
  assert.throws(
    () => validateQuery({ conversationTag: "deal-alice-bob" }, ROUTE_CONTEXT),
    (error) => error.code === "CONVERSATION_TAG_INVALID",
  );
  assert.throws(
    () => validateQuery({ conversationTag: "0x123", limit: "11" }, ROUTE_CONTEXT),
    (error) => error.code === "INDEXER_QUERY_INVALID",
  );

  assert.deepEqual(validateQuery({
    conversationTag: "0x0123",
    limit: "3",
    pageBlocks: "25",
  }, ROUTE_CONTEXT), {
    conversationTag: "0x123",
    cursor: "",
    limit: 3,
    pageBlocks: 25,
  });
});

test("signed indexer cursors reject tampering and cross-tag reuse", () => {
  const binding = indexerBindingHash({
    chainId: "SN_SEPOLIA",
    helperAddress: "0x123",
    conversationTag: "0x456",
  });
  const cursor = encodeIndexerCursor({
    nextFromBlock: 120,
    anchorBlock: 119,
    anchorHash: "0xabc",
  }, CURSOR_SECRET, binding);

  assert.deepEqual(decodeIndexerCursor(cursor, CURSOR_SECRET, binding, ROUTE_CONTEXT), {
    nextFromBlock: 120,
    anchorBlock: 119,
    anchorHash: "0xabc",
  });
  assert.throws(
    () => decodeIndexerCursor(`${cursor.slice(0, -1)}x`, CURSOR_SECRET, binding, ROUTE_CONTEXT),
    (error) => error.code === "INDEXER_CURSOR_INVALID",
  );
  assert.throws(
    () => decodeIndexerCursor(cursor, CURSOR_SECRET, indexerBindingHash({
      chainId: "SN_SEPOLIA",
      helperAddress: "0x123",
      conversationTag: "0x999",
    }), ROUTE_CONTEXT),
    (error) => error.code === "INDEXER_CURSOR_SCOPE_MISMATCH",
  );
});

test("minimal hardened helper events load bounded ciphertext and verified provenance", async () => {
  const conversationTag = "0x123";
  const normalizedTag = normalizeFelt(conversationTag);
  const eventType = "1";
  const encryptedPayload = "2";
  const payloadChunks = ["3", "4"];
  const payloadHash = normalizeFelt(hash.computePoseidonHashOnElements([
    shortString.encodeShortString("VEIL_TIMELINE_V1"),
    normalizedTag,
    eventType,
    encryptedPayload,
    String(payloadChunks.length),
    ...payloadChunks,
  ]));
  const selector = normalizeFelt(hash.getSelectorFromName("TimelineCommitmentStored"));
  const calls = [];
  const rpcClient = {
    async callContract(input) {
      calls.push(input.entrypoint);
      if (input.entrypoint === "get_event") {
        return ["1", normalizedTag, eventType, encryptedPayload, payloadHash, "2", "100"];
      }
      if (input.entrypoint === "is_privacy_pool_event") return ["1"];
      if (input.entrypoint === "is_payload_committed") return ["1"];
      if (input.entrypoint === "get_payload_chunk") return [payloadChunks[Number(input.calldata[2])]];
      throw new Error("unexpected call");
    },
  };

  const messages = await materializeTimeline({
    events: [{
      keys: [selector, normalizedTag, "1"],
      data: [payloadHash],
      blockNumber: 500,
      blockHash: "0xabc",
      transactionHash: "0xdef",
      eventIndex: 4,
    }],
    conversationTag,
    helperAddress: "0x456",
    rpcClient,
    messageLimit: 5,
    context: ROUTE_CONTEXT,
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].mode, "shield");
  assert.equal(messages[0].provenance, "privacy-pool");
  assert.equal(messages[0].commitmentVerified, true);
  assert.deepEqual(messages[0].payloadChunks, payloadChunks);
  assert.deepEqual(calls.sort(), [
    "get_event",
    "get_payload_chunk",
    "get_payload_chunk",
    "is_payload_committed",
    "is_privacy_pool_event",
  ].sort());
});

test("minimal deployed helper events never fabricate provenance when optional readers are absent", async () => {
  const conversationTag = "0x123";
  const normalizedTag = normalizeFelt(conversationTag);
  const payloadHash = normalizeFelt(hash.computePoseidonHashOnElements([
    shortString.encodeShortString("VEIL_TIMELINE_V1"),
    normalizedTag,
    "1",
    "2",
    "0",
  ]));
  const selector = normalizeFelt(hash.getSelectorFromName("TimelineCommitmentStored"));
  const rpcClient = {
    async callContract(input) {
      if (input.entrypoint === "get_event") {
        return ["1", normalizedTag, "1", "2", payloadHash, "0", "100"];
      }
      throw new ApiError(
        502,
        "INDEXER_RPC_REJECTED",
        ROUTE_CONTEXT.route,
        "Rejected.",
        "Use the pinned ABI.",
      );
    },
  };

  const messages = await materializeTimeline({
    events: [{
      keys: [selector, normalizedTag, "1"],
      data: [payloadHash],
      blockNumber: 500,
      blockHash: "0xabc",
      transactionHash: "0xdef",
    }],
    conversationTag,
    helperAddress: "0x456",
    rpcClient,
    messageLimit: 5,
    context: ROUTE_CONTEXT,
  });

  assert.equal(messages[0].provenance, "unverified-helper-provenance");
  assert.equal("mode" in messages[0], false);
  assert.equal(messages[0].commitmentVerified, true);
});

test("legacy ciphertext events remain readable without fabricated shielded provenance", async () => {
  const conversationTag = "0x123";
  const normalizedTag = normalizeFelt(conversationTag);
  const payloadChunks = ["9"];
  const payloadHash = normalizeFelt(hash.computePoseidonHashOnElements([
    shortString.encodeShortString("VEIL_TIMELINE_V1"),
    normalizedTag,
    "1",
    "2",
    "1",
    ...payloadChunks,
  ]));
  const messages = await materializeTimeline({
    events: [
      {
        keys: ["10", normalizedTag, "1", "7"],
        data: ["2", payloadHash, "1", "100"],
        blockNumber: 500,
        blockHash: "0xabc",
        transactionHash: "0xdef",
        eventIndex: 4,
      },
      {
        keys: ["11", normalizedTag, "7", "0"],
        data: ["9"],
        blockNumber: 500,
        blockHash: "0xabc",
        transactionHash: "0xdef",
        eventIndex: 5,
      },
    ],
    conversationTag,
    helperAddress: "0x456",
    rpcClient: {},
    messageLimit: 5,
    context: ROUTE_CONTEXT,
  });

  assert.equal(messages[0].provenance, "unverified-legacy");
  assert.equal("mode" in messages[0], false);
  assert.equal(messages[0].commitmentVerified, true);
});

test("indexer handler starts from the verified deployment block and returns a signed cursor", async () => {
  resetRateLimitsForTest();
  const originalFetch = globalThis.fetch;
  const originalInfo = console.info;
  const previousEnvironment = {
    VEIL_INDEXER_CURSOR_SECRET: process.env.VEIL_INDEXER_CURSOR_SECRET,
    STARKNET_CHAIN_ID: process.env.STARKNET_CHAIN_ID,
    STARKNET_RPC_URL: process.env.STARKNET_RPC_URL,
    VEIL_CHANNEL_HELPER_ADDRESS: process.env.VEIL_CHANNEL_HELPER_ADDRESS,
    VITE_VEIL_CHANNEL_HELPER_ADDRESS: process.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS,
  };
  process.env.VEIL_INDEXER_CURSOR_SECRET = CURSOR_SECRET;
  process.env.STARKNET_CHAIN_ID = "SN_SEPOLIA";
  process.env.STARKNET_RPC_URL = "https://rpc.example.test";
  delete process.env.VEIL_CHANNEL_HELPER_ADDRESS;
  delete process.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS;
  const rpcRequests = [];
  console.info = () => {};
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    rpcRequests.push(request);
    if (request.method === "starknet_chainId") return rpcResponse("0x534e5f5345504f4c4941");
    if (request.method === "starknet_blockNumber") return rpcResponse(200);
    if (request.method === "starknet_getTransactionReceipt") {
      return rpcResponse({
        block_number: 100,
        transaction_hash: request.params[0],
      });
    }
    if (request.method === "starknet_getBlockWithTxHashes") {
      return rpcResponse({ block_hash: "0xabc", transactions: [] });
    }
    if (request.method === "starknet_getEvents") {
      return rpcResponse({ events: [], continuation_token: null });
    }
    throw new Error(`Unexpected RPC method ${request.method}`);
  };

  try {
    const response = createResponse();
    await indexerHandler({
      method: "GET",
      headers: { "x-forwarded-for": "192.0.2.8" },
      query: { conversationTag: "0x123", limit: "5", pageBlocks: "10" },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.source, "bounded-rpc-bridge");
    assert.equal(response.payload.page.fromBlock, 100);
    assert.equal(response.payload.page.toBlock, 109);
    assert.ok(response.payload.nextCursor.length > 20);

    const eventRequest = rpcRequests.find((item) => item.method === "starknet_getEvents");
    const filter = eventRequest.params[0];
    assert.deepEqual(filter.from_block, { block_number: 100 });
    assert.deepEqual(filter.to_block, { block_number: 109 });
    assert.deepEqual(filter.keys, [[], ["0x123"]]);
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
    restoreEnvironment(previousEnvironment);
  }
});

test("indexer handler detects an anchor reorg and returns an explicit rollback page", async () => {
  resetRateLimitsForTest();
  const originalFetch = globalThis.fetch;
  const originalInfo = console.info;
  const previousEnvironment = {
    VEIL_INDEXER_CURSOR_SECRET: process.env.VEIL_INDEXER_CURSOR_SECRET,
    STARKNET_CHAIN_ID: process.env.STARKNET_CHAIN_ID,
    STARKNET_RPC_URL: process.env.STARKNET_RPC_URL,
    VEIL_CHANNEL_HELPER_ADDRESS: process.env.VEIL_CHANNEL_HELPER_ADDRESS,
    VITE_VEIL_CHANNEL_HELPER_ADDRESS: process.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS,
  };
  process.env.VEIL_INDEXER_CURSOR_SECRET = CURSOR_SECRET;
  process.env.STARKNET_CHAIN_ID = "SN_SEPOLIA";
  process.env.STARKNET_RPC_URL = "https://reorg-rpc.example.test";
  delete process.env.VEIL_CHANNEL_HELPER_ADDRESS;
  delete process.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS;
  console.info = () => {};
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    if (request.method === "starknet_chainId") return rpcResponse("0x534e5f5345504f4c4941");
    if (request.method === "starknet_blockNumber") return rpcResponse(200);
    if (request.method === "starknet_getTransactionReceipt") {
      return rpcResponse({ block_number: 100, transaction_hash: request.params[0] });
    }
    if (request.method === "starknet_getEvents") {
      return rpcResponse({ events: [], continuation_token: null });
    }
    if (request.method === "starknet_getBlockWithTxHashes") {
      const blockNumber = request.params[0].block_number;
      return rpcResponse({
        block_hash: blockNumber === 149 ? "0xbbb" : "0xccc",
        transactions: [],
      });
    }
    throw new Error(`Unexpected RPC method ${request.method}`);
  };

  const helperAddress = "0x52390845931a0c8d4735246d853a1a514c3cbf88cb1714937284814c5e57b23";
  const conversationTag = "0x123";
  const binding = indexerBindingHash({
    chainId: "SN_SEPOLIA",
    helperAddress,
    conversationTag,
  });
  const cursor = encodeIndexerCursor({
    nextFromBlock: 150,
    anchorBlock: 149,
    anchorHash: "0xaaa",
  }, CURSOR_SECRET, binding);

  try {
    const response = createResponse();
    await indexerHandler({
      method: "GET",
      headers: { "x-forwarded-for": "192.0.2.9" },
      query: { conversationTag, cursor, limit: "5", pageBlocks: "5" },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload.reorg, {
      detected: true,
      rollbackFromBlock: 117,
    });
    assert.equal(response.payload.page.fromBlock, 117);
    assert.equal(response.payload.page.toBlock, 121);
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
    restoreEnvironment(previousEnvironment);
  }
});

function createResponse() {
  return {
    headers: new Map(),
    statusCode: 200,
    payload: undefined,
    setHeader(name, value) {
      this.headers.set(name, value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    send(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function rpcResponse(result, status = 200) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function restoreEnvironment(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
