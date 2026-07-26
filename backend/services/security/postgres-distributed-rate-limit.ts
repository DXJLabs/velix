import {
  type ConsumeRateLimitInput,
  type DistributedRateLimitRepository,
  type RateLimitConsumption,
  DistributedRateLimitError,
} from "./distributed-rate-limit.js";

import type {
  PostgresTransactionProvider,
} from "../prover/postgres-proof-job-repository.js";

type DatabaseRow =
  Record<string, unknown>;

const CONSUME_SQL = `
INSERT INTO veil_api_rate_limits (
  scope,
  identity_hash,
  window_start_ms,
  expires_at_ms,
  request_count
)
VALUES (
  $1, $2, $3, $4, 1
)
ON CONFLICT (
  scope,
  identity_hash,
  window_start_ms
)
DO UPDATE SET
  request_count = LEAST(
    veil_api_rate_limits.request_count + 1,
    1000000
  ),
  expires_at_ms = EXCLUDED.expires_at_ms
RETURNING
  request_count,
  expires_at_ms
`;

const DELETE_EXPIRED_SQL = `
WITH expired AS (
  SELECT
    scope,
    identity_hash,
    window_start_ms
  FROM veil_api_rate_limits
  WHERE expires_at_ms <= $1
  ORDER BY
    expires_at_ms,
    scope,
    identity_hash,
    window_start_ms
  FOR UPDATE SKIP LOCKED
  LIMIT $2
)
DELETE FROM veil_api_rate_limits AS limits
USING expired
WHERE limits.scope =
  expired.scope
  AND limits.identity_hash =
    expired.identity_hash
  AND limits.window_start_ms =
    expired.window_start_ms
RETURNING limits.scope
`;

export class PostgresDistributedRateLimitRepository
  implements DistributedRateLimitRepository {
  readonly #provider:
    PostgresTransactionProvider;

  constructor(
    provider: PostgresTransactionProvider,
  ) {
    this.#provider = provider;
  }

  async consume(
    input: ConsumeRateLimitInput,
  ): Promise<RateLimitConsumption> {
    const windowStartMs =
      Math.floor(
        input.nowMs
          / input.windowMs,
      ) * input.windowMs;

    const resetAtMs =
      windowStartMs
        + input.windowMs;

    const result =
      await this.#provider
        .query<DatabaseRow>(
          CONSUME_SQL,
          [
            input.scope,
            input.identityHash,
            windowStartMs,
            resetAtMs,
          ],
        );

    const row =
      requireSingleRow(
        result.rows,
      );

    const count =
      requireDatabaseInteger(
        row.request_count,
      );

    const storedResetAtMs =
      requireDatabaseInteger(
        row.expires_at_ms,
      );

    return Object.freeze({
      allowed:
        count <= input.limit,

      count,

      limit:
        input.limit,

      remaining:
        Math.max(
          0,
          input.limit - count,
        ),

      resetAtMs:
        storedResetAtMs,
    });
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
      await this.#provider
        .query<DatabaseRow>(
          DELETE_EXPIRED_SQL,
          [
            nowMs,
            limit,
          ],
        );

    return result.rows.length;
  }
}

function requireSingleRow(
  rows: readonly DatabaseRow[],
): DatabaseRow {
  if (rows.length !== 1) {
    throw repositoryError(
      "DISTRIBUTED_RATE_LIMIT_STORAGE_INVALID",
      "PostgreSQL did not return one rate-limit record.",
    );
  }

  const row = rows[0];

  if (!row) {
    throw repositoryError(
      "DISTRIBUTED_RATE_LIMIT_STORAGE_INVALID",
      "PostgreSQL returned an empty rate-limit record.",
    );
  }

  return row;
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
    throw repositoryError(
      "DISTRIBUTED_RATE_LIMIT_STORAGE_INVALID",
      "PostgreSQL returned an invalid rate-limit integer.",
    );
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
    throw repositoryError(
      "DISTRIBUTED_RATE_LIMIT_INPUT_INVALID",
      "The PostgreSQL rate-limit input is invalid.",
    );
  }
}

function repositoryError(
  code: string,
  message: string,
): DistributedRateLimitError {
  return new DistributedRateLimitError(
    code,
    message,
  );
}
