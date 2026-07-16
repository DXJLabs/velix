import {
  ApiError,
  createRequestContext,
  logEvent,
  requirePost,
  sendError,
} from "./_lib/privy.js";
import {
  assertJsonBodyWithinLimit,
  enforceRateLimit,
  setPrivateResponseHeaders,
} from "./_lib/security.js";

/**
 * Fail-closed paymaster boundary.
 *
 * The previous implementation forwarded arbitrary JSON-RPC with VEIL's AVNU
 * credential. `paymaster_buildTransaction` contains user-selected calls, while
 * `paymaster_executeTransaction` must be bound to the exact reviewed build.
 * This stateless proxy had no durable build/execute binding and no proof-aware
 * VEIL intent policy, so an allowlist at only one stage would be bypassable.
 */
export default async function handler(request, response) {
  const context = createRequestContext(request, "/api/paymaster");

  try {
    setPrivateResponseHeaders(response);
    logEvent("info", "paymaster.request.denied", context, {
      method: request.method,
      contentType: request.headers["content-type"],
    });
    requirePost(request, response, context);
    assertJsonBodyWithinLimit(request, context, 64 * 1024);
    enforceRateLimit(request, response, context, { limit: 20, windowMs: 60_000 });

    throw new ApiError(
      503,
      "PAYMASTER_ROUTE_UNVERIFIED",
      context.route,
      "VEIL paymaster forwarding is disabled because the proof-aware sponsorship route is not verified.",
      "Submit through a compatible direct wallet path, or implement and test an allowlisted build-to-execute intent binding before enabling sponsorship.",
    );
  } catch (error) {
    sendError(response, context, error);
  }
}
