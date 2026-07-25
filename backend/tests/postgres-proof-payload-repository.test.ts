import assert from "node:assert/strict";
import test from "node:test";

import type {
  EncryptedProofPayload,
} from "../services/prover/proof-payload.js";

import {
  ProofPayloadRepositoryError,
} from "../services/prover/proof-payload-repository.js";

import {
  PostgresProofPayloadRepository,
} from "../services/prover/postgres-proof-payload-repository.js";

import type {
  PostgresQueryExecutor,
  PostgresQueryResult,
  PostgresTransactionProvider,
} from "../services/prover/postgres-proof-job-repository.js";

type Row = Record<string, unknown>;

function encryptedPayload(
  ciphertextByte = 7,
): EncryptedProofPayload {
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
      Buffer.alloc(32, ciphertextByte),

    ciphertextSha256:
      ciphertextByte === 7
        ? "b".repeat(64)
        : "c".repeat(64),

    createdAtMs:
      1_000,

    expiresAtMs:
      61_000,
  });
}

function databaseRow(
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
    rowCount: rows.length,
  };
}

test(
  "PostgreSQL payload repository inserts encrypted payloads transactionally",
  async () => {
    const payload =
      encryptedPayload();

    const provider =
      new ScriptedProvider([
        result(databaseRow(payload)),
      ]);

    const repository =
      new PostgresProofPayloadRepository(
        provider,
      );

    const created =
      await repository.createOrGet(
        payload,
      );

    assert.equal(created.created, true);
    assert.deepEqual(
      created.payload,
      payload,
    );

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
  "PostgreSQL payload repository resolves identical retries",
  async () => {
    const payload =
      encryptedPayload();

    const provider =
      new ScriptedProvider([
        result(),
        result(databaseRow(payload)),
      ]);

    const repository =
      new PostgresProofPayloadRepository(
        provider,
      );

    const repeated =
      await repository.createOrGet(
        payload,
      );

    assert.equal(
      repeated.created,
      false,
    );

    assert.deepEqual(
      repeated.payload,
      payload,
    );
  },
);

test(
  "PostgreSQL payload repository rejects reference rebinding",
  async () => {
    const existing =
      encryptedPayload(7);

    const conflicting =
      encryptedPayload(8);

    const provider =
      new ScriptedProvider([
        result(),
        result(databaseRow(existing)),
      ]);

    const repository =
      new PostgresProofPayloadRepository(
        provider,
      );

    await assert.rejects(
      () => repository.createOrGet(
        conflicting,
      ),
      (error: unknown) =>
        error instanceof
          ProofPayloadRepositoryError
        && error.code
          === "PROOF_PAYLOAD_REFERENCE_CONFLICT",
    );
  },
);

test(
  "PostgreSQL payload expiry cleanup uses skip-locked batching",
  async () => {
    const provider =
      new ScriptedProvider([
        result(
          {
            payload_reference:
              "payload_abcdefghijklmnop",
          },
          {
            payload_reference:
              "payload_qrstuvwxyzabcdef",
          },
        ),
      ]);

    const repository =
      new PostgresProofPayloadRepository(
        provider,
      );

    const deleted =
      await repository.deleteExpired(
        100_000,
        100,
      );

    assert.equal(deleted, 2);

    const sql =
      provider.queries[0]?.text ?? "";

    assert.match(
      sql,
      /FOR UPDATE SKIP LOCKED/u,
    );

    assert.match(
      sql,
      /ORDER BY expires_at_ms/u,
    );
  },
);
