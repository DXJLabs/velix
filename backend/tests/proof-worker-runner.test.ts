import assert from "node:assert/strict";
import test from "node:test";

import {
  runProofWorkerLoop,
} from "../services/prover/proof-worker-runner.js";

import type {
  ProofWorkerDependencies,
} from "../services/prover/proof-worker.js";

function idleDependencies():
  ProofWorkerDependencies {
  return {
    jobs: {
      async createOrGetByIdempotency() {
        throw new Error(
          "not used",
        );
      },

      async getById() {
        return null;
      },

      async getByIdempotencyKeyHash() {
        return null;
      },

      async compareAndSwap() {
        throw new Error(
          "not used",
        );
      },

      async claimNextAvailable() {
        return null;
      },

      async recoverExpired() {
        return [];
      },
    },

    payloads: {
      async createOrGet() {
        throw new Error(
          "not used",
        );
      },

      async getByReference() {
        throw new Error(
          "not used",
        );
      },

      async deleteByReference() {
        throw new Error(
          "not used",
        );
      },

      async deleteExpired() {
        throw new Error(
          "not used",
        );
      },
    },

    prover: {
      async prove() {
        throw new Error(
          "not used",
        );
      },
    },

    results: {
      async finalize() {
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

    now:
      () => 1_000,
  };
}

test(
  "production worker loop backs off while the queue is idle",
  async () => {
    const delays:
      number[] = [];

    const events:
      string[] = [];

    const summary =
      await runProofWorkerLoop(
        {
          worker:
            idleDependencies(),

          async sleep(
            delayMs,
          ) {
            delays.push(
              delayMs,
            );
          },

          onEvent(event) {
            events.push(
              event.type,
            );
          },
        },
        {
          leaseOwnerHash:
            "a".repeat(64),

          leaseDurationMs:
            10_000,

          heartbeatIntervalMs:
            2_000,

          maxRunningJobs:
            1,

          recoveryBatchSize:
            50,

          idleDelayMs:
            2_000,

          errorDelayMs:
            5_000,

          maximumIterations:
            2,
        },
      );

    assert.deepEqual(
      delays,
      [
        2_000,
        2_000,
      ],
    );

    assert.deepEqual(
      events,
      [
        "iteration",
        "iteration",
        "stopped",
      ],
    );

    assert.equal(
      summary.iterations,
      2,
    );

    assert.equal(
      summary.completedJobs,
      0,
    );
  },
);

test(
  "production worker loop stops gracefully after abort",
  async () => {
    const controller =
      new AbortController();

    const summary =
      await runProofWorkerLoop(
        {
          worker:
            idleDependencies(),

          async sleep() {
            controller.abort();
          },
        },
        {
          leaseOwnerHash:
            "a".repeat(64),

          leaseDurationMs:
            10_000,

          heartbeatIntervalMs:
            2_000,

          maxRunningJobs:
            1,

          recoveryBatchSize:
            50,

          idleDelayMs:
            2_000,

          errorDelayMs:
            5_000,

          signal:
            controller.signal,

          maximumIterations:
            10,
        },
      );

    assert.equal(
      summary.iterations,
      1,
    );

    assert.equal(
      summary.stopped,
      true,
    );
  },
);
