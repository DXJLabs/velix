import {
  Pool,
  type PoolClient,
  type QueryResultRow,
} from "pg";

import {
  BackendEnvironmentError,
} from "../../config/backend-env.js";

import type {
  PostgresQueryExecutor,
  PostgresQueryResult,
  PostgresTransactionProvider,
} from "./postgres-proof-job-repository.js";

interface GlobalPostgresCache {
  __veilPostgresPool?: Pool;
}

const globalCache =
  globalThis as typeof globalThis & GlobalPostgresCache;

export function createPostgresProvider(
  env: NodeJS.ProcessEnv = process.env,
): PostgresTransactionProvider {
  const connectionString = requireDatabaseUrl(env);
  const pool = getPool(connectionString);

  return Object.freeze({
    query: async <Row extends Record<string, unknown>>(
      text: string,
      values: readonly unknown[] = [],
    ): Promise<PostgresQueryResult<Row>> => {
      return runQuery<Row>(pool, text, values);
    },

    transaction: async <T>(
      operation: (
        executor: PostgresQueryExecutor,
      ) => Promise<T>,
    ): Promise<T> => {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const executor: PostgresQueryExecutor =
          Object.freeze({
            query: async <
              Row extends Record<string, unknown>,
            >(
              text: string,
              values: readonly unknown[] = [],
            ): Promise<PostgresQueryResult<Row>> => {
              return runQuery<Row>(
                client,
                text,
                values,
              );
            },
          });

        const result = await operation(executor);

        await client.query("COMMIT");

        return result;
      } catch (error) {
        await rollbackQuietly(client);
        throw error;
      } finally {
        client.release();
      }
    },
  });
}

function requireDatabaseUrl(
  env: NodeJS.ProcessEnv,
): string {
  const value = env.DATABASE_URL?.trim();

  if (!value) {
    throw new BackendEnvironmentError(
      "DATABASE_URL_MISSING",
      "DATABASE_URL must be configured in the server environment.",
    );
  }

  if (value.includes("${{")) {
    throw new BackendEnvironmentError(
      "DATABASE_URL_UNRESOLVED",
      "DATABASE_URL contains an unresolved environment reference.",
    );
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new BackendEnvironmentError(
      "DATABASE_URL_INVALID",
      "DATABASE_URL must be a valid PostgreSQL URL.",
    );
  }

  if (
    parsed.protocol !== "postgres:"
    && parsed.protocol !== "postgresql:"
  ) {
    throw new BackendEnvironmentError(
      "DATABASE_URL_INVALID",
      "DATABASE_URL must use the PostgreSQL protocol.",
    );
  }

  return value;
}

function getPool(
  connectionString: string,
): Pool {
  const existing = globalCache.__veilPostgresPool;

  if (existing) {
    return existing;
  }

  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });

  globalCache.__veilPostgresPool = pool;

  return pool;
}

async function runQuery<
  Row extends Record<string, unknown>,
>(
  executor: Pool | PoolClient,
  text: string,
  values: readonly unknown[],
): Promise<PostgresQueryResult<Row>> {
  const result =
    await executor.query<QueryResultRow>(
      text,
      [...values],
    );

  return Object.freeze({
    rows: result.rows as Row[],
    rowCount: result.rowCount,
  });
}

async function rollbackQuietly(
  client: PoolClient,
): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original transaction error.
  }
}
