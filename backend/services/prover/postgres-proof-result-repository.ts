import {
  validateEncryptedProofResultRecord,
  type EncryptedProofResult,
} from "./proof-result.js";

import {
  proofResultRepositoryError,
  sameEncryptedProofResult,
  type ProofResultRepository,
} from "./proof-result-repository.js";

import type {
  PostgresQueryExecutor,
  PostgresTransactionProvider,
} from "./postgres-proof-job-repository.js";

type DatabaseRow =
  Record<string, unknown>;

const INSERT_SQL = `
INSERT INTO veil_proof_results (
  schema_version,
  result_reference,
  job_id,
  request_fingerprint,
  key_version,
  nonce,
  authentication_tag,
  ciphertext,
  ciphertext_sha256,
  proof_size_bytes,
  created_at_ms,
  expires_at_ms
)
VALUES (
  $1, $2, $3, $4, $5, $6,
  $7, $8, $9, $10, $11, $12
)
ON CONFLICT DO NOTHING
RETURNING *
`;

const GET_BY_REFERENCE_SQL = `
SELECT *
FROM veil_proof_results
WHERE result_reference = $1
LIMIT 1
`;

const GET_BY_JOB_SQL = `
SELECT *
FROM veil_proof_results
WHERE job_id = $1
LIMIT 1
`;

const DELETE_EXPIRED_SQL = `
WITH expired AS (
  SELECT result_reference
  FROM veil_proof_results
  WHERE expires_at_ms <= $1
  ORDER BY
    expires_at_ms,
    result_reference
  FOR UPDATE SKIP LOCKED
  LIMIT $2
)
DELETE FROM veil_proof_results AS results
USING expired
WHERE results.result_reference =
  expired.result_reference
RETURNING results.result_reference
`;

export class PostgresProofResultRepository
implements ProofResultRepository {
  readonly #provider:
    PostgresTransactionProvider;

  constructor(
    provider: PostgresTransactionProvider,
  ) {
    this.#provider =
      provider;
  }

  async create(
    result: EncryptedProofResult,
  ): Promise<EncryptedProofResult> {
    const normalized =
      validateEncryptedProofResultRecord(
        result,
      );

    const inserted =
      await this.#provider.query<DatabaseRow>(
        INSERT_SQL,
        recordValues(
          normalized,
        ),
      );

    const insertedRow =
      singleRow(
        inserted.rows,
      );

    if (insertedRow !== null) {
      const stored =
        mapRow(
          insertedRow,
        );

      if (
        !sameEncryptedProofResult(
          normalized,
          stored,
        )
      ) {
        throw proofResultRepositoryError(
          "PROOF_RESULT_CREATE_MISMATCH",
          "PostgreSQL returned a different encrypted proof result.",
        );
      }

      return stored;
    }

    throw proofResultRepositoryError(
      "PROOF_RESULT_ALREADY_EXISTS",
      "A durable proof result already exists for this job or reference.",
    );
  }

  async getByReference(
    resultReference: string,
  ): Promise<EncryptedProofResult | null> {
    return getOne(
      this.#provider,
      GET_BY_REFERENCE_SQL,
      requireResultReference(
        resultReference,
      ),
    );
  }

  async getByJobId(
    jobId: string,
  ): Promise<EncryptedProofResult | null> {
    return getOne(
      this.#provider,
      GET_BY_JOB_SQL,
      requireJobId(
        jobId,
      ),
    );
  }

  async deleteExpired(
    nowMs: number,
    limit: number,
  ): Promise<number> {
    requireInteger(
      nowMs,
      0,
      Number.MAX_SAFE_INTEGER,
    );

    requireInteger(
      limit,
      1,
      1_000,
    );

    const result =
      await this.#provider.query<DatabaseRow>(
        DELETE_EXPIRED_SQL,
        [
          nowMs,
          limit,
        ],
      );

    return result.rows.length;
  }
}

async function getOne(
  executor: PostgresQueryExecutor,
  text: string,
  value: string,
): Promise<EncryptedProofResult | null> {
  const result =
    await executor.query<DatabaseRow>(
      text,
      [value],
    );

  const row =
    singleRow(
      result.rows,
    );

  return row === null
    ? null
    : mapRow(row);
}

function recordValues(
  result: EncryptedProofResult,
): readonly unknown[] {
  return [
    result.schemaVersion,
    result.resultReference,
    result.jobId,
    result.requestFingerprint,
    result.keyVersion,
    result.nonce,
    result.authenticationTag,
    result.ciphertext,
    result.ciphertextSha256,
    result.proofSizeBytes,
    result.createdAtMs,
    result.expiresAtMs,
  ];
}

function mapRow(
  row: DatabaseRow,
): EncryptedProofResult {
  if (
    row.schema_version
      !== "veil-proof-result-v1"
  ) {
    throw invalidRow();
  }

  return validateEncryptedProofResultRecord({
    schemaVersion:
      "veil-proof-result-v1",

    resultReference:
      requireString(
        row.result_reference,
      ),

    jobId:
      requireString(
        row.job_id,
      ),

    requestFingerprint:
      requireString(
        row.request_fingerprint,
      ),

    keyVersion:
      requireString(
        row.key_version,
      ),

    nonce:
      requireBuffer(
        row.nonce,
      ),

    authenticationTag:
      requireBuffer(
        row.authentication_tag,
      ),

    ciphertext:
      requireBuffer(
        row.ciphertext,
      ),

    ciphertextSha256:
      requireString(
        row.ciphertext_sha256,
      ),

    proofSizeBytes:
      requireDatabaseInteger(
        row.proof_size_bytes,
      ),

    createdAtMs:
      requireDatabaseInteger(
        row.created_at_ms,
      ),

    expiresAtMs:
      requireDatabaseInteger(
        row.expires_at_ms,
      ),
  });
}

function singleRow(
  rows: readonly DatabaseRow[],
): DatabaseRow | null {
  if (
    rows.length > 1
  ) {
    throw invalidRow();
  }

  return rows[0] ?? null;
}

function requireResultReference(
  value: string,
): string {
  if (
    typeof value !== "string"
    || !/^result_[0-9a-f]{64}$/u
      .test(value)
  ) {
    throw proofResultRepositoryError(
      "PROOF_RESULT_REFERENCE_INVALID",
      "The proof result reference is invalid.",
    );
  }

  return value;
}

function requireJobId(
  value: string,
): string {
  if (
    typeof value !== "string"
    || !/^job_[A-Za-z0-9_-]{16,128}$/u
      .test(value)
  ) {
    throw proofResultRepositoryError(
      "PROOF_RESULT_JOB_ID_INVALID",
      "The proof result job identifier is invalid.",
    );
  }

  return value;
}

function requireString(
  value: unknown,
): string {
  if (
    typeof value !== "string"
  ) {
    throw invalidRow();
  }

  return value;
}

function requireBuffer(
  value: unknown,
): Buffer {
  if (
    !Buffer.isBuffer(value)
  ) {
    throw invalidRow();
  }

  return Buffer.from(value);
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

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
): void {
  if (
    !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw proofResultRepositoryError(
      "PROOF_RESULT_ARGUMENT_INVALID",
      "A proof result repository argument is invalid.",
    );
  }
}

function invalidRow() {
  return proofResultRepositoryError(
    "PROOF_RESULT_DATABASE_ROW_INVALID",
    "The stored encrypted proof result record is invalid.",
  );
}
