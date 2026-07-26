import {
  assertProofSuccessFinalizeInput,
  proofSuccessFinalizerError,
  type ProofSuccessFinalizeInput,
  type ProofSuccessFinalizeResult,
  type ProofSuccessFinalizer,
} from "./proof-success-finalizer.js";

import {
  PostgresProofJobRepository,
  type PostgresQueryExecutor,
  type PostgresQueryResult,
  type PostgresTransactionProvider,
} from "./postgres-proof-job-repository.js";

import {
  PostgresProofResultRepository,
} from "./postgres-proof-result-repository.js";

type DatabaseRow =
  Record<string, unknown>;

const FINALIZE_SUCCESS_SQL = `
UPDATE veil_proof_jobs
SET
  state = 'succeeded',
  revision = $3,
  updated_at_ms = $4,
  completed_at_ms = $4,
  result_reference = $5,
  lease_owner_hash = NULL,
  lease_expires_at_ms = NULL,
  failure_code = NULL,
  failure_retryable = NULL
WHERE job_id = $1
  AND revision = $2
  AND state = 'running'
  AND lease_owner_hash = $6
  AND cancellation_requested_at_ms IS NULL
  AND lease_expires_at_ms > $4
  AND lease_expires_at_ms >
    (
      EXTRACT(
        EPOCH FROM clock_timestamp()
      ) * 1000
    )::bigint
RETURNING job_id
`;

export class PostgresProofSuccessFinalizer
implements ProofSuccessFinalizer {
  readonly #provider:
    PostgresTransactionProvider;

  constructor(
    provider: PostgresTransactionProvider,
  ) {
    this.#provider =
      provider;
  }

  async finalize(
    input: ProofSuccessFinalizeInput,
  ): Promise<ProofSuccessFinalizeResult> {
    assertProofSuccessFinalizeInput(
      input,
    );

    return this.#provider.transaction(
      async (executor) => {
        const scopedProvider =
          new ScopedTransactionProvider(
            executor,
          );

        const resultRepository =
          new PostgresProofResultRepository(
            scopedProvider,
          );

        const jobRepository =
          new PostgresProofJobRepository(
            scopedProvider,
          );

        const storedResult =
          await resultRepository.create(
            input.result,
          );

        const current =
          input.currentJob;

        const completed =
          input.completedJob;

        const update =
          await executor.query<DatabaseRow>(
            FINALIZE_SUCCESS_SQL,
            [
              current.jobId,
              current.revision,
              completed.revision,
              completed.completedAtMs,
              completed.resultReference,
              current.leaseOwnerHash,
            ],
          );

        if (
          update.rows.length !== 1
          || update.rowCount !== 1
        ) {
          throw proofSuccessFinalizerError(
            "PROOF_SUCCESS_FINALIZE_CONFLICT",
            "The proof job lease changed before atomic completion.",
          );
        }

        const storedJob =
          await jobRepository.getById(
            current.jobId,
          );

        if (storedJob === null) {
          throw proofSuccessFinalizerError(
            "PROOF_SUCCESS_JOB_MISSING",
            "The atomically completed proof job could not be reloaded.",
          );
        }

        const reloadedResult =
          await resultRepository
            .getByReference(
              storedResult.resultReference,
            );

        if (
          reloadedResult === null
        ) {
          throw proofSuccessFinalizerError(
            "PROOF_SUCCESS_RESULT_MISSING",
            "The atomically stored proof result could not be reloaded.",
          );
        }

        return Object.freeze({
          job:
            storedJob,

          result:
            reloadedResult,
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
    this.#executor =
      executor;
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
      executor:
        PostgresQueryExecutor,
    ) => Promise<T>,
  ): Promise<T> {
    return operation(this);
  }
}
