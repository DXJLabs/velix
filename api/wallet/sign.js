import {
  ApiError,
  assertHexHash,
  authenticatePrivyRequest,
  createPrivyClient,
  createRequestContext,
  getServerManagedStarknetWallet,
  hashForLog,
  logEvent,
  requirePost,
  sendError,
} from "../_lib/privy.js";
import {
  assertJsonBodyWithinLimit,
  enforceRateLimit,
  setPrivateResponseHeaders,
} from "../_lib/security.js";

const PRIVY_SIGN_TIMEOUT_MS = 20_000;

export default async function handler(request, response) {
  const context = createRequestContext(request, "/api/wallet/sign");

  try {
    setPrivateResponseHeaders(response);
    requirePost(request, response, context);
    assertJsonBodyWithinLimit(request, context, 4_096);
    enforceRateLimit(request, response, context, { limit: 30, windowMs: 60_000 });

    const { walletId, hash } = request.body || {};
    if (!walletId || !hash) {
      throw new ApiError(
        400,
        "WALLET_SIGN_INPUT_MISSING",
        context.route,
        "walletId and hash are required.",
        "Let the authenticated StarkZap Privy signer call this endpoint.",
      );
    }

    const normalizedHash = assertHexHash(hash, context);
    const auth = await authenticatePrivyRequest(request, context);
    const client = createPrivyClient(context);
    const wallet = await getServerManagedStarknetWallet(client, auth.userId, walletId, context);
    if (!wallet) {
      throw new ApiError(
        403,
        "WALLET_MAPPING_MISMATCH",
        context.route,
        "The requested Starknet wallet is not mapped to the authenticated Privy user.",
        "Use the wallet returned by /api/wallet/starknet for the current Privy session.",
      );
    }

    logEvent("info", "wallet.sign.start", context, {
      userIdHash: hashForLog(auth.userId),
      walletIdHash: hashForLog(wallet.id),
      walletMode: "server-managed",
    });

    const result = await Promise.race([
      client.wallets().rawSign(wallet.id, { params: { hash: normalizedHash } }),
      timeoutAfter(PRIVY_SIGN_TIMEOUT_MS),
    ]);
    const signature = typeof result === "string"
      ? result
      : result?.signature || result?.rawSignature || result?.raw_signature;
    if (!signature) {
      throw new ApiError(
        502,
        "PRIVY_SIGNATURE_INVALID",
        context.route,
        "Privy returned no Starknet signature.",
        "Confirm the Privy wallet supports raw_sign and retry after a fresh login.",
      );
    }

    logEvent("info", "wallet.sign.complete", context, {
      userIdHash: hashForLog(auth.userId),
      walletIdHash: hashForLog(wallet.id),
      walletMode: "server-managed",
      ok: true,
    });
    response.status(200).json({ signature });
  } catch (error) {
    sendError(response, context, error);
  }
}

function timeoutAfter(timeoutMs) {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => {
      reject(new ApiError(
        504,
        "PRIVY_SIGN_TIMEOUT",
        "/api/wallet/sign",
        "Privy did not return a signature before the timeout.",
        "Retry once with a fresh Privy session.",
      ));
    }, timeoutMs);
    timer.unref?.();
  });
}
