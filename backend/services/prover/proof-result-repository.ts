import {
  validateEncryptedProofResultRecord,
  type EncryptedProofResult,
} from "./proof-result.js";

export interface ProofResultRepository {
  create(
    result: EncryptedProofResult,
  ): Promise<EncryptedProofResult>;

  getByReference(
    resultReference: string,
  ): Promise<EncryptedProofResult | null>;

  getByJobId(
    jobId: string,
  ): Promise<EncryptedProofResult | null>;

  deleteExpired(
    nowMs: number,
    limit: number,
  ): Promise<number>;
}

export class ProofResultRepositoryError
extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "ProofResultRepositoryError";

    this.code =
      code;
  }
}

export async function createProofResult(
  repository: ProofResultRepository,
  requested: EncryptedProofResult,
): Promise<EncryptedProofResult> {
  const normalized =
    validateEncryptedProofResultRecord(
      requested,
    );

  const stored =
    await repository.create(
      normalized,
    );

  const validated =
    validateEncryptedProofResultRecord(
      stored,
    );

  if (
    !sameEncryptedProofResult(
      normalized,
      validated,
    )
  ) {
    throw proofResultRepositoryError(
      "PROOF_RESULT_CREATE_MISMATCH",
      "The repository returned a different encrypted proof result.",
    );
  }

  return validated;
}

export function sameEncryptedProofResult(
  left: EncryptedProofResult,
  right: EncryptedProofResult,
): boolean {
  return (
    left.schemaVersion
      === right.schemaVersion
    && left.resultReference
      === right.resultReference
    && left.jobId
      === right.jobId
    && left.requestFingerprint
      === right.requestFingerprint
    && left.keyVersion
      === right.keyVersion
    && left.ciphertextSha256
      === right.ciphertextSha256
    && left.proofSizeBytes
      === right.proofSizeBytes
    && left.createdAtMs
      === right.createdAtMs
    && left.expiresAtMs
      === right.expiresAtMs
    && left.nonce.equals(
      right.nonce,
    )
    && left.authenticationTag.equals(
      right.authenticationTag,
    )
    && left.ciphertext.equals(
      right.ciphertext,
    )
  );
}

export function proofResultRepositoryError(
  code: string,
  message: string,
): ProofResultRepositoryError {
  return new ProofResultRepositoryError(
    code,
    message,
  );
}
