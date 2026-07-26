import {
  createHmac,
} from "node:crypto";

export type ProofIdentityProvider =
  "privy";

export interface ProofJobAccessRecord {
  readonly schemaVersion:
    "veil-proof-job-access-v1";

  readonly jobId:
    string;

  /*
   * This is scoped to one jobId. The same authenticated user receives
   * a different value for every proof job.
   */
  readonly subjectHash:
    string;

  readonly createdAtMs:
    number;
}

export interface CreateProofJobAccessInput {
  readonly jobId: string;
  readonly subjectHash: string;
  readonly createdAtMs: number;
}

export class ProofJobAccessError
extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "ProofJobAccessError";

    this.code =
      code;
  }
}

export function deriveProofJobSubjectHash(
  secretValue: Uint8Array,
  provider: ProofIdentityProvider,
  subjectValue: string,
  jobIdValue: string,
): string {
  const secret =
    requireSecret(secretValue);

  const subject =
    requireSubject(subjectValue);

  const jobId =
    requireJobId(jobIdValue);

  try {
    return createHmac(
      "sha256",
      secret,
    )
      .update(
        "veil-proof-job-access-subject-v1",
        "utf8",
      )
      .update("\0", "utf8")
      .update(provider, "utf8")
      .update("\0", "utf8")
      .update(jobId, "utf8")
      .update("\0", "utf8")
      .update(subject, "utf8")
      .digest("hex");
  } finally {
    secret.fill(0);
  }
}

export function createProofJobAccessRecord(
  input: CreateProofJobAccessInput,
): ProofJobAccessRecord {
  return Object.freeze({
    schemaVersion:
      "veil-proof-job-access-v1",

    jobId:
      requireJobId(
        input.jobId,
      ),

    subjectHash:
      requireSubjectHash(
        input.subjectHash,
      ),

    createdAtMs:
      requireTimestamp(
        input.createdAtMs,
      ),
  });
}

export function assertProofJobAccessRecord(
  value: ProofJobAccessRecord,
): void {
  if (
    typeof value !== "object"
    || value === null
    || value.schemaVersion
      !== "veil-proof-job-access-v1"
  ) {
    throw accessError(
      "PROOF_JOB_ACCESS_RECORD_INVALID",
      "The proof job access record is invalid.",
    );
  }

  requireJobId(value.jobId);
  requireSubjectHash(
    value.subjectHash,
  );
  requireTimestamp(
    value.createdAtMs,
  );

  if (
    Object.keys(value).length !== 4
  ) {
    throw accessError(
      "PROOF_JOB_ACCESS_RECORD_INVALID",
      "The proof job access record contains unsupported metadata.",
    );
  }
}

function requireSecret(
  value: Uint8Array,
): Buffer {
  if (
    !(value instanceof Uint8Array)
    || value.byteLength < 32
    || value.byteLength > 4_096
  ) {
    throw accessError(
      "PROOF_JOB_ACCESS_SECRET_INVALID",
      "The proof job access HMAC secret is invalid.",
    );
  }

  return Buffer.from(value);
}

function requireSubject(
  value: string,
): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 512
    || value !== value.trim()
    || /[\u0000-\u001f\u007f]/u
      .test(value)
  ) {
    throw accessError(
      "PROOF_JOB_ACCESS_SUBJECT_INVALID",
      "The authenticated identity subject is invalid.",
    );
  }

  return value;
}

function requireJobId(
  value: string,
): string {
  if (
    typeof value !== "string"
    || !/^job_[A-Za-z0-9_-]{16,128}$/u
      .test(value)
  ) {
    throw accessError(
      "PROOF_JOB_ACCESS_JOB_ID_INVALID",
      "The proof job access job identifier is invalid.",
    );
  }

  return value;
}

function requireSubjectHash(
  value: string,
): string {
  if (
    typeof value !== "string"
    || !/^[0-9a-f]{64}$/u
      .test(value)
  ) {
    throw accessError(
      "PROOF_JOB_ACCESS_SUBJECT_HASH_INVALID",
      "The proof job subject hash is invalid.",
    );
  }

  return value;
}

function requireTimestamp(
  value: number,
): number {
  if (
    !Number.isSafeInteger(value)
    || value < 0
  ) {
    throw accessError(
      "PROOF_JOB_ACCESS_TIME_INVALID",
      "The proof job access timestamp is invalid.",
    );
  }

  return value;
}

function accessError(
  code: string,
  message: string,
): ProofJobAccessError {
  return new ProofJobAccessError(
    code,
    message,
  );
}
