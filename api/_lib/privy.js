import crypto from "node:crypto";
import { PrivyClient, verifyAccessToken } from "@privy-io/node";

export const STARKNET_CHAIN_TYPE = "starknet";

export class ApiError extends Error {
  constructor(status, code, where, why, howToFix, details = {}) {
    super(why);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.where = where;
    this.why = why;
    this.howToFix = howToFix;
    this.details = details;
  }
}

export function createRequestContext(request, route) {
  const suppliedRequestId = request.headers?.["x-vercel-id"] || request.headers?.["x-request-id"];
  const requestId = typeof suppliedRequestId === "string"
    && /^[A-Za-z0-9._:-]{1,128}$/.test(suppliedRequestId)
    ? suppliedRequestId
    : crypto.randomUUID();

  return { route, requestId };
}

export function logEvent(level, event, context, details = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level: ["info", "warn", "error"].includes(level) ? level : "info",
    event: safeLogLabel(event, "api.event"),
    where: safeLogLabel(context.route, "api"),
    requestId: safeLogLabel(context.requestId, "generated"),
    ...sanitizeLogDetails(details),
  };
  const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
  console[method](JSON.stringify(payload));
}

export function sendError(response, context, error) {
  const apiError = normalizeError(context.route, error);
  logEvent("error", "api.error", context, {
    ...apiError.details,
    code: apiError.code,
    status: apiError.status,
    errorName: error?.name,
    errorCode: error?.code,
  });
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.status(apiError.status).json({
    error: apiError.why,
    code: apiError.code,
    where: apiError.where,
    why: apiError.why,
    howToFix: apiError.howToFix,
    requestId: context.requestId,
  });
}

export function requirePost(request, response, context) {
  if (request.method === "POST") return true;
  response.setHeader("Allow", "POST");
  throw new ApiError(
    405,
    "METHOD_NOT_ALLOWED",
    context.route,
    "This endpoint only accepts POST requests.",
    "Call this endpoint with method POST and a JSON request body.",
  );
}

export function createPrivyClient(context) {
  return new PrivyClient({
    appId: requireEnv("PRIVY_APP_ID", context),
    appSecret: requireEnv("PRIVY_APP_SECRET", context),
  });
}

export async function authenticatePrivyRequest(request, context) {
  logEvent("info", "auth.privy.access_token.verify.start", context);
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    throw new ApiError(
      401,
      "PRIVY_ACCESS_TOKEN_MISSING",
      context.route,
      "The request did not include a Privy access token.",
      "After Privy login, call getAccessToken() and send it as Authorization: Bearer <token>.",
    );
  }

  try {
    const verified = await verifyAccessToken({
      access_token: accessToken,
      app_id: requireEnv("PRIVY_APP_ID", context),
      verification_key: requireEnv("PRIVY_VERIFICATION_KEY", context),
    });
    logEvent("info", "auth.privy.access_token.verified", context, {
      userIdHash: hashForLog(verified.user_id),
    });
    return {
      userId: verified.user_id,
      sessionId: verified.session_id,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      401,
      "PRIVY_ACCESS_TOKEN_INVALID",
      context.route,
      "The Privy access token could not be verified.",
      "Confirm PRIVY_APP_ID and PRIVY_VERIFICATION_KEY match the same Privy app, then retry after a fresh login.",
      { errorName: error?.name, errorCode: error?.code },
    );
  }
}

export async function getServerManagedStarknetWallet(client, userId, walletId, context) {
  const externalId = starknetWalletExternalId(userId);
  for await (const wallet of client.wallets().list({
    external_id: externalId,
    chain_type: STARKNET_CHAIN_TYPE,
  })) {
    if (wallet.archived_at) continue;
    if (!walletId || wallet.id === walletId) return wallet;
  }

  return null;
}

export function starknetWalletExternalId(userId) {
  const digest = crypto.createHash("sha256").update(String(userId)).digest("hex").slice(0, 48);
  return `veil_starknet_${digest}`;
}

export function formatWallet(wallet) {
  return {
    id: wallet.id,
    address: wallet.address,
    publicKey: wallet.public_key || wallet.publicKey,
  };
}

export function assertHexHash(hash, context) {
  const normalized = String(hash || "").trim();
  if (!/^0x[0-9a-fA-F]+$/.test(normalized) || normalized.length > 66) {
    throw new ApiError(
      400,
      "INVALID_STARKNET_HASH",
      context.route,
      "hash must be a 0x-prefixed Starknet transaction hash or message hash.",
      "Pass the exact hash produced by starknet.js for the transaction being signed.",
    );
  }
  return normalized;
}

export function hashForLog(value) {
  if (!value) return undefined;
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

export function stableIdempotencyKey(prefix, value) {
  const digest = crypto.createHash("sha256").update(String(value)).digest("hex");
  return `${prefix}-${digest}`;
}

function requireEnv(name, context, aliases = []) {
  for (const candidate of [name, ...aliases]) {
    const value = process.env[candidate];
    if (value) return value;
  }

  throw new ApiError(
    500,
    "SERVER_ENV_MISSING",
    context.route,
    `${name} is not configured.`,
    `Set ${name}${aliases.length ? ` or ${aliases.join(" / ")}` : ""} in the server environment for the same Privy app used by VITE_PRIVY_APP_ID.`,
  );
}

function getBearerToken(request) {
  const authorization = request.headers.authorization || request.headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization).trim());
  return match?.[1] || "";
}

function normalizeError(route, error) {
  if (error instanceof ApiError) return error;

  return new ApiError(
    500,
    "UNEXPECTED_WALLET_ERROR",
    route,
    "The server could not complete this request.",
    "Retry once using the requestId shown. If it fails again, check the sanitized service health logs.",
    { errorName: error?.name, errorCode: error?.code },
  );
}

const LOG_FIELD_ALLOWLIST = new Set([
  "address",
  "blockNumber",
  "chainId",
  "chainType",
  "code",
  "contentType",
  "cursorPresent",
  "durationMs",
  "errorCode",
  "errorName",
  "eventCount",
  "eventIndex",
  "eventType",
  "externalIdPresent",
  "fromBlock",
  "helperAddress",
  "limit",
  "method",
  "ok",
  "pageBlocks",
  "provenance",
  "publicKeyPresent",
  "reorgDetected",
  "retryCount",
  "rpcMethod",
  "status",
  "targetHost",
  "toBlock",
  "upstreamStatus",
  "userIdHash",
  "walletIdHash",
  "walletMode",
]);

const SENSITIVE_KEY = /(?:authorization|cookie|token|secret|private.?key|viewing.?key|channel.?key|claim|registry|note|balance|proof|witness|calldata|signature|plaintext|message|memo|terms|body|payload)/i;
const LOG_LABEL_FIELDS = new Set([
  "chainId",
  "chainType",
  "code",
  "contentType",
  "errorCode",
  "errorName",
  "method",
  "provenance",
  "rpcMethod",
  "walletMode",
]);

export function sanitizeLogDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};

  return Object.fromEntries(
    Object.entries(details)
      .filter(([key, value]) => LOG_FIELD_ALLOWLIST.has(key) && value !== undefined)
      .map(([key, value]) => [
        key,
        LOG_LABEL_FIELDS.has(key)
          ? safeLogLabel(value, "invalid-label")
          : sanitizeForLog(value, key),
      ]),
  );
}

export function sanitizeForLog(value, key = "", depth = 0, seen = new WeakSet()) {
  if (SENSITIVE_KEY.test(key)) return "[redacted]";
  if (value === null || value === undefined) return value;
  if (depth > 5) return "[truncated]";
  if (typeof value === "string") return sanitizeLogString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return `[${typeof value}]`;

  if (value instanceof Error) {
    return {
      name: safeLogLabel(value.name, "Error"),
      code: sanitizeForLog(value.code, "code", depth + 1, seen),
      cause: sanitizeForLog(value.cause, "cause", depth + 1, seen),
    };
  }

  if (typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    if (Array.isArray(value)) {
      return value.slice(0, 25).map((item) => sanitizeForLog(item, "arrayItem", depth + 1, seen));
    }
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 50)
        .map(([nestedKey, nestedValue]) => [
          safeLogLabel(nestedKey, "field"),
          sanitizeForLog(nestedValue, nestedKey, depth + 1, seen),
        ]),
    );
  }

  return "[unsupported]";
}

function sanitizeLogString(value) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/([?&](?:token|secret|key|proof|signature|authorization)=)[^&#\s]+/gi, "$1[redacted]")
    .replace(/(["']?(?:token|secret|privateKey|viewingKey|claimSecret|proof|signature)["']?\s*[:=]\s*["']?)[^,"'\s}]+/gi, "$1[redacted]")
    .slice(0, 512);
}

function safeLogLabel(value, fallback) {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9._:/-]{1,128}$/.test(normalized) ? normalized : fallback;
}
