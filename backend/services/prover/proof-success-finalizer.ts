import type {
  ProofJobRecord,
} from "./proof-job.js";

import {
  validateEncryptedProofResultRecord,
  type EncryptedProofResult,
} from "./proof-result.js";

import {
  sameEncryptedProofResult,
} from "./proof-result-repository.js";

export interface ProofSuccessFinalizeInput {
  readonly currentJob:
    ProofJobRecord;

  readonly completedJob:
    ProofJobRecord;

  readonly result:
    EncryptedProofResult;
}

export interface ProofSuccessFinalizeResult {
  readonly job:
    ProofJobRecord;

  readonly result:
    EncryptedProofResult;
}

export interface ProofSuccessFinalizer {
  finalize(
    input: ProofSuccessFinalizeInput,
  ): Promise<ProofSuccessFinalizeResult>;
}

export class ProofSuccessFinalizerError
extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "ProofSuccessFinalizerError";

    this.code =
      code;
  }
}

export async function finalizeProofSuccess(
  finalizer: ProofSuccessFinalizer,
  input: ProofSuccessFinalizeInput,
): Promise<ProofSuccessFinalizeResult> {
  assertProofSuccessFinalizeInput(
    input,
  );

  const stored =
    await finalizer.finalize(
      input,
    );

  if (
    JSON.stringify(
      stored.job,
    )
    !== JSON.stringify(
      input.completedJob,
    )
    || !sameEncryptedProofResult(
      stored.result,
      input.result,
    )
  ) {
    throw finalizerError(
      "PROOF_SUCCESS_FINALIZE_MISMATCH",
      "The atomic finalizer returned a different proof completion snapshot.",
    );
  }

  return Object.freeze({
    job:
      stored.job,

    result:
      stored.result,
  });
}

export function assertProofSuccessFinalizeInput(
  input: ProofSuccessFinalizeInput,
): void {
  const current =
    input.currentJob;

  const completed =
    input.completedJob;

  const result =
    validateEncryptedProofResultRecord(
      input.result,
    );

  if (
    current.state !== "running"
    || current.leaseOwnerHash === null
    || current.leaseExpiresAtMs === null
  ) {
    throw finalizerError(
      "PROOF_SUCCESS_CURRENT_JOB_INVALID",
      "The proof completion does not own an active running job.",
    );
  }

  if (
    completed.state !== "succeeded"
    || completed.revision
      !== current.revision + 1
    || completed.attempts
      !== current.attempts
    || completed.leaseOwnerHash !== null
    || completed.leaseExpiresAtMs !== null
    || completed.failure !== null
    || completed.completedAtMs === null
    || completed.resultReference
      !== result.resultReference
  ) {
    throw finalizerError(
      "PROOF_SUCCESS_COMPLETED_JOB_INVALID",
      "The proof completion snapshot is invalid.",
    );
  }

  if (
    current.schemaVersion
      !== completed.schemaVersion
    || current.jobId
      !== completed.jobId
    || current.requestFingerprint
      !== completed.requestFingerprint
    || current.idempotencyKeyHash
      !== completed.idempotencyKeyHash
    || current.payloadReference
      !== completed.payloadReference
    || current.maxAttempts
      !== completed.maxAttempts
    || current.createdAtMs
      !== completed.createdAtMs
    || result.jobId
      !== current.jobId
    || result.requestFingerprint
      !== current.requestFingerprint
    || result.createdAtMs
      !== completed.completedAtMs
  ) {
    throw finalizerError(
      "PROOF_SUCCESS_BINDING_INVALID",
      "The proof result, running job, and completion snapshot are not bound together.",
    );
  }
}

export function proofSuccessFinalizerError(
  code: string,
  message: string,
): ProofSuccessFinalizerError {
  return finalizerError(
    code,
    message,
  );
}

function finalizerError(
  code: string,
  message: string,
): ProofSuccessFinalizerError {
  return new ProofSuccessFinalizerError(
    code,
    message,
  );
}
