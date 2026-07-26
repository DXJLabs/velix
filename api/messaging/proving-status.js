import {
  ApiError,
  authenticatePrivyRequest,
  createRequestContext,
  logEvent,
  sendError,
} from "../_lib/privy.js";

import {
  assertNoRequestBody,
  setPrivateResponseHeaders,
} from "../_lib/security.js";

import {
  enforceDistributedRateLimit,
} from "../_lib/distributed-rate-limit.js";

import {
  asProofJobApiError,
  readAuthenticatedProofJobStatus,
} from "../_lib/proof-jobs.js";

export default async function handler(
  request,
  response,
) {
  const context =
    createRequestContext(
      request,
      "/api/messaging/proving-status",
    );

  const startedAt =
    Date.now();

  try {
    setPrivateResponseHeaders(
      response,
    );

    requireGet(
      request,
      response,
      context,
    );

    assertNoRequestBody(
      request,
      context,
    );

    await enforceDistributedRateLimit(
      request,
      response,
      context,
      {
        scope:
          "api:messaging:proving-status",

        limit:
          60,

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
      await readAuthenticatedProofJobStatus({
        jobId:
          requireJobId(
            request,
            context,
          ),

        authenticatedSubject:
          authentication.userId,
      });

    logEvent(
      "info",
      "messaging.proving_status.complete",
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

    response.status(200).json(
      result,
    );
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

function requireGet(
  request,
  response,
  context,
) {
  if (request.method === "GET") {
    return;
  }

  response.setHeader(
    "Allow",
    "GET",
  );

  throw new ApiError(
    405,
    "METHOD_NOT_ALLOWED",
    context.route,
    "This endpoint only accepts GET requests.",
    "Call this endpoint with method GET and one jobId query parameter.",
  );
}

function requireJobId(
  request,
  context,
) {
  const value =
    request.query?.jobId;

  if (
    Array.isArray(value)
    || typeof value !== "string"
  ) {
    throw new ApiError(
      400,
      "PROOF_JOB_STATUS_JOB_ID_INVALID",
      context.route,
      "The request did not include one valid jobId query parameter.",
      "Call /api/messaging/proving-status?jobId=<opaque-job-id>.",
    );
  }

  return value;
}
