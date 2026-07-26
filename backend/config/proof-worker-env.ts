import {
  createHmac,
} from "node:crypto";

import {
  loadProofQueuePolicy,
} from "./proof-queue-env.js";

export interface ProofWorkerRuntimePolicy {
  readonly leaseOwnerHash: string;
  readonly leaseDurationMs: number;
  readonly heartbeatIntervalMs: number;
  readonly idleDelayMs: number;
  readonly errorDelayMs: number;
  readonly maxRunningJobs: number;
  readonly recoveryBatchSize: number;
}

export class ProofWorkerEnvironmentError
extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "ProofWorkerEnvironmentError";

    this.code =
      code;
  }
}

export function loadProofWorkerRuntimePolicy(
  env: NodeJS.ProcessEnv = process.env,
): ProofWorkerRuntimePolicy {
  const queue =
    loadProofQueuePolicy(env);

  const workerName =
    requireString(
      env,
      "VEIL_PROOF_WORKER_NAME",
      /^[A-Za-z0-9._:-]{1,96}$/u,
    );

  const rawSecret =
    requireString(
      env,
      "VEIL_PROOF_WORKER_SECRET",
      /^.{32,4096}$/su,
    );

  const secret =
    Buffer.from(
      rawSecret,
      "utf8",
    );

  const leaseOwnerHash = (() => {
    try {
      return createHmac(
        "sha256",
        secret,
      )
        .update(
          "veil-proof-worker-owner-v1",
          "utf8",
        )
        .update("\0", "utf8")
        .update(
          workerName,
          "utf8",
        )
        .digest("hex");
    } finally {
      secret.fill(0);
    }
  })();

  const leaseDurationMs =
    requireInteger(
      env,
      "VEIL_PROOF_WORKER_LEASE_MS",
      1_000,
      30 * 60_000,
    );

  const heartbeatIntervalMs =
    requireInteger(
      env,
      "VEIL_PROOF_WORKER_HEARTBEAT_MS",
      100,
      leaseDurationMs - 1,
    );

  return Object.freeze({
    leaseOwnerHash,
    leaseDurationMs,
    heartbeatIntervalMs,

    idleDelayMs:
      requireInteger(
        env,
        "VEIL_PROOF_WORKER_IDLE_MS",
        50,
        60_000,
      ),

    errorDelayMs:
      requireInteger(
        env,
        "VEIL_PROOF_WORKER_ERROR_MS",
        100,
        60_000,
      ),

    maxRunningJobs:
      queue.maxRunningJobs,

    recoveryBatchSize:
      queue.recoveryBatchSize,
  });
}

function requireString(
  env: NodeJS.ProcessEnv,
  name: string,
  pattern: RegExp,
): string {
  const value =
    env[name]?.trim();

  if (
    !value
    || value.includes("${{")
    || !pattern.test(value)
  ) {
    throw environmentError(
      "PROOF_WORKER_ENV_INVALID",
      `${name} is missing or invalid.`,
    );
  }

  return value;
}

function requireInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const raw =
    env[name]?.trim();

  if (
    !raw
    || raw.includes("${{")
    || !/^[0-9]+$/u.test(raw)
  ) {
    throw environmentError(
      "PROOF_WORKER_ENV_INVALID",
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
      "PROOF_WORKER_ENV_OUT_OF_RANGE",
      `${name} must be between ${minimum} and ${maximum}.`,
    );
  }

  return value;
}

function environmentError(
  code: string,
  message: string,
): ProofWorkerEnvironmentError {
  return new ProofWorkerEnvironmentError(
    code,
    message,
  );
}
