import assert from "node:assert/strict";
import test from "node:test";

import {
  createQueuedProofJob,
} from "../services/prover/proof-job.js";

import {
  getAuthorizedProofJobStatus,
  ProofJobStatusError,
} from "../services/prover/proof-job-status.js";

import {
  createProofJobAccessRecord,
  deriveProofJobSubjectHash,
} from "../services/security/proof-job-access.js";

const JOB_ID =
  "job_abcdefghijklmnop";

const SUBJECT =
  "did:privy:user-owner";

const SECRET =
  Buffer.alloc(
    32,
    9,
  );

function job() {
  return createQueuedProofJob({
    jobId:
      JOB_ID,

    requestFingerprint:
      `veil-proof-intent-v1:${"a".repeat(64)}`,

    idempotencyKeyHash:
      "b".repeat(64),

    payloadReference:
      "payload_abcdefghijklmnop",

    nowMs:
      1_000,

    maxAttempts:
      3,
  });
}

function access() {
  return createProofJobAccessRecord({
    jobId:
      JOB_ID,

    subjectHash:
      deriveProofJobSubjectHash(
        SECRET,
        "privy",
        SUBJECT,
        JOB_ID,
      ),

    createdAtMs:
      1_000,
  });
}

function hasCode(
  expectedCode: string,
) {
  return (
    error: unknown,
  ): boolean =>
    error instanceof
      ProofJobStatusError
    && error.code === expectedCode;
}

test(
  "authenticated owner reads a minimal proof job status",
  async () => {
    const storedJob =
      job();

    const result =
      await getAuthorizedProofJobStatus(
        {
          jobs: {
            async getById() {
              return storedJob;
            },
          },

          access: {
            async getByJobId() {
              return access();
            },
          },

          accessSecret:
            SECRET,
        },
        {
          identityProvider:
            "privy",

          authenticatedSubject:
            SUBJECT,

          jobId:
            JOB_ID,
        },
      );

    assert.equal(
      result.state,
      "queued",
    );

    assert.equal(
      result.jobId,
      JOB_ID,
    );

    const serialized =
      JSON.stringify(result);

    assert.equal(
      serialized.includes(
        "requestFingerprint",
      ),
      false,
    );

    assert.equal(
      serialized.includes(
        "idempotencyKeyHash",
      ),
      false,
    );

    assert.equal(
      serialized.includes(
        "payloadReference",
      ),
      false,
    );

    assert.equal(
      serialized.includes(
        "leaseOwnerHash",
      ),
      false,
    );

    assert.equal(
      serialized.includes(
        SUBJECT,
      ),
      false,
    );
  },
);

test(
  "another authenticated subject cannot read the proof job",
  async () => {
    await assert.rejects(
      () =>
        getAuthorizedProofJobStatus(
          {
            jobs: {
              async getById() {
                return job();
              },
            },

            access: {
              async getByJobId() {
                return access();
              },
            },

            accessSecret:
              SECRET,
          },
          {
            identityProvider:
              "privy",

            authenticatedSubject:
              "did:privy:user-attacker",

            jobId:
              JOB_ID,
          },
        ),

      hasCode(
        "PROOF_JOB_NOT_FOUND_OR_FORBIDDEN",
      ),
    );
  },
);

test(
  "missing and forbidden proof jobs use the same public error",
  async () => {
    await assert.rejects(
      () =>
        getAuthorizedProofJobStatus(
          {
            jobs: {
              async getById() {
                throw new Error(
                  "job lookup must not run",
                );
              },
            },

            access: {
              async getByJobId() {
                return null;
              },
            },

            accessSecret:
              SECRET,
          },
          {
            identityProvider:
              "privy",

            authenticatedSubject:
              SUBJECT,

            jobId:
              JOB_ID,
          },
        ),

      hasCode(
        "PROOF_JOB_NOT_FOUND_OR_FORBIDDEN",
      ),
    );
  },
);
