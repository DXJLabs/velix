import assert from "node:assert/strict";
import test from "node:test";

import {
  BackendEnvironmentError,
} from "../config/backend-env.js";

import {
  loadProofPayloadKeyring,
} from "../config/proof-payload-env.js";

const KEY =
  Buffer.alloc(32, 7).toString("base64");

function hasCode(expectedCode: string) {
  return (error: unknown): boolean =>
    error instanceof BackendEnvironmentError
    && error.code === expectedCode;
}

test("loads the active proof payload key", () => {
  const keyring = loadProofPayloadKeyring({
    VEIL_PROOF_PAYLOAD_ACTIVE_KEY_VERSION:
      "v1",

    VEIL_PROOF_PAYLOAD_KEYS:
      JSON.stringify({
        v1: KEY,
      }),
  });

  assert.equal(
    keyring.activeKeyVersion,
    "v1",
  );

  assert.deepEqual(
    keyring.resolveKey("v1"),
    Buffer.alloc(32, 7),
  );
});

test("rejects a missing active key version", () => {
  assert.throws(
    () => loadProofPayloadKeyring({
      VEIL_PROOF_PAYLOAD_KEYS:
        JSON.stringify({
          v1: KEY,
        }),
    }),
    hasCode(
      "VEIL_PROOF_PAYLOAD_ACTIVE_KEY_VERSION_MISSING",
    ),
  );
});

test("rejects an active key absent from the keyring", () => {
  assert.throws(
    () => loadProofPayloadKeyring({
      VEIL_PROOF_PAYLOAD_ACTIVE_KEY_VERSION:
        "v2",

      VEIL_PROOF_PAYLOAD_KEYS:
        JSON.stringify({
          v1: KEY,
        }),
    }),
    hasCode(
      "VEIL_PROOF_PAYLOAD_ACTIVE_KEY_MISSING",
    ),
  );
});

test("rejects keys that are not exactly 32 bytes", () => {
  assert.throws(
    () => loadProofPayloadKeyring({
      VEIL_PROOF_PAYLOAD_ACTIVE_KEY_VERSION:
        "v1",

      VEIL_PROOF_PAYLOAD_KEYS:
        JSON.stringify({
          v1:
            Buffer.alloc(16)
              .toString("base64"),
        }),
    }),
    hasCode(
      "VEIL_PROOF_PAYLOAD_KEY_INVALID",
    ),
  );
});

test("rejects unknown key versions", () => {
  const keyring = loadProofPayloadKeyring({
    VEIL_PROOF_PAYLOAD_ACTIVE_KEY_VERSION:
      "v1",

    VEIL_PROOF_PAYLOAD_KEYS:
      JSON.stringify({
        v1: KEY,
      }),
  });

  assert.throws(
    () => keyring.resolveKey("v2"),
    hasCode(
      "VEIL_PROOF_PAYLOAD_KEY_NOT_FOUND",
    ),
  );
});
