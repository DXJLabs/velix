import assert from "node:assert/strict";
import test from "node:test";

import {
  BackendEnvironmentError,
} from "../config/backend-env.js";

import {
  createPostgresProvider,
} from "../services/prover/postgres-provider.js";

function assertEnvironmentError(
  operation: () => unknown,
  expectedCode: string,
): void {
  assert.throws(
    operation,
    (error: unknown) => (
      error instanceof BackendEnvironmentError
      && error.code === expectedCode
    ),
  );
}

test("rejects a missing DATABASE_URL", () => {
  assertEnvironmentError(
    () => createPostgresProvider({}),
    "DATABASE_URL_MISSING",
  );
});

test("rejects an unresolved Railway reference", () => {
  assertEnvironmentError(
    () => createPostgresProvider({
      DATABASE_URL:
        "postgresql://user:pass@host:${{RAILWAY_TCP_PROXY_PORT}}/db",
    }),
    "DATABASE_URL_UNRESOLVED",
  );
});

test("rejects a non-PostgreSQL URL", () => {
  assertEnvironmentError(
    () => createPostgresProvider({
      DATABASE_URL: "https://example.com/database",
    }),
    "DATABASE_URL_INVALID",
  );
});

test("creates a PostgreSQL transaction provider", () => {
  const provider = createPostgresProvider({
    DATABASE_URL:
      "postgresql://user:password@localhost:5432/veil",
  });

  assert.equal(typeof provider.query, "function");
  assert.equal(typeof provider.transaction, "function");
});
