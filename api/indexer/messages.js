import {
  STARKNET_SEPOLIA_CHAIN_ID,
  VEIL_SEPOLIA_CONFIG,
  normalizeStarknetChainId,
} from "../../config/veil-sepolia.js";
import {
  ApiError,
  createRequestContext,
  logEvent,
  sendError,
} from "../_lib/privy.js";
import {
  assertNoRequestBody,
  enforceRateLimit,
  setPrivateResponseHeaders,
} from "../_lib/security.js";
import {
  decodeIndexerCursor,
  encodeIndexerCursor,
  indexerBindingHash,
} from "./_lib/cursor.js";
import {
  createStarknetRpcClient,
  normalizeFelt,
  toHexFelt,
} from "./_lib/starknet-rpc.js";
import { materializeTimeline } from "./_lib/timeline.js";

const ALLOWED_QUERY_FIELDS = new Set(["conversationTag", "cursor", "limit", "pageBlocks"]);
const DEFAULT_CONFIRMATIONS = 12;
const DEFAULT_MESSAGE_LIMIT = 5;
const DEFAULT_PAGE_BLOCKS = 2_000;
const MAX_MESSAGE_LIMIT = 10;
const MAX_PAGE_BLOCKS = 5_000;
const NETWORK_METADATA_CACHE = new Map();

export default async function handler(request, response) {
  const context = createRequestContext(request, "/api/indexer/messages");
  const startedAt = Date.now();

  try {
    setPrivateResponseHeaders(response);
    requireGet(request, response, context);
    assertNoRequestBody(request, context);
    enforceRateLimit(request, response, context, { limit: 30, windowMs: 60_000 });

    const query = validateQuery(request.query || {}, context);
    const config = serverConfig(context);
    const rpcClient = createStarknetRpcClient(config.rpcUrl, context);
    const bindingHash = indexerBindingHash({
      chainId: config.chainId,
      helperAddress: config.helperAddress,
      conversationTag: query.conversationTag,
    });
    const cursorState = query.cursor
      ? decodeIndexerCursor(query.cursor, config.cursorSecret, bindingHash, context)
      : null;

    logEvent("info", "indexer.page.start", context, {
      chainId: config.chainId,
      helperAddress: config.helperAddress,
      cursorPresent: Boolean(cursorState),
      limit: query.limit,
      pageBlocks: query.pageBlocks,
    });

    const { deploymentBlock } = await verifiedNetworkMetadata(rpcClient, config, context);
    const latestBlock = await rpcClient.blockNumber();

    const safeTip = latestBlock - config.confirmations;
    let fromBlock = cursorState?.nextFromBlock ?? deploymentBlock;
    if (fromBlock < deploymentBlock) throw invalidCursorRange(context);

    let reorgDetected = false;
    let rollbackFromBlock = null;
    if (cursorState?.anchorBlock !== null && cursorState?.anchorBlock !== undefined) {
      let canonicalAnchorHash = null;
      if (cursorState.anchorBlock <= latestBlock) {
        canonicalAnchorHash = await rpcClient.blockHash(cursorState.anchorBlock);
      }
      if (canonicalAnchorHash !== cursorState.anchorHash) {
        reorgDetected = true;
        rollbackFromBlock = Math.max(
          deploymentBlock,
          cursorState.anchorBlock - config.reorgOverlapBlocks,
        );
        fromBlock = rollbackFromBlock;
      }
    }

    let messages = [];
    let toBlock = null;
    let nextCursorState = cursorState || {
      nextFromBlock: fromBlock,
      anchorBlock: null,
      anchorHash: null,
    };

    if (safeTip >= fromBlock) {
      toBlock = Math.min(safeTip, fromBlock + query.pageBlocks - 1);
      const pageHashBefore = await rpcClient.blockHash(toBlock);
      const rawEvents = await rpcClient.getEvents({
        fromBlock,
        toBlock,
        helperAddress: config.helperAddress,
        conversationTag: query.conversationTag,
        maxRawEvents: Math.min(2_000, query.limit * 66),
      });
      messages = await materializeTimeline({
        events: rawEvents,
        conversationTag: query.conversationTag,
        helperAddress: config.helperAddress,
        rpcClient,
        messageLimit: query.limit,
        context,
      });
      const pageHashAfter = await rpcClient.blockHash(toBlock);
      if (pageHashBefore !== pageHashAfter) {
        throw new ApiError(
          409,
          "INDEXER_REORG_IN_PROGRESS",
          context.route,
          "The Sepolia page changed while it was being indexed.",
          "Discard this response and retry the same cursor after the chain stabilizes.",
        );
      }
      nextCursorState = {
        nextFromBlock: toBlock + 1,
        anchorBlock: toBlock,
        anchorHash: pageHashAfter,
      };
    }

    const nextCursor = encodeIndexerCursor(nextCursorState, config.cursorSecret, bindingHash);
    const hasMore = safeTip >= nextCursorState.nextFromBlock;

    logEvent("info", "indexer.page.complete", context, {
      chainId: config.chainId,
      helperAddress: config.helperAddress,
      fromBlock,
      toBlock,
      eventCount: messages.length,
      reorgDetected,
      durationMs: Date.now() - startedAt,
    });

    response.status(200).json({
      schemaVersion: "veil-indexer-page-v1",
      source: "bounded-rpc-bridge",
      chainId: config.chainId,
      helperAddress: config.helperAddress,
      conversationTag: query.conversationTag,
      messages,
      nextCursor,
      page: {
        fromBlock,
        toBlock,
        latestBlock,
        safeTip: Math.max(-1, safeTip),
        confirmationDepth: config.confirmations,
        hasMore,
      },
      reorg: {
        detected: reorgDetected,
        rollbackFromBlock,
      },
    });
  } catch (error) {
    sendError(response, context, error);
  }
}

async function verifiedNetworkMetadata(rpcClient, config, context) {
  const cacheKey = `${config.rpcUrl}|${config.helperDeploymentTransactionHash}`;
  const cached = NETWORK_METADATA_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const rpcChainId = await rpcClient.chainId();
  if (rpcChainId !== normalizeFelt(VEIL_SEPOLIA_CONFIG.chainIdHex, "Sepolia chain ID")) {
    throw new ApiError(
      503,
      "INDEXER_CHAIN_MISMATCH",
      context.route,
      "The configured RPC is not Starknet Sepolia.",
      "Stop indexing and configure the verified SN_SEPOLIA RPC before retrying.",
    );
  }
  const deploymentBlock = await rpcClient.transactionBlockNumber(
    config.helperDeploymentTransactionHash,
  );
  const metadata = {
    deploymentBlock,
    expiresAt: Date.now() + 5 * 60_000,
  };
  NETWORK_METADATA_CACHE.set(cacheKey, metadata);
  return metadata;
}

export function validateQuery(query, context) {
  const keys = Object.keys(query);
  if (keys.some((key) => key === "channelId" || key === "channel_id")) {
    throw new ApiError(
      400,
      "RAW_CHANNEL_ID_FORBIDDEN",
      context.route,
      "Raw channel identifiers are not accepted by the VEIL indexer.",
      "Derive VEIL_CONVERSATION_TAG_V1 on the client and send only conversationTag.",
    );
  }
  if (keys.some((key) => !ALLOWED_QUERY_FIELDS.has(key))) {
    throw new ApiError(
      400,
      "INDEXER_QUERY_INVALID",
      context.route,
      "The indexer query contains unsupported fields.",
      "Send only conversationTag, cursor, limit, and pageBlocks.",
    );
  }

  const rawTag = singleQueryValue(query.conversationTag, "conversationTag", context);
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(rawTag)) throw invalidConversationTag(context);
  let conversationTag;
  try {
    conversationTag = toHexFelt(rawTag, "conversation tag");
  } catch {
    throw invalidConversationTag(context);
  }
  if (conversationTag === "0x0") throw invalidConversationTag(context);

  const cursor = query.cursor === undefined
    ? ""
    : singleQueryValue(query.cursor, "cursor", context);
  if (cursor.length > 2_048) throw invalidQuery(context);

  return {
    conversationTag,
    cursor,
    limit: boundedQueryInteger(query.limit, "limit", 1, MAX_MESSAGE_LIMIT, DEFAULT_MESSAGE_LIMIT, context),
    pageBlocks: boundedQueryInteger(
      query.pageBlocks,
      "pageBlocks",
      1,
      MAX_PAGE_BLOCKS,
      DEFAULT_PAGE_BLOCKS,
      context,
    ),
  };
}

function serverConfig(context) {
  const requestedChainId = normalizeStarknetChainId(
    process.env.STARKNET_CHAIN_ID
      || process.env.VITE_STARKNET_CHAIN_ID
      || STARKNET_SEPOLIA_CHAIN_ID,
  );
  if (requestedChainId !== STARKNET_SEPOLIA_CHAIN_ID) {
    throw new ApiError(
      503,
      "INDEXER_CHAIN_CONFIG_INVALID",
      context.route,
      "VEIL application indexing is locked to Starknet Sepolia.",
      "Set STARKNET_CHAIN_ID=SN_SEPOLIA and remove mixed-network configuration.",
    );
  }

  const canonicalHelper = toHexFelt(
    VEIL_SEPOLIA_CONFIG.contracts.channelHelper.address,
    "configured helper address",
  );
  const overrideHelper = process.env.VEIL_CHANNEL_HELPER_ADDRESS
    || process.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS;
  if (overrideHelper) {
    let normalizedOverride;
    try {
      normalizedOverride = toHexFelt(overrideHelper, "helper override");
    } catch {
      throw helperConfigMismatch(context);
    }
    if (normalizedOverride !== canonicalHelper) throw helperConfigMismatch(context);
  }

  return {
    chainId: STARKNET_SEPOLIA_CHAIN_ID,
    rpcUrl: process.env.STARKNET_RPC_URL || VEIL_SEPOLIA_CONFIG.rpc.defaultUrl,
    helperAddress: canonicalHelper,
    helperDeploymentTransactionHash: VEIL_SEPOLIA_CONFIG.contracts.channelHelper.deploymentTransactionHash,
    cursorSecret: process.env.VEIL_INDEXER_CURSOR_SECRET || "",
    confirmations: boundedEnvironmentInteger(
      process.env.VEIL_INDEXER_CONFIRMATIONS,
      2,
      64,
      DEFAULT_CONFIRMATIONS,
      context,
    ),
    reorgOverlapBlocks: boundedEnvironmentInteger(
      process.env.VEIL_INDEXER_REORG_OVERLAP,
      DEFAULT_CONFIRMATIONS,
      256,
      32,
      context,
    ),
  };
}

function requireGet(request, response, context) {
  if (request.method === "GET") return;
  response.setHeader("Allow", "GET");
  throw new ApiError(
    405,
    "METHOD_NOT_ALLOWED",
    context.route,
    "This endpoint only accepts GET requests.",
    "Request a bounded cursor page with method GET.",
  );
}

function singleQueryValue(value, label, context) {
  if (typeof value !== "string" || !value.trim()) throw invalidQuery(context, label);
  return value.trim();
}

function boundedQueryInteger(value, label, minimum, maximum, fallback, context) {
  if (value === undefined) return fallback;
  const normalized = singleQueryValue(value, label, context);
  if (!/^[0-9]+$/.test(normalized)) throw invalidQuery(context, label);
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw invalidQuery(context, label);
  }
  return parsed;
}

function boundedEnvironmentInteger(value, minimum, maximum, fallback, context) {
  if (value === undefined || value === "") return fallback;
  if (!/^[0-9]+$/.test(String(value))) throw invalidEnvironment(context);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw invalidEnvironment(context);
  }
  return parsed;
}

function invalidConversationTag(context) {
  return new ApiError(
    400,
    "CONVERSATION_TAG_INVALID",
    context.route,
    "conversationTag must be a nonzero 0x-prefixed Starknet felt.",
    "Derive the opaque VEIL_CONVERSATION_TAG_V1 value on the client; never send a raw deal id, address, or channel key.",
  );
}

function invalidQuery(context) {
  return new ApiError(
    400,
    "INDEXER_QUERY_INVALID",
    context.route,
    "The indexer query does not match the bounded request schema.",
    "Send one value per documented field and keep limit/pageBlocks within their documented bounds.",
  );
}

function invalidEnvironment(context) {
  return new ApiError(
    503,
    "INDEXER_ENV_INVALID",
    context.route,
    "An indexer numeric environment setting is outside its safe bounds.",
    "Correct VEIL_INDEXER_CONFIRMATIONS or VEIL_INDEXER_REORG_OVERLAP before retrying.",
  );
}

function helperConfigMismatch(context) {
  return new ApiError(
    503,
    "INDEXER_HELPER_CONFIG_MISMATCH",
    context.route,
    "The helper override does not match the verified Sepolia deployment manifest.",
    "Remove the override or update the single verified manifest with deployment evidence first.",
  );
}

function invalidCursorRange(context) {
  return new ApiError(
    400,
    "INDEXER_CURSOR_RANGE_INVALID",
    context.route,
    "The cursor points before the verified helper deployment.",
    "Discard it and start a fresh scan for this conversation tag.",
  );
}
