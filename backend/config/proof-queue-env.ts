export interface ProofQueuePolicy {
  readonly maxQueuedJobs: number;
  readonly maxRunningJobs: number;
  readonly recoveryBatchSize: number;
}

export class ProofQueueEnvironmentError
  extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "ProofQueueEnvironmentError";

    this.code =
      code;
  }
}

export function loadProofQueuePolicy(
  env: NodeJS.ProcessEnv = process.env,
): ProofQueuePolicy {
  return Object.freeze({
    maxQueuedJobs:
      requireBoundedInteger(
        env,
        "VEIL_PROOF_QUEUE_MAX_QUEUED_JOBS",
        1,
        10_000,
      ),

    maxRunningJobs:
      requireBoundedInteger(
        env,
        "VEIL_PROOF_QUEUE_MAX_RUNNING_JOBS",
        1,
        32,
      ),

    recoveryBatchSize:
      requireBoundedInteger(
        env,
        "VEIL_PROOF_QUEUE_RECOVERY_BATCH_SIZE",
        1,
        1_000,
      ),
  });
}

function requireBoundedInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const raw =
    env[name]?.trim();

  if (!raw) {
    throw environmentError(
      "PROOF_QUEUE_ENV_MISSING",
      `${name} must be configured.`,
    );
  }

  if (
    raw.includes("${{")
    || !/^[0-9]+$/u.test(raw)
  ) {
    throw environmentError(
      "PROOF_QUEUE_ENV_INVALID",
      `${name} must be a resolved integer.`,
    );
  }

  const value =
    Number(raw);

  if (
    !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw environmentError(
      "PROOF_QUEUE_ENV_OUT_OF_RANGE",
      `${name} must be between ${minimum} and ${maximum}.`,
    );
  }

  return value;
}

function environmentError(
  code: string,
  message: string,
): ProofQueueEnvironmentError {
  return new ProofQueueEnvironmentError(
    code,
    message,
  );
}
