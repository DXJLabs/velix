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

export class PostgresProofEnqueueRepository
implements ProofEnqueueRepository {
  readonly #provider:
    PostgresTransactionProvider;

  constructor(
    provider: PostgresTransactionProvider,
  ) {
    this.#provider = provider;
  }

  async createOrGet(
    input: ProofEnqueueInput,
  ): Promise<ProofEnqueueResult> {
    assertProofEnqueueBinding(input);

    return this.#provider.transaction(
      async (executor) => {
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
