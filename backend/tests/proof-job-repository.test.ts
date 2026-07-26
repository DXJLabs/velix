import assert from "node:assert/strict";
import test from "node:test";

import {
  claimProofJob,
  completeProofJobSuccess,
  createQueuedProofJob,
  recoverExpiredProofJob,
  type ClaimProofJobInput,
  type ProofJobRecord,
} from "../services/prover/proof-job.js";
import {
  claimNextProofJob,
  createOrGetProofJob,
  persistProofJobTransition,
  recoverExpiredProofJobs,
  renewOwnedProofJobLease,
  type ProofJobAtomicClaimInput,
  type ProofJobCompareAndSwapInput,
  type ProofJobCreateResult,
  type ProofJobRecoveryRepository,
  type ProofJobRepository,
} from "../services/prover/proof-job-repository.js";

const OWNER =
  "1".repeat(64);

const OTHER_OWNER =
  "2".repeat(64);

function createJob(
  suffix: string,
  idempotencyDigit: string,
  fingerprintDigit: string,
  nowMs = 1_000,
): ProofJobRecord {
  return createQueuedProofJob({
    jobId:
      `job_abcdefghijklmnop${suffix}`,

    requestFingerprint:
      `veil-proof-intent-v1:${fingerprintDigit.repeat(64)}`,

    idempotencyKeyHash:
      idempotencyDigit.repeat(64),

    payloadReference:
      `payload_ref_${suffix}`,

    nowMs,
    maxAttempts:
      3,
  });
}

/*
 * This test double exists only for repository contract tests. It is
 * not exported and must never be used as the production job store.
 */
class TestProofJobRepository
  implements ProofJobRepository {
  readonly #byId =
    new Map<string, ProofJobRecord>();

  readonly #idempotency =
    new Map<string, string>();

  async createOrGetByIdempotency(
    job: ProofJobRecord,
  ): Promise<ProofJobCreateResult> {
    const existingJobId =
      this.#idempotency.get(
        job.idempotencyKeyHash,
      );

    if (existingJobId !== undefined) {
      const existing =
        this.#byId.get(
          existingJobId,
        );

      if (!existing) {
        throw new Error(
          "Broken test repository index.",
        );
      }

      return {
        created: false,
        job: existing,
      };
    }

    if (
      this.#byId.has(job.jobId)
    ) {
      throw new Error(
        "Duplicate test jobId.",
      );
    }

    this.#byId.set(
      job.jobId,
      job,
    );

    this.#idempotency.set(
      job.idempotencyKeyHash,
      job.jobId,
    );

    return {
      created: true,
      job,
    };
  }

  async getById(
    jobId: string,
  ): Promise<ProofJobRecord | null> {
    return this.#byId.get(jobId)
      ?? null;
  }

  async getByIdempotencyKeyHash(
    hash: string,
  ): Promise<ProofJobRecord | null> {
    const jobId =
      this.#idempotency.get(hash);

    return jobId === undefined
      ? null
      : this.#byId.get(jobId)
        ?? null;
  }

  async compareAndSwap(
    input: ProofJobCompareAndSwapInput,
  ): Promise<ProofJobRecord | null> {
    const current =
      this.#byId.get(
        input.jobId,
      );

    if (
      current === undefined
      || current.revision
        !== input.expectedRevision
    ) {
      return null;
    }

    this.#byId.set(
      input.jobId,
      input.next,
    );

    return input.next;
  }

  async claimNextAvailable(
    input: ProofJobAtomicClaimInput,
  ): Promise<ProofJobRecord | null> {
    const runningJobs =
      [...this.#byId.values()]
        .filter(
          (job) =>
            job.state === "running"
            && job.leaseExpiresAtMs !== null
            && job.leaseExpiresAtMs
              > input.nowMs,
        )
        .length;

    if (
      runningJobs
      >= input.maxRunningJobs
    ) {
      return null;
    }

    const candidates =
      [...this.#byId.values()]
        .filter(
          (job) =>
            job.state === "queued"
            && job.availableAtMs
              <= input.nowMs
            && job.attempts
              < job.maxAttempts,
        )
        .sort(
          (left, right) =>
            left.availableAtMs
              - right.availableAtMs
            || left.createdAtMs
              - right.createdAtMs
            || left.jobId.localeCompare(
              right.jobId,
            ),
        );

    const selected =
      candidates[0];

    if (!selected) {
      return null;
    }

    const claimed =
      claimProofJob(
        selected,
        input,
      );

    const persisted =
      await this.compareAndSwap({
        jobId:
          selected.jobId,

        expectedRevision:
          selected.revision,

        next:
          claimed,
      });

    return persisted;
  }
}

test(
  "atomic create returns one durable job for repeated idempotent requests",
  async () => {
    const repository =
      new TestProofJobRepository();

    const requested =
      createJob(
        "001",
        "3",
        "4",
      );

    const first =
      await createOrGetProofJob(
        repository,
        requested,
      );

    const second =
      await createOrGetProofJob(
        repository,
        {
          ...requested,

          jobId:
            "job_abcdefghijklmnop002",
        },
      );

    assert.equal(
      first.created,
      true,
    );

    assert.equal(
      second.created,
      false,
    );

    assert.equal(
      second.job.jobId,
      requested.jobId,
    );
  },
);

test(
  "idempotency keys cannot be rebound to another proof intent",
  async () => {
    const repository =
      new TestProofJobRepository();

    await createOrGetProofJob(
      repository,
      createJob(
        "003",
        "5",
        "6",
      ),
    );

    await assert.rejects(
      () =>
        createOrGetProofJob(
          repository,
          createJob(
            "004",
            "5",
            "7",
          ),
        ),

      (
        error: unknown,
      ) =>
        error instanceof Error
        && "code" in error
        && error.code
          === "PROOF_JOB_IDEMPOTENCY_CONFLICT",
    );
  },
);

test(
  "compare and swap rejects stale proof job revisions",
  async () => {
    const repository =
      new TestProofJobRepository();

    const queued =
      createJob(
        "005",
        "8",
        "9",
      );

    await createOrGetProofJob(
      repository,
      queued,
    );

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

    await persistProofJobTransition(
      repository,
      queued,
      running,
    );

    await assert.rejects(
      () =>
        persistProofJobTransition(
          repository,
          queued,
          running,
        ),

      (
        error: unknown,
      ) =>
        error instanceof Error
        && "code" in error
        && error.code
          === "PROOF_JOB_REVISION_CONFLICT",
    );
  },
);

test(
  "atomic claim permits only one worker to acquire the queued job",
  async () => {
    const repository =
      new TestProofJobRepository();

    await createOrGetProofJob(
      repository,
      createJob(
        "006",
        "a",
        "b",
      ),
    );

    const first =
      await claimNextProofJob(
        repository,
        {
          leaseOwnerHash:
            OWNER,

          nowMs:
            1_000,

          leaseDurationMs:
            5_000,

          maxRunningJobs:
            1,
        },
      );

    const second =
      await claimNextProofJob(
        repository,
        {
          leaseOwnerHash:
            OTHER_OWNER,

          nowMs:
            1_000,

          leaseDurationMs:
            5_000,

          maxRunningJobs:
            1,
        },
      );

    assert.equal(
      first?.state,
      "running",
    );

    assert.equal(
      first?.leaseOwnerHash,
      OWNER,
    );

    assert.equal(
      second,
      null,
    );
  },
);

test(
  "durable transitions cannot alter immutable proof job metadata",
  async () => {
    const repository =
      new TestProofJobRepository();

    const queued =
      createJob(
        "007",
        "c",
        "d",
      );

    await createOrGetProofJob(
      repository,
      queued,
    );

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

    const succeeded =
      completeProofJobSuccess(
        running,
        {
          leaseOwnerHash:
            OWNER,

          resultReference:
            "result_ref_007",

          nowMs:
            2_000,
        },
      );

    await assert.rejects(
      () =>
        persistProofJobTransition(
          repository,
          running,
          {
            ...succeeded,

            payloadReference:
              "payload_ref_attacker",
          },
        ),

      (
        error: unknown,
      ) =>
        error instanceof Error
        && "code" in error
        && error.code
          === "PROOF_JOB_IMMUTABLE_FIELD_CHANGED",
    );
  },
);


test(
  "atomic claim respects the active running-job limit",
  async () => {
    const repository =
      new TestProofJobRepository();

    const firstJob =
      createJob(
        "008",
        "e",
        "f",
      );

    const secondJob =
      createJob(
        "009",
        "0",
        "1",
      );

    await createOrGetProofJob(
      repository,
      firstJob,
    );

    await createOrGetProofJob(
      repository,
      secondJob,
    );

    const first =
      await claimNextProofJob(
        repository,
        {
          leaseOwnerHash:
            OWNER,

          nowMs:
            1_000,

          leaseDurationMs:
            5_000,

          maxRunningJobs:
            1,
        },
      );

    const blocked =
      await claimNextProofJob(
        repository,
        {
          leaseOwnerHash:
            OTHER_OWNER,

          nowMs:
            1_000,

          leaseDurationMs:
            5_000,

          maxRunningJobs:
            1,
        },
      );

    assert.equal(
      first?.state,
      "running",
    );

    assert.equal(
      blocked,
      null,
    );

    const afterLeaseExpiry =
      await claimNextProofJob(
        repository,
        {
          leaseOwnerHash:
            OTHER_OWNER,

          nowMs:
            7_000,

          leaseDurationMs:
            5_000,

          maxRunningJobs:
            1,
        },
      );

    assert.equal(
      afterLeaseExpiry?.jobId,
      secondJob.jobId,
    );
  },
);


test(
  "recovery repository returns a bounded validated batch",
  async () => {
    const running =
      claimProofJob(
        createJob(
          "010",
          "2",
          "3",
        ),
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

    const repository:
      ProofJobRecoveryRepository = {
        async recoverExpired(input) {
          assert.deepEqual(
            input,
            {
              nowMs:
                6_000,

              limit:
                50,
            },
          );

          return [
            recovered,
          ];
        },
      };

    const result =
      await recoverExpiredProofJobs(
        repository,
        {
          nowMs:
            6_000,

          limit:
            50,
        },
      );

    assert.deepEqual(
      result,
      [
        recovered,
      ],
    );

    assert.equal(
      Object.isFrozen(result),
      true,
    );
  },
);

test(
  "recovery repository rejects an unsafe batch limit",
  async () => {
    let repositoryCalled =
      false;

    const repository:
      ProofJobRecoveryRepository = {
        async recoverExpired() {
          repositoryCalled =
            true;

          return [];
        },
      };

    await assert.rejects(
      () =>
        recoverExpiredProofJobs(
          repository,
          {
            nowMs:
              6_000,

            limit:
              1_001,
          },
        ),

      (
        error: unknown,
      ) =>
        error instanceof Error
        && "code" in error
        && error.code
          === "PROOF_JOB_RECOVERY_LIMIT_INVALID",
    );

    assert.equal(
      repositoryCalled,
      false,
    );
  },
);


test(
  "owned proof job lease renewal is stored durably",
  async () => {
    const repository =
      new TestProofJobRepository();

    const queued =
      createJob(
        "011",
        "4",
        "5",
      );

    await createOrGetProofJob(
      repository,
      queued,
    );

    const claimed =
      await claimNextProofJob(
        repository,
        {
          leaseOwnerHash:
            OWNER,

          nowMs:
            1_000,

          leaseDurationMs:
            5_000,

          maxRunningJobs:
            1,
        },
      );

    assert.ok(claimed);

    const renewed =
      await renewOwnedProofJobLease(
        repository,
        claimed,
        {
          leaseOwnerHash:
            OWNER,

          nowMs:
            4_000,

          leaseDurationMs:
            5_000,
        },
      );

    assert.equal(
      renewed.revision,
      claimed.revision + 1,
    );

    assert.equal(
      renewed.updatedAtMs,
      4_000,
    );

    assert.equal(
      renewed.leaseExpiresAtMs,
      9_000,
    );

    assert.equal(
      renewed.leaseOwnerHash,
      OWNER,
    );

    assert.deepEqual(
      await repository.getById(
        renewed.jobId,
      ),
      renewed,
    );
  },
);
