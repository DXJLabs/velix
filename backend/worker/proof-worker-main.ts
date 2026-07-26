import {
  loadProofPayloadKeyring,
} from "../config/proof-payload-env.js";

import {
  loadProofWorkerRuntimePolicy,
} from "../config/proof-worker-env.js";

import {
  PostgresProofJobRepository,
} from "../services/prover/postgres-proof-job-repository.js";

import {
  PostgresProofPayloadRepository,
} from "../services/prover/postgres-proof-payload-repository.js";

import {
  PostgresProofSuccessFinalizer,
} from "../services/prover/postgres-proof-success-finalizer.js";

import {
  createPostgresProvider,
} from "../services/prover/postgres-provider.js";

import {
  createBackendProverClient,
} from "../services/prover/prover-client.js";

import {
  runProofWorkerLoop,
} from "../services/prover/proof-worker-runner.js";

const controller =
  new AbortController();

for (
  const signalName
  of [
    "SIGINT",
    "SIGTERM",
  ] as const
) {
  process.once(
    signalName,
    () => {
      controller.abort();
    },
  );
}

async function main():
  Promise<void> {
  const provider =
    createPostgresProvider();

  const policy =
    loadProofWorkerRuntimePolicy();

  const jobs =
    new PostgresProofJobRepository(
      provider,
    );

  const payloads =
    new PostgresProofPayloadRepository(
      provider,
    );

  const results =
    new PostgresProofSuccessFinalizer(
      provider,
    );

  const prover =
    createBackendProverClient({
      onStatus(event) {
        log({
          event:
            "proof.prover.status",

          status:
            event.responseStatus,

          retryCount:
            event.retryCount,

          durationMs:
            event.durationMs,

          errorCode:
            event.errorCode,
        });
      },
    });

  await runProofWorkerLoop(
    {
      worker: {
        jobs,
        payloads,
        results,
        prover,

        keyring:
          loadProofPayloadKeyring(),
      },

      onEvent(event) {
        log({
          event:
            `proof.worker.${event.type}`,

          outcome:
            event.outcome,

          state:
            event.state,

          attempts:
            event.attempts,

          errorCode:
            event.code,
        });
      },
    },
    {
      ...policy,

      signal:
        controller.signal,
    },
  );
}

function log(
  details: Readonly<
    Record<string, unknown>
  >,
): void {
  const sanitized =
    Object.fromEntries(
      Object.entries(details)
        .filter(
          ([, value]) =>
            value !== undefined,
        ),
    );

  console.info(
    JSON.stringify({
      timestamp:
        new Date().toISOString(),

      ...sanitized,
    }),
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      JSON.stringify({
        timestamp:
          new Date().toISOString(),

        event:
          "proof.worker.fatal",

        errorCode:
          typeof error === "object"
          && error !== null
          && "code" in error
          && typeof error.code
            === "string"
            ? error.code
            : "PROOF_WORKER_FATAL",
      }),
    );

    process.exitCode =
      1;
  },
);
