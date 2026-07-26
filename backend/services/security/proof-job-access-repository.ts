import {
  assertProofJobAccessRecord,
  type ProofJobAccessRecord,
} from "./proof-job-access.js";

export interface ProofJobAccessCreateResult {
  readonly created: boolean;
  readonly access: ProofJobAccessRecord;
}

export interface ProofJobAccessRepository {
  createOrGet(
    access: ProofJobAccessRecord,
  ): Promise<ProofJobAccessCreateResult>;

  getByJobId(
    jobId: string,
  ): Promise<ProofJobAccessRecord | null>;
}

export class ProofJobAccessRepositoryError
extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "ProofJobAccessRepositoryError";

    this.code =
      code;
  }
}

export async function createOrGetProofJobAccess(
  repository: ProofJobAccessRepository,
  requested: ProofJobAccessRecord,
): Promise<ProofJobAccessCreateResult> {
  assertProofJobAccessRecord(
    requested,
  );

  const result =
    await repository.createOrGet(
      requested,
    );

  if (
    typeof result !== "object"
    || result === null
    || typeof result.created
      !== "boolean"
  ) {
    throw repositoryError(
      "PROOF_JOB_ACCESS_RESULT_INVALID",
      "The access repository returned an invalid result.",
    );
  }

  assertProofJobAccessRecord(
    result.access,
  );

  const matches =
    result.created
      ? sameSnapshot(
          requested,
          result.access,
        )
      : sameBinding(
          requested,
          result.access,
        );

  if (!matches) {
    throw repositoryError(
      result.created
        ? "PROOF_JOB_ACCESS_CREATE_MISMATCH"
        : "PROOF_JOB_ACCESS_SUBJECT_CONFLICT",

      result.created
        ? "The repository returned a different newly created access record."
        : "The proof job is already bound to another authenticated subject.",
    );
  }

  return Object.freeze({
    created:
      result.created,

    access:
      result.access,
  });
}

export function proofJobAccessRepositoryError(
  code: string,
  message: string,
): ProofJobAccessRepositoryError {
  return repositoryError(
    code,
    message,
  );
}

function sameSnapshot(
  left: ProofJobAccessRecord,
  right: ProofJobAccessRecord,
): boolean {
  return (
    sameBinding(
      left,
      right,
    )
    && left.createdAtMs
      === right.createdAtMs
  );
}

function sameBinding(
  left: ProofJobAccessRecord,
  right: ProofJobAccessRecord,
): boolean {
  return (
    left.schemaVersion
      === right.schemaVersion
    && left.jobId
      === right.jobId
    && left.subjectHash
      === right.subjectHash
  );
}

function repositoryError(
  code: string,
  message: string,
): ProofJobAccessRepositoryError {
  return new ProofJobAccessRepositoryError(
    code,
    message,
  );
}
