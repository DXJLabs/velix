import assert from "node:assert/strict";
import test from "node:test";

import {
  runProofWorkerOnce,
  type ProofWorkerDependencies,
} from "../services/prover/proof-worker.js";
import {
  claimProofJob,
  createQueuedProofJob,
  requestProofJobCancellation,
  type ProofJobRecord,
} from "../services/prover/proof-job.js";

test(
  "proof worker returns idle when no queued job is available",
  async () => {
    const dependencies = {
      jobs: {
        async createOrGetByIdempotency() {
          throw new Error("not used");
        },

        async getById() {
          return null;
        },

        async getByIdempotencyKeyHash() {
          return null;
        },

        async compareAndSwap() {
          throw new Error("not used");
        },

        async claimNextAvailable() {
          return null;
        },
      },

      payloads: {
        async createOrGet() {
          throw new Error("not used");
        },

        async getByReference() {
          throw new Error("not used");
        },

        async deleteByReference() {
          throw new Error("not used");
        },

        async deleteExpired() {
          throw new Error("not used");
        },
      },

      prover: {
        async prove() {
          throw new Error("not used");
        },
      },

      results: {
        async persist() {
          throw new Error("not used");
        },
      },

      keyring: {
        activeKeyVersion: "v1",

        resolveKey() {
          throw new Error("not used");
        },
      },

      now: () => 1_000,
    } satisfies ProofWorkerDependencies;

    const result =
      await runProofWorkerOnce(
        dependencies,
        {
          leaseOwnerHash:
            "a".repeat(64),

          leaseDurationMs:
            10_000,

          maxRunningJobs:
            1,
        },
      );

    assert.deepEqual(
      result,
      {
        schemaVersion:
          "veil-proof-worker-result-v1",

        outcome:
          "idle",

        jobId:
          null,

        state:
          null,

        attempts:
          null,
      },
    );
  },
);


test(
  "proof worker requeues a retryable failure",
  async () => {
    const leaseOwnerHash =
      "a".repeat(64);

    const queued =
      createQueuedProofJob({
        jobId:
          `job_${"b".repeat(64)}`,

        requestFingerprint:
          `veil-proof-intent-v1:${"c".repeat(64)}`,

        idempotencyKeyHash:
          "d".repeat(64),

        payloadReference:
          `payload_${"e".repeat(64)}`,

        nowMs:
          1_000,

        maxAttempts:
          3,
      });

    const claimed =
      claimProofJob(
        queued,
        {
          leaseOwnerHash,
          nowMs: 1_000,
          leaseDurationMs: 10_000,
        },
      );

    const persisted: {
      value: ProofJobRecord | null;
    } = {
      value: null,
    };

    const dependencies = {
      jobs: {
        async createOrGetByIdempotency() {
          throw new Error("not used");
        },

        async getById() {
          return null;
        },

        async getByIdempotencyKeyHash() {
          return null;
        },

        async claimNextAvailable() {
          return claimed;
        },

        async compareAndSwap(input) {
          persisted.value =
            input.next;

          return input.next;
        },
      },

      payloads: {
        async createOrGet() {
          throw new Error("not used");
        },

        async getByReference() {
          throw Object.assign(
            new Error(
              "temporary prover dependency failure",
            ),
            {
              code:
                "PROVER_UNREACHABLE",

              retryable:
                true,
            },
          );
        },

        async deleteByReference() {
          throw new Error("not used");
        },

        async deleteExpired() {
          throw new Error("not used");
        },
      },

      prover: {
        async prove() {
          throw new Error("not used");
        },
      },

      results: {
        async persist() {
          throw new Error("not used");
        },
      },

      keyring: {
        activeKeyVersion: "v1",

        resolveKey() {
          throw new Error("not used");
        },
      },

      now: () => 1_000,
    } satisfies ProofWorkerDependencies;

    const result =
      await runProofWorkerOnce(
        dependencies,
        {
          leaseOwnerHash,
          leaseDurationMs: 10_000,
          maxRunningJobs: 1,
        },
      );

    assert.equal(
      result.outcome,
      "requeued",
    );

    assert.equal(
      result.state,
      "queued",
    );

    assert.equal(
      result.attempts,
      1,
    );

    assert.equal(
      persisted.value?.failure?.code,
      "PROVER_UNREACHABLE",
    );

    assert.equal(
      persisted.value?.availableAtMs,
      2_000,
    );
  },
);


test(
  "proof worker acknowledges cancellation on a claimed job",
  async () => {
    const leaseOwnerHash =
      "1".repeat(64);

    const queued =
      createQueuedProofJob({
        jobId:
          `job_${"2".repeat(64)}`,

        requestFingerprint:
          `veil-proof-intent-v1:${"3".repeat(64)}`,

        idempotencyKeyHash:
          "4".repeat(64),

        payloadReference:
          `payload_${"5".repeat(64)}`,

        nowMs:
          1_000,
      });

    const claimed =
      claimProofJob(
        queued,
        {
          leaseOwnerHash,
          nowMs: 1_000,
          leaseDurationMs: 10_000,
        },
      );

    const cancelling =
      requestProofJobCancellation(
        claimed,
        1_000,
      );

    const result =
      await runProofWorkerOnce(
        {
          jobs: {
            async createOrGetByIdempotency() {
              throw new Error("not used");
            },

            async getById() {
              return null;
            },

            async getByIdempotencyKeyHash() {
              return null;
            },

            async claimNextAvailable() {
              return cancelling;
            },

            async compareAndSwap(input) {
              return input.next;
            },
          },

          payloads: {
            async createOrGet() {
              throw new Error("not used");
            },

            async getByReference() {
              throw new Error(
                "cancel before proving",
              );
            },

            async deleteByReference() {
              throw new Error("not used");
            },

            async deleteExpired() {
              throw new Error("not used");
            },
          },

          prover: {
            async prove() {
              throw new Error("not used");
            },
          },

          results: {
            async persist() {
              throw new Error("not used");
            },
          },

          keyring: {
            activeKeyVersion: "v1",

            resolveKey() {
              throw new Error("not used");
            },
          },

          now: () => 1_000,
        },
        {
          leaseOwnerHash,
          leaseDurationMs: 10_000,
          maxRunningJobs: 1,
        },
      );

    assert.equal(
      result.outcome,
      "cancelled",
    );

    assert.equal(
      result.state,
      "cancelled",
    );
  },
);
