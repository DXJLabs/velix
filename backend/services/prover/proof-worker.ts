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
    ProofJobRepository;

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

export interface RunProofWorkerInput {
  readonly leaseOwnerHash: string;
  readonly leaseDurationMs: number;
  readonly signal?: AbortSignal;
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


export async function executeClaimedProofJob(
  dependencies: ProofWorkerDependencies,
  job: ProofJobRecord,
  input: RunProofWorkerInput,
): Promise<ProofWorkerResult> {
  if (
    job.state !== "running"
    || job.leaseOwnerHash
      !== input.leaseOwnerHash
  ) {
    throw workerError(
      "PROOF_WORKER_LEASE_INVALID",
      "The proof worker does not own the claimed job lease.",
    );
  }

  const request =
    await loadProofWorkItem(
      dependencies,
      job,
      requireWorkerTimestamp(
        dependencies.now?.()
          ?? Date.now(),
      ),
    );

  const result =
    await dependencies.prover.prove(
      request,
      input.signal,
    );

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
      job,
      result,
      nowMs:
        completedAtMs,
    });

  const completed =
    completeProofJobSuccess(
      job,
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
      job,
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
  const claimed =
    await claimNextProofJob(
      dependencies.jobs,
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

  try {
    return await executeClaimedProofJob(
      dependencies,
      claimed,
      input,
    );
  } catch (error) {
    const failure =
      normalizeWorkerFailure(error);

    const failedAtMs =
      requireWorkerTimestamp(
        dependencies.now?.()
          ?? Date.now(),
      );

    const next =
      completeProofJobFailure(
        claimed,
        {
          leaseOwnerHash:
            input.leaseOwnerHash,

          errorCode:
            failure.code,

          retryable:
            failure.retryable,

          retryDelayMs:
            retryDelayMs(
              claimed.attempts,
            ),

          nowMs:
            failedAtMs,
        },
      );

    const stored =
      await persistProofJobTransition(
        dependencies.jobs,
        claimed,
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
