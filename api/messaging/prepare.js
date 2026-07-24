import {
  ApiError,
  authenticatePrivyRequest,
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
import { createBackendProverClient } from "../../backend/dist/services/prover/prover-client.js";
import { normalizeProofError } from "../../backend/dist/services/prover/proof-errors.js";
import { requestMessageProof } from "../../backend/dist/services/prover/proof-request.js";

const MAX_PROOF_REQUEST_BYTES = 512 * 1024;

export default async function handler(request, response) {
  const context = createRequestContext(request, "/api/messaging/prepare");
  const startedAt = Date.now();

  try {
    setPrivateResponseHeaders(response);
    requirePost(request, response, context);
    assertJsonBodyWithinLimit(request, context, MAX_PROOF_REQUEST_BYTES);
    enforceRateLimit(request, response, context, { limit: 3, windowMs: 60_000 });
    await authenticatePrivyRequest(request, context);

    const client = createBackendProverClient({
      onStatus(event) {
        logEvent("info", "messaging.prover.status", context, {
          status: event.responseStatus,
          retryCount: event.retryCount,
          durationMs: event.durationMs,
          errorCode: event.errorCode,
        });
      },
    });
    const result = await requestMessageProof(client, request.body, request.signal);

    logEvent("info", "messaging.prepare.complete", context, {
      status: result.status,
      retryCount: result.retryCount,
      durationMs: Date.now() - startedAt,
    });
    response.status(200).json(result);
  } catch (error) {
    sendError(response, context, asApiError(error, context));
  }
}

function asApiError(error, context) {
  if (error instanceof ApiError) return error;
  const normalized = normalizeProofError(error);
  return new ApiError(
    normalized.status,
    normalized.code,
    context.route,
    normalized.why,
    normalized.howToFix,
    { errorName: error?.name, errorCode: error?.code },
  );
}
