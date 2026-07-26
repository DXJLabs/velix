import {
  createOrGetProofJobAccess,
  proofJobAccessRepositoryError,
  type ProofJobAccessCreateResult,
  type ProofJobAccessRepository,
  type ProofJobAccessRepositoryError,
} from "./proof-job-access-repository.js";

import {
  createProofJobAccessRecord,
  type ProofJobAccessRecord,
} from "./proof-job-access.js";

import type {
  PostgresQueryExecutor,
  PostgresTransactionProvider,
} from "../prover/postgres-proof-job-repository.js";

type DatabaseRow =
  Record<string, unknown>;

const INSERT_SQL = `
INSERT INTO veil_proof_job_access (
  schema_version,
  job_id,
  subject_hash,
  created_at_ms
)
VALUES ($1, $2, $3, $4)
ON CONFLICT (job_id) DO NOTHING
RETURNING *
`;

const GET_SQL = `
SELECT
  schema_version,
  job_id,
  subject_hash,
  created_at_ms
FROM veil_proof_job_access
WHERE job_id = $1
LIMIT 1
`;

export class PostgresProofJobAccessRepository
implements ProofJobAccessRepository {
  readonly #provider:
    PostgresTransactionProvider;

  constructor(
    provider: PostgresTransactionProvider,
  ) {
    this.#provider =
      provider;
  }

  async createOrGet(
    access: ProofJobAccessRecord,
  ): Promise<ProofJobAccessCreateResult> {
    return this.#provider.transaction(
      async (executor) => {
        const inserted =
          await executor.query<DatabaseRow>(
            INSERT_SQL,
            recordValues(access),
          );

        const insertedRow =
          singleRow(
            inserted.rows,
          );

        if (insertedRow !== null) {
          return Object.freeze({
            created:
              true,

            access:
              mapRow(insertedRow),
          });
        }

        const existing =
          await getByJobId(
            executor,
            access.jobId,
          );

        if (existing === null) {
          throw proofJobAccessRepositoryError(
            "PROOF_JOB_ACCESS_CREATE_FAILED",
            "The proof job access binding could not be created.",
          );
        }

        /*
         * Reuse the repository contract validation so an existing job
         * cannot be rebound to a different authenticated subject.
         */
        const validated =
          await createOrGetProofJobAccess(
            {
              async createOrGet() {
                return {
                  created:
                    false,

                  access:
                    existing,
                };
              },

              async getByJobId() {
                return existing;
              },
            },
            access,
          );

        return validated;
      },
    );
  }

  async getByJobId(
    jobId: string,
  ): Promise<ProofJobAccessRecord | null> {
    return getByJobId(
      this.#provider,
      requireJobId(jobId),
    );
  }
}

async function getByJobId(
  executor: PostgresQueryExecutor,
  jobId: string,
): Promise<ProofJobAccessRecord | null> {
  const result =
    await executor.query<DatabaseRow>(
      GET_SQL,
      [jobId],
    );

  const row =
    singleRow(result.rows);

  return row === null
    ? null
    : mapRow(row);
}

function recordValues(
  access: ProofJobAccessRecord,
): readonly unknown[] {
  return [
    access.schemaVersion,
    access.jobId,
    access.subjectHash,
    access.createdAtMs,
  ];
}

function mapRow(
  row: DatabaseRow,
): ProofJobAccessRecord {
  if (
    row.schema_version
      !== "veil-proof-job-access-v1"
  ) {
    throw invalidRow();
  }

  return createProofJobAccessRecord({
    jobId:
      requireString(
        row.job_id,
      ),

    subjectHash:
      requireString(
        row.subject_hash,
      ),

    createdAtMs:
      requireDatabaseInteger(
        row.created_at_ms,
      ),
  });
}

function singleRow(
  rows: readonly DatabaseRow[],
): DatabaseRow | null {
  if (rows.length > 1) {
    throw invalidRow();
  }

  return rows[0] ?? null;
}

function requireJobId(
  value: string,
): string {
  if (
    typeof value !== "string"
    || !/^job_[A-Za-z0-9_-]{16,128}$/u
      .test(value)
  ) {
    throw proofJobAccessRepositoryError(
      "PROOF_JOB_ACCESS_JOB_ID_INVALID",
      "The proof job access job identifier is invalid.",
    );
  }

  return value;
}

function requireString(
  value: unknown,
): string {
  if (typeof value !== "string") {
    throw invalidRow();
  }

  return value;
}

function requireDatabaseInteger(
  value: unknown,
): number {
  const parsed =
    typeof value === "string"
      ? Number(value)
      : value;

  if (
    typeof parsed !== "number"
    || !Number.isSafeInteger(parsed)
    || parsed < 0
  ) {
    throw invalidRow();
  }

  return parsed;
}

function invalidRow():
  ProofJobAccessRepositoryError {
  return proofJobAccessRepositoryError(
    "PROOF_JOB_ACCESS_DATABASE_ROW_INVALID",
    "The stored proof job access record is invalid.",
  );
}
