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
  setPrivateResponseHeaders,
} from "../_lib/security.js";

import {
  enforceDistributedRateLimit,
} from "../_lib/distributed-rate-limit.js";

import {
  asProofJobApiError,
  enqueueAuthenticatedProofJob,
} from "../_lib/proof-jobs.js";

const MAX_PROOF_REQUEST_BYTES =
  512 * 1024;

export default async function handler(
  request,
  response,
) {
  const context =
    createRequestContext(
      request,
      "/api/messaging/prepare",
    );

  const startedAt =
    Date.now();

  try {
    setPrivateResponseHeaders(
      response,
    );

    requirePost(
      request,
      response,
      context,
    );

    assertJsonBodyWithinLimit(
      request,
      context,
      MAX_PROOF_REQUEST_BYTES,
    );

    await enforceDistributedRateLimit(
      request,
      response,
      context,
      {
        scope:
          "api:messaging:prepare",

        limit:
          3,

        windowMs:
          60_000,
      },
    );

    const authentication =
      await authenticatePrivyRequest(
        request,
        context,
      );

    const result =
      await enqueueAuthenticatedProofJob({
        request:
          request.body,

        idempotencyKey:
          requireIdempotencyKey(
            request,
            context,
          ),

        authenticatedSubject:
          authentication.userId,

        onStatus(event) {
          logEvent(
            "info",
            "messaging.prover.prepare_status",
            context,
            {
              status:
                event.responseStatus,

              retryCount:
                event.retryCount,

              durationMs:
                event.durationMs,

              errorCode:
                event.errorCode,
            },
          );
        },
      });

    logEvent(
      "info",
      "messaging.prepare.queued",
      context,
      {
        status:
          result.state,

        durationMs:
          Date.now()
            - startedAt,

        ok:
          true,
      },
    );

    response.status(202).json({
      schemaVersion:
        result.schemaVersion,

      created:
        result.created,

      jobId:
        result.jobId,

      state:
        result.state,

      createdAtMs:
        result.createdAtMs,

      expiresAtMs:
        result.expiresAtMs,
    });
  } catch (error) {
    sendError(
      response,
      context,
      asProofJobApiError(
        error,
        context,
      ),
    );
  }
}

function requireIdempotencyKey(
  request,
  context,
) {
  const raw =
    request.headers
      ?.["idempotency-key"]
    ?? request.headers
      ?.["x-idempotency-key"];

  if (
    Array.isArray(raw)
    || typeof raw !== "string"
  ) {
    throw new ApiError(
      400,
      "PROOF_IDEMPOTENCY_KEY_MISSING",
      context.route,
      "The request did not include a valid Idempotency-Key header.",
      "Send one opaque Idempotency-Key value containing between 16 and 200 safe characters.",
    );
  }

  return raw;
}
