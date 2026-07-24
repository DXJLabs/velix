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
import { loadRpcEnvironment } from "../../backend/dist/config/backend-env.js";
import {
  RpcDiscoveryClient,
  RpcDiscoveryError,
  toHexFelt,
} from "../../backend/dist/services/discovery/rpc-discovery.js";

const ALLOWED_QUERY_FIELDS = new Set(["transactionHash"]);

export default async function handler(request, response) {
  const context = createRequestContext(request, "/api/messaging/transaction-status");
  const startedAt = Date.now();

  try {
    setPrivateResponseHeaders(response);
    requireGet(request, response, context);
    assertNoRequestBody(request, context);
    enforceRateLimit(request, response, context, { limit: 30, windowMs: 60_000 });
    const transactionHash = validateQuery(request.query ?? {}, context);
    const environment = loadRpcEnvironment();
    const rpc = new RpcDiscoveryClient({ rpcUrl: environment.rpcUrl });
    const status = await rpc.transactionStatus(transactionHash, request.signal);

    logEvent("info", "messaging.transaction_status.complete", context, {
      status: status.finalityStatus,
      blockNumber: status.blockNumber ?? undefined,
      durationMs: Date.now() - startedAt,
    });
    response.status(200).json({
      schemaVersion: "veil-transaction-status-v1",
      chainId: environment.chainId,
      ...status,
    });
  } catch (error) {
    sendError(response, context, asApiError(error, context));
  }
}

export function validateQuery(query, context) {
  if (!query || typeof query !== "object" || Array.isArray(query)) throw invalidQuery(context);
  if (Object.keys(query).some((key) => !ALLOWED_QUERY_FIELDS.has(key))) throw invalidQuery(context);
  if (typeof query.transactionHash !== "string" || !query.transactionHash.trim()) throw invalidQuery(context);
  try {
    return toHexFelt(query.transactionHash.trim(), "transactionHash");
  } catch {
    throw invalidQuery(context);
  }
}

function requireGet(request, response, context) {
  if (request.method === "GET") return;
  response.setHeader("Allow", "GET");
  throw new ApiError(
    405,
    "METHOD_NOT_ALLOWED",
    context.route,
    "This endpoint only accepts GET requests.",
    "Call it with transactionHash as the only query field.",
  );
}

function invalidQuery(context) {
  return new ApiError(
    400,
    "TRANSACTION_STATUS_QUERY_INVALID",
    context.route,
    "transactionHash must be the only query field and must contain a Starknet felt.",
    "Send GET /api/messaging/transaction-status?transactionHash=0x... without a request body.",
  );
}

function asApiError(error, context) {
  if (error instanceof ApiError) return error;
  if (error instanceof RpcDiscoveryError) {
    const status = error.code === "RPC_TIMEOUT" ? 504 : error.code === "RPC_REJECTED" ? 404 : 502;
    return new ApiError(
      status,
      error.code,
      context.route,
      "The Starknet transaction status could not be read.",
      "Retry once, then verify the Sepolia RPC and transaction hash.",
      { errorName: error.name, errorCode: error.code },
    );
  }
  return error;
}
