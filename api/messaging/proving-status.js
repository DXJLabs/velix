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
import { createBackendProverClient } from "../../backend/dist/services/prover/prover-client.js";
import { normalizeProofError } from "../../backend/dist/services/prover/proof-errors.js";
import { getProverStatus } from "../../backend/dist/services/prover/proof-status.js";

export default async function handler(request, response) {
  const context = createRequestContext(request, "/api/messaging/proving-status");
  const startedAt = Date.now();

  try {
    setPrivateResponseHeaders(response);
    requireGet(request, response, context);
    assertNoRequestBody(request, context);
    enforceRateLimit(request, response, context, { limit: 20, windowMs: 60_000 });

    const client = createBackendProverClient();
    const result = await getProverStatus(client, context.requestId, request.signal);
    logEvent("info", "messaging.proving_status.complete", context, {
      status: result.status,
      retryCount: result.retryCount,
      durationMs: Date.now() - startedAt,
    });
    response.status(result.readyToAcceptProofJobs ? 200 : 503).json(result);
  } catch (error) {
    sendError(response, context, asApiError(error, context));
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
    "Call the prover health endpoint with method GET and no request body.",
  );
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
