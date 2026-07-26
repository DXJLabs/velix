import assert from "node:assert/strict";
import test from "node:test";

import {
  createProofJobAccessRecord,
  deriveProofJobSubjectHash,
  ProofJobAccessError,
} from "../services/security/proof-job-access.js";

function hasCode(
  expectedCode: string,
) {
  return (
    error: unknown,
  ): boolean =>
    error instanceof
      ProofJobAccessError
    && error.code === expectedCode;
}

test(
  "proof access identity is pseudonymous and scoped to one job",
  () => {
    const secret =
      Buffer.alloc(
        32,
        7,
      );

    const subject =
      "did:privy:user-001";

    const first =
      deriveProofJobSubjectHash(
        secret,
        "privy",
        subject,
        "job_abcdefghijklmnop",
      );

    const repeated =
      deriveProofJobSubjectHash(
        secret,
        "privy",
        subject,
        "job_abcdefghijklmnop",
      );

    const anotherJob =
      deriveProofJobSubjectHash(
        secret,
        "privy",
        subject,
        "job_ponmlkjihgfedcba",
      );

    assert.match(
      first,
      /^[0-9a-f]{64}$/u,
    );

    assert.equal(
      first,
      repeated,
    );

    assert.notEqual(
      first,
      anotherJob,
    );

    assert.equal(
      first.includes(subject),
      false,
    );
  },
);

test(
  "proof access record contains no raw identity or proving metadata",
  () => {
    const record =
      createProofJobAccessRecord({
        jobId:
          "job_abcdefghijklmnop",

        subjectHash:
          "a".repeat(64),

        createdAtMs:
          1_000,
      });

    assert.deepEqual(
      Object.keys(record),
      [
        "schemaVersion",
        "jobId",
        "subjectHash",
        "createdAtMs",
      ],
    );

    const serialized =
      JSON.stringify(record);

    assert.equal(
      serialized.includes(
        "privy",
      ),
      false,
    );

    assert.equal(
      serialized.includes(
        "wallet",
      ),
      false,
    );

    assert.equal(
      serialized.includes(
        "requestFingerprint",
      ),
      false,
    );

    assert.equal(
      serialized.includes(
        "payloadReference",
      ),
      false,
    );
  },
);

test(
  "proof access derivation rejects a weak HMAC secret",
  () => {
    assert.throws(
      () =>
        deriveProofJobSubjectHash(
          Buffer.alloc(16),
          "privy",
          "did:privy:user-001",
          "job_abcdefghijklmnop",
        ),

      hasCode(
        "PROOF_JOB_ACCESS_SECRET_INVALID",
      ),
    );
  },
);
