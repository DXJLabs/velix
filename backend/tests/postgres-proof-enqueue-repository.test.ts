import assert from "node:assert/strict";
import test from "node:test";

import {
  createQueuedProofJob,
  type ProofJobRecord,
} from "../services/prover/proof-job.js";

import type {
  EncryptedProofPayload,
} from "../services/prover/proof-payload.js";

import {
  ProofEnqueueRepositoryError,
} from "../services/prover/proof-enqueue-repository.js";

import {
  PostgresProofEnqueueRepository,
} from "../services/prover/postgres-proof-enqueue-repository.js";

import type {
  PostgresQueryExecutor,
  PostgresQueryResult,
  PostgresTransactionProvider,
} from "../services/prover/postgres-proof-job-repository.js";

type Row = Record<string, unknown>;

function queuedJob(): ProofJobRecord {
  return createQueuedProofJob({
    jobId:
      "job_abcdefghijklmnop",

    requestFingerprint:
      `veil-proof-intent-v1:${"a".repeat(64)}`,

    idempotencyKeyHash:
      "b".repeat(64),

    payloadReference:
      "payload_abcdefghijklmnop",

    nowMs:
      1_000,

    maxAttempts:
      3,
  });
}

function encryptedPayload(): EncryptedProofPayload {
  return Object.freeze({
    schemaVersion:
      "veil-proof-payload-v1",

    payloadReference:
      "payload_abcdefghijklmnop",

    requestFingerprint:
      `veil-proof-intent-v1:${"a".repeat(64)}`,

    keyVersion:
      "v1",

    nonce:
      Buffer.alloc(12, 1),

    authenticationTag:
      Buffer.alloc(16, 2),

    ciphertext:
      Buffer.alloc(32, 3),

    ciphertextSha256:
      "c".repeat(64),

    createdAtMs:
      1_000,

    expiresAtMs:
      61_000,
  });
}

function jobRow(
  job: ProofJobRecord,
): Row {
  return {
    schema_version:
      job.schemaVersion,

    job_id:
      job.jobId,

    request_fingerprint:
      job.requestFingerprint,

    idempotency_key_hash:
      job.idempotencyKeyHash,

    payload_reference:
      job.payloadReference,

    state:
      job.state,

    revision:
      String(job.revision),

    attempts:
      String(job.attempts),

    max_attempts:
      String(job.maxAttempts),

    created_at_ms:
      String(job.createdAtMs),

    updated_at_ms:
      String(job.updatedAtMs),

    available_at_ms:
      String(job.availableAtMs),

    lease_owner_hash:
      null,

    lease_expires_at_ms:
      null,

    cancellation_requested_at_ms:
      null,

    completed_at_ms:
      null,

    result_reference:
      null,

    failure_code:
      null,

    failure_retryable:
      null,
  };
}

function payloadRow(
  payload: EncryptedProofPayload,
): Row {
  return {
    schema_version:
      payload.schemaVersion,

    payload_reference:
      payload.payloadReference,

    request_fingerprint:
      payload.requestFingerprint,

    key_version:
      payload.keyVersion,

    nonce:
      payload.nonce,

    authentication_tag:
      payload.authenticationTag,

    ciphertext:
      payload.ciphertext,

    ciphertext_sha256:
      payload.ciphertextSha256,

    created_at_ms:
      String(payload.createdAtMs),

    expires_at_ms:
      String(payload.expiresAtMs),
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

    return response as
      PostgresQueryResult<ResultRow>;
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
    rowCount:
      rows.length,
  };
}

function hasCode(
  expectedCode: string,
) {
  return (
    error: unknown,
  ): boolean =>
    error instanceof
      ProofEnqueueRepositoryError
    && error.code === expectedCode;
}

test(
  "PostgreSQL enqueue creates job and payload in one transaction",
  async () => {
    const job =
      queuedJob();

    const payload =
      encryptedPayload();

    const provider =
      new ScriptedProvider([
        result(jobRow(job)),
        result(payloadRow(payload)),
      ]);

    const repository =
      new PostgresProofEnqueueRepository(
        provider,
      );

    const created =
      await repository.createOrGet({
        job,
        payload,
      });

    assert.equal(
      created.created,
      true,
    );

    assert.deepEqual(
      created.job,
      job,
    );

    assert.deepEqual(
      created.payload,
      payload,
    );

    assert.equal(
      provider.transactionCount,
      1,
    );

    assert.equal(
      provider.queries.length,
      2,
    );

    assert.match(
      provider.queries[0]?.text ?? "",
      /veil_proof_jobs/u,
    );

    assert.match(
      provider.queries[1]?.text ?? "",
      /veil_proof_payloads/u,
    );
  },
);

test(
  "PostgreSQL enqueue resolves an identical retry in one transaction",
  async () => {
    const job =
      queuedJob();

    const payload =
      encryptedPayload();

    const provider =
      new ScriptedProvider([
        result(),
        result(jobRow(job)),
        result(payloadRow(payload)),
      ]);

    const repository =
      new PostgresProofEnqueueRepository(
        provider,
      );

    const repeated =
      await repository.createOrGet({
        job,
        payload,
      });

    assert.equal(
      repeated.created,
      false,
    );

    assert.deepEqual(
      repeated.job,
      job,
    );

    assert.deepEqual(
      repeated.payload,
      payload,
    );

    assert.equal(
      provider.transactionCount,
      1,
    );
  },
);

test(
  "PostgreSQL enqueue rejects an existing job with a missing payload",
  async () => {
    const job =
      queuedJob();

    const payload =
      encryptedPayload();

    const provider =
      new ScriptedProvider([
        result(),
        result(jobRow(job)),
        result(),
      ]);

    const repository =
      new PostgresProofEnqueueRepository(
        provider,
      );

    await assert.rejects(
      () => repository.createOrGet({
        job,
        payload,
      }),
      hasCode(
        "PROOF_ENQUEUE_PARTIAL_STATE",
      ),
    );

    assert.equal(
      provider.transactionCount,
      1,
    );
  },
);

test(
  "PostgreSQL enqueue rejects a new job with an existing payload",
  async () => {
    const job =
      queuedJob();

    const payload =
      encryptedPayload();

    const provider =
      new ScriptedProvider([
        result(jobRow(job)),
        result(),
        result(payloadRow(payload)),
      ]);

    const repository =
      new PostgresProofEnqueueRepository(
        provider,
      );

    await assert.rejects(
      () => repository.createOrGet({
        job,
        payload,
      }),
      hasCode(
        "PROOF_ENQUEUE_PARTIAL_STATE",
      ),
    );

    assert.equal(
      provider.transactionCount,
      1,
    );
  },
);
