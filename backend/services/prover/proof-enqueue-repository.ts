import type {
  ProofJobRecord,
} from "./proof-job.js";

import type {
  EncryptedProofPayload,
} from "./proof-payload.js";

import {
  assertProofJobAccessRecord,
  type ProofJobAccessRecord,
} from "../security/proof-job-access.js";

export interface ProofEnqueueInput {
  readonly job: ProofJobRecord;
  readonly payload: EncryptedProofPayload;
  readonly access?: ProofJobAccessRecord;
}

export interface ProofEnqueueResult {
  readonly created: boolean;
  readonly job: ProofJobRecord;
  readonly payload: EncryptedProofPayload;
  readonly access?: ProofJobAccessRecord;
}

export interface ProofEnqueueRepository {
  createOrGet(
    input: ProofEnqueueInput,
  ): Promise<ProofEnqueueResult>;
}

export class ProofEnqueueRepositoryError
extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "ProofEnqueueRepositoryError";

    this.code =
      code;
  }
}

export async function createOrGetProofEnqueue(
  repository: ProofEnqueueRepository,
  input: ProofEnqueueInput,
): Promise<ProofEnqueueResult> {
  assertBinding(input);

  const result =
    await repository.createOrGet(input);

  assertBinding(result);
  assertAccessResult(
    input,
    result,
  );

  if (result.created) {
    assertCreatedSnapshot(
      input,
      result,
    );
  } else {
    /*
     * AES-GCM uses a fresh nonce for every encryption. An idempotent
     * retry therefore returns the originally stored encrypted payload
     * rather than requiring the new ciphertext bytes to match.
     */
    assertIdempotentIntent(
      input.job,
      result.job,
    );
  }

  return Object.freeze({
    created:
      result.created,

    job:
      result.job,

    payload:
      result.payload,

    ...(result.access === undefined
      ? {}
      : {
          access:
            result.access,
        }),
  });
}

export function assertProofEnqueueBinding(
  input: ProofEnqueueInput,
): void {
  assertBinding(input);
}

function assertBinding(
  input: ProofEnqueueInput,
): void {
  if (
    input.job.payloadReference
      !== input.payload.payloadReference
    || input.job.requestFingerprint
      !== input.payload.requestFingerprint
    || input.job.createdAtMs
      !== input.payload.createdAtMs
    || !/^payload_[A-Za-z0-9_-]{16,128}$/u
      .test(input.payload.payloadReference)
  ) {
    throw enqueueError(
      "PROOF_ENQUEUE_BINDING_INVALID",
      "The proof job and encrypted payload are not bound to the same request.",
    );
  }

  if (input.access !== undefined) {
    assertProofJobAccessRecord(
      input.access,
    );

    if (
      input.access.jobId
        !== input.job.jobId
    ) {
      throw enqueueError(
        "PROOF_ENQUEUE_ACCESS_BINDING_INVALID",
        "The proof access record is not bound to the same job.",
      );
    }
  }
}

function assertAccessResult(
  expected: ProofEnqueueInput,
  actual: ProofEnqueueResult,
): void {
  if (expected.access === undefined) {
    if (actual.access !== undefined) {
      throw enqueueError(
        "PROOF_ENQUEUE_ACCESS_UNEXPECTED",
        "The repository returned unexpected proof access metadata.",
      );
    }

    return;
  }

  if (actual.access === undefined) {
    throw enqueueError(
      "PROOF_ENQUEUE_ACCESS_MISSING",
      "The repository did not persist the required proof access binding.",
    );
  }

  const matches =
    actual.created
      ? sameAccessSnapshot(
          expected.access,
          actual.access,
        )
      : sameAccessBinding(
          expected.access,
          actual.access,
        );

  if (!matches) {
    throw enqueueError(
      "PROOF_ENQUEUE_ACCESS_MISMATCH",
      "The repository returned a different proof access binding.",
    );
  }
}

function assertCreatedSnapshot(
  expected: ProofEnqueueInput,
  actual: ProofEnqueueResult,
): void {
  if (
    JSON.stringify(expected.job)
      !== JSON.stringify(actual.job)
    || !samePayload(
      expected.payload,
      actual.payload,
    )
  ) {
    throw enqueueError(
      "PROOF_ENQUEUE_CREATE_MISMATCH",
      "The repository returned a different newly created proof request.",
    );
  }
}

function assertIdempotentIntent(
  requested: ProofJobRecord,
  existing: ProofJobRecord,
): void {
  if (
    requested.idempotencyKeyHash
      !== existing.idempotencyKeyHash
    || requested.requestFingerprint
      !== existing.requestFingerprint
    || requested.payloadReference
      !== existing.payloadReference
    || requested.maxAttempts
      !== existing.maxAttempts
  ) {
    throw enqueueError(
      "PROOF_ENQUEUE_IDEMPOTENCY_CONFLICT",
      "The idempotency key is already bound to another proof request.",
    );
  }
}

function sameAccessSnapshot(
  expected: ProofJobAccessRecord,
  actual: ProofJobAccessRecord,
): boolean {
  return (
    sameAccessBinding(
      expected,
      actual,
    )
    && expected.createdAtMs
      === actual.createdAtMs
  );
}

function sameAccessBinding(
  expected: ProofJobAccessRecord,
  actual: ProofJobAccessRecord,
): boolean {
  return (
    expected.schemaVersion
      === actual.schemaVersion
    && expected.jobId
      === actual.jobId
    && expected.subjectHash
      === actual.subjectHash
  );
}

function samePayload(
  expected: EncryptedProofPayload,
  actual: EncryptedProofPayload,
): boolean {
  return (
    expected.schemaVersion
      === actual.schemaVersion
    && expected.payloadReference
      === actual.payloadReference
    && expected.requestFingerprint
      === actual.requestFingerprint
    && expected.keyVersion
      === actual.keyVersion
    && expected.ciphertextSha256
      === actual.ciphertextSha256
    && expected.createdAtMs
      === actual.createdAtMs
    && expected.expiresAtMs
      === actual.expiresAtMs
    && expected.nonce.equals(
      actual.nonce,
    )
    && expected.authenticationTag.equals(
      actual.authenticationTag,
    )
    && expected.ciphertext.equals(
      actual.ciphertext,
    )
  );
}

function enqueueError(
  code: string,
  message: string,
): ProofEnqueueRepositoryError {
  return new ProofEnqueueRepositoryError(
    code,
    message,
  );
}
