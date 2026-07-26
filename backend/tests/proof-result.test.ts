import assert from "node:assert/strict";
import test from "node:test";

import {
  decryptProofResult,
  encryptProofResult,
  ProofResultError,
} from "../services/prover/proof-result.js";

const FINGERPRINT =
  `veil-proof-intent-v1:${"a".repeat(64)}`;

const JOB_ID =
  `job_${"b".repeat(64)}`;

function proofResult() {
  const proof =
    Buffer.alloc(
      64,
      7,
    ).toString(
      "base64",
    );

  return {
    status:
      "LOCAL_PROVER_VERIFIED" as const,

    requestId:
      "message-result-test-1",

    operation:
      "message" as const,

    requestFingerprint:
      FINGERPRINT,

    proof,

    proofFacts:
      Object.freeze([
        "0x1",
      ]),

    l2ToL1Messages:
      Object.freeze([
        Object.freeze({
          fromAddress:
            "0x1",

          toAddress:
            "0x2",

          payload:
            Object.freeze([
              "0x3",
            ]),
        }),
      ]),

    proofSizeBytes:
      64,

    retryCount:
      0,

    broadcastEnabled:
      false as const,

    canonicalPrepared:
      false as const,

    liveVerified:
      false as const,

    shieldEnabled:
      false as const,
  };
}

test(
  "encrypted proof result round trips without plaintext storage",
  () => {
    const key =
      Buffer.alloc(
        32,
        9,
      );

    const encrypted =
      encryptProofResult({
        job: {
          jobId:
            JOB_ID,

          requestFingerprint:
            FINGERPRINT,
        },

        result:
          proofResult(),

        keyVersion:
          "v1",

        key,

        nowMs:
          1_000,
      });

    assert.equal(
      encrypted.ciphertext
        .includes(
          Buffer.from(
            proofResult().proof,
            "utf8",
          ),
        ),
      false,
    );

    const decrypted =
      decryptProofResult(
        encrypted,
        key,
        1_001,
      );

    assert.deepEqual(
      decrypted,
      proofResult(),
    );
  },
);

test(
  "encrypted proof result rejects ciphertext tampering",
  () => {
    const key =
      Buffer.alloc(
        32,
        4,
      );

    const encrypted =
      encryptProofResult({
        job: {
          jobId:
            JOB_ID,

          requestFingerprint:
            FINGERPRINT,
        },

        result:
          proofResult(),

        keyVersion:
          "v1",

        key,

        nowMs:
          1_000,
      });

    const ciphertext =
      Buffer.from(
        encrypted.ciphertext,
      );

    ciphertext[0] =
      (ciphertext[0] ?? 0) ^ 1;

    assert.throws(
      () =>
        decryptProofResult(
          {
            ...encrypted,
            ciphertext,
          },
          key,
          1_001,
        ),

      (
        error: unknown,
      ) =>
        error instanceof
          ProofResultError
        && error.code
          === "PROOF_RESULT_INTEGRITY_FAILED",
    );
  },
);

test(
  "proof result cannot be rebound to another durable fingerprint",
  () => {
    const key =
      Buffer.alloc(
        32,
        5,
      );

    assert.throws(
      () =>
        encryptProofResult({
          job: {
            jobId:
              JOB_ID,

            requestFingerprint:
              `veil-proof-intent-v1:${"c".repeat(64)}`,
          },

          result:
            proofResult(),

          keyVersion:
            "v1",

          key,

          nowMs:
            1_000,
        }),

      (
        error: unknown,
      ) =>
        error instanceof
          ProofResultError
        && error.code
          === "PROOF_RESULT_BINDING_INVALID",
    );
  },
);
