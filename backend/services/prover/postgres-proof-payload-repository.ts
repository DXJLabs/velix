import type {
  EncryptedProofPayload,
} from "./proof-payload.js";

import {
  proofPayloadRepositoryError,
  type ProofPayloadCreateResult,
  type ProofPayloadRepository,
} from "./proof-payload-repository.js";

import type {
  PostgresQueryExecutor,
  PostgresTransactionProvider,
} from "./postgres-proof-job-repository.js";

type DatabaseRow = Record<string, unknown>;

const INSERT_SQL = `
INSERT INTO veil_proof_payloads (
  schema_version,
  payload_reference,
  request_fingerprint,
  key_version,
  nonce,
  authentication_tag,
  ciphertext,
  ciphertext_sha256,
  created_at_ms,
  expires_at_ms
)
VALUES (
  $1, $2, $3, $4, $5,
  $6, $7, $8, $9, $10
)
ON CONFLICT DO NOTHING
RETURNING *
`;

const GET_SQL = `
SELECT *
FROM veil_proof_payloads
WHERE payload_reference = $1
LIMIT 1
`;

const DELETE_SQL = `
DELETE FROM veil_proof_payloads
WHERE payload_reference = $1
RETURNING payload_reference
`;

const DELETE_EXPIRED_SQL = `
WITH expired AS (
  SELECT payload_reference
  FROM veil_proof_payloads
  WHERE expires_at_ms <= $1
  ORDER BY expires_at_ms, payload_reference
  FOR UPDATE SKIP LOCKED
  LIMIT $2
)
DELETE FROM veil_proof_payloads AS payloads
USING expired
WHERE payloads.payload_reference =
  expired.payload_reference
RETURNING payloads.payload_reference
`;

export class PostgresProofPayloadRepository
implements ProofPayloadRepository {
  readonly #provider: PostgresTransactionProvider;

  constructor(
    provider: PostgresTransactionProvider,
  ) {
    this.#provider = provider;
  }

  async createOrGet(
    payload: EncryptedProofPayload,
  ): Promise<ProofPayloadCreateResult> {
    return this.#provider.transaction(
      async (executor) => {
        const inserted =
          await executor.query<DatabaseRow>(
            INSERT_SQL,
            recordValues(payload),
          );

        const insertedRow =
          singleRow(inserted.rows);

        if (insertedRow !== null) {
          return Object.freeze({
            created: true,
            payload: mapRow(insertedRow),
          });
        }

        const existing =
          await getByReference(
            executor,
            payload.payloadReference,
          );

        if (existing === null) {
          throw proofPayloadRepositoryError(
            "PROOF_PAYLOAD_CREATE_FAILED",
            "The proof payload could not be created.",
          );
        }

        assertSamePayload(existing, payload);

        return Object.freeze({
          created: false,
          payload: existing,
        });
      },
    );
  }

  async getByReference(
    payloadReference: string,
  ): Promise<EncryptedProofPayload | null> {
    return getByReference(
      this.#provider,
      requireReference(payloadReference),
    );
  }

  async deleteByReference(
    payloadReference: string,
  ): Promise<boolean> {
    const result =
      await this.#provider.query<DatabaseRow>(
        DELETE_SQL,
        [requireReference(payloadReference)],
      );

    return result.rows.length === 1;
  }

  async deleteExpired(
    nowMs: number,
    limit: number,
  ): Promise<number> {
    requireInteger(nowMs, 0, Number.MAX_SAFE_INTEGER);
    requireInteger(limit, 1, 1_000);

    const result =
      await this.#provider.query<DatabaseRow>(
        DELETE_EXPIRED_SQL,
        [nowMs, limit],
      );

    return result.rows.length;
  }
}

async function getByReference(
  executor: PostgresQueryExecutor,
  payloadReference: string,
): Promise<EncryptedProofPayload | null> {
  const result =
    await executor.query<DatabaseRow>(
      GET_SQL,
      [payloadReference],
    );

  const row = singleRow(result.rows);

  return row === null
    ? null
    : mapRow(row);
}

function recordValues(
  payload: EncryptedProofPayload,
): readonly unknown[] {
  return [
    payload.schemaVersion,
    payload.payloadReference,
    payload.requestFingerprint,
    payload.keyVersion,
    payload.nonce,
    payload.authenticationTag,
    payload.ciphertext,
    payload.ciphertextSha256,
    payload.createdAtMs,
    payload.expiresAtMs,
  ];
}

function mapRow(
  row: DatabaseRow,
): EncryptedProofPayload {
  if (row.schema_version !== "veil-proof-payload-v1") {
    throw invalidRow();
  }

  return Object.freeze({
    schemaVersion: "veil-proof-payload-v1",
    payloadReference:
      requireReference(row.payload_reference),
    requestFingerprint:
      requireString(row.request_fingerprint),
    keyVersion:
      requireString(row.key_version),
    nonce:
      requireBuffer(row.nonce),
    authenticationTag:
      requireBuffer(row.authentication_tag),
    ciphertext:
      requireBuffer(row.ciphertext),
    ciphertextSha256:
      requireString(row.ciphertext_sha256),
    createdAtMs:
      requireDatabaseInteger(row.created_at_ms),
    expiresAtMs:
      requireDatabaseInteger(row.expires_at_ms),
  });
}

function assertSamePayload(
  existing: EncryptedProofPayload,
  incoming: EncryptedProofPayload,
): void {
  const matches =
    existing.requestFingerprint
      === incoming.requestFingerprint
    && existing.keyVersion
      === incoming.keyVersion
    && existing.ciphertextSha256
      === incoming.ciphertextSha256
    && existing.createdAtMs
      === incoming.createdAtMs
    && existing.expiresAtMs
      === incoming.expiresAtMs
    && existing.nonce.equals(incoming.nonce)
    && existing.authenticationTag.equals(
      incoming.authenticationTag,
    )
    && existing.ciphertext.equals(
      incoming.ciphertext,
    );

  if (!matches) {
    throw proofPayloadRepositoryError(
      "PROOF_PAYLOAD_REFERENCE_CONFLICT",
      "The payload reference is already bound to different encrypted data.",
    );
  }
}

function singleRow(
  rows: readonly DatabaseRow[],
): DatabaseRow | null {
  if (rows.length > 1) {
    throw invalidRow();
  }

  return rows[0] ?? null;
}

function requireReference(
  value: unknown,
): string {
  if (
    typeof value !== "string"
    || !/^payload_[A-Za-z0-9_-]{16,128}$/u
      .test(value)
  ) {
    throw proofPayloadRepositoryError(
      "PROOF_PAYLOAD_REFERENCE_INVALID",
      "The proof payload reference is invalid.",
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

function requireBuffer(
  value: unknown,
): Buffer {
  if (!Buffer.isBuffer(value)) {
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
    throw proofPayloadRepositoryError(
      "PROOF_PAYLOAD_ARGUMENT_INVALID",
      "A proof payload repository argument is invalid.",
    );
  }
}

function invalidRow() {
  return proofPayloadRepositoryError(
    "PROOF_PAYLOAD_DATABASE_ROW_INVALID",
    "The stored proof payload record is invalid.",
  );
}
