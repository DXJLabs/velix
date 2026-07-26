import type {
  TransactionProofRequestInput,
  TransactionProofResult,
} from "#veil-sdk/transaction-prover";

import type {
  ProofPayloadKeyring,
} from "../../config/proof-payload-env.js";

import {
  completeProofJobFailure,
  completeProofJobSuccess,
  type ProofJobRecord,
} from "./proof-job.js";

import {
  claimNextProofJob,
  persistProofJobTransition,
  recoverExpiredProofJobs,
  renewOwnedProofJobLease,
  type ProofJobRecoveryRepository,
  type ProofJobRepository,
} from "./proof-job-repository.js";

import type {
  ProofPayloadRepository,
} from "./proof-payload-repository.js";

export interface ProofExecutor {
  prove(
    input: TransactionProofRequestInput,
    signal?: AbortSignal,
  ): Promise<TransactionProofResult>;
}

export interface ProofResultWriter {
  persist(input: {
    readonly job: ProofJobRecord;
    readonly result: TransactionProofResult;
    readonly nowMs: number;
  }): Promise<{
    readonly resultReference: string;
  }>;
}

export interface ProofWorkerDependencies {
  readonly jobs:
    ProofJobRepository
    & ProofJobRecoveryRepository;

  readonly payloads:
    ProofPayloadRepository;

  readonly prover:
    ProofExecutor;

  readonly results:
    ProofResultWriter;

  readonly keyring:
    ProofPayloadKeyring;

  readonly now?: () => number;
}

export interface ProofLeaseHeartbeatInput {
  readonly leaseOwnerHash: string;
  readonly leaseDurationMs: number;
  readonly heartbeatIntervalMs?: number;
  readonly signal?: AbortSignal;
}

export interface RunProofWorkerInput
extends ProofLeaseHeartbeatInput {
  readonly maxRunningJobs: number;
  readonly recoveryBatchSize: number;
}

export type ProofWorkerOutcome =
  | "idle"
  | "succeeded"
  | "requeued"
  | "failed"
  | "cancelled";

export interface ProofWorkerResult {
  readonly schemaVersion:
    "veil-proof-worker-result-v1";

  readonly outcome:
    ProofWorkerOutcome;

  readonly jobId:
    string | null;

  readonly state:
    ProofJobRecord["state"] | null;

  readonly attempts:
    number | null;
}

export class ProofWorkerError extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "ProofWorkerError";

    this.code = code;
  }
}

export async function loadProofWorkItem(
  dependencies: Pick<
    ProofWorkerDependencies,
    "payloads" | "keyring"
  >,
  job: ProofJobRecord,
  nowMs: number,
): Promise<TransactionProofRequestInput> {
  if (
    !Number.isSafeInteger(nowMs)
    || nowMs < 0
  ) {
    throw workerError(
      "PROOF_WORKER_TIME_INVALID",
      "The proof worker timestamp is invalid.",
    );
  }

  const payload =
    await dependencies.payloads
      .getByReference(
        job.payloadReference,
      );

  if (payload === null) {
    throw workerError(
      "PROOF_WORKER_PAYLOAD_MISSING",
      "The encrypted proof work item is unavailable.",
    );
  }

  if (
    payload.payloadReference
      !== job.payloadReference
    || payload.requestFingerprint
      !== job.requestFingerprint
  ) {
    throw workerError(
      "PROOF_WORKER_PAYLOAD_BINDING_INVALID",
      "The encrypted proof work item does not match the claimed job.",
    );
  }

  const key =
    dependencies.keyring
      .resolveKey(
        payload.keyVersion,
      );

  let decrypted: unknown;

  try {
    const {
      decryptProofPayload,
    } = await import(
      "./proof-payload.js"
    );

    decrypted =
      decryptProofPayload(
        payload,
        key,
        nowMs,
      );
  } finally {
    key.fill(0);
  }

  if (
    typeof decrypted !== "object"
    || decrypted === null
    || Array.isArray(decrypted)
  ) {
    throw workerError(
      "PROOF_WORKER_PAYLOAD_INVALID",
      "The decrypted proof work item is invalid.",
    );
  }

  const workItem =
    decrypted as Record<
      string,
      unknown
    >;

  if (
    workItem.schemaVersion
      !== "veil-proof-work-item-v1"
    || !Object.hasOwn(
      workItem,
      "request",
    )
    || Object.keys(workItem).length
      !== 2
  ) {
    throw workerError(
      "PROOF_WORKER_PAYLOAD_INVALID",
      "The decrypted proof work item schema is invalid.",
    );
  }

  const {
    parseMessageProofRequest,
  } = await import(
    "./proof-request.js"
  );

  return parseMessageProofRequest(
    workItem.request,
  );
}

function workerError(
  code: string,
  message: string,
): ProofWorkerError {
  return new ProofWorkerError(
    code,
    message,
  );
}


export interface ProofJobLeaseHeartbeat {
  readonly signal: AbortSignal;

  current(): ProofJobRecord;

  stop(): Promise<ProofJobRecord>;
}

export interface ProofLeaseHeartbeatDependencies {
  readonly jobs: ProofJobRepository;
  readonly now?: () => number;
}

export function startProofJobLeaseHeartbeat(
  dependencies: ProofLeaseHeartbeatDependencies,
  job: ProofJobRecord,
  input: ProofLeaseHeartbeatInput,
): ProofJobLeaseHeartbeat {
  assertOwnedRunningJob(
    job,
    input.leaseOwnerHash,
  );

  const heartbeatIntervalMs =
    resolveHeartbeatIntervalMs(input);

  const timerController =
    new AbortController();

  const operationController =
    new AbortController();

  let currentJob =
    job;

  let heartbeatFailure:
    unknown | null = null;

  let stopPromise:
    Promise<ProofJobRecord> | null = null;

  const forwardAbort = (): void => {
    if (
      !operationController.signal.aborted
    ) {
      operationController.abort();
    }

    if (
      !timerController.signal.aborted
    ) {
      timerController.abort();
    }
  };

  if (input.signal?.aborted) {
    forwardAbort();
  } else {
    input.signal?.addEventListener(
      "abort",
      forwardAbort,
      {
        once:
          true,
      },
    );
  }

  const heartbeatPromise =
    (async (): Promise<void> => {
      while (
        !timerController.signal.aborted
      ) {
        const elapsed =
          await waitForHeartbeat(
            heartbeatIntervalMs,
            timerController.signal,
          );

        if (!elapsed) {
          return;
        }

        try {
          currentJob =
            await renewOwnedProofJobLease(
              dependencies.jobs,
              currentJob,
              {
                leaseOwnerHash:
                  input.leaseOwnerHash,

                leaseDurationMs:
                  input.leaseDurationMs,

                nowMs:
                  requireWorkerTimestamp(
                    dependencies.now?.()
                      ?? Date.now(),
                  ),
              },
            );
        } catch (error) {
          heartbeatFailure =
            error;

          if (
            !operationController
              .signal.aborted
          ) {
            operationController.abort();
          }

          if (
            !timerController
              .signal.aborted
          ) {
            timerController.abort();
          }

          return;
        }
      }
    })();

  return Object.freeze({
    signal:
      operationController.signal,

    current():
      ProofJobRecord {
      return currentJob;
    },

    stop():
      Promise<ProofJobRecord> {
      if (stopPromise === null) {
        stopPromise =
          (async (): Promise<
            ProofJobRecord
          > => {
            if (
              !timerController
                .signal.aborted
            ) {
              timerController.abort();
            }

            await heartbeatPromise;

            input.signal
              ?.removeEventListener(
                "abort",
                forwardAbort,
              );

            if (
              heartbeatFailure !== null
            ) {
              throw heartbeatFailure;
            }

            return currentJob;
          })();
      }

      return stopPromise;
    },
  });
}

function resolveHeartbeatIntervalMs(
  input: ProofLeaseHeartbeatInput,
): number {
  if (
    !Number.isSafeInteger(
      input.leaseDurationMs,
    )
    || input.leaseDurationMs < 1_000
    || input.leaseDurationMs
      > 30 * 60_000
  ) {
    throw workerError(
      "PROOF_WORKER_LEASE_DURATION_INVALID",
      "The proof worker lease duration is invalid.",
    );
  }

  const intervalMs =
    input.heartbeatIntervalMs
      ?? Math.max(
        100,
        Math.floor(
          input.leaseDurationMs / 3,
        ),
      );

  if (
    !Number.isSafeInteger(intervalMs)
    || intervalMs < 1
    || intervalMs
      >= input.leaseDurationMs
  ) {
    throw workerError(
      "PROOF_WORKER_HEARTBEAT_INTERVAL_INVALID",
      "The proof worker heartbeat interval is invalid.",
    );
  }

  return intervalMs;
}

function waitForHeartbeat(
  intervalMs: number,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>(
    (resolve) => {
      let timer:
        ReturnType<typeof setTimeout>;

      let settled =
        false;

      const finish = (
        elapsed: boolean,
      ): void => {
        if (settled) {
          return;
        }

        settled =
          true;

        clearTimeout(timer);

        signal.removeEventListener(
          "abort",
          onAbort,
        );

        resolve(elapsed);
      };

      const onAbort = (): void => {
        finish(false);
      };

      timer =
        setTimeout(
          () => {
            finish(true);
          },
          intervalMs,
        );

      signal.addEventListener(
        "abort",
        onAbort,
        {
          once:
            true,
        },
      );
    },
  );
}

function assertOwnedRunningJob(
  job: ProofJobRecord,
  leaseOwnerHash: string,
): void {
  if (
    job.state !== "running"
    || job.leaseOwnerHash
      !== leaseOwnerHash
    || job.leaseExpiresAtMs === null
  ) {
    throw workerError(
      "PROOF_WORKER_LEASE_INVALID",
      "The proof worker does not own the claimed job lease.",
    );
  }
}


export async function executeClaimedProofJob(
  dependencies: ProofWorkerDependencies,
  heartbeat: ProofJobLeaseHeartbeat,
  input: RunProofWorkerInput,
): Promise<ProofWorkerResult> {
  const initialJob =
    heartbeat.current();

  assertOwnedRunningJob(
    initialJob,
    input.leaseOwnerHash,
  );

  const request =
    await loadProofWorkItem(
      dependencies,
      initialJob,
      requireWorkerTimestamp(
        dependencies.now?.()
          ?? Date.now(),
      ),
    );

  const result =
    await dependencies.prover.prove(
      request,
      heartbeat.signal,
    );

  /*
   * Stop and await heartbeat activity before creating the terminal
   * transition. This provides the latest durable job revision.
   */
  const activeJob =
    await heartbeat.stop();

  const completedAtMs =
    requireWorkerTimestamp(
      dependencies.now?.()
        ?? Date.now(),
    );

  /*
   * Proof bytes are stored outside the job table. The job receives only
   * the opaque result reference returned by the durable result writer.
   */
  const persistedResult =
    await dependencies.results.persist({
      job:
        activeJob,

      result,

      nowMs:
        completedAtMs,
    });

  const completed =
    completeProofJobSuccess(
      activeJob,
      {
        leaseOwnerHash:
          input.leaseOwnerHash,

        resultReference:
          persistedResult
            .resultReference,

        nowMs:
          completedAtMs,
      },
    );

  const stored =
    await persistProofJobTransition(
      dependencies.jobs,
      activeJob,
      completed,
    );

  return Object.freeze({
    schemaVersion:
      "veil-proof-worker-result-v1",

    outcome:
      "succeeded",

    jobId:
      stored.jobId,

    state:
      stored.state,

    attempts:
      stored.attempts,
  });
}

function requireWorkerTimestamp(
  value: number,
): number {
  if (
    !Number.isSafeInteger(value)
    || value < 0
  ) {
    throw workerError(
      "PROOF_WORKER_TIME_INVALID",
      "The proof worker timestamp is invalid.",
    );
  }

  return value;
}


export async function runProofWorkerOnce(
  dependencies: ProofWorkerDependencies,
  input: RunProofWorkerInput,
): Promise<ProofWorkerResult> {
  const nowMs =
    requireWorkerTimestamp(
      dependencies.now?.()
        ?? Date.now(),
    );

  await recoverExpiredProofJobs(
    dependencies.jobs,
    {
      nowMs,

      limit:
        input.recoveryBatchSize,
    },
  );

  const claimed =
    await claimNextProofJob(
      dependencies.jobs,
      {
        leaseOwnerHash:
          input.leaseOwnerHash,

        leaseDurationMs:
          input.leaseDurationMs,

        maxRunningJobs:
          input.maxRunningJobs,

        nowMs,
      },
    );

  if (claimed === null) {
    return Object.freeze({
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
    });
  }

  const heartbeat =
    startProofJobLeaseHeartbeat(
      dependencies,
      claimed,
      input,
    );

  try {
    return await executeClaimedProofJob(
      dependencies,
      heartbeat,
      input,
    );
  } catch (error) {
    let failureSource:
      unknown = error;

    let activeJob =
      heartbeat.current();

    try {
      activeJob =
        await heartbeat.stop();
    } catch (heartbeatError) {
      failureSource =
        heartbeatError;

      activeJob =
        heartbeat.current();
    }

    const failure =
      normalizeWorkerFailure(
        failureSource,
      );

    const failedAtMs =
      requireWorkerTimestamp(
        dependencies.now?.()
          ?? Date.now(),
      );

    const next =
      completeProofJobFailure(
        activeJob,
        {
          leaseOwnerHash:
            input.leaseOwnerHash,

          errorCode:
            failure.code,

          retryable:
            failure.retryable,

          retryDelayMs:
            retryDelayMs(
              activeJob.attempts,
            ),

          nowMs:
            failedAtMs,
        },
      );

    const stored =
      await persistProofJobTransition(
        dependencies.jobs,
        activeJob,
        next,
      );

    return Object.freeze({
      schemaVersion:
        "veil-proof-worker-result-v1",

      outcome:
        stored.state === "queued"
          ? "requeued"
          : stored.state === "cancelled"
            ? "cancelled"
            : "failed",

      jobId:
        stored.jobId,

      state:
        stored.state,

      attempts:
        stored.attempts,
    });
  }
}


function normalizeWorkerFailure(
  error: unknown,
): {
  readonly code: string;
  readonly retryable: boolean;
} {
  if (
    typeof error === "object"
    && error !== null
  ) {
    const candidate =
      error as Record<
        string,
        unknown
      >;

    if (
      typeof candidate.code
        === "string"
      && /^[A-Z][A-Z0-9_]{2,63}$/u
        .test(candidate.code)
      && typeof candidate.retryable
        === "boolean"
    ) {
      return Object.freeze({
        code:
          candidate.code,

        retryable:
          candidate.retryable,
      });
    }
  }

  if (
    error instanceof
      ProofWorkerError
  ) {
    return Object.freeze({
      code:
        error.code,

      retryable:
        false,
    });
  }

  return Object.freeze({
    code:
      "PROOF_WORKER_UNEXPECTED",

    retryable:
      false,
  });
}

function retryDelayMs(
  attempts: number,
): number {
  const exponent =
    Math.max(
      0,
      Math.min(
        attempts - 1,
        6,
      ),
    );

  return Math.min(
    1_000 * (2 ** exponent),
    60_000,
  );
}
