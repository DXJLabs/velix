import crypto from "node:crypto";
import { PrivyClient, verifyAccessToken } from "@privy-io/node";

export const STARKNET_CHAIN_TYPE = "starknet";

export class ApiError extends Error {
  constructor(status, code, where, why, howToFix, details = {}) {
    super(why);
    this.status = status;
    this.code = code;
    this.where = where;
    this.why = why;
    this.howToFix = howToFix;
    this.details = details;
  }
}

export function createRequestContext(request, route) {
  const requestId = request.headers["x-vercel-id"]
    || request.headers["x-request-id"]
    || crypto.randomUUID();

  return { route, requestId };
}

export function logEvent(level, event, context, details = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    where: context.route,
    requestId: context.requestId,
    ...sanitizeLogDetails(details),
  };
  const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
  console[method](JSON.stringify(payload));
}

export function sendError(response, context, error) {
  const apiError = normalizeError(context.route, error);
  logEvent("error", "api.error", context, {
    code: apiError.code,
    why: apiError.why,
    howToFix: apiError.howToFix,
    status: apiError.status,
    ...serializeError(error),
    ...apiError.details,
  });
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
  logEvent("info", "auth.privy.access_token.verify.start", context, {
    authorizationPresent: Boolean(request.headers.authorization || request.headers.Authorization),
  });
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
      sessionId: verified.session_id,
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
      serializeError(error),
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
    error?.message || "The wallet operation failed unexpectedly.",
    "Check the structured server log for this requestId, confirm Privy credentials and wallet ownership, then retry.",
    serializeError(error),
  );
}

function serializeError(error) {
  if (!error) return {};
  const cause = error.cause;
  return {
    errorName: error.name,
    errorMessage: error.message || String(error),
    errorStack: error.stack,
    errorCauseName: cause?.name,
    errorCauseMessage: cause?.message || (cause ? String(cause) : undefined),
    errorCauseStack: cause?.stack,
  };
}

function sanitizeLogDetails(details) {
  return Object.fromEntries(
    Object.entries(details)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        if (/token|secret|authorization/i.test(key)) return [key, "[redacted]"];
        return [key, value];
      }),
  );
}
