import {
  assertProofEnqueueBinding,
  ProofEnqueueRepositoryError,
  type ProofEnqueueInput,
  type ProofEnqueueRepository,
  type ProofEnqueueResult,
} from "./proof-enqueue-repository.js";

import {
  createOrGetProofJob,
} from "./proof-job-repository.js";

import {
  PostgresProofJobRepository,
  type PostgresQueryExecutor,
  type PostgresQueryResult,
  type PostgresTransactionProvider,
} from "./postgres-proof-job-repository.js";

import {
  PostgresProofPayloadRepository,
} from "./postgres-proof-payload-repository.js";

const QUEUE_ADMISSION_LOCK_SQL = `
SELECT pg_advisory_xact_lock($1, $2)
`;

const QUEUED_JOB_COUNT_SQL = `
SELECT COUNT(*)::integer AS queued_jobs
FROM veil_proof_jobs
WHERE state = 'queued'
`;

const QUEUE_LOCK_NAMESPACE =
  1_447_381_324;

const QUEUE_LOCK_KEY =
  2;

export class PostgresProofEnqueueRepository
implements ProofEnqueueRepository {
  readonly #provider:
    PostgresTransactionProvider;

  readonly #maxQueuedJobs:
    number;

  constructor(
    provider: PostgresTransactionProvider,
    maxQueuedJobs: number,
  ) {
    if (
      !Number.isSafeInteger(maxQueuedJobs)
      || maxQueuedJobs < 1
      || maxQueuedJobs > 10_000
    ) {
      throw new TypeError(
        "maxQueuedJobs is outside the allowed range.",
      );
    }

    this.#provider = provider;
    this.#maxQueuedJobs =
      maxQueuedJobs;
  }

  async createOrGet(
    input: ProofEnqueueInput,
  ): Promise<ProofEnqueueResult> {
    assertProofEnqueueBinding(input);

    return this.#provider.transaction(
      async (executor) => {
        await executor.query(
          QUEUE_ADMISSION_LOCK_SQL,
          [
            QUEUE_LOCK_NAMESPACE,
            QUEUE_LOCK_KEY,
          ],
        );

        const scopedProvider =
          new ScopedTransactionProvider(
            executor,
          );

        const jobRepository =
          new PostgresProofJobRepository(
            scopedProvider,
          );

        const payloadRepository =
          new PostgresProofPayloadRepository(
            scopedProvider,
          );

        const jobResult =
          await createOrGetProofJob(
            jobRepository,
            input.job,
          );

        if (jobResult.created) {
          const capacity =
            await executor.query(
              QUEUED_JOB_COUNT_SQL,
            );

          const queuedJobs =
            readQueuedJobCount(
              capacity.rows,
            );

          if (
            queuedJobs
            > this.#maxQueuedJobs
          ) {
            throw new ProofEnqueueRepositoryError(
              "PROOF_ENQUEUE_QUEUE_FULL",
              "The durable proof queue is full.",
            );
          }

          const payloadResult =
            await payloadRepository.createOrGet(
              input.payload,
            );

          if (!payloadResult.created) {
            throw new ProofEnqueueRepositoryError(
              "PROOF_ENQUEUE_PARTIAL_STATE",
              "The database contains an incomplete proof enqueue record.",
            );
          }

          return Object.freeze({
            created:
              true,

            job:
              jobResult.job,

            payload:
              payloadResult.payload,
          });
        }

        const storedPayload =
          await payloadRepository.getByReference(
            jobResult.job.payloadReference,
          );

        if (storedPayload === null) {
          throw new ProofEnqueueRepositoryError(
            "PROOF_ENQUEUE_PARTIAL_STATE",
            "The database contains an incomplete proof enqueue record.",
          );
        }

        return Object.freeze({
          created:
            false,

          job:
            jobResult.job,

          payload:
            storedPayload,
        });
      },
    );
  }
}

function readQueuedJobCount(
  rows: readonly Record<
    string,
    unknown
  >[],
): number {
  if (rows.length !== 1) {
    throw new ProofEnqueueRepositoryError(
      "PROOF_ENQUEUE_CAPACITY_INVALID",
      "The database returned an invalid queue capacity result.",
    );
  }

  const raw =
    rows[0]?.queued_jobs;

  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        && /^[0-9]+$/u.test(raw)
        ? Number(raw)
        : Number.NaN;

  if (
    !Number.isSafeInteger(value)
    || value < 0
  ) {
    throw new ProofEnqueueRepositoryError(
      "PROOF_ENQUEUE_CAPACITY_INVALID",
      "The database returned an invalid queue capacity result.",
    );
  }

  return value;
}

class ScopedTransactionProvider
implements PostgresTransactionProvider {
  readonly #executor:
    PostgresQueryExecutor;

  constructor(
    executor: PostgresQueryExecutor,
  ) {
    this.#executor = executor;
  }

  query<
    Row extends Record<string, unknown>,
  >(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<PostgresQueryResult<Row>> {
    return this.#executor.query<Row>(
      text,
      values,
    );
  }

  transaction<T>(
    operation: (
      executor: PostgresQueryExecutor,
    ) => Promise<T>,
  ): Promise<T> {
    /*
     * The outer enqueue transaction already owns the database
     * transaction. Inner repositories reuse its executor.
     */
    return operation(this);
  }
}
