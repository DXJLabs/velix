import assert from "node:assert/strict";
import test from "node:test";

import {
  createProofJobAccessRecord,
  type ProofJobAccessRecord,
} from "../services/security/proof-job-access.js";

import {
  ProofJobAccessRepositoryError,
} from "../services/security/proof-job-access-repository.js";

import {
  PostgresProofJobAccessRepository,
} from "../services/security/postgres-proof-job-access-repository.js";

import type {
  PostgresQueryResult,
  PostgresTransactionProvider,
} from "../services/prover/postgres-proof-job-repository.js";

type DatabaseRow =
  Record<string, unknown>;

interface RecordedQuery {
  readonly text: string;
  readonly values: readonly unknown[];
}

class ScriptedProvider
implements PostgresTransactionProvider {
  readonly queries:
    RecordedQuery[] = [];

  transactionCount =
    0;

  readonly #responses:
    PostgresQueryResult<DatabaseRow>[];

  constructor(
    responses:
      PostgresQueryResult<DatabaseRow>[],
  ) {
    this.#responses =
      [...responses];
  }

  async query<
    Row extends Record<string, unknown>,
  >(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<PostgresQueryResult<Row>> {
    this.queries.push({
      text,
      values,
    });

    const response =
      this.#responses.shift();

    if (!response) {
      throw new Error(
        "No scripted PostgreSQL response remains.",
      );
    }

    return response as
      PostgresQueryResult<Row>;
  }

  async transaction<T>(
    operation: (
      executor: this,
    ) => Promise<T>,
  ): Promise<T> {
    this.transactionCount +=
      1;

    return operation(this);
  }
}

function result(
  ...rows: DatabaseRow[]
): PostgresQueryResult<DatabaseRow> {
  return {
    rows,
    rowCount:
      rows.length,
  };
}

function accessRecord(
  overrides: Partial<
    ProofJobAccessRecord
  > = {},
): ProofJobAccessRecord {
  return Object.freeze({
    ...createProofJobAccessRecord({
      jobId:
        "job_abcdefghijklmnop",

      subjectHash:
        "a".repeat(64),

      createdAtMs:
        1_000,
    }),

    ...overrides,
  });
}

function databaseRow(
  access: ProofJobAccessRecord,
): DatabaseRow {
  return {
    schema_version:
      access.schemaVersion,

    job_id:
      access.jobId,

    subject_hash:
      access.subjectHash,

    created_at_ms:
      String(
        access.createdAtMs,
      ),
  };
}

function hasCode(
  expectedCode: string,
) {
  return (
    error: unknown,
  ): boolean =>
    error instanceof
      ProofJobAccessRepositoryError
    && error.code === expectedCode;
}

test(
  "PostgreSQL inserts a separated proof access binding",
  async () => {
    const access =
      accessRecord();

    const provider =
      new ScriptedProvider([
        result(
          databaseRow(access),
        ),
      ]);

    const repository =
      new PostgresProofJobAccessRepository(
        provider,
      );

    const created =
      await repository.createOrGet(
        access,
      );

    assert.equal(
      created.created,
      true,
    );

    assert.deepEqual(
      created.access,
      access,
    );

    assert.equal(
      provider.transactionCount,
      1,
    );

    assert.match(
      provider.queries[0]?.text ?? "",
      /veil_proof_job_access/u,
    );

    assert.deepEqual(
      provider.queries[0]?.values,
      [
        access.schemaVersion,
        access.jobId,
        access.subjectHash,
        access.createdAtMs,
      ],
    );
  },
);

test(
  "PostgreSQL accepts an identical proof access retry",
  async () => {
    const access =
      accessRecord();

    const provider =
      new ScriptedProvider([
        result(),
        result(
          databaseRow(access),
        ),
      ]);

    const repository =
      new PostgresProofJobAccessRepository(
        provider,
      );

    const repeated =
      await repository.createOrGet(
        access,
      );

    assert.equal(
      repeated.created,
      false,
    );

    assert.deepEqual(
      repeated.access,
      access,
    );
  },
);

test(
  "PostgreSQL rejects proof job access subject rebinding",
  async () => {
    const requested =
      accessRecord();

    const existing =
      accessRecord({
        subjectHash:
          "b".repeat(64),
      });

    const provider =
      new ScriptedProvider([
        result(),
        result(
          databaseRow(existing),
        ),
      ]);

    const repository =
      new PostgresProofJobAccessRepository(
        provider,
      );

    await assert.rejects(
      () =>
        repository.createOrGet(
          requested,
        ),

      hasCode(
        "PROOF_JOB_ACCESS_SUBJECT_CONFLICT",
      ),
    );
  },
);
