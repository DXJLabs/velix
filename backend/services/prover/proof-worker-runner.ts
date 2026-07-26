import type {
  ProofWorkerDependencies,
  ProofWorkerResult,
  RunProofWorkerInput,
} from "./proof-worker.js";

import {
  runProofWorkerOnce,
} from "./proof-worker.js";

export interface ProofWorkerLoopInput
extends RunProofWorkerInput {
  readonly idleDelayMs: number;
  readonly errorDelayMs: number;
  readonly maximumIterations?: number;
}

export interface ProofWorkerLoopEvent {
  readonly type:
    | "iteration"
    | "error"
    | "stopped";

  readonly outcome?:
    ProofWorkerResult["outcome"];

  readonly state?:
    ProofWorkerResult["state"];

  readonly attempts?:
    number | null;

  readonly code?:
    string;
}

export interface ProofWorkerLoopDependencies {
  readonly worker:
    ProofWorkerDependencies;

  readonly sleep?: (
    delayMs: number,
    signal?: AbortSignal,
  ) => Promise<void>;

  readonly onEvent?: (
    event: ProofWorkerLoopEvent,
  ) => void;
}

export interface ProofWorkerLoopSummary {
  readonly iterations: number;
  readonly completedJobs: number;
  readonly stopped: boolean;
}

export async function runProofWorkerLoop(
  dependencies:
    ProofWorkerLoopDependencies,
  input:
    ProofWorkerLoopInput,
): Promise<ProofWorkerLoopSummary> {
  const sleep =
    dependencies.sleep
      ?? abortableDelay;

  const maximumIterations =
    input.maximumIterations
      ?? Number.MAX_SAFE_INTEGER;

  if (
    !Number.isSafeInteger(
      maximumIterations,
    )
    || maximumIterations < 1
  ) {
    throw new TypeError(
      "maximumIterations must be a positive safe integer.",
    );
  }

  let iterations =
    0;

  let completedJobs =
    0;

  while (
    !input.signal?.aborted
    && iterations
      < maximumIterations
  ) {
    try {
      const result =
        await runProofWorkerOnce(
          dependencies.worker,
          input,
        );

      iterations +=
        1;

      if (
        result.outcome !== "idle"
      ) {
        completedJobs +=
          1;
      }

      dependencies.onEvent?.(
        Object.freeze({
          type:
            "iteration",

          outcome:
            result.outcome,

          state:
            result.state,

          attempts:
            result.attempts,
        }),
      );

      if (
        result.outcome === "idle"
        && !input.signal?.aborted
      ) {
        await sleep(
          input.idleDelayMs,
          input.signal,
        );
      }
    } catch (error) {
      iterations +=
        1;

      dependencies.onEvent?.(
        Object.freeze({
          type:
            "error",

          code:
            errorCode(error),
        }),
      );

      if (
        !input.signal?.aborted
      ) {
        await sleep(
          input.errorDelayMs,
          input.signal,
        );
      }
    }
  }

  const summary =
    Object.freeze({
      iterations,
      completedJobs,
      stopped:
        Boolean(
          input.signal?.aborted,
        ),
    });

  dependencies.onEvent?.(
    Object.freeze({
      type:
        "stopped",
    }),
  );

  return summary;
}

function errorCode(
  error: unknown,
): string {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code
      === "string"
    && /^[A-Z][A-Z0-9_]{2,63}$/u
      .test(error.code)
  ) {
    return error.code;
  }

  return "PROOF_WORKER_LOOP_UNEXPECTED";
}

function abortableDelay(
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (
    !Number.isSafeInteger(delayMs)
    || delayMs < 0
    || delayMs > 60_000
  ) {
    return Promise.reject(
      new TypeError(
        "Worker delay is outside the allowed range.",
      ),
    );
  }

  if (
    signal?.aborted
    || delayMs === 0
  ) {
    return Promise.resolve();
  }

  return new Promise<void>(
    (resolve) => {
      const timer =
        setTimeout(
          finish,
          delayMs,
        );

      function finish() {
        clearTimeout(timer);

        signal?.removeEventListener(
          "abort",
          finish,
        );

        resolve();
      }

      signal?.addEventListener(
        "abort",
        finish,
        {
          once:
            true,
        },
      );
    },
  );
}
