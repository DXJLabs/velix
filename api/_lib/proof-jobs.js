import {
  loadProofAccessEnvironment,
} from "../../backend/dist/config/proof-access-env.js";

import {
  loadProofPayloadKeyring,
} from "../../backend/dist/config/proof-payload-env.js";

import {
  loadProofQueuePolicy,
} from "../../backend/dist/config/proof-queue-env.js";

import {
  enqueueAuthenticatedMessageProof,
} from "../../backend/dist/services/prover/proof-enqueue-service.js";

import {
  PostgresProofEnqueueRepository,
} from "../../backend/dist/services/prover/postgres-proof-enqueue-repository.js";

import {
  PostgresProofJobRepository,
} from "../../backend/dist/services/prover/postgres-proof-job-repository.js";

import {
  createPostgresProvider,
} from "../../backend/dist/services/prover/postgres-provider.js";

import {
  createBackendProverClient,
} from "../../backend/dist/services/prover/prover-client.js";

import {
  getAuthorizedProofJobStatus,
} from "../../backend/dist/services/prover/proof-job-status.js";

import {
  readAuthorizedProofResult,
} from "../../backend/dist/services/prover/proof-result-access.js";

import {
  PostgresProofResultRepository,
} from "../../backend/dist/services/prover/postgres-proof-result-repository.js";

import {
  PostgresProofJobAccessRepository,
} from "../../backend/dist/services/security/postgres-proof-job-access-repository.js";

import {
  normalizeProofError,
} from "../../backend/dist/services/prover/proof-errors.js";

import {
  ApiError,
} from "./privy.js";

const SERVICE_CACHE =
  Symbol.for(
    "veil.api.proof-jobs.v2",
  );

export async function enqueueAuthenticatedProofJob(
  input,
) {
  const services =
    proofJobServices();

  const prover =
    createBackendProverClient({
      ...(typeof input.onStatus
        === "function"
        ? {
            onStatus:
              input.onStatus,
          }
        : {}),
    });

  return enqueueAuthenticatedMessageProof(
    {
      prover,

      repository:
        services.enqueueRepository,

      keyring:
        services.keyring,

      accessSecret:
        services.accessSecret,
    },
    {
      request:
        input.request,

      idempotencyKey:
        input.idempotencyKey,

      identityProvider:
        "privy",

      authenticatedSubject:
        input.authenticatedSubject,
    },
  );
}

export async function readAuthenticatedProofJobStatus(
  input,
) {
  const services =
    proofJobServices();

  return getAuthorizedProofJobStatus(
    {
      jobs:
        services.jobRepository,

      access:
        services.accessRepository,

      accessSecret:
        services.accessSecret,
    },
    {
      identityProvider:
        "privy",

      authenticatedSubject:
        input.authenticatedSubject,

      jobId:
        input.jobId,
    },
  );
}

export async function readAuthenticatedProofResult(
  input,
) {
  const services =
    proofJobServices();

  return readAuthorizedProofResult(
    {
      jobs:
        services.jobRepository,

      access:
        services.accessRepository,

      results:
        services.resultRepository,

      keyring:
        services.keyring,

      accessSecret:
        services.accessSecret,
    },
    {
      identityProvider:
        "privy",

      authenticatedSubject:
        input.authenticatedSubject,

      jobId:
        input.jobId,
    },
  );
}

export function asProofJobApiError(
  error,
  context,
) {
  if (
    error instanceof ApiError
  ) {
    return error;
  }

  const code =
    typeof error?.code === "string"
      ? error.code
      : "";

  if (
    code
      === "PROOF_JOB_NOT_FOUND_OR_FORBIDDEN"
  ) {
    return new ApiError(
      404,
      code,
      context.route,
      "The requested proof job was not found.",
      "Confirm the job identifier and use the same authenticated account that created it.",
    );
  }

  if (
    code
      === "PROOF_RESULT_NOT_READY"
  ) {
    return new ApiError(
      409,
      code,
      context.route,
      "The durable proof result is not ready.",
      "Read the private proving status and retry after the job reaches succeeded.",
    );
  }

  if (
    code
      === "PROOF_RESULT_UNAVAILABLE"
  ) {
    return new ApiError(
      409,
      code,
      context.route,
      "The durable proof job cannot provide a proof result.",
      "Inspect the private job status and submit a new idempotent proof request only when retryable.",
    );
  }

  if (
    code
      === "PROOF_JOB_STATUS_JOB_ID_INVALID"
    || code
      === "PROOF_IDEMPOTENCY_KEY_INVALID"
    || code
      === "PROOF_ENQUEUE_BINDING_INVALID"
    || code
      === "PROOF_ENQUEUE_ACCESS_BINDING_INVALID"
  ) {
    return new ApiError(
      400,
      code,
      context.route,
      "The durable proof job request is invalid.",
      "Use a valid opaque job identifier and a unique Idempotency-Key header.",
    );
  }

  if (
    code
      === "PROOF_ENQUEUE_IDEMPOTENCY_CONFLICT"
    || code
      === "PROOF_JOB_ACCESS_SUBJECT_CONFLICT"
  ) {
    return new ApiError(
      409,
      code,
      context.route,
      "The proof request conflicts with an existing durable job.",
      "Reuse an idempotency key only for the same request and authenticated account.",
    );
  }

  if (
    code
      === "PROOF_ENQUEUE_QUEUE_FULL"
  ) {
    return new ApiError(
      503,
      code,
      context.route,
      "The durable proof queue is currently full.",
      "Retry the same idempotent request after queued proof work has completed.",
    );
  }

  const normalized =
    normalizeProofError(error);

  if (
    normalized.code
      !== "VEIL_BACKEND_UNEXPECTED"
  ) {
    return new ApiError(
      normalized.status,
      normalized.code,
      context.route,
      normalized.why,
      normalized.howToFix,
    );
  }

  if (
    code.startsWith("PROOF_")
    || code.startsWith("DATABASE_")
    || code.startsWith("VEIL_PROOF_")
  ) {
    return new ApiError(
      503,
      code
        || "PROOF_JOB_STORAGE_UNAVAILABLE",
      context.route,
      "The durable proof job boundary is unavailable.",
      "Retry later after the server database, proof queue, and encrypted result storage have recovered.",
    );
  }

  return new ApiError(
    500,
    "VEIL_BACKEND_UNEXPECTED",
    context.route,
    "The VEIL messaging backend could not complete the durable proof operation.",
    "Retry once using the returned requestId, then inspect sanitized server logs.",
    {
      errorName:
        error?.name,

      errorCode:
        error?.code,
    },
  );
}

function proofJobServices() {
  if (
    globalThis[SERVICE_CACHE]
  ) {
    return globalThis[SERVICE_CACHE];
  }

  const provider =
    createPostgresProvider();

  const queuePolicy =
    loadProofQueuePolicy();

  const accessEnvironment =
    loadProofAccessEnvironment();

  const services =
    Object.freeze({
      enqueueRepository:
        new PostgresProofEnqueueRepository(
          provider,
          queuePolicy.maxQueuedJobs,
        ),

      jobRepository:
        new PostgresProofJobRepository(
          provider,
        ),

      accessRepository:
        new PostgresProofJobAccessRepository(
          provider,
        ),

      resultRepository:
        new PostgresProofResultRepository(
          provider,
        ),

      keyring:
        loadProofPayloadKeyring(),

      accessSecret:
        accessEnvironment.hmacSecret,
    });

  globalThis[SERVICE_CACHE] =
    services;

  return services;
}
