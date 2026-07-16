import crypto from "node:crypto";

import { ApiError } from "./privy.js";

const RATE_LIMIT_STORE = Symbol.for("veil.api.rate-limit.v1");
const DEFAULT_BODY_LIMIT_BYTES = 8 * 1024;

function rateLimitStore() {
  globalThis[RATE_LIMIT_STORE] ||= new Map();
  return globalThis[RATE_LIMIT_STORE];
}

export function enforceRateLimit(request, response, context, options = {}) {
  const limit = boundedInteger(options.limit, 1, 1_000, 30);
  const windowMs = boundedInteger(options.windowMs, 1_000, 60 * 60 * 1_000, 60_000);
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  const clientHash = crypto
    .createHash("sha256")
    .update(clientIdentity(request))
    .digest("hex")
    .slice(0, 24);
  const key = `${context.route}:${clientHash}:${windowStart}`;
  const store = rateLimitStore();

  pruneRateLimitStore(store, now);
  const current = store.get(key)?.count || 0;

  response.setHeader("X-RateLimit-Limit", String(limit));
  response.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - current - 1)));
  response.setHeader("X-RateLimit-Reset", String(Math.ceil(resetAt / 1_000)));

  if (current >= limit) {
    response.setHeader("Retry-After", String(Math.max(1, Math.ceil((resetAt - now) / 1_000))));
    throw new ApiError(
      429,
      "RATE_LIMITED",
      context.route,
      "Too many requests were sent to this endpoint.",
      "Wait until the Retry-After interval has elapsed, then retry once.",
    );
  }

  store.set(key, { count: current + 1, expiresAt: resetAt });
}

export function assertJsonBodyWithinLimit(request, context, maxBytes = DEFAULT_BODY_LIMIT_BYTES) {
  const limit = boundedInteger(maxBytes, 1, 1024 * 1024, DEFAULT_BODY_LIMIT_BYTES);
  const declaredLength = parseContentLength(request.headers?.["content-length"]);
  if (declaredLength > limit) throw bodyTooLarge(context, limit);

  const body = request.body;
  if (body === undefined || body === null) return;

  const contentType = String(request.headers?.["content-type"] || "").toLowerCase();
  if (contentType && !contentType.startsWith("application/json")) {
    throw new ApiError(
      415,
      "CONTENT_TYPE_UNSUPPORTED",
      context.route,
      "This endpoint accepts JSON requests only.",
      "Send Content-Type: application/json with a bounded JSON body.",
    );
  }

  let byteLength;
  try {
    byteLength = Buffer.byteLength(typeof body === "string" ? body : JSON.stringify(body), "utf8");
  } catch {
    throw new ApiError(
      400,
      "REQUEST_BODY_INVALID",
      context.route,
      "The request body is not valid JSON data.",
      "Send a JSON object without cyclic or unsupported values.",
    );
  }
  if (byteLength > limit) throw bodyTooLarge(context, limit);
}

export function assertNoRequestBody(request, context) {
  const declaredLength = parseContentLength(request.headers?.["content-length"]);
  const body = request.body;
  const hasParsedBody = body !== undefined
    && body !== null
    && !(typeof body === "string" && body.length === 0)
    && !(typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 0);

  if (declaredLength > 0 || hasParsedBody) {
    throw new ApiError(
      400,
      "REQUEST_BODY_NOT_ALLOWED",
      context.route,
      "This endpoint does not accept a request body.",
      "Remove the request body and send only the documented query parameters.",
    );
  }
}

export function setPrivateResponseHeaders(response) {
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

export function resetRateLimitsForTest() {
  rateLimitStore().clear();
}

function clientIdentity(request) {
  const forwarded = request.headers?.["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || "").split(",")[0];
  return String(
    request.headers?.["x-vercel-forwarded-for"]
      || firstForwarded
      || request.headers?.["x-real-ip"]
      || request.socket?.remoteAddress
      || "unknown-client",
  ).trim().slice(0, 256);
}

function pruneRateLimitStore(store, now) {
  if (store.size < 5_000) return;
  for (const [key, value] of store) {
    if (value.expiresAt <= now) store.delete(key);
  }
  if (store.size > 10_000) {
    for (const key of store.keys()) {
      store.delete(key);
      if (store.size <= 9_000) break;
    }
  }
}

function parseContentLength(value) {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : Number.POSITIVE_INFINITY;
}

function boundedInteger(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function bodyTooLarge(context, limit) {
  return new ApiError(
    413,
    "REQUEST_BODY_TOO_LARGE",
    context.route,
    `The request body exceeds the ${limit}-byte endpoint limit.`,
    "Send only the documented fields and keep private data, proofs, calldata, and plaintext off this endpoint.",
  );
}
