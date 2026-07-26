import assert from "node:assert/strict";
import test from "node:test";

import {
  claimProofJob,
  createQueuedProofJob,
  type ProofJobRecord,
} from "../services/prover/proof-job.js";
import {
  claimNextProofJob,
  createOrGetProofJob,
} from "../services/prover/proof-job-repository.js";
import {
  PostgresProofJobRepository,
  type PostgresQueryExecutor,
  type PostgresQueryResult,
  type PostgresTransactionProvider,
} from "../services/prover/postgres-proof-job-repository.js";

type Row = Record<string, unknown>;

const OWNER = "1".repeat(64);

function queuedJob(): ProofJobRecord {
  return createQueuedProofJob({
    jobId: "job_abcdefghijklmnop001",
    requestFingerprint:
      `veil-proof-intent-v1:${"2".repeat(64)}`,
    idempotencyKeyHash: "3".repeat(64),
    payloadReference: "payload_ref_001",
    nowMs: 1_000,
    maxAttempts: 3,
  });
}

function databaseRow(
  job: ProofJobRecord,
): Row {
  return {
    schema_version: job.schemaVersion,
    job_id: job.jobId,
    request_fingerprint:
      job.requestFingerprint,
    idempotency_key_hash:
      job.idempotencyKeyHash,
    payload_reference:
      job.payloadReference,
    state: job.state,
    revision: String(job.revision),
    attempts: String(job.attempts),
    max_attempts:
      String(job.maxAttempts),
    created_at_ms:
      String(job.createdAtMs),
    updated_at_ms:
      String(job.updatedAtMs),
    available_at_ms:
      String(job.availableAtMs),
    lease_owner_hash:
      job.leaseOwnerHash,
    lease_expires_at_ms:
      job.leaseExpiresAtMs === null
        ? null
        : String(job.leaseExpiresAtMs),
    cancellation_requested_at_ms:
      null,
    completed_at_ms:
      job.completedAtMs === null
        ? null
        : String(job.completedAtMs),
    result_reference:
      job.resultReference,
    failure_code:
      job.failure?.code ?? null,
    failure_retryable:
      job.failure?.retryable ?? null,
  };
}

class ScriptedProvider
  implements PostgresTransactionProvider {
  readonly queries: Array<{
    text: string;
    values: readonly unknown[];
  }> = [];

  readonly #responses:
    Array<PostgresQueryResult<Row>>;

  transactionCount = 0;

  constructor(
    responses:
      Array<PostgresQueryResult<Row>>,
  ) {
    this.#responses = [...responses];
  }

  async query<
    ResultRow extends Record<
      string,
      unknown
    >,
  >(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<
    PostgresQueryResult<ResultRow>
  > {
    this.queries.push({
      text,
      values,
    });

    const response =
      this.#responses.shift();

    if (!response) {
      throw new Error(
        "Missing scripted response.",
      );
    }

    return response as PostgresQueryResult<ResultRow>;
  }

  async transaction<T>(
    operation: (
      executor: PostgresQueryExecutor,
    ) => Promise<T>,
  ): Promise<T> {
    this.transactionCount += 1;
    return operation(this);
  }
}

function result(
  ...rows: Row[]
): PostgresQueryResult<Row> {
  return {
    rows,
    rowCount: rows.length,
  };
}

test(
  "PostgreSQL repository inserts proof jobs transactionally",
  async () => {
    const job = queuedJob();

    const provider =
      new ScriptedProvider([
        result(databaseRow(job)),
      ]);

    const repository =
      new PostgresProofJobRepository(
        provider,
      );

    const created =
      await createOrGetProofJob(
        repository,
        job,
      );

    assert.equal(created.created, true);
    assert.deepEqual(created.job, job);
    assert.equal(
      provider.transactionCount,
      1,
    );

    assert.match(
      provider.queries[0]?.text ?? "",
      /ON CONFLICT DO NOTHING/u,
    );
  },
);

test(
  "PostgreSQL repository resolves idempotent retries",
  async () => {
    const job = queuedJob();

    const provider =
      new ScriptedProvider([
        result(),
        result(databaseRow(job)),
      ]);

    const repository =
      new PostgresProofJobRepository(
        provider,
      );

    const repeated =
      await createOrGetProofJob(
        repository,
        {
          ...job,
          jobId:
            "job_abcdefghijklmnop002",
        },
      );

    assert.equal(
      repeated.created,
      false,
    );

    assert.equal(
      repeated.job.jobId,
      job.jobId,
    );
  },
);

test(
  "PostgreSQL atomic claim uses skip-locked ordering",
  async () => {
    const running =
      claimProofJob(
        queuedJob(),
        {
          leaseOwnerHash: OWNER,
          nowMs: 1_000,
          leaseDurationMs: 5_000,
        },
      );

    const provider =
      new ScriptedProvider([
        result({}),
        result(databaseRow(running)),
      ]);

    const repository =
      new PostgresProofJobRepository(
        provider,
      );

    const claimed =
      await claimNextProofJob(
        repository,
        {
          leaseOwnerHash: OWNER,
          nowMs: 1_000,
          leaseDurationMs: 5_000,
          maxRunningJobs: 1,
        },
      );

    assert.equal(
      claimed?.state,
      "running",
    );

    const lockSql =
      provider.queries[0]?.text ?? "";

    const claimSql =
      provider.queries[1]?.text ?? "";

    assert.equal(
      provider.transactionCount,
      1,
    );

    assert.match(
      lockSql,
      /pg_advisory_xact_lock/u,
    );

    assert.match(
      claimSql,
      /FOR UPDATE OF queued SKIP LOCKED/u,
    );

    assert.match(
      claimSql,
      /active_running_jobs/u,
    );

    assert.match(
      claimSql,
      /lease_expires_at_ms > \$1/u,
    );

    assert.equal(
      provider.queries[1]?.values[3],
      1,
    );
  },
);
