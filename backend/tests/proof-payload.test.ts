import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  ProofPayloadError,
  decryptProofPayload,
  encryptProofPayload,
} from "../services/prover/proof-payload.js";

const NOW = 2_000_000_000_000;
const FINGERPRINT =
  `veil-proof-intent-v1:${"a".repeat(64)}`;

function createRecord() {
  const key = randomBytes(32);

  const record = encryptProofPayload({
    payloadReference:
      "payload_abcdefghijklmnop",
    requestFingerprint: FINGERPRINT,
    keyVersion: "v1",
    key,
    payload: {
      canonical: {
        requestId: "request_1",
        operation: "message",
      },
    },
    nowMs: NOW,
    expiresAtMs: NOW + 60_000,
  });

  return { key, record };
}

function hasCode(expectedCode: string) {
  return (error: unknown): boolean =>
    error instanceof ProofPayloadError
    && error.code === expectedCode;
}

test("encrypted proof payload round trips", () => {
  const { key, record } = createRecord();

  const result = decryptProofPayload(
    record,
    key,
    NOW + 1,
  );

  assert.deepEqual(result, {
    canonical: {
      requestId: "request_1",
      operation: "message",
    },
  });

  assert.equal(record.nonce.length, 12);
  assert.equal(
    record.authenticationTag.length,
    16,
  );
});

test("encrypted proof payload rejects ciphertext tampering", () => {
  const { key, record } = createRecord();
  const ciphertext = Buffer.from(
    record.ciphertext,
  );

  ciphertext[0] = ciphertext[0]! ^ 1;

  assert.throws(
    () => decryptProofPayload(
      {
        ...record,
        ciphertext,
      },
      key,
      NOW + 1,
    ),
    hasCode("PROOF_PAYLOAD_INTEGRITY_FAILED"),
  );
});

test("encrypted proof payload rejects the wrong key", () => {
  const { record } = createRecord();

  assert.throws(
    () => decryptProofPayload(
      record,
      randomBytes(32),
      NOW + 1,
    ),
    hasCode("PROOF_PAYLOAD_DECRYPTION_FAILED"),
  );
});

test("encrypted proof payload rejects expired records", () => {
  const { key, record } = createRecord();

  assert.throws(
    () => decryptProofPayload(
      record,
      key,
      record.expiresAtMs,
    ),
    hasCode("PROOF_PAYLOAD_EXPIRED"),
  );
});
