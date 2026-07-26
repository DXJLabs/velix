import type {
  TransactionProofResult,
} from "#veil-sdk/transaction-prover";

import type {
  ProofPayloadKeyring,
} from "../../config/proof-payload-env.js";

import {
  getAuthorizedProofJobStatus,
  type AuthorizedProofJobStatusInput,
  type ProofJobStatusDependencies,
} from "./proof-job-status.js";

import {
  decryptProofResult,
} from "./proof-result.js";

import type {
  ProofResultRepository,
} from "./proof-result-repository.js";

export interface ProofResultAccessDependencies
extends ProofJobStatusDependencies {
  readonly results:
    Pick<
      ProofResultRepository,
      "getByReference"
    >;

  readonly keyring:
    ProofPayloadKeyring;

  readonly now?: () => number;
}

export class ProofResultAccessError
extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "ProofResultAccessError";

    this.code =
      code;
  }
}

export async function readAuthorizedProofResult(
  dependencies:
    ProofResultAccessDependencies,
  input:
    AuthorizedProofJobStatusInput,
): Promise<TransactionProofResult> {
  const status =
    await getAuthorizedProofJobStatus(
      dependencies,
      input,
    );

  if (
    status.state === "queued"
    || status.state === "running"
  ) {
    throw accessError(
      "PROOF_RESULT_NOT_READY",
      "The durable proof job has not completed.",
    );
  }

  if (
    status.state !== "succeeded"
    || status.resultReference === null
  ) {
    throw accessError(
      "PROOF_RESULT_UNAVAILABLE",
      "The durable proof job completed without an available proof result.",
    );
  }

  const encrypted =
    await dependencies.results
      .getByReference(
        status.resultReference,
      );

  if (
    encrypted === null
    || encrypted.jobId
      !== status.jobId
    || encrypted.resultReference
      !== status.resultReference
  ) {
    throw accessError(
      "PROOF_RESULT_STORAGE_INCONSISTENT",
      "The durable proof result is missing or not bound to its job.",
    );
  }

  const key =
    dependencies.keyring
      .resolveKey(
        encrypted.keyVersion,
      );

  try {
    return decryptProofResult(
      encrypted,
      key,
      requireTimestamp(
        dependencies.now?.()
          ?? Date.now(),
      ),
    );
  } finally {
    key.fill(0);
  }
}

function requireTimestamp(
  value: number,
): number {
  if (
    !Number.isSafeInteger(value)
    || value < 0
  ) {
    throw accessError(
      "PROOF_RESULT_TIME_INVALID",
      "The proof result access timestamp is invalid.",
    );
  }

  return value;
}

function accessError(
  code: string,
  message: string,
): ProofResultAccessError {
  return new ProofResultAccessError(
    code,
    message,
  );
}
