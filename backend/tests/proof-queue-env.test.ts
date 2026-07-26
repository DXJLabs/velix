import assert from "node:assert/strict";
import test from "node:test";

import {
  loadProofQueuePolicy,
  ProofQueueEnvironmentError,
} from "../config/proof-queue-env.js";

test(
  "loads strict proof queue limits",
  () => {
    assert.deepEqual(
      loadProofQueuePolicy({
        VEIL_PROOF_QUEUE_MAX_QUEUED_JOBS:
          "100",

        VEIL_PROOF_QUEUE_MAX_RUNNING_JOBS:
          "2",

        VEIL_PROOF_QUEUE_RECOVERY_BATCH_SIZE:
          "50",
      }),
      {
        maxQueuedJobs:
          100,

        maxRunningJobs:
          2,

        recoveryBatchSize:
          50,
      },
    );
  },
);

test(
  "rejects a missing proof queue limit",
  () => {
    assert.throws(
      () =>
        loadProofQueuePolicy({
          VEIL_PROOF_QUEUE_MAX_QUEUED_JOBS:
            "100",

          VEIL_PROOF_QUEUE_MAX_RUNNING_JOBS:
            "2",
        }),

      (error: unknown) =>
        error instanceof
          ProofQueueEnvironmentError
        && error.code
          === "PROOF_QUEUE_ENV_MISSING",
    );
  },
);

test(
  "rejects an unresolved proof queue environment reference",
  () => {
    assert.throws(
      () =>
        loadProofQueuePolicy({
          VEIL_PROOF_QUEUE_MAX_QUEUED_JOBS:
            "${{shared.MAX_QUEUE}}",

          VEIL_PROOF_QUEUE_MAX_RUNNING_JOBS:
            "2",

          VEIL_PROOF_QUEUE_RECOVERY_BATCH_SIZE:
            "50",
        }),

      (error: unknown) =>
        error instanceof
          ProofQueueEnvironmentError
        && error.code
          === "PROOF_QUEUE_ENV_INVALID",
    );
  },
);

test(
  "rejects proof queue limits outside the safe range",
  () => {
    assert.throws(
      () =>
        loadProofQueuePolicy({
          VEIL_PROOF_QUEUE_MAX_QUEUED_JOBS:
            "100",

          VEIL_PROOF_QUEUE_MAX_RUNNING_JOBS:
            "33",

          VEIL_PROOF_QUEUE_RECOVERY_BATCH_SIZE:
            "50",
        }),

      (error: unknown) =>
        error instanceof
          ProofQueueEnvironmentError
        && error.code
          === "PROOF_QUEUE_ENV_OUT_OF_RANGE",
    );
  },
);
