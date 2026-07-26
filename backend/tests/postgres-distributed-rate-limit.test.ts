import assert from "node:assert/strict";
import test from "node:test";

import type {
  PostgresQueryExecutor,
  PostgresTransactionProvider,
} from "../services/prover/postgres-proof-job-repository.js";

import {
  PostgresDistributedRateLimitRepository,
} from "../services/security/postgres-distributed-rate-limit.js";

test(
  "PostgreSQL rate limit atomically increments a shared window",
  async () => {
    const queries: Array<{
      text: string;
      values: readonly unknown[];
    }> = [];

    const provider:
      PostgresTransactionProvider = {
        async query<
          Row extends Record<string, unknown>,
        >(
          text: string,
          values: readonly unknown[] = [],
        ) {
          queries.push({
            text,
            values,
          });

          return {
            rows: [
              {
                request_count:
                  "4",

                expires_at_ms:
                  "60000",
              } as unknown as Row,
            ],

            rowCount:
              1,
          };
        },

        async transaction<T>(
          operation: (
            executor: PostgresQueryExecutor,
          ) => Promise<T>,
        ) {
          return operation(provider);
        },
      };

    const repository =
      new PostgresDistributedRateLimitRepository(
        provider,
      );

    const result =
      await repository.consume({
        scope:
          "api:messaging:prepare",

        identityHash:
          "a".repeat(64),

        nowMs:
          1_000,

        windowMs:
          60_000,

        limit:
          3,
      });

    assert.deepEqual(
      result,
      {
        allowed:
          false,

        count:
          4,

        limit:
          3,

        remaining:
          0,

        resetAtMs:
          60_000,
      },
    );

    assert.equal(
      queries.length,
      1,
    );

    assert.match(
      queries[0]?.text ?? "",
      /ON CONFLICT/u,
    );

    assert.deepEqual(
      queries[0]?.values,
      [
        "api:messaging:prepare",
        "a".repeat(64),
        0,
        60_000,
      ],
    );
  },
);

test(
  "PostgreSQL rate-limit cleanup uses skip-locked batching",
  async () => {
    let capturedSql = "";
    let capturedValues:
      readonly unknown[] = [];

    const provider:
      PostgresTransactionProvider = {
        async query<
          Row extends Record<string, unknown>,
        >(
          text: string,
          values: readonly unknown[] = [],
        ) {
          capturedSql =
            text;

          capturedValues =
            values;

          return {
            rows: [
              {
                scope:
                  "api:test:one",
              },
              {
                scope:
                  "api:test:two",
              },
            ] as unknown as Row[],

            rowCount:
              2,
          };
        },

        async transaction<T>(
          operation: (
            executor: PostgresQueryExecutor,
          ) => Promise<T>,
        ) {
          return operation(provider);
        },
      };

    const repository =
      new PostgresDistributedRateLimitRepository(
        provider,
      );

    const deleted =
      await repository.deleteExpired(
        120_000,
        100,
      );

    assert.equal(
      deleted,
      2,
    );

    assert.match(
      capturedSql,
      /FOR UPDATE SKIP LOCKED/u,
    );

    assert.deepEqual(
      capturedValues,
      [
        120_000,
        100,
      ],
    );
  },
);
