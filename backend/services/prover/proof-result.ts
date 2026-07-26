import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import type {
  ProverL2ToL1Message,
  TransactionProofResult,
} from "#veil-sdk/transaction-prover";

import type {
  ProofJobRecord,
} from "./proof-job.js";

export const PROOF_RESULT_SCHEMA_VERSION =
  "veil-proof-result-v1" as const;

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const MAX_RESULT_BYTES = 2 * 1024 * 1024;
const MAX_PROOF_BYTES = 1024 * 1024;
const RESULT_LIFETIME_MS =
  7 * 24 * 60 * 60_000;

const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

const CANONICAL_FELT =
  /^0x(?:0|[1-9a-f][0-9a-f]*)$/u;

export interface EncryptedProofResult {
  readonly schemaVersion:
    typeof PROOF_RESULT_SCHEMA_VERSION;

  readonly resultReference: string;
  readonly jobId: string;
  readonly requestFingerprint: string;
  readonly keyVersion: string;

  readonly nonce: Buffer;
  readonly authenticationTag: Buffer;
  readonly ciphertext: Buffer;
  readonly ciphertextSha256: string;

  readonly proofSizeBytes: number;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

export interface EncryptProofResultInput {
  readonly job:
    Pick<
      ProofJobRecord,
      "jobId" | "requestFingerprint"
    >;

  readonly result:
    TransactionProofResult;

  readonly keyVersion:
    string;

  readonly key:
    Uint8Array;

  readonly nowMs:
    number;
}

export class ProofResultError
extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "ProofResultError";

    this.code =
      code;
  }
}

export function createProofResultReference(
  jobId: string,
  requestFingerprint: string,
): string {
  requireJobId(jobId);
  requireFingerprint(
    requestFingerprint,
  );

  return `result_${createHash("sha256")
    .update(
      [
        "veil-proof-result-reference-v1",
        jobId,
        requestFingerprint,
      ].join("\n"),
      "utf8",
    )
    .digest("hex")}`;
}

export function encryptProofResult(
  input: EncryptProofResultInput,
): EncryptedProofResult {
  const normalizedResult =
    normalizeTransactionProofResult(
      input.result,
      input.job.requestFingerprint,
    );

  const metadata =
    validateMetadata({
      resultReference:
        createProofResultReference(
          input.job.jobId,
          input.job.requestFingerprint,
        ),

      jobId:
        input.job.jobId,

      requestFingerprint:
        input.job.requestFingerprint,

      keyVersion:
        input.keyVersion,

      createdAtMs:
        input.nowMs,

      expiresAtMs:
        input.nowMs
        + RESULT_LIFETIME_MS,

      proofSizeBytes:
        normalizedResult.proofSizeBytes,
    });

  const key =
    requireKey(input.key);

  const serialized =
    JSON.stringify(
      normalizedResult,
    );

  const plaintext =
    Buffer.from(
      serialized,
      "utf8",
    );

  if (
    plaintext.length < 1
    || plaintext.length > MAX_RESULT_BYTES
  ) {
    throw resultError(
      "PROOF_RESULT_SIZE_INVALID",
      "The serialized proof result exceeds the allowed size.",
    );
  }

  const nonce =
    randomBytes(
      NONCE_BYTES,
    );

  const cipher =
    createCipheriv(
      "aes-256-gcm",
      key,
      nonce,
    );

  cipher.setAAD(
    buildAdditionalData(
      metadata,
    ),
  );

  const ciphertext =
    Buffer.concat([
      cipher.update(
        plaintext,
      ),
      cipher.final(),
    ]);

  const authenticationTag =
    cipher.getAuthTag();

  return Object.freeze({
    schemaVersion:
      PROOF_RESULT_SCHEMA_VERSION,

    ...metadata,

    nonce,
    authenticationTag,
    ciphertext,

    ciphertextSha256:
      sha256Hex(
        ciphertext,
      ),
  });
}

export function decryptProofResult(
  record: EncryptedProofResult,
  keyValue: Uint8Array,
  nowMs: number,
): TransactionProofResult {
  const metadata =
    validateEncryptedProofResultRecord(
      record,
    );

  const key =
    requireKey(keyValue);

  requireTimestamp(
    nowMs,
    "nowMs",
  );

  if (
    nowMs >= metadata.expiresAtMs
  ) {
    throw resultError(
      "PROOF_RESULT_EXPIRED",
      "The encrypted proof result has expired.",
    );
  }

  if (
    sha256Hex(
      record.ciphertext,
    )
    !== record.ciphertextSha256
  ) {
    throw resultError(
      "PROOF_RESULT_INTEGRITY_FAILED",
      "The encrypted proof result failed integrity validation.",
    );
  }

  try {
    const decipher =
      createDecipheriv(
        "aes-256-gcm",
        key,
        record.nonce,
      );

    decipher.setAAD(
      buildAdditionalData(
        metadata,
      ),
    );

    decipher.setAuthTag(
      record.authenticationTag,
    );

    const plaintext =
      Buffer.concat([
        decipher.update(
          record.ciphertext,
        ),
        decipher.final(),
      ]);

    const parsed =
      JSON.parse(
        plaintext.toString(
          "utf8",
        ),
      ) as unknown;

    return normalizeTransactionProofResult(
      parsed,
      metadata.requestFingerprint,
    );
  } catch (error) {
    if (
      error instanceof
        ProofResultError
    ) {
      throw error;
    }

    throw resultError(
      "PROOF_RESULT_DECRYPTION_FAILED",
      "The encrypted proof result could not be authenticated.",
    );
  }
}

export function validateEncryptedProofResultRecord(
  record: EncryptedProofResult,
): EncryptedProofResult {
  if (
    typeof record !== "object"
    || record === null
    || record.schemaVersion
      !== PROOF_RESULT_SCHEMA_VERSION
  ) {
    throw resultError(
      "PROOF_RESULT_RECORD_INVALID",
      "The encrypted proof result record is invalid.",
    );
  }

  const metadata =
    validateMetadata(
      record,
    );

  requireBuffer(
    record.nonce,
    NONCE_BYTES,
    "nonce",
  );

  requireBuffer(
    record.authenticationTag,
    TAG_BYTES,
    "authenticationTag",
  );

  if (
    !Buffer.isBuffer(
      record.ciphertext,
    )
    || record.ciphertext.length < 1
    || record.ciphertext.length
      > MAX_RESULT_BYTES
  ) {
    throw resultError(
      "PROOF_RESULT_CIPHERTEXT_INVALID",
      "The encrypted proof result ciphertext is invalid.",
    );
  }

  if (
    !/^[0-9a-f]{64}$/u.test(
      record.ciphertextSha256,
    )
  ) {
    throw resultError(
      "PROOF_RESULT_DIGEST_INVALID",
      "The encrypted proof result digest is invalid.",
    );
  }

  return Object.freeze({
    schemaVersion:
      PROOF_RESULT_SCHEMA_VERSION,

    ...metadata,

    nonce:
      Buffer.from(
        record.nonce,
      ),

    authenticationTag:
      Buffer.from(
        record.authenticationTag,
      ),

    ciphertext:
      Buffer.from(
        record.ciphertext,
      ),

    ciphertextSha256:
      record.ciphertextSha256,
  });
}

function normalizeTransactionProofResult(
  value: unknown,
  expectedFingerprint: string,
): TransactionProofResult {
  const record =
    plainRecord(
      value,
      "The transaction proof result must be a plain object.",
    );

  assertExactKeys(
    record,
    [
      "status",
      "requestId",
      "operation",
      "requestFingerprint",
      "proof",
      "proofFacts",
      "l2ToL1Messages",
      "proofSizeBytes",
      "retryCount",
      "broadcastEnabled",
      "canonicalPrepared",
      "liveVerified",
      "shieldEnabled",
    ],
  );

  const status =
    record.status
      === "LOCAL_PROVER_VERIFIED"
      || record.status
        === "PROVER_READY_UNVERIFIED_LIVE"
      ? record.status
      : invalidResult(
          "The proof result status is invalid.",
        );

  const requestId =
    requireBoundedString(
      record.requestId,
      /^[A-Za-z0-9._:-]{1,160}$/u,
      "requestId",
    );

  if (
    record.operation !== "message"
  ) {
    throw resultError(
      "PROOF_RESULT_OPERATION_INVALID",
      "Only canonical message proof results may be persisted.",
    );
  }

  const requestFingerprint =
    requireFingerprint(
      record.requestFingerprint,
    );

  if (
    requestFingerprint
      !== expectedFingerprint
  ) {
    throw resultError(
      "PROOF_RESULT_BINDING_INVALID",
      "The proof result fingerprint does not match the durable job.",
    );
  }

  const proof =
    requireCanonicalBase64(
      record.proof,
    );

  const proofSizeBytes =
    requireBoundedInteger(
      record.proofSizeBytes,
      1,
      MAX_PROOF_BYTES,
      "proofSizeBytes",
    );

  if (
    Buffer.from(
      proof,
      "base64",
    ).length !== proofSizeBytes
  ) {
    throw resultError(
      "PROOF_RESULT_PROOF_SIZE_MISMATCH",
      "The proof result byte length does not match its declared size.",
    );
  }

  const proofFacts =
    requireFeltArray(
      record.proofFacts,
      1,
      256,
      "proofFacts",
    );

  if (
    !Array.isArray(
      record.l2ToL1Messages,
    )
    || record.l2ToL1Messages.length
      !== 1
  ) {
    throw resultError(
      "PROOF_RESULT_MESSAGES_INVALID",
      "The proof result must contain exactly one Pool output message.",
    );
  }

  const l2ToL1Messages =
    Object.freeze(
      record.l2ToL1Messages.map(
        normalizeL2ToL1Message,
      ),
    );

  const retryCount =
    requireBoundedInteger(
      record.retryCount,
      0,
      3,
      "retryCount",
    );

  if (
    record.broadcastEnabled !== false
    || record.canonicalPrepared !== false
    || record.liveVerified !== false
    || record.shieldEnabled !== false
  ) {
    throw resultError(
      "PROOF_RESULT_CAPABILITY_INVALID",
      "The reviewed proof result cannot enable runtime, broadcast, or shield capabilities.",
    );
  }

  return Object.freeze({
    status,
    requestId,
    operation:
      "message",

    requestFingerprint,
    proof,

    proofFacts:
      Object.freeze(
        proofFacts,
      ),

    l2ToL1Messages,

    proofSizeBytes,
    retryCount,

    broadcastEnabled:
      false,

    canonicalPrepared:
      false,

    liveVerified:
      false,

    shieldEnabled:
      false,
  });
}

function normalizeL2ToL1Message(
  value: unknown,
): ProverL2ToL1Message {
  const record =
    plainRecord(
      value,
      "A proof output message must be a plain object.",
    );

  assertExactKeys(
    record,
    [
      "fromAddress",
      "toAddress",
      "payload",
    ],
  );

  return Object.freeze({
    fromAddress:
      requireFelt(
        record.fromAddress,
        false,
        "fromAddress",
      ),

    toAddress:
      requireFelt(
        record.toAddress,
        true,
        "toAddress",
      ),

    payload:
      Object.freeze(
        requireFeltArray(
          record.payload,
          1,
          4_096,
          "payload",
        ),
      ),
  });
}

function validateMetadata(
  input: {
    resultReference: string;
    jobId: string;
    requestFingerprint: string;
    keyVersion: string;
    proofSizeBytes: number;
    createdAtMs: number;
    expiresAtMs: number;
  },
) {
  const resultReference =
    requireResultReference(
      input.resultReference,
    );

  const jobId =
    requireJobId(
      input.jobId,
    );

  const requestFingerprint =
    requireFingerprint(
      input.requestFingerprint,
    );

  const keyVersion =
    requireBoundedString(
      input.keyVersion,
      /^[A-Za-z0-9._-]{1,32}$/u,
      "keyVersion",
    );

  const proofSizeBytes =
    requireBoundedInteger(
      input.proofSizeBytes,
      1,
      MAX_PROOF_BYTES,
      "proofSizeBytes",
    );

  const createdAtMs =
    requireTimestamp(
      input.createdAtMs,
      "createdAtMs",
    );

  const expiresAtMs =
    requireTimestamp(
      input.expiresAtMs,
      "expiresAtMs",
    );

  if (
    expiresAtMs <= createdAtMs
    || expiresAtMs
      > createdAtMs
        + 30 * 24 * 60 * 60_000
  ) {
    throw resultError(
      "PROOF_RESULT_LIFETIME_INVALID",
      "The encrypted proof result lifetime is invalid.",
    );
  }

  if (
    resultReference
      !== createProofResultReference(
        jobId,
        requestFingerprint,
      )
  ) {
    throw resultError(
      "PROOF_RESULT_REFERENCE_BINDING_INVALID",
      "The proof result reference is not bound to the durable job.",
    );
  }

  return Object.freeze({
    resultReference,
    jobId,
    requestFingerprint,
    keyVersion,
    proofSizeBytes,
    createdAtMs,
    expiresAtMs,
  });
}

function buildAdditionalData(
  metadata: {
    resultReference: string;
    jobId: string;
    requestFingerprint: string;
    keyVersion: string;
    proofSizeBytes: number;
    createdAtMs: number;
    expiresAtMs: number;
  },
): Buffer {
  return Buffer.from(
    [
      PROOF_RESULT_SCHEMA_VERSION,
      metadata.resultReference,
      metadata.jobId,
      metadata.requestFingerprint,
      metadata.keyVersion,
      metadata.proofSizeBytes,
      metadata.createdAtMs,
      metadata.expiresAtMs,
    ].join("\n"),
    "utf8",
  );
}

function requireCanonicalBase64(
  value: unknown,
): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || !BASE64.test(value)
  ) {
    throw resultError(
      "PROOF_RESULT_PROOF_INVALID",
      "The proof result must contain canonical Base64 proof bytes.",
    );
  }

  const decoded =
    Buffer.from(
      value,
      "base64",
    );

  if (
    decoded.length < 1
    || decoded.length > MAX_PROOF_BYTES
    || decoded.toString(
      "base64",
    ) !== value
  ) {
    throw resultError(
      "PROOF_RESULT_PROOF_INVALID",
      "The proof result contains invalid Base64 proof bytes.",
    );
  }

  return value;
}

function requireFeltArray(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): string[] {
  if (
    !Array.isArray(value)
    || value.length < minimum
    || value.length > maximum
  ) {
    throw resultError(
      "PROOF_RESULT_FELT_ARRAY_INVALID",
      `${label} has an invalid length.`,
    );
  }

  return value.map(
    (item, index) =>
      requireFelt(
        item,
        true,
        `${label}[${index}]`,
      ),
  );
}

function requireFelt(
  value: unknown,
  allowZero: boolean,
  label: string,
): string {
  if (
    typeof value !== "string"
    || !CANONICAL_FELT.test(
      value,
    )
  ) {
    throw resultError(
      "PROOF_RESULT_FELT_INVALID",
      `${label} is not a canonical Starknet felt.`,
    );
  }

  const parsed =
    BigInt(value);

  if (
    parsed < 0n
    || parsed >= (1n << 251n)
    || (
      !allowZero
      && parsed === 0n
    )
  ) {
    throw resultError(
      "PROOF_RESULT_FELT_INVALID",
      `${label} is outside the allowed Starknet felt range.`,
    );
  }

  return `0x${parsed.toString(16)}`;
}

function requireKey(
  value: Uint8Array,
): Buffer {
  const key =
    Buffer.from(value);

  if (
    key.length !== KEY_BYTES
  ) {
    throw resultError(
      "PROOF_RESULT_KEY_INVALID",
      "The proof result encryption key must contain exactly 32 bytes.",
    );
  }

  return key;
}

function requireBuffer(
  value: Buffer,
  length: number,
  label: string,
): void {
  if (
    !Buffer.isBuffer(value)
    || value.length !== length
  ) {
    throw resultError(
      "PROOF_RESULT_CIPHERTEXT_INVALID",
      `The encrypted proof result ${label} is invalid.`,
    );
  }
}

function requireResultReference(
  value: string,
): string {
  return requireBoundedString(
    value,
    /^result_[0-9a-f]{64}$/u,
    "resultReference",
  );
}

function requireJobId(
  value: string,
): string {
  return requireBoundedString(
    value,
    /^job_[A-Za-z0-9_-]{16,128}$/u,
    "jobId",
  );
}

function requireFingerprint(
  value: unknown,
): string {
  return requireBoundedString(
    value,
    /^veil-proof-intent-v1:[0-9a-f]{64}$/u,
    "requestFingerprint",
  );
}

function requireBoundedString(
  value: unknown,
  pattern: RegExp,
  label: string,
): string {
  if (
    typeof value !== "string"
    || !pattern.test(value)
  ) {
    throw resultError(
      "PROOF_RESULT_FIELD_INVALID",
      `${label} is invalid.`,
    );
  }

  return value;
}

function requireBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw resultError(
      "PROOF_RESULT_FIELD_INVALID",
      `${label} is invalid.`,
    );
  }

  return value;
}

function requireTimestamp(
  value: unknown,
  label: string,
): number {
  return requireBoundedInteger(
    value,
    0,
    Number.MAX_SAFE_INTEGER,
    label,
  );
}

function plainRecord(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || Object.getPrototypeOf(value)
      !== Object.prototype
  ) {
    throw resultError(
      "PROOF_RESULT_SHAPE_INVALID",
      message,
    );
  }

  return value as
    Record<string, unknown>;
}

function assertExactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
): void {
  const keys =
    Object.keys(record);

  if (
    keys.length !== expected.length
    || keys.some(
      (key) =>
        !expected.includes(key),
    )
  ) {
    throw resultError(
      "PROOF_RESULT_SHAPE_INVALID",
      "The proof result contains unknown or missing fields.",
    );
  }
}

function invalidResult(
  message: string,
): never {
  throw resultError(
    "PROOF_RESULT_FIELD_INVALID",
    message,
  );
}

function sha256Hex(
  value: Uint8Array,
): string {
  return createHash(
    "sha256",
  )
    .update(value)
    .digest("hex");
}

function resultError(
  code: string,
  message: string,
): ProofResultError {
  return new ProofResultError(
    code,
    message,
  );
}
