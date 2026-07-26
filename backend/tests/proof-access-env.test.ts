import assert from "node:assert/strict";
import test from "node:test";

import {
  loadProofAccessEnvironment,
  ProofAccessEnvironmentError,
} from "../config/proof-access-env.js";

function hasCode(
  expectedCode: string,
) {
  return (
    error: unknown,
  ): boolean =>
    error instanceof
      ProofAccessEnvironmentError
    && error.code === expectedCode;
}

test(
  "loads the server-only proof access secret",
  () => {
    const secret =
      "s".repeat(48);

    const loaded =
      loadProofAccessEnvironment({
        VEIL_PROOF_ACCESS_SECRET:
          secret,
      });

    assert.equal(
      loaded.hmacSecret.toString(
        "utf8",
      ),
      secret,
    );

    loaded.hmacSecret.fill(0);
  },
);

test(
  "rejects a missing proof access secret",
  () => {
    assert.throws(
      () =>
        loadProofAccessEnvironment(
          {},
        ),

      hasCode(
        "PROOF_ACCESS_ENV_MISSING",
      ),
    );
  },
);

test(
  "rejects an unresolved proof access secret",
  () => {
    assert.throws(
      () =>
        loadProofAccessEnvironment({
          VEIL_PROOF_ACCESS_SECRET:
            "${{ Postgres.SECRET }}",
        }),

      hasCode(
        "PROOF_ACCESS_ENV_UNRESOLVED",
      ),
    );
  },
);

test(
  "rejects a short proof access secret",
  () => {
    assert.throws(
      () =>
        loadProofAccessEnvironment({
          VEIL_PROOF_ACCESS_SECRET:
            "too-short",
        }),

      hasCode(
        "PROOF_ACCESS_SECRET_INVALID",
      ),
    );
  },
);
