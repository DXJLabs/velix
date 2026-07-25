import type {
  EncryptedProofPayload,
} from "./proof-payload.js";

export interface ProofPayloadCreateResult {
  readonly created: boolean;
  readonly payload: EncryptedProofPayload;
}

export interface ProofPayloadRepository {
  createOrGet(
    payload: EncryptedProofPayload,
  ): Promise<ProofPayloadCreateResult>;

  getByReference(
    payloadReference: string,
  ): Promise<EncryptedProofPayload | null>;

  deleteByReference(
    payloadReference: string,
  ): Promise<boolean>;

  deleteExpired(
    nowMs: number,
    limit: number,
  ): Promise<number>;
}

export class ProofPayloadRepositoryError
  extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "ProofPayloadRepositoryError";

    this.code = code;
  }
}

export function proofPayloadRepositoryError(
  code: string,
  message: string,
): ProofPayloadRepositoryError {
  return new ProofPayloadRepositoryError(
    code,
    message,
  );
}
