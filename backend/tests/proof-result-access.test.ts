import assert from "node:assert/strict";
import test from "node:test";

import {
  claimProofJob,
  completeProofJobSuccess,
  createQueuedProofJob,
} from "../services/prover/proof-job.js";

import {
  encryptProofResult,
} from "../services/prover/proof-result.js";

import {
  ProofResultAccessError,
  readAuthorizedProofResult,
} from "../services/prover/proof-result-access.js";

import {
  createProofJobAccessRecord,
  deriveProofJobSubjectHash,
} from "../services/security/proof-job-access.js";

const SECRET =
  Buffer.alloc(
    32,
    7,
  );

const KEY =
  Buffer.alloc(
    32,
    8,
  );

const SUBJECT =
  "did:privy:proof-result-owner";

const JOB_ID =
  `job_${"a".repeat(64)}`;

const FINGERPRINT =
  `veil-proof-intent-v1:${"b".repeat(64)}`;

function resultValue() {
  const proof =
    Buffer.alloc(
      32,
      6,
    ).toString(
      "base64",
    );

  return {
    status:
      "LOCAL_PROVER_VERIFIED" as const,

    requestId:
      "proof-result-access-1",

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
      32,

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

function fixture() {
  const queued =
    createQueuedProofJob({
      jobId:
        JOB_ID,

      requestFingerprint:
        FINGERPRINT,

      idempotencyKeyHash:
        "c".repeat(64),

      payloadReference:
        `payload_${"d".repeat(64)}`,

      nowMs:
        1_000,
    });

  const claimed =
    claimProofJob(
      queued,
      {
        leaseOwnerHash:
          "e".repeat(64),

        nowMs:
          1_000,

        leaseDurationMs:
          10_000,
      },
    );

  const encrypted =
    encryptProofResult({
      job:
        claimed,

      result:
        resultValue(),

      keyVersion:
        "v1",

      key:
        KEY,

      nowMs:
        2_000,
    });

  const completed =
    completeProofJobSuccess(
      claimed,
      {
        leaseOwnerHash:
          "e".repeat(64),

        resultReference:
          encrypted.resultReference,

        nowMs:
          2_000,
      },
    );

  const access =
    createProofJobAccessRecord({
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

  return {
    completed,
    encrypted,
    access,
  };
}

test(
  "authenticated owner decrypts the durable proof result",
  async () => {
    const stored =
      fixture();

    const result =
      await readAuthorizedProofResult(
        {
          jobs: {
            async getById() {
              return stored.completed;
            },
          },

          access: {
            async getByJobId() {
              return stored.access;
            },
          },

          results: {
            async getByReference() {
              return stored.encrypted;
            },
          },

          keyring: {
            activeKeyVersion:
              "v1",

            resolveKey() {
              return Buffer.from(
                KEY,
              );
            },
          },

          accessSecret:
            SECRET,

          now:
            () => 2_001,
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

    assert.deepEqual(
      result,
      resultValue(),
    );
  },
);

test(
  "another authenticated subject cannot read the durable proof result",
  async () => {
    const stored =
      fixture();

    await assert.rejects(
      () =>
        readAuthorizedProofResult(
          {
            jobs: {
              async getById() {
                return stored.completed;
              },
            },

            access: {
              async getByJobId() {
                return stored.access;
              },
            },

            results: {
              async getByReference() {
                throw new Error(
                  "result lookup must not run",
                );
              },
            },

            keyring: {
              activeKeyVersion:
                "v1",

              resolveKey() {
                throw new Error(
                  "key lookup must not run",
                );
              },
            },

            accessSecret:
              SECRET,
          },
          {
            identityProvider:
              "privy",

            authenticatedSubject:
              "did:privy:attacker",

            jobId:
              JOB_ID,
          },
        ),

      /unavailable to this authenticated identity/u,
    );
  },
);

test(
  "queued proof jobs do not expose a result",
  async () => {
    const queued =
      createQueuedProofJob({
        jobId:
          JOB_ID,

        requestFingerprint:
          FINGERPRINT,

        idempotencyKeyHash:
          "c".repeat(64),

        payloadReference:
          `payload_${"d".repeat(64)}`,

        nowMs:
          1_000,
      });

    const access =
      fixture().access;

    await assert.rejects(
      () =>
        readAuthorizedProofResult(
          {
            jobs: {
              async getById() {
                return queued;
              },
            },

            access: {
              async getByJobId() {
                return access;
              },
            },

            results: {
              async getByReference() {
                throw new Error(
                  "not used",
                );
              },
            },

            keyring: {
              activeKeyVersion:
                "v1",

              resolveKey() {
                throw new Error(
                  "not used",
                );
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

      (
        error: unknown,
      ) =>
        error instanceof
          ProofResultAccessError
        && error.code
          === "PROOF_RESULT_NOT_READY",
    );
  },
);
