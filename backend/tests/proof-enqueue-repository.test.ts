import assert from "node:assert/strict";
import test from "node:test";

import {
  createQueuedProofJob,
  type ProofJobRecord,
} from "../services/prover/proof-job.js";

import type {
  EncryptedProofPayload,
} from "../services/prover/proof-payload.js";

import {
  createOrGetProofEnqueue,
  ProofEnqueueRepositoryError,
  type ProofEnqueueInput,
  type ProofEnqueueRepository,
  type ProofEnqueueResult,
} from "../services/prover/proof-enqueue-repository.js";

function queuedJob(
  overrides: Partial<ProofJobRecord> = {},
): ProofJobRecord {
  return Object.freeze({
    ...createQueuedProofJob({
      jobId:
        "job_abcdefghijklmnop",

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
    }),

    ...overrides,
  });
}

function encryptedPayload(
  overrides: Partial<
    EncryptedProofPayload
  > = {},
): EncryptedProofPayload {
  return Object.freeze({
    schemaVersion:
      "veil-proof-payload-v1",

    payloadReference:
      "payload_abcdefghijklmnop",

    requestFingerprint:
      `veil-proof-intent-v1:${"a".repeat(64)}`,

    keyVersion:
      "v1",

    nonce:
      Buffer.alloc(12, 1),

    authenticationTag:
      Buffer.alloc(16, 2),

    ciphertext:
      Buffer.alloc(32, 3),

    ciphertextSha256:
      "c".repeat(64),

    createdAtMs:
      1_000,

    expiresAtMs:
      61_000,

    ...overrides,
  });
}

function enqueueInput(): ProofEnqueueInput {
  return Object.freeze({
    job:
      queuedJob(),

    payload:
      encryptedPayload(),
  });
}

class ScriptedRepository
implements ProofEnqueueRepository {
  callCount = 0;

  readonly #result:
    ProofEnqueueResult;

  constructor(
    result: ProofEnqueueResult,
  ) {
    this.#result = result;
  }

  async createOrGet(
    _input: ProofEnqueueInput,
  ): Promise<ProofEnqueueResult> {
    this.callCount += 1;

    return this.#result;
  }
}

function hasCode(
  expectedCode: string,
) {
  return (
    error: unknown,
  ): boolean =>
    error instanceof
      ProofEnqueueRepositoryError
    && error.code === expectedCode;
}

test(
  "accepts a matching newly created proof enqueue",
  async () => {
    const input =
      enqueueInput();

    const repository =
      new ScriptedRepository({
        created:
          true,

        job:
          input.job,

        payload:
          input.payload,
      });

    const result =
      await createOrGetProofEnqueue(
        repository,
        input,
      );

    assert.equal(
      result.created,
      true,
    );

    assert.deepEqual(
      result.job,
      input.job,
    );

    assert.deepEqual(
      result.payload,
      input.payload,
    );

    assert.equal(
      repository.callCount,
      1,
    );
  },
);

test(
  "rejects an unbound job and payload before repository access",
  async () => {
    const input =
      enqueueInput();

    const repository =
      new ScriptedRepository({
        created:
          true,

        job:
          input.job,

        payload:
          input.payload,
      });

    await assert.rejects(
      () => createOrGetProofEnqueue(
        repository,
        {
          job:
            input.job,

          payload:
            encryptedPayload({
              requestFingerprint:
                `veil-proof-intent-v1:${"d".repeat(64)}`,
            }),
        },
      ),
      hasCode(
        "PROOF_ENQUEUE_BINDING_INVALID",
      ),
    );

    assert.equal(
      repository.callCount,
      0,
    );
  },
);

test(
  "accepts an identical idempotent retry",
  async () => {
    const input =
      enqueueInput();

    const repository =
      new ScriptedRepository({
        created:
          false,

        job:
          input.job,

        payload:
          input.payload,
      });

    const result =
      await createOrGetProofEnqueue(
        repository,
        input,
      );

    assert.equal(
      result.created,
      false,
    );

    assert.deepEqual(
      result.job,
      input.job,
    );

    assert.deepEqual(
      result.payload,
      input.payload,
    );
  },
);

test(
  "rejects idempotency key rebinding",
  async () => {
    const input =
      enqueueInput();

    const repository =
      new ScriptedRepository({
        created:
          false,

        job:
          queuedJob({
            idempotencyKeyHash:
              "e".repeat(64),
          }),

        payload:
          input.payload,
      });

    await assert.rejects(
      () => createOrGetProofEnqueue(
        repository,
        input,
      ),
      hasCode(
        "PROOF_ENQUEUE_IDEMPOTENCY_CONFLICT",
      ),
    );
  },
);

test(
  "accepts the stored randomized encryption on an idempotent retry",
  async () => {
    const input =
      enqueueInput();

    const storedPayload =
      encryptedPayload({
        nonce:
          Buffer.alloc(12, 4),

        authenticationTag:
          Buffer.alloc(16, 5),

        ciphertext:
          Buffer.alloc(32, 9),

        ciphertextSha256:
          "f".repeat(64),
      });

    const repository =
      new ScriptedRepository({
        created:
          false,

        job:
          input.job,

        payload:
          storedPayload,
      });

    const result =
      await createOrGetProofEnqueue(
        repository,
        input,
      );

    assert.equal(
      result.created,
      false,
    );

    assert.deepEqual(
      result.payload,
      storedPayload,
    );
  },
);
