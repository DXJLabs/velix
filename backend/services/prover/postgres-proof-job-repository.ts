import {
  PROOF_JOB_STATES,
  type ProofJobFailure,
  type ProofJobRecord,
  type ProofJobState,
} from "./proof-job.js";
import {
  ProofJobRepositoryError,
  type ProofJobAtomicClaimInput,
  type ProofJobCompareAndSwapInput,
  type ProofJobCreateResult,
  type ProofJobRecoveryInput,
  type ProofJobRecoveryRepository,
  type ProofJobRepository,
} from "./proof-job-repository.js";

export interface PostgresQueryResult<Row extends Record<string, unknown>> {
  readonly rows: readonly Row[];
  readonly rowCount: number | null;
}

export interface PostgresQueryExecutor {
  query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PostgresQueryResult<Row>>;
}

export interface PostgresTransactionProvider extends PostgresQueryExecutor {
  transaction<T>(
    operation: (executor: PostgresQueryExecutor) => Promise<T>,
  ): Promise<T>;
}

type DatabaseRow = Record<string, unknown>;

const STATE_SET = new Set<string>(PROOF_JOB_STATES);

const INSERT_SQL = `
INSERT INTO veil_proof_jobs (
  schema_version,
  job_id,
  request_fingerprint,
  idempotency_key_hash,
  payload_reference,
  state,
  revision,
  attempts,
  max_attempts,
  created_at_ms,
  updated_at_ms,
  available_at_ms,
  lease_owner_hash,
  lease_expires_at_ms,
  cancellation_requested_at_ms,
  completed_at_ms,
  result_reference,
  failure_code,
  failure_retryable
)
VALUES (
  $1, $2, $3, $4, $5,
  $6, $7, $8, $9, $10,
  $11, $12, $13, $14, $15,
  $16, $17, $18, $19
)
ON CONFLICT DO NOTHING
RETURNING *
`;

const GET_BY_ID_SQL = `
SELECT *
FROM veil_proof_jobs
WHERE job_id = $1
LIMIT 1
`;

const GET_BY_IDEMPOTENCY_SQL = `
SELECT *
FROM veil_proof_jobs
WHERE idempotency_key_hash = $1
LIMIT 1
`;

const COMPARE_AND_SWAP_SQL = `
UPDATE veil_proof_jobs
SET
  state = $3,
  revision = $4,
  attempts = $5,
  updated_at_ms = $6,
  available_at_ms = $7,
  lease_owner_hash = $8,
  lease_expires_at_ms = $9,
  cancellation_requested_at_ms = $10,
  completed_at_ms = $11,
  result_reference = $12,
  failure_code = $13,
  failure_retryable = $14
WHERE job_id = $1
  AND revision = $2
RETURNING *
`;

const CLAIM_CAPACITY_LOCK_SQL = `
SELECT pg_advisory_xact_lock($1, $2)
`;

const CLAIM_CAPACITY_LOCK_NAMESPACE =
  1_447_381_324;

const CLAIM_CAPACITY_LOCK_KEY =
  1;

const CLAIM_NEXT_SQL = `
WITH capacity AS (
  SELECT
    COUNT(*)::integer
      AS active_running_jobs
  FROM veil_proof_jobs
  WHERE state = 'running'
    AND lease_expires_at_ms > $1
),
candidate AS (
  SELECT queued.job_id
  FROM veil_proof_jobs AS queued
  CROSS JOIN capacity
  WHERE queued.state = 'queued'
    AND queued.available_at_ms <= $1
    AND queued.attempts
      < queued.max_attempts
    AND capacity.active_running_jobs
      < $4
  ORDER BY
    queued.available_at_ms,
    queued.created_at_ms,
    queued.job_id
  FOR UPDATE OF queued SKIP LOCKED
  LIMIT 1
)
UPDATE veil_proof_jobs AS jobs
SET
  state = 'running',
  revision = jobs.revision + 1,
  attempts = jobs.attempts + 1,
  updated_at_ms = $1,
  lease_owner_hash = $2,
  lease_expires_at_ms = $1 + $3,
  failure_code = NULL,
  failure_retryable = NULL
FROM candidate
WHERE jobs.job_id = candidate.job_id
RETURNING jobs.*
`;

const RECOVER_EXPIRED_SQL = `
WITH candidates AS (
  SELECT job_id
  FROM veil_proof_jobs
  WHERE state = 'running'
    AND lease_expires_at_ms IS NOT NULL
    AND lease_expires_at_ms <= $1
  ORDER BY
    lease_expires_at_ms,
    updated_at_ms,
    job_id
  FOR UPDATE SKIP LOCKED
  LIMIT $2
)
UPDATE veil_proof_jobs AS jobs
SET
  state = CASE
    WHEN jobs.cancellation_requested_at_ms
      IS NOT NULL
      THEN 'cancelled'
    WHEN jobs.attempts
      < jobs.max_attempts
      THEN 'queued'
    ELSE 'failed'
  END,
  revision = jobs.revision + 1,
  updated_at_ms = $1,
  available_at_ms = CASE
    WHEN jobs.cancellation_requested_at_ms
      IS NULL
      AND jobs.attempts
        < jobs.max_attempts
      THEN $1
    ELSE jobs.available_at_ms
  END,
  lease_owner_hash = NULL,
  lease_expires_at_ms = NULL,
  completed_at_ms = CASE
    WHEN jobs.cancellation_requested_at_ms
      IS NOT NULL
      OR jobs.attempts
        >= jobs.max_attempts
      THEN $1
    ELSE NULL
  END,
  result_reference = NULL,
  failure_code = CASE
    WHEN jobs.cancellation_requested_at_ms
      IS NOT NULL
      THEN NULL
    ELSE 'PROOF_WORKER_LEASE_EXPIRED'
  END,
  failure_retryable = CASE
    WHEN jobs.cancellation_requested_at_ms
      IS NOT NULL
      THEN NULL
    WHEN jobs.attempts
      < jobs.max_attempts
      THEN TRUE
    ELSE FALSE
  END
FROM candidates
WHERE jobs.job_id = candidates.job_id
RETURNING jobs.*
`;

export class PostgresProofJobRepository
implements
  ProofJobRepository,
  ProofJobRecoveryRepository {
  readonly #provider: PostgresTransactionProvider;

  constructor(provider: PostgresTransactionProvider) {
    this.#provider = provider;
  }

  async createOrGetByIdempotency(
    job: ProofJobRecord,
  ): Promise<ProofJobCreateResult> {
    return this.#provider.transaction(async (executor) => {
      const inserted = await executor.query<DatabaseRow>(
        INSERT_SQL,
        recordValues(job),
      );

      const insertedRow = singleRow(inserted.rows);

      if (insertedRow !== null) {
        return Object.freeze({
          created: true,
          job: mapRow(insertedRow),
        });
      }

      const existing = await executor.query<DatabaseRow>(
        GET_BY_IDEMPOTENCY_SQL,
        [job.idempotencyKeyHash],
      );

      const existingRow = singleRow(existing.rows);

      if (existingRow !== null) {
        return Object.freeze({
          created: false,
          job: mapRow(existingRow),
        });
      }

      const conflictingId = await executor.query<DatabaseRow>(
        GET_BY_ID_SQL,
        [job.jobId],
      );

      if (singleRow(conflictingId.rows) !== null) {
        throw repositoryError(
          "PROOF_JOB_ID_CONFLICT",
          "The proof job identifier is already bound to another request.",
        );
      }

      throw repositoryError(
        "PROOF_JOB_CREATE_RACE_UNRESOLVED",
        "The database did not persist or resolve the proof job.",
      );
    });
  }

  async getById(jobId: string): Promise<ProofJobRecord | null> {
    requireJobId(jobId);

    const result = await this.#provider.query<DatabaseRow>(
      GET_BY_ID_SQL,
      [jobId],
    );

    const row = singleRow(result.rows);

    return row === null ? null : mapRow(row);
  }

  async getByIdempotencyKeyHash(
    idempotencyKeyHash: string,
  ): Promise<ProofJobRecord | null> {
    requireSha256(idempotencyKeyHash, "idempotencyKeyHash");

    const result = await this.#provider.query<DatabaseRow>(
      GET_BY_IDEMPOTENCY_SQL,
      [idempotencyKeyHash],
    );

    const row = singleRow(result.rows);

    return row === null ? null : mapRow(row);
  }

  async compareAndSwap(
    input: ProofJobCompareAndSwapInput,
  ): Promise<ProofJobRecord | null> {
    requireJobId(input.jobId);
    requireInteger(input.expectedRevision, "expectedRevision");

    if (
      input.next.jobId !== input.jobId
      || input.next.revision !== input.expectedRevision + 1
    ) {
      throw repositoryError(
        "PROOF_JOB_COMPARE_AND_SWAP_INVALID",
        "The proof job transition is inconsistent.",
      );
    }

    const next = input.next;

    const result = await this.#provider.query<DatabaseRow>(
      COMPARE_AND_SWAP_SQL,
      [
        input.jobId,
        input.expectedRevision,
        next.state,
        next.revision,
        next.attempts,
        next.updatedAtMs,
        next.availableAtMs,
        next.leaseOwnerHash,
        next.leaseExpiresAtMs,
        next.cancellationRequestedAtMs,
        next.completedAtMs,
        next.resultReference,
        next.failure?.code ?? null,
        next.failure?.retryable ?? null,
      ],
    );

    const row = singleRow(result.rows);

    return row === null ? null : mapRow(row);
  }

  async claimNextAvailable(
    input: ProofJobAtomicClaimInput,
  ): Promise<ProofJobRecord | null> {
    requireSha256(input.leaseOwnerHash, "leaseOwnerHash");
    requireInteger(input.nowMs, "nowMs");

    if (
      !Number.isSafeInteger(input.leaseDurationMs)
      || input.leaseDurationMs < 1_000
      || input.leaseDurationMs > 30 * 60_000
    ) {
      throw new TypeError(
        "leaseDurationMs is outside the allowed range.",
      );
    }

    if (
      !Number.isSafeInteger(
        input.maxRunningJobs,
      )
      || input.maxRunningJobs < 1
      || input.maxRunningJobs > 32
    ) {
      throw new TypeError(
        "maxRunningJobs is outside the allowed range.",
      );
    }

    return this.#provider.transaction(
      async (executor) => {
        await executor.query<DatabaseRow>(
          CLAIM_CAPACITY_LOCK_SQL,
          [
            CLAIM_CAPACITY_LOCK_NAMESPACE,
            CLAIM_CAPACITY_LOCK_KEY,
          ],
        );

        const result =
          await executor.query<DatabaseRow>(
            CLAIM_NEXT_SQL,
            [
              input.nowMs,
              input.leaseOwnerHash,
              input.leaseDurationMs,
              input.maxRunningJobs,
            ],
          );

        const row =
          singleRow(result.rows);

        return row === null
          ? null
          : mapRow(row);
      },
    );
  }

  async recoverExpired(
    input: ProofJobRecoveryInput,
  ): Promise<readonly ProofJobRecord[]> {
    requireInteger(
      input.nowMs,
      "nowMs",
    );

    if (
      !Number.isSafeInteger(input.limit)
      || input.limit < 1
      || input.limit > 1_000
    ) {
      throw new TypeError(
        "limit is outside the allowed range.",
      );
    }

    const result =
      await this.#provider.query<DatabaseRow>(
        RECOVER_EXPIRED_SQL,
        [
          input.nowMs,
          input.limit,
        ],
      );

    return Object.freeze(
      result.rows.map(mapRow),
    );
  }
}

function recordValues(job: ProofJobRecord): readonly unknown[] {
  return [
    job.schemaVersion,
    job.jobId,
    job.requestFingerprint,
    job.idempotencyKeyHash,
    job.payloadReference,
    job.state,
    job.revision,
    job.attempts,
    job.maxAttempts,
    job.createdAtMs,
    job.updatedAtMs,
    job.availableAtMs,
    job.leaseOwnerHash,
    job.leaseExpiresAtMs,
    job.cancellationRequestedAtMs,
    job.completedAtMs,
    job.resultReference,
    job.failure?.code ?? null,
    job.failure?.retryable ?? null,
  ];
}

function mapRow(row: DatabaseRow): ProofJobRecord {
  if (row.schema_version !== "veil-proof-job-v1") {
    throw invalidRow("schema version");
  }

  const state = requireState(row.state);
  const failureCode = nullableString(row.failure_code);
  const failureRetryable = nullableBoolean(row.failure_retryable);

  if ((failureCode === null) !== (failureRetryable === null)) {
    throw invalidRow("failure fields");
  }

  const failure: ProofJobFailure | null =
    failureCode === null
      ? null
      : Object.freeze({
          code: requireErrorCode(failureCode),
          retryable: failureRetryable === true,
        });

  const job: ProofJobRecord = Object.freeze({
    schemaVersion: "veil-proof-job-v1",
    jobId: requireJobId(requireString(row.job_id)),
    requestFingerprint: requireFingerprint(
      requireString(row.request_fingerprint),
    ),
    idempotencyKeyHash: requireSha256(
      requireString(row.idempotency_key_hash),
      "idempotency_key_hash",
    ),
    payloadReference: requireOpaqueReference(
      requireString(row.payload_reference),
    ),
    state,
    revision: requireInteger(row.revision, "revision"),
    attempts: requireInteger(row.attempts, "attempts"),
    maxAttempts: requireInteger(row.max_attempts, "max_attempts"),
    createdAtMs: requireInteger(row.created_at_ms, "created_at_ms"),
    updatedAtMs: requireInteger(row.updated_at_ms, "updated_at_ms"),
    availableAtMs: requireInteger(row.available_at_ms, "available_at_ms"),
    leaseOwnerHash: nullableSha256(row.lease_owner_hash),
    leaseExpiresAtMs: nullableInteger(
      row.lease_expires_at_ms,
      "lease_expires_at_ms",
    ),
    cancellationRequestedAtMs: nullableInteger(
      row.cancellation_requested_at_ms,
      "cancellation_requested_at_ms",
    ),
    completedAtMs: nullableInteger(
      row.completed_at_ms,
      "completed_at_ms",
    ),
    resultReference: nullableOpaqueReference(row.result_reference),
    failure,
  });

  validateJob(job);

  return job;
}

function validateJob(job: ProofJobRecord): void {
  if (
    job.maxAttempts < 1
    || job.maxAttempts > 10
    || job.attempts > job.maxAttempts
    || job.updatedAtMs < job.createdAtMs
  ) {
    throw invalidRow("numeric invariants");
  }

  const running = job.state === "running";
  const hasLease =
    job.leaseOwnerHash !== null
    && job.leaseExpiresAtMs !== null;

  if (running !== hasLease) {
    throw invalidRow("lease shape");
  }

  if (
    running
    && (job.leaseExpiresAtMs as number) <= job.updatedAtMs
  ) {
    throw invalidRow("lease expiry");
  }

  const terminal =
    job.state === "succeeded"
    || job.state === "failed"
    || job.state === "cancelled";

  if (terminal !== (job.completedAtMs !== null)) {
    throw invalidRow("completion shape");
  }

  if (
    job.state === "succeeded"
    && (job.resultReference === null || job.failure !== null)
  ) {
    throw invalidRow("success shape");
  }

  if (job.state !== "succeeded" && job.resultReference !== null) {
    throw invalidRow("result shape");
  }

  if (job.state === "failed" && job.failure === null) {
    throw invalidRow("failure shape");
  }
}

function singleRow<Row extends Record<string, unknown>>(
  rows: readonly Row[],
): Row | null {
  if (rows.length > 1) {
    throw repositoryError(
      "PROOF_JOB_DATABASE_RESULT_INVALID",
      "The database returned more than one proof job row.",
    );
  }

  return rows[0] ?? null;
}

function requireState(value: unknown): ProofJobState {
  if (typeof value !== "string" || !STATE_SET.has(value)) {
    throw invalidRow("state");
  }

  return value as ProofJobState;
}

function requireString(value: unknown): string {
  if (typeof value !== "string") {
    throw invalidRow("string value");
  }

  return value;
}

function requireInteger(value: unknown, label: string): number {
  let parsed: number;

  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "bigint") {
    parsed = Number(value);
  } else if (
    typeof value === "string"
    && /^[0-9]+$/u.test(value)
  ) {
    parsed = Number(value);
  } else {
    throw invalidRow(label);
  }

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw invalidRow(label);
  }

  return parsed;
}

function nullableInteger(
  value: unknown,
  label: string,
): number | null {
  return value === null
    ? null
    : requireInteger(value, label);
}

function nullableString(value: unknown): string | null {
  return value === null ? null : requireString(value);
}

function nullableBoolean(value: unknown): boolean | null {
  if (value === null) return null;

  if (typeof value !== "boolean") {
    throw invalidRow("boolean value");
  }

  return value;
}

function requireJobId(value: string): string {
  if (!/^job_[A-Za-z0-9_-]{16,128}$/u.test(value)) {
    throw invalidRow("job id");
  }

  return value;
}

function requireFingerprint(value: string): string {
  if (!/^veil-proof-intent-v1:[0-9a-f]{64}$/u.test(value)) {
    throw invalidRow("request fingerprint");
  }

  return value;
}

function requireSha256(value: string, label: string): string {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw invalidRow(label);
  }

  return value;
}

function nullableSha256(value: unknown): string | null {
  return value === null
    ? null
    : requireSha256(
        requireString(value),
        "lease_owner_hash",
      );
}

function requireOpaqueReference(value: string): string {
  if (!/^[A-Za-z0-9:_-]{1,200}$/u.test(value)) {
    throw invalidRow("opaque reference");
  }

  return value;
}

function nullableOpaqueReference(
  value: unknown,
): string | null {
  return value === null
    ? null
    : requireOpaqueReference(requireString(value));
}

function requireErrorCode(value: string): string {
  if (!/^[A-Z][A-Z0-9_]{2,63}$/u.test(value)) {
    throw invalidRow("failure code");
  }

  return value;
}

function invalidRow(reason: string): ProofJobRepositoryError {
  return repositoryError(
    "PROOF_JOB_DATABASE_ROW_INVALID",
    `The database returned an invalid proof job row: ${reason}.`,
  );
}

function repositoryError(
  code: string,
  message: string,
): ProofJobRepositoryError {
  return new ProofJobRepositoryError(code, message);
}
