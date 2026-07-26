import type {
  ClaimProofJobInput,
  ProofJobRecord,
} from "./proof-job.js";

export interface ProofJobCreateResult {
  readonly created: boolean;
  readonly job: ProofJobRecord;
}

export interface ProofJobCompareAndSwapInput {
  readonly jobId: string;
  readonly expectedRevision: number;
  readonly next: ProofJobRecord;
}

export interface ProofJobAtomicClaimInput
  extends ClaimProofJobInput {
  readonly maxRunningJobs: number;

  /*
   * The repository must choose one eligible job atomically using:
   * availableAtMs, createdAtMs, then jobId as the stable ordering.
   */
}

export interface ProofJobRepository {
  /*
   * The durable implementation must enforce unique constraints on
   * both jobId and idempotencyKeyHash in one atomic transaction.
   */
  createOrGetByIdempotency(
    job: ProofJobRecord,
  ): Promise<ProofJobCreateResult>;

  getById(
    jobId: string,
  ): Promise<ProofJobRecord | null>;

  getByIdempotencyKeyHash(
    idempotencyKeyHash: string,
  ): Promise<ProofJobRecord | null>;

  /*
   * The durable implementation must update only when the persisted
   * revision equals expectedRevision. A conflict returns null.
   */
  compareAndSwap(
    input: ProofJobCompareAndSwapInput,
  ): Promise<ProofJobRecord | null>;

  /*
   * Selection and transition to running must happen atomically.
   * The implementation must never select a terminal, unavailable,
   * leased, or attempts-exhausted job.
   */
  claimNextAvailable(
    input: ProofJobAtomicClaimInput,
  ): Promise<ProofJobRecord | null>;
}

export class ProofJobRepositoryError
  extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "ProofJobRepositoryError";

    this.code = code;
  }
}

export async function createOrGetProofJob(
  repository: ProofJobRepository,
  requested: ProofJobRecord,
): Promise<ProofJobCreateResult> {
  assertInitialQueuedJob(
    requested,
  );

  const result =
    await repository
      .createOrGetByIdempotency(
        requested,
      );

  assertRepositoryJob(
    result.job,
  );

  if (result.created) {
    assertSameSnapshot(
      requested,
      result.job,
      "PROOF_JOB_CREATE_MISMATCH",
    );

    return Object.freeze({
      created: true,
      job: result.job,
    });
  }

  assertSameIdempotentIntent(
    requested,
    result.job,
  );

  return Object.freeze({
    created: false,
    job: result.job,
  });
}

export async function persistProofJobTransition(
  repository: ProofJobRepository,
  current: ProofJobRecord,
  next: ProofJobRecord,
): Promise<ProofJobRecord> {
  assertRepositoryJob(
    current,
  );

  assertRepositoryJob(
    next,
  );

  assertImmutableFields(
    current,
    next,
  );

  if (
    next.revision
    !== current.revision + 1
  ) {
    throw repositoryError(
      "PROOF_JOB_REVISION_INVALID",
      "A proof job transition must increment revision exactly once.",
    );
  }

  const stored =
    await repository.compareAndSwap({
      jobId:
        current.jobId,

      expectedRevision:
        current.revision,

      next,
    });

  if (stored === null) {
    throw repositoryError(
      "PROOF_JOB_REVISION_CONFLICT",
      "The persisted proof job changed before this transition was stored.",
    );
  }

  assertSameSnapshot(
    next,
    stored,
    "PROOF_JOB_STORAGE_MISMATCH",
  );

  return stored;
}

export async function claimNextProofJob(
  repository: ProofJobRepository,
  input: ProofJobAtomicClaimInput,
): Promise<ProofJobRecord | null> {
  if (
    !Number.isSafeInteger(
      input.maxRunningJobs,
    )
    || input.maxRunningJobs < 1
    || input.maxRunningJobs > 32
  ) {
    throw repositoryError(
      "PROOF_JOB_CONCURRENCY_LIMIT_INVALID",
      "The proof worker concurrency limit is invalid.",
    );
  }

  const claimed =
    await repository
      .claimNextAvailable(input);

  if (claimed === null) {
    return null;
  }

  assertRepositoryJob(
    claimed,
  );

  if (
    claimed.state !== "running"
    || claimed.leaseOwnerHash
      !== input.leaseOwnerHash
    || claimed.leaseExpiresAtMs
      !== input.nowMs
        + input.leaseDurationMs
  ) {
    throw repositoryError(
      "PROOF_JOB_ATOMIC_CLAIM_INVALID",
      "The repository returned an invalid atomic claim result.",
    );
  }

  return claimed;
}

function assertInitialQueuedJob(
  job: ProofJobRecord,
): void {
  assertRepositoryJob(job);

  if (
    job.state !== "queued"
    || job.revision !== 0
    || job.attempts !== 0
    || job.leaseOwnerHash !== null
    || job.leaseExpiresAtMs !== null
    || job.completedAtMs !== null
    || job.resultReference !== null
    || job.failure !== null
  ) {
    throw repositoryError(
      "PROOF_JOB_INITIAL_STATE_INVALID",
      "A newly persisted proof job must be an untouched queued record.",
    );
  }
}

function assertSameIdempotentIntent(
  requested: ProofJobRecord,
  existing: ProofJobRecord,
): void {
  if (
    requested.idempotencyKeyHash
      !== existing.idempotencyKeyHash
    || requested.requestFingerprint
      !== existing.requestFingerprint
    || requested.payloadReference
      !== existing.payloadReference
    || requested.maxAttempts
      !== existing.maxAttempts
  ) {
    throw repositoryError(
      "PROOF_JOB_IDEMPOTENCY_CONFLICT",
      "The idempotency key is already bound to a different proof request.",
    );
  }
}

function assertImmutableFields(
  current: ProofJobRecord,
  next: ProofJobRecord,
): void {
  if (
    current.schemaVersion
      !== next.schemaVersion
    || current.jobId
      !== next.jobId
    || current.requestFingerprint
      !== next.requestFingerprint
    || current.idempotencyKeyHash
      !== next.idempotencyKeyHash
    || current.payloadReference
      !== next.payloadReference
    || current.maxAttempts
      !== next.maxAttempts
    || current.createdAtMs
      !== next.createdAtMs
  ) {
    throw repositoryError(
      "PROOF_JOB_IMMUTABLE_FIELD_CHANGED",
      "A proof job transition changed immutable durable metadata.",
    );
  }
}

function assertRepositoryJob(
  value: ProofJobRecord,
): void {
  if (
    value.schemaVersion
      !== "veil-proof-job-v1"
    || !/^job_[A-Za-z0-9_-]{16,128}$/u
      .test(value.jobId)
    || !/^veil-proof-intent-v1:[0-9a-f]{64}$/u
      .test(value.requestFingerprint)
    || !/^[0-9a-f]{64}$/u
      .test(value.idempotencyKeyHash)
    || !/^[A-Za-z0-9:_-]{1,200}$/u
      .test(value.payloadReference)
    || !Number.isSafeInteger(
      value.revision,
    )
    || value.revision < 0
    || !Number.isSafeInteger(
      value.attempts,
    )
    || value.attempts < 0
    || !Number.isSafeInteger(
      value.maxAttempts,
    )
    || value.maxAttempts < 1
    || value.attempts
      > value.maxAttempts
  ) {
    throw repositoryError(
      "PROOF_JOB_RECORD_INVALID",
      "The durable repository returned an invalid proof job record.",
    );
  }
}

function assertSameSnapshot(
  expected: ProofJobRecord,
  actual: ProofJobRecord,
  code: string,
): void {
  if (
    JSON.stringify(expected)
    !== JSON.stringify(actual)
  ) {
    throw repositoryError(
      code,
      "The durable repository returned a different proof job snapshot.",
    );
  }
}

function repositoryError(
  code: string,
  message: string,
): ProofJobRepositoryError {
  return new ProofJobRepositoryError(
    code,
    message,
  );
}
