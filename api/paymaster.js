import {
  ApiError,
  authenticatePrivyRequest,
  createPrivyClient,
  createRequestContext,
  getServerManagedStarknetWallet,
  hashForLog,
  logEvent,
  requirePost,
  sendError,
} from "./_lib/privy.js";
import {
  assertJsonBodyWithinLimit,
  enforceRateLimit,
  setPrivateResponseHeaders,
} from "./_lib/security.js";
import {
  assertWalletDeploySponsorshipEnabled,
  validateWalletDeployPayload,
} from "./_lib/wallet-deployment.js";

const DEFAULT_SEPOLIA_PAYMASTER_URL = "https://sepolia.paymaster.avnu.fi";
const UPSTREAM_TIMEOUT_MS = 20_000;

export default async function handler(request, response) {
  const context = createRequestContext(request, "/api/paymaster");

  try {
    setPrivateResponseHeaders(response);
    requirePost(request, response, context);
    assertJsonBodyWithinLimit(request, context, 64 * 1024);
    enforceRateLimit(request, response, context, { limit: 8, windowMs: 60_000 });

    const auth = await authenticatePrivyRequest(request, context);
    assertWalletDeploySponsorshipEnabled(context);

    const client = createPrivyClient(context);
    const wallet = await getServerManagedStarknetWallet(client, auth.userId, undefined, context);
    const publicKey = wallet?.public_key || wallet?.publicKey;
    if (!wallet || !publicKey) {
      throw new ApiError(
        403,
        "WALLET_MAPPING_MISSING",
        context.route,
        "No server-managed Starknet wallet is mapped to the authenticated Privy user.",
        "Create or restore the user's Starknet wallet through /api/wallet/starknet before onboarding.",
      );
    }

    const payload = parseJsonBody(request.body, context);
    const validated = validateWalletDeployPayload(payload, publicKey, context);
    const paymasterUrl = resolvePaymasterUrl(context);
    const apiKey = requireServerEnv("AVNU_PAYMASTER_API_KEY", context);

    logEvent("info", "paymaster.wallet_deploy.forward.start", context, {
      method: request.method,
      rpcMethod: validated.method,
      targetHost: new URL(paymasterUrl).host,
      userIdHash: hashForLog(auth.userId),
      walletIdHash: hashForLog(wallet.id),
    });

    const upstream = await fetch(paymasterUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-paymaster-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const body = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json";

    logEvent(upstream.ok ? "info" : "warn", "paymaster.wallet_deploy.forward.complete", context, {
      rpcMethod: validated.method,
      targetHost: new URL(paymasterUrl).host,
      status: upstream.status,
      ok: upstream.ok,
      userIdHash: hashForLog(auth.userId),
      walletIdHash: hashForLog(wallet.id),
    });

    response.status(upstream.status);
    response.setHeader("Content-Type", contentType);
    response.send(body);
  } catch (error) {
    sendError(response, context, error);
  }
}

function parseJsonBody(body, context) {
  if (body && typeof body === "object" && !Array.isArray(body)) return body;
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Normalized below.
    }
  }
  throw new ApiError(
    400,
    "PAYMASTER_BODY_INVALID",
    context.route,
    "The paymaster request body must be one valid JSON-RPC object.",
    "Let StarkZap call /api/paymaster directly.",
  );
}

function resolvePaymasterUrl(context) {
  const configured = String(
    process.env.AVNU_PAYMASTER_NODE_URL
      || process.env.AVNU_PAYMASTER_URL
      || DEFAULT_SEPOLIA_PAYMASTER_URL,
  ).trim();
  let parsed;
  try {
    parsed = new URL(configured);
  } catch {
    throw invalidPaymasterUrl(context);
  }
  if (parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || parsed.origin !== DEFAULT_SEPOLIA_PAYMASTER_URL
    || (parsed.pathname !== "/" && parsed.pathname !== "")) {
    throw invalidPaymasterUrl(context);
  }
  return parsed.origin;
}

function invalidPaymasterUrl(context) {
  return new ApiError(
    500,
    "PAYMASTER_URL_INVALID",
    context.route,
    "The AVNU paymaster endpoint is not the pinned Sepolia origin.",
    `Set AVNU_PAYMASTER_NODE_URL=${DEFAULT_SEPOLIA_PAYMASTER_URL}.`,
  );
}

function requireServerEnv(name, context) {
  const value = process.env[name];
  if (value) return value;
  throw new ApiError(
    500,
    "SERVER_ENV_MISSING",
    context.route,
    `${name} is not configured.`,
    `Store the rotated ${name} only in Vercel server environment variables, then redeploy.`,
  );
}
