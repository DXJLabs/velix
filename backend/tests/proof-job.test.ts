import assert from "node:assert/strict";
import test from "node:test";

import {
  acknowledgeProofJobCancellation,
  claimProofJob,
  completeProofJobFailure,
  completeProofJobSuccess,
  createQueuedProofJob,
  recoverExpiredProofJob,
  renewProofJobLease,
  requestProofJobCancellation,
} from "../services/prover/proof-job.js";

const OWNER =
  "1".repeat(64);

const OTHER_OWNER =
  "2".repeat(64);

const IDEMPOTENCY_HASH =
  "3".repeat(64);

const FINGERPRINT =
  `veil-proof-intent-v1:${"4".repeat(64)}`;

function queuedJob(
  maxAttempts = 3,
) {
  return createQueuedProofJob({
    jobId:
      "job_abcdefghijklmnop",

    requestFingerprint:
      FINGERPRINT,

    idempotencyKeyHash:
      IDEMPOTENCY_HASH,

    payloadReference:
      "payload_ref_001",

    nowMs:
      1_000,

    maxAttempts,
  });
}

test(
  "proof job completes through an owned durable lease",
  () => {
    const queued =
      queuedJob();

    const running =
      claimProofJob(
        queued,
        {
          leaseOwnerHash:
            OWNER,

          nowMs:
            1_000,

          leaseDurationMs:
            5_000,
        },
      );

    assert.equal(
      running.state,
      "running",
    );

    assert.equal(
      running.attempts,
      1,
    );

    assert.throws(
      () =>
        claimProofJob(
          running,
          {
            leaseOwnerHash:
              OTHER_OWNER,

            nowMs:
              1_100,

            leaseDurationMs:
              5_000,
          },
        ),

      /Expected queued/u,
    );

    const renewed =
      renewProofJobLease(
        running,
        {
          leaseOwnerHash:
            OWNER,

          nowMs:
            2_000,

          leaseDurationMs:
            5_000,
        },
      );

    assert.equal(
      renewed.leaseExpiresAtMs,
      7_000,
    );

    const succeeded =
      completeProofJobSuccess(
        renewed,
        {
          leaseOwnerHash:
            OWNER,

          resultReference:
            "result_ref_001",

          nowMs:
            3_000,
        },
      );

    assert.equal(
      succeeded.state,
      "succeeded",
    );

    assert.equal(
      succeeded.resultReference,
      "result_ref_001",
    );

    assert.equal(
      succeeded.leaseOwnerHash,
      null,
    );

    assert.throws(
      () =>
        completeProofJobFailure(
          succeeded,
          {
            leaseOwnerHash:
              OWNER,

            errorCode:
              "PROVER_FAILED",

            retryable:
              false,

            retryDelayMs:
              0,

            nowMs:
              3_100,
          },
        ),

      /Expected running/u,
    );
  },
);

test(
  "retryable proof jobs return to queued state until attempts are exhausted",
  () => {
    const firstRunning =
      claimProofJob(
        queuedJob(2),
        {
          leaseOwnerHash:
            OWNER,

          nowMs:
            1_000,

          leaseDurationMs:
            5_000,
        },
      );

    const retryQueued =
      completeProofJobFailure(
        firstRunning,
        {
          leaseOwnerHash:
            OWNER,

          errorCode:
            "PROVER_TIMEOUT",

          retryable:
            true,

          retryDelayMs:
            500,

          nowMs:
            2_000,
        },
      );

    assert.equal(
      retryQueued.state,
      "queued",
    );

    assert.equal(
      retryQueued.availableAtMs,
      2_500,
    );

    assert.throws(
      () =>
        claimProofJob(
          retryQueued,
          {
            leaseOwnerHash:
              OWNER,

            nowMs:
              2_499,

            leaseDurationMs:
              5_000,
          },
        ),

      /not available/u,
    );

    const secondRunning =
      claimProofJob(
        retryQueued,
        {
          leaseOwnerHash:
            OWNER,

          nowMs:
            2_500,

          leaseDurationMs:
            5_000,
        },
      );

    const failed =
      completeProofJobFailure(
        secondRunning,
        {
          leaseOwnerHash:
            OWNER,

          errorCode:
            "PROVER_TIMEOUT",

          retryable:
            true,

          retryDelayMs:
            500,

          nowMs:
            3_000,
        },
      );

    assert.equal(
      failed.state,
      "failed",
    );

    assert.equal(
      failed.attempts,
      2,
    );

    assert.equal(
      failed.failure?.code,
      "PROVER_TIMEOUT",
    );
  },
);

test(
  "queued and running proof jobs cancel without reporting success",
  () => {
    const queuedCancelled =
      requestProofJobCancellation(
        queuedJob(),
        1_100,
      );

    assert.equal(
      queuedCancelled.state,
      "cancelled",
    );

    const running =
      claimProofJob(
        queuedJob(),
        {
          leaseOwnerHash:
            OWNER,

          nowMs:
            1_000,

          leaseDurationMs:
            5_000,
        },
      );

    const requested =
      requestProofJobCancellation(
        running,
        1_500,
      );

    assert.equal(
      requested.state,
      "running",
    );

    assert.throws(
      () =>
        completeProofJobSuccess(
          requested,
          {
            leaseOwnerHash:
              OWNER,

            resultReference:
              "result_ref_002",

            nowMs:
              2_000,
          },
        ),

      /cannot complete successfully/u,
    );

    const cancelled =
      acknowledgeProofJobCancellation(
        requested,
        OWNER,
        2_000,
      );

    assert.equal(
      cancelled.state,
      "cancelled",
    );

    assert.equal(
      cancelled.resultReference,
      null,
    );
  },
);

test(
  "proof job metadata contains references rather than proof requests or proof bytes",
  () => {
    const serialized =
      JSON.stringify(
        queuedJob(),
      );

    assert.doesNotMatch(
      serialized,
      /plaintext|viewingKey|privateKey|signature|calldata|proofBytes/u,
    );

    assert.match(
      serialized,
      /payload_ref_001/u,
    );
  },
);


test(
  "expired running proof job returns to the durable queue",
  () => {
    const running =
      claimProofJob(
        queuedJob(),
        {
          leaseOwnerHash:
            OWNER,

          nowMs:
            1_000,

          leaseDurationMs:
            5_000,
        },
      );

    const recovered =
      recoverExpiredProofJob(
        running,
        6_000,
      );

    assert.equal(
      recovered.state,
      "queued",
    );

    assert.equal(
      recovered.revision,
      running.revision + 1,
    );

    assert.equal(
      recovered.leaseOwnerHash,
      null,
    );

    assert.equal(
      recovered.leaseExpiresAtMs,
      null,
    );

    assert.deepEqual(
      recovered.failure,
      {
        code:
          "PROOF_WORKER_LEASE_EXPIRED",

        retryable:
          true,
      },
    );
  },
);

test(
  "active proof job lease cannot be recovered",
  () => {
    const running =
      claimProofJob(
        queuedJob(),
        {
          leaseOwnerHash:
            OWNER,

          nowMs:
            1_000,

          leaseDurationMs:
            5_000,
        },
      );

    assert.throws(
      () =>
        recoverExpiredProofJob(
          running,
          5_999,
        ),

      /lease has not expired/u,
    );
  },
);
