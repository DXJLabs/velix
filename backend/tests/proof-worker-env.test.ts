import assert from "node:assert/strict";
import test from "node:test";

import {
  loadProofWorkerRuntimePolicy,
  ProofWorkerEnvironmentError,
} from "../config/proof-worker-env.js";

function validEnv():
  NodeJS.ProcessEnv {
  return {
    VEIL_PROOF_QUEUE_MAX_QUEUED_JOBS:
      "100",

    VEIL_PROOF_QUEUE_MAX_RUNNING_JOBS:
      "1",

    VEIL_PROOF_QUEUE_RECOVERY_BATCH_SIZE:
      "50",

    VEIL_PROOF_WORKER_NAME:
      "worker-1",

    VEIL_PROOF_WORKER_SECRET:
      "s".repeat(48),

    VEIL_PROOF_WORKER_LEASE_MS:
      "120000",

    VEIL_PROOF_WORKER_HEARTBEAT_MS:
      "30000",

    VEIL_PROOF_WORKER_IDLE_MS:
      "2000",

    VEIL_PROOF_WORKER_ERROR_MS:
      "5000",
  };
}

test(
  "loads a pseudonymous production proof worker policy",
  () => {
    const policy =
      loadProofWorkerRuntimePolicy(
        validEnv(),
      );

    assert.match(
      policy.leaseOwnerHash,
      /^[0-9a-f]{64}$/u,
    );

    assert.equal(
      policy.leaseDurationMs,
      120_000,
    );

    assert.equal(
      policy.heartbeatIntervalMs,
      30_000,
    );

    assert.equal(
      policy.maxRunningJobs,
      1,
    );
  },
);

test(
  "worker identity hash changes across worker names",
  () => {
    const first =
      loadProofWorkerRuntimePolicy(
        validEnv(),
      );

    const second =
      loadProofWorkerRuntimePolicy({
        ...validEnv(),

        VEIL_PROOF_WORKER_NAME:
          "worker-2",
      });

    assert.notEqual(
      first.leaseOwnerHash,
      second.leaseOwnerHash,
    );
  },
);

test(
  "rejects a heartbeat interval that reaches the lease duration",
  () => {
    assert.throws(
      () =>
        loadProofWorkerRuntimePolicy({
          ...validEnv(),

          VEIL_PROOF_WORKER_HEARTBEAT_MS:
            "120000",
        }),

      (
        error: unknown,
      ) =>
        error instanceof
          ProofWorkerEnvironmentError
        && error.code
          === "PROOF_WORKER_ENV_OUT_OF_RANGE",
    );
  },
);
