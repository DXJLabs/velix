import {
  timingSafeEqual,
} from "node:crypto";

import type {
  ProofJobRepository,
} from "./proof-job-repository.js";

import type {
  ProofJobFailure,
  ProofJobRecord,
  ProofJobState,
} from "./proof-job.js";

import {
  assertProofJobAccessRecord,
  deriveProofJobSubjectHash,
  type ProofIdentityProvider,
} from "../security/proof-job-access.js";

import type {
  ProofJobAccessRepository,
} from "../security/proof-job-access-repository.js";

export interface ProofJobStatusDependencies {
  readonly jobs:
    Pick<
      ProofJobRepository,
      "getById"
    >;

  readonly access:
    Pick<
      ProofJobAccessRepository,
      "getByJobId"
    >;

  readonly accessSecret:
    Uint8Array;
}

export interface AuthorizedProofJobStatusInput {
  readonly identityProvider:
    ProofIdentityProvider;

  readonly authenticatedSubject:
    string;

  readonly jobId:
    string;
}

export interface PublicProofJobStatus {
  readonly schemaVersion:
    "veil-proof-job-status-v1";

  readonly jobId:
    string;

  readonly state:
    ProofJobState;

  readonly attempts:
    number;

  readonly maxAttempts:
    number;

  readonly createdAtMs:
    number;

  readonly updatedAtMs:
    number;

  readonly availableAtMs:
    number;

  readonly completedAtMs:
    number | null;

  readonly resultReference:
    string | null;

  readonly failure:
    ProofJobFailure | null;
}

export class ProofJobStatusError
extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "ProofJobStatusError";

    this.code =
      code;
  }
}

export async function getAuthorizedProofJobStatus(
  dependencies: ProofJobStatusDependencies,
  input: AuthorizedProofJobStatusInput,
): Promise<PublicProofJobStatus> {
  const jobId =
    requireJobId(
      input.jobId,
    );

  const expectedSubjectHash =
    deriveProofJobSubjectHash(
      dependencies.accessSecret,
      input.identityProvider,
      input.authenticatedSubject,
      jobId,
    );

  const access =
    await dependencies.access
      .getByJobId(jobId);

  if (access === null) {
    throw notFoundOrForbidden();
  }

  assertProofJobAccessRecord(
    access,
  );

  if (
    !sameHash(
      access.subjectHash,
      expectedSubjectHash,
    )
  ) {
    throw notFoundOrForbidden();
  }

  const job =
    await dependencies.jobs
      .getById(jobId);

  if (job === null) {
    throw statusError(
      "PROOF_JOB_STATUS_STORAGE_INCONSISTENT",
      "The proof job access binding references a missing durable job.",
    );
  }

  return publicStatus(job);
}

function publicStatus(
  job: ProofJobRecord,
): PublicProofJobStatus {
  return Object.freeze({
    schemaVersion:
      "veil-proof-job-status-v1",

    jobId:
      job.jobId,

    state:
      job.state,

    attempts:
      job.attempts,

    maxAttempts:
      job.maxAttempts,

    createdAtMs:
      job.createdAtMs,

    updatedAtMs:
      job.updatedAtMs,

    availableAtMs:
      job.availableAtMs,

    completedAtMs:
      job.completedAtMs,

    resultReference:
      job.resultReference,

    failure:
      job.failure === null
        ? null
        : Object.freeze({
            code:
              job.failure.code,

            retryable:
              job.failure.retryable,
          }),
  });
}

function sameHash(
  left: string,
  right: string,
): boolean {
  const leftBytes =
    Buffer.from(
      left,
      "hex",
    );

  const rightBytes =
    Buffer.from(
      right,
      "hex",
    );

  return (
    leftBytes.length === 32
    && rightBytes.length === 32
    && timingSafeEqual(
      leftBytes,
      rightBytes,
    )
  );
}

function requireJobId(
  value: string,
): string {
  if (
    typeof value !== "string"
    || !/^job_[A-Za-z0-9_-]{16,128}$/u
      .test(value)
  ) {
    throw statusError(
      "PROOF_JOB_STATUS_JOB_ID_INVALID",
      "The proof job identifier is invalid.",
    );
  }

  return value;
}

function notFoundOrForbidden():
  ProofJobStatusError {
  return statusError(
    "PROOF_JOB_NOT_FOUND_OR_FORBIDDEN",
    "The proof job is unavailable to this authenticated identity.",
  );
}

function statusError(
  code: string,
  message: string,
): ProofJobStatusError {
  return new ProofJobStatusError(
    code,
    message,
  );
}
