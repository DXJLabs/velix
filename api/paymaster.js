import {
  ApiError,
  authenticatePrivyRequest,
  createRequestContext,
  hashForLog,
  logEvent,
  requirePost,
  sendError,
} from "./_lib/privy.js";

const DEFAULT_PAYMASTER_URLS = {
  SN_MAIN: "https://starknet.paymaster.avnu.fi",
  SN_SEPOLIA: "https://sepolia.paymaster.avnu.fi",
};

export default async function handler(request, response) {
  const context = createRequestContext(request, "/api/paymaster");

  try {
    logEvent("info", "paymaster.request.received", context, {
      method: request.method,
      contentType: request.headers["content-type"],
      authorizationPresent: Boolean(request.headers.authorization || request.headers.Authorization),
    });
    requirePost(request, response, context);

    const auth = await authenticatePrivyRequest(request, context);
    const payload = await readJsonBody(request, context);
    const paymasterUrl = resolvePaymasterUrl();
    const apiKey = requireEnv("AVNU_PAYMASTER_API_KEY", context);

    logEvent("info", "paymaster.forward.start", context, {
      userIdHash: hashForLog(auth.userId),
      targetHost: new URL(paymasterUrl).host,
      rpcMethod: rpcMethodForLog(payload),
    });

    const upstream = await fetch(paymasterUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-paymaster-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });
    const body = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json";

    logEvent(upstream.ok ? "info" : "error", "paymaster.forward.response", context, {
      userIdHash: hashForLog(auth.userId),
      targetHost: new URL(paymasterUrl).host,
      rpcMethod: rpcMethodForLog(payload),
      status: upstream.status,
      ok: upstream.ok,
      responsePreview: upstream.ok ? undefined : body.slice(0, 500),
      howToFix: upstream.ok
        ? undefined
        : "Confirm AVNU_PAYMASTER_API_KEY is active, has Sepolia credits, and AVNU_PAYMASTER_NODE_URL matches the Starknet chain.",
    });

    response.status(upstream.status);
    response.setHeader("Content-Type", contentType);
    response.setHeader("Cache-Control", "no-store");
    response.send(body);
  } catch (error) {
    sendError(response, context, error);
  }
}

async function readJsonBody(request, context) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body);
    } catch {
      throw invalidBody(context);
    }
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) throw invalidBody(context);
  try {
    return JSON.parse(rawBody);
  } catch {
    throw invalidBody(context);
  }
}

function invalidBody(context) {
  return new ApiError(
    400,
    "PAYMASTER_BODY_INVALID",
    context.route,
    "The paymaster request body must be valid JSON-RPC.",
    "Let StarkZap/starknet.js call /api/paymaster directly; do not handcraft this request.",
  );
}

function resolvePaymasterUrl() {
  const configured = process.env.AVNU_PAYMASTER_NODE_URL || process.env.AVNU_PAYMASTER_URL;
  if (configured) return configured;

  const chainId = String(process.env.STARKNET_CHAIN_ID || process.env.VITE_STARKNET_CHAIN_ID || "SN_SEPOLIA")
    .trim()
    .toUpperCase();
  return chainId === "SN_MAIN" ? DEFAULT_PAYMASTER_URLS.SN_MAIN : DEFAULT_PAYMASTER_URLS.SN_SEPOLIA;
}

function rpcMethodForLog(payload) {
  if (Array.isArray(payload)) {
    return payload.map((item) => item?.method).filter(Boolean).join(",") || "batch";
  }
  return payload?.method || "unknown";
}

function requireEnv(name, context) {
  const value = process.env[name];
  if (value) return value;

  throw new ApiError(
    500,
    "SERVER_ENV_MISSING",
    context.route,
    `${name} is not configured.`,
    `Set ${name} in Vercel Production and Preview. Rotate the exposed AVNU key first, then paste the new key as this env value.`,
  );
}
