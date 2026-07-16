import crypto from "node:crypto";

import { hash } from "starknet";

import { ApiError } from "../../_lib/privy.js";

export const FELT_MODULUS = 2n ** 251n + 17n * 2n ** 192n + 1n;

const ALLOWED_CALL_ENTRYPOINTS = new Set([
  "get_event",
  "get_payload_chunk",
  "is_payload_committed",
  "is_privacy_pool_event",
]);
const MAX_RPC_RESPONSE_BYTES = 2 * 1024 * 1024;
const RPC_TIMEOUT_MS = 8_000;

export function createStarknetRpcClient(rpcUrl, context) {
  const url = validatedRpcUrl(rpcUrl, context);

  return {
    async chainId() {
      return normalizeFelt(await rpc(url, "starknet_chainId", [], context), "chain ID");
    },

    async blockNumber() {
      const result = await rpc(url, "starknet_blockNumber", [], context);
      if (!Number.isSafeInteger(result) || result < 0) throw invalidRpcResponse(context);
      return result;
    },

    async blockHash(blockNumber) {
      const result = await rpc(
        url,
        "starknet_getBlockWithTxHashes",
        [{ block_number: safeBlockNumber(blockNumber, context) }],
        context,
      );
      if (!result?.block_hash) throw invalidRpcResponse(context);
      return toHexFelt(result.block_hash, "block hash");
    },

    async transactionBlockNumber(transactionHash) {
      const normalizedTransactionHash = toHexFelt(transactionHash, "deployment transaction hash");
      const result = await rpc(
        url,
        "starknet_getTransactionReceipt",
        [normalizedTransactionHash],
        context,
      );
      if (
        !result
        || !Number.isSafeInteger(result.block_number)
        || result.block_number < 0
        || (result.transaction_hash
          && toHexFelt(result.transaction_hash, "receipt transaction hash") !== normalizedTransactionHash)
      ) {
        throw invalidRpcResponse(context);
      }
      return result.block_number;
    },

    async getEvents({ fromBlock, toBlock, helperAddress, conversationTag, maxRawEvents }) {
      return getBoundedEvents({
        url,
        fromBlock: safeBlockNumber(fromBlock, context),
        toBlock: safeBlockNumber(toBlock, context),
        helperAddress: toHexFelt(helperAddress, "helper address"),
        conversationTag: toHexFelt(conversationTag, "conversation tag"),
        maxRawEvents,
        context,
      });
    },

    async callContract({ helperAddress, entrypoint, calldata, blockNumber }) {
      if (!ALLOWED_CALL_ENTRYPOINTS.has(entrypoint)) {
        throw new ApiError(
          500,
          "INDEXER_CALL_POLICY_VIOLATION",
          context.route,
          "The indexer attempted an unsupported contract read.",
          "Keep indexer contract reads limited to the pinned VEIL helper ABI.",
        );
      }
      const result = await rpc(
        url,
        "starknet_call",
        [{
          contract_address: toHexFelt(helperAddress, "helper address"),
          entry_point_selector: hash.getSelectorFromName(entrypoint),
          calldata: calldata.map((item) => toHexFelt(item, "contract calldata")),
        }, { block_number: safeBlockNumber(blockNumber, context) }],
        context,
      );
      if (!Array.isArray(result) || result.length > 128) throw invalidRpcResponse(context);
      return result.map((item) => normalizeFelt(item, "contract result"));
    },
  };
}

export function normalizeFelt(value, label = "felt") {
  let parsed;
  try {
    if (typeof value === "bigint") parsed = value;
    else if (typeof value === "number" && Number.isSafeInteger(value)) parsed = BigInt(value);
    else if (typeof value === "string" && /^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(value.trim())) {
      parsed = BigInt(value.trim());
    } else {
      throw new Error("invalid felt");
    }
  } catch {
    throw new TypeError(`${label} must be a canonical non-negative Starknet felt.`);
  }
  if (parsed < 0n || parsed >= FELT_MODULUS) {
    throw new TypeError(`${label} is outside the Starknet felt range.`);
  }
  return parsed.toString();
}

export function toHexFelt(value, label = "felt") {
  return `0x${BigInt(normalizeFelt(value, label)).toString(16)}`;
}

async function getBoundedEvents({
  url,
  fromBlock,
  toBlock,
  helperAddress,
  conversationTag,
  maxRawEvents,
  context,
}) {
  const rawLimit = Number(maxRawEvents);
  if (!Number.isSafeInteger(rawLimit) || rawLimit < 1 || rawLimit > 2_000) {
    throw new TypeError("maxRawEvents must be between 1 and 2000.");
  }
  if (toBlock < fromBlock) return [];

  const chunkSize = Math.min(100, rawLimit);
  const events = [];
  const seenContinuationTokens = new Set();
  let continuationToken;

  do {
    const filter = {
      from_block: { block_number: fromBlock },
      to_block: { block_number: toBlock },
      address: helperAddress,
      keys: [[], [conversationTag]],
      chunk_size: chunkSize,
      ...(continuationToken ? { continuation_token: continuationToken } : {}),
    };
    const result = await rpc(url, "starknet_getEvents", [filter], context);
    if (!result || !Array.isArray(result.events)) throw invalidRpcResponse(context);
    if (events.length + result.events.length > rawLimit) {
      throw new ApiError(
        422,
        "INDEXER_EVENT_DENSITY_LIMIT",
        context.route,
        "This bounded block page contains more helper events than the endpoint can safely process.",
        "Retry with pageBlocks=1. A durable application indexer is required for sustained high-volume history.",
      );
    }
    for (const event of result.events) {
      events.push(validateEvent(event, helperAddress, fromBlock, toBlock, context));
    }

    continuationToken = result.continuation_token || result.continuationToken || "";
    if (continuationToken) {
      if (typeof continuationToken !== "string" || continuationToken.length > 2_048) {
        throw invalidRpcResponse(context);
      }
      if (seenContinuationTokens.has(continuationToken)) throw invalidRpcResponse(context);
      seenContinuationTokens.add(continuationToken);
    }
  } while (continuationToken);

  return events;
}

function validateEvent(event, helperAddress, fromBlock, toBlock, context) {
  if (!event || typeof event !== "object" || !Array.isArray(event.keys) || !Array.isArray(event.data)) {
    throw invalidRpcResponse(context);
  }
  if (event.keys.length > 128 || event.data.length > 128) throw invalidRpcResponse(context);
  if (!Number.isSafeInteger(event.block_number) || event.block_number < fromBlock || event.block_number > toBlock) {
    throw invalidRpcResponse(context);
  }
  if (event.from_address && toHexFelt(event.from_address, "event address") !== helperAddress) {
    throw invalidRpcResponse(context);
  }
  return {
    keys: event.keys.map((item) => normalizeFelt(item, "event key")),
    data: event.data.map((item) => normalizeFelt(item, "event data")),
    blockNumber: event.block_number,
    blockHash: event.block_hash ? toHexFelt(event.block_hash, "event block hash") : undefined,
    transactionHash: event.transaction_hash
      ? toHexFelt(event.transaction_hash, "event transaction hash")
      : undefined,
    eventIndex: Number.isSafeInteger(event.event_index) && event.event_index >= 0
      ? event.event_index
      : undefined,
  };
}

async function rpc(url, method, params, context) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  let response;
  let body;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomInt(1, 2_147_483_647),
        method,
        params,
      }),
      signal: controller.signal,
    });
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RPC_RESPONSE_BYTES) {
      throw invalidRpcResponse(context);
    }
    body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_RPC_RESPONSE_BYTES) throw invalidRpcResponse(context);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      502,
      error?.name === "AbortError" ? "INDEXER_RPC_TIMEOUT" : "INDEXER_RPC_UNAVAILABLE",
      context.route,
      error?.name === "AbortError"
        ? "The Starknet RPC did not respond within the indexer timeout."
        : "The Starknet RPC is unavailable to the indexer.",
      "Retry the bounded page once, then check the configured Sepolia RPC health.",
      { rpcMethod: method },
    );
  } finally {
    clearTimeout(timeout);
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw invalidRpcResponse(context);
  }
  if (response.status === 429) {
    throw new ApiError(
      503,
      "INDEXER_RPC_RATE_LIMITED",
      context.route,
      "The configured Starknet RPC rate-limited the bounded indexer page.",
      "Retry the same signed cursor after the provider window resets, or configure a dedicated Sepolia RPC for the indexer.",
      { rpcMethod: method, upstreamStatus: response.status },
    );
  }
  if (!response.ok || payload?.error || !("result" in (payload || {}))) {
    throw new ApiError(
      502,
      "INDEXER_RPC_REJECTED",
      context.route,
      "The Starknet RPC rejected an indexer request.",
      "Retry once, then verify RPC version, Sepolia chain, helper deployment, and bounded query configuration.",
      { rpcMethod: method, upstreamStatus: response.status },
    );
  }
  return payload.result;
}

function validatedRpcUrl(value, context) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw invalidRpcConfig(context);
  }
  if (url.protocol !== "https:" || url.username || url.password) throw invalidRpcConfig(context);
  return url.toString();
}

function safeBlockNumber(value, context) {
  if (!Number.isSafeInteger(value) || value < 0) throw invalidRpcResponse(context);
  return value;
}

function invalidRpcConfig(context) {
  return new ApiError(
    503,
    "INDEXER_RPC_CONFIG_INVALID",
    context.route,
    "The indexer requires a valid HTTPS Starknet Sepolia RPC URL.",
    "Configure STARKNET_RPC_URL with a reviewed HTTPS Sepolia endpoint and keep credentials server-side.",
  );
}

function invalidRpcResponse(context) {
  return new ApiError(
    502,
    "INDEXER_RPC_RESPONSE_INVALID",
    context.route,
    "The Starknet RPC returned data outside the bounded indexer schema.",
    "Retry once, then verify the RPC version and configured VEIL helper deployment.",
  );
}
