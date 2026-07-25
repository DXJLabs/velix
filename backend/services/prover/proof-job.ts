export const PROOF_JOB_STATES =
  Object.freeze([
    "queued",
    "running",
    "succeeded",
    "failed",
    "cancelled",
  ] as const);

export type ProofJobState =
  typeof PROOF_JOB_STATES[number];

export interface ProofJobFailure {
  readonly code: string;
  readonly retryable: boolean;
}

export interface ProofJobRecord {
  readonly schemaVersion:
    "veil-proof-job-v1";

  readonly jobId: string;
  readonly requestFingerprint: string;
  readonly idempotencyKeyHash: string;
  readonly payloadReference: string;

  readonly state: ProofJobState;
  readonly revision: number;
  readonly attempts: number;
  readonly maxAttempts: number;

  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly availableAtMs: number;

  readonly leaseOwnerHash: string | null;
  readonly leaseExpiresAtMs: number | null;

  readonly cancellationRequestedAtMs:
    number | null;

  readonly completedAtMs: number | null;
  readonly resultReference: string | null;
  readonly failure: ProofJobFailure | null;
}

export interface CreateProofJobInput {
  jobId: string;
  requestFingerprint: string;
  idempotencyKeyHash: string;
  payloadReference: string;
  nowMs: number;
  maxAttempts?: number;
}

export interface ClaimProofJobInput {
  leaseOwnerHash: string;
  nowMs: number;
  leaseDurationMs: number;
}

export class ProofJobStateError
  extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "ProofJobStateError";

    this.code = code;
  }
}

const MAX_ATTEMPTS = 10;
const MIN_LEASE_MS = 1_000;
const MAX_LEASE_MS = 30 * 60_000;
const MAX_RETRY_DELAY_MS = 60 * 60_000;

export function createQueuedProofJob(
  input: CreateProofJobInput,
): ProofJobRecord {
  const nowMs =
    requireTimestamp(
      input.nowMs,
      "nowMs",
    );

  const maxAttempts =
    input.maxAttempts ?? 3;

  requireBoundedInteger(
    maxAttempts,
    1,
    MAX_ATTEMPTS,
    "maxAttempts",
  );

  return freezeJob({
    schemaVersion:
      "veil-proof-job-v1",

    jobId:
      requireJobId(input.jobId),

    requestFingerprint:
      requireFingerprint(
        input.requestFingerprint,
      ),

    idempotencyKeyHash:
      requireSha256(
        input.idempotencyKeyHash,
        "idempotencyKeyHash",
      ),

    payloadReference:
      requireOpaqueReference(
        input.payloadReference,
        "payloadReference",
      ),

    state:
      "queued",

    revision:
      0,

    attempts:
      0,

    maxAttempts,

    createdAtMs:
      nowMs,

    updatedAtMs:
      nowMs,

    availableAtMs:
      nowMs,

    leaseOwnerHash:
      null,

    leaseExpiresAtMs:
      null,

    cancellationRequestedAtMs:
      null,

    completedAtMs:
      null,

    resultReference:
      null,

    failure:
      null,
  });
}

export function claimProofJob(
  job: ProofJobRecord,
  input: ClaimProofJobInput,
): ProofJobRecord {
  requireState(
    job,
    "queued",
  );

  const nowMs =
    requireTimestamp(
      input.nowMs,
      "nowMs",
    );

  if (
    nowMs < job.availableAtMs
  ) {
    throw stateError(
      "PROOF_JOB_NOT_AVAILABLE",
      "The proof job is not available yet.",
    );
  }

  if (
    job.attempts >= job.maxAttempts
  ) {
    throw stateError(
      "PROOF_JOB_ATTEMPTS_EXHAUSTED",
      "The proof job exhausted its attempts.",
    );
  }

  const leaseDurationMs =
    requireBoundedInteger(
      input.leaseDurationMs,
      MIN_LEASE_MS,
      MAX_LEASE_MS,
      "leaseDurationMs",
    );

  return freezeJob({
    ...job,

    state:
      "running",

    revision:
      job.revision + 1,

    attempts:
      job.attempts + 1,

    updatedAtMs:
      nowMs,

    leaseOwnerHash:
      requireSha256(
        input.leaseOwnerHash,
        "leaseOwnerHash",
      ),

    leaseExpiresAtMs:
      nowMs + leaseDurationMs,

    failure:
      null,
  });
}

export function renewProofJobLease(
  job: ProofJobRecord,
  input: ClaimProofJobInput,
): ProofJobRecord {
  const nowMs =
    requireOwnedActiveLease(
      job,
      input.leaseOwnerHash,
      input.nowMs,
    );

  if (
    job.cancellationRequestedAtMs
      !== null
  ) {
    throw stateError(
      "PROOF_JOB_CANCELLATION_REQUESTED",
      "The proof job cannot renew after cancellation was requested.",
    );
  }

  const leaseDurationMs =
    requireBoundedInteger(
      input.leaseDurationMs,
      MIN_LEASE_MS,
      MAX_LEASE_MS,
      "leaseDurationMs",
    );

  return freezeJob({
    ...job,

    revision:
      job.revision + 1,

    updatedAtMs:
      nowMs,

    leaseExpiresAtMs:
      nowMs + leaseDurationMs,
  });
}

export function requestProofJobCancellation(
  job: ProofJobRecord,
  nowValue: number,
): ProofJobRecord {
  const nowMs =
    requireTimestamp(
      nowValue,
      "nowMs",
    );

  if (
    isTerminalProofJobState(
      job.state,
    )
  ) {
    return job;
  }

  if (
    job.cancellationRequestedAtMs
      !== null
  ) {
    return job;
  }

  if (
    job.state === "queued"
  ) {
    return freezeJob({
      ...job,

      state:
        "cancelled",

      revision:
        job.revision + 1,

      updatedAtMs:
        nowMs,

      cancellationRequestedAtMs:
        nowMs,

      completedAtMs:
        nowMs,
    });
  }

  return freezeJob({
    ...job,

    revision:
      job.revision + 1,

    updatedAtMs:
      nowMs,

    cancellationRequestedAtMs:
      nowMs,
  });
}

export function acknowledgeProofJobCancellation(
  job: ProofJobRecord,
  leaseOwnerHash: string,
  nowValue: number,
): ProofJobRecord {
  const nowMs =
    requireOwnedActiveLease(
      job,
      leaseOwnerHash,
      nowValue,
    );

  if (
    job.cancellationRequestedAtMs
      === null
  ) {
    throw stateError(
      "PROOF_JOB_CANCELLATION_NOT_REQUESTED",
      "The proof job has no cancellation request.",
    );
  }

  return freezeJob({
    ...job,

    state:
      "cancelled",

    revision:
      job.revision + 1,

    updatedAtMs:
      nowMs,

    completedAtMs:
      nowMs,

    leaseOwnerHash:
      null,

    leaseExpiresAtMs:
      null,
  });
}

export function completeProofJobSuccess(
  job: ProofJobRecord,
  input: {
    leaseOwnerHash: string;
    resultReference: string;
    nowMs: number;
  },
): ProofJobRecord {
  const nowMs =
    requireOwnedActiveLease(
      job,
      input.leaseOwnerHash,
      input.nowMs,
    );

  if (
    job.cancellationRequestedAtMs
      !== null
  ) {
    throw stateError(
      "PROOF_JOB_CANCELLATION_REQUESTED",
      "A cancelled proof job cannot complete successfully.",
    );
  }

  return freezeJob({
    ...job,

    state:
      "succeeded",

    revision:
      job.revision + 1,

    updatedAtMs:
      nowMs,

    completedAtMs:
      nowMs,

    resultReference:
      requireOpaqueReference(
        input.resultReference,
        "resultReference",
      ),

    leaseOwnerHash:
      null,

    leaseExpiresAtMs:
      null,

    failure:
      null,
  });
}

export function completeProofJobFailure(
  job: ProofJobRecord,
  input: {
    leaseOwnerHash: string;
    errorCode: string;
    retryable: boolean;
    retryDelayMs: number;
    nowMs: number;
  },
): ProofJobRecord {
  const nowMs =
    requireOwnedActiveLease(
      job,
      input.leaseOwnerHash,
      input.nowMs,
    );

  if (
    job.cancellationRequestedAtMs
      !== null
  ) {
    return acknowledgeProofJobCancellation(
      job,
      input.leaseOwnerHash,
      nowMs,
    );
  }

  const failure =
    Object.freeze({
      code:
        requireErrorCode(
          input.errorCode,
        ),

      retryable:
        input.retryable,
    });

  const retryDelayMs =
    requireBoundedInteger(
      input.retryDelayMs,
      0,
      MAX_RETRY_DELAY_MS,
      "retryDelayMs",
    );

  if (
    input.retryable
    && job.attempts
      < job.maxAttempts
  ) {
    return freezeJob({
      ...job,

      state:
        "queued",

      revision:
        job.revision + 1,

      updatedAtMs:
        nowMs,

      availableAtMs:
        nowMs + retryDelayMs,

      leaseOwnerHash:
        null,

      leaseExpiresAtMs:
        null,

      failure,
    });
  }

  return freezeJob({
    ...job,

    state:
      "failed",

    revision:
      job.revision + 1,

    updatedAtMs:
      nowMs,

    completedAtMs:
      nowMs,

    leaseOwnerHash:
      null,

    leaseExpiresAtMs:
      null,

    failure,
  });
}

export function isTerminalProofJobState(
  state: ProofJobState,
): boolean {
  return state === "succeeded"
    || state === "failed"
    || state === "cancelled";
}

function requireOwnedActiveLease(
  job: ProofJobRecord,
  ownerValue: string,
  nowValue: number,
): number {
  requireState(
    job,
    "running",
  );

  const nowMs =
    requireTimestamp(
      nowValue,
      "nowMs",
    );

  const leaseOwnerHash =
    requireSha256(
      ownerValue,
      "leaseOwnerHash",
    );

  if (
    job.leaseOwnerHash
      !== leaseOwnerHash
  ) {
    throw stateError(
      "PROOF_JOB_LEASE_OWNER_MISMATCH",
      "The proof job lease owner does not match.",
    );
  }

  if (
    job.leaseExpiresAtMs === null
    || nowMs
      >= job.leaseExpiresAtMs
  ) {
    throw stateError(
      "PROOF_JOB_LEASE_EXPIRED",
      "The proof job lease expired.",
    );
  }

  return nowMs;
}

function requireState(
  job: ProofJobRecord,
  expected: ProofJobState,
): void {
  if (
    job.state !== expected
  ) {
    throw stateError(
      "PROOF_JOB_STATE_INVALID",
      `Expected ${expected} proof job state, received ${job.state}.`,
    );
  }
}

function requireJobId(
  value: string,
): string {
  if (
    !/^job_[A-Za-z0-9_-]{16,128}$/u
      .test(value)
  ) {
    throw new TypeError(
      "jobId must be an opaque proof job identifier.",
    );
  }

  return value;
}

function requireFingerprint(
  value: string,
): string {
  if (
    !/^veil-proof-intent-v1:[0-9a-f]{64}$/u
      .test(value)
  ) {
    throw new TypeError(
      "requestFingerprint is invalid.",
    );
  }

  return value;
}

function requireSha256(
  value: string,
  label: string,
): string {
  if (
    !/^[0-9a-f]{64}$/u
      .test(value)
  ) {
    throw new TypeError(
      `${label} must be a lowercase SHA-256 digest.`,
    );
  }

  return value;
}

function requireOpaqueReference(
  value: string,
  label: string,
): string {
  if (
    !/^[A-Za-z0-9:_-]{1,200}$/u
      .test(value)
  ) {
    throw new TypeError(
      `${label} must be an opaque reference.`,
    );
  }

  return value;
}

function requireErrorCode(
  value: string,
): string {
  if (
    !/^[A-Z][A-Z0-9_]{2,63}$/u
      .test(value)
  ) {
    throw new TypeError(
      "errorCode must be a bounded public error code.",
    );
  }

  return value;
}

function requireTimestamp(
  value: number,
  label: string,
): number {
  return requireBoundedInteger(
    value,
    0,
    Number.MAX_SAFE_INTEGER,
    label,
  );
}

function requireBoundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw new TypeError(
      `${label} is outside the allowed integer range.`,
    );
  }

  return value;
}

function freezeJob(
  job: ProofJobRecord,
): ProofJobRecord {
  return Object.freeze({
    ...job,

    failure:
      job.failure === null
        ? null
        : Object.freeze({
            ...job.failure,
          }),
  });
}

function stateError(
  code: string,
  message: string,
): ProofJobStateError {
  return new ProofJobStateError(
    code,
    message,
  );
}
