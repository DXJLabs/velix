import {
  ApiError,
  createRequestContext,
  logEvent,
  requirePost,
  sendError,
} from "../_lib/privy.js";
import {
  assertJsonBodyWithinLimit,
  enforceRateLimit,
  setPrivateResponseHeaders,
} from "../_lib/security.js";

/**
 * Raw hash signing is intentionally disabled.
 *
 * A `{ walletId, hash }` API cannot prove what the hash authorizes. Adding a
 * caller-provided `purpose` label would not fix that: an attacker could attach
 * an allowed label to an arbitrary hash. Re-enable server-managed signing only
 * after this route accepts a narrowly defined structured intent and computes
 * the Starknet hash itself under a pinned account/chain/domain policy.
 */
export default async function handler(request, response) {
  const context = createRequestContext(request, "/api/wallet/sign");

  try {
    setPrivateResponseHeaders(response);
    logEvent("info", "wallet.sign.request.denied", context, {
      method: request.method,
      contentType: request.headers["content-type"],
    });
    requirePost(request, response, context);
    assertJsonBodyWithinLimit(request, context, 4_096);
    enforceRateLimit(request, response, context, { limit: 15, windowMs: 60_000 });

    throw new ApiError(
      503,
      "SERVER_SIGNING_DISABLED",
      context.route,
      "Server-managed raw Starknet hash signing is disabled.",
      "Use a wallet-side signer. A future server route must accept a reviewed structured intent and compute the authorized hash itself.",
    );
  } catch (error) {
    sendError(response, context, error);
  }
}
