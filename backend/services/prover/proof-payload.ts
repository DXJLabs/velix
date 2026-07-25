import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export const PROOF_PAYLOAD_SCHEMA_VERSION =
  "veil-proof-payload-v1" as const;

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const MAX_PAYLOAD_BYTES = 512 * 1024;
const MAX_LIFETIME_MS = 7 * 24 * 60 * 60_000;

export interface EncryptedProofPayload {
  readonly schemaVersion:
    typeof PROOF_PAYLOAD_SCHEMA_VERSION;

  readonly payloadReference: string;
  readonly requestFingerprint: string;
  readonly keyVersion: string;

  readonly nonce: Buffer;
  readonly authenticationTag: Buffer;
  readonly ciphertext: Buffer;
  readonly ciphertextSha256: string;

  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

export interface EncryptProofPayloadInput {
  readonly payloadReference: string;
  readonly requestFingerprint: string;
  readonly keyVersion: string;
  readonly key: Uint8Array;
  readonly payload: unknown;
  readonly nowMs: number;
  readonly expiresAtMs: number;
}

export class ProofPayloadError extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProofPayloadError";
    this.code = code;
  }
}

export function encryptProofPayload(
  input: EncryptProofPayloadInput,
): EncryptedProofPayload {
  const metadata = validateMetadata(input);
  const key = requireKey(input.key);

  let serialized: string | undefined;

  try {
    serialized = JSON.stringify(input.payload);
  } catch {
    throw payloadError(
      "PROOF_PAYLOAD_SERIALIZATION_FAILED",
      "The proof payload could not be serialized.",
    );
  }

  if (serialized === undefined) {
    throw payloadError(
      "PROOF_PAYLOAD_SERIALIZATION_FAILED",
      "The proof payload must be valid JSON.",
    );
  }

  const plaintext = Buffer.from(serialized, "utf8");

  if (
    plaintext.length < 1
    || plaintext.length > MAX_PAYLOAD_BYTES
  ) {
    throw payloadError(
      "PROOF_PAYLOAD_SIZE_INVALID",
      "The proof payload exceeds the allowed size.",
    );
  }

  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(
    "aes-256-gcm",
    key,
    nonce,
  );

  cipher.setAAD(buildAdditionalData(metadata));

  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);

  const authenticationTag =
    cipher.getAuthTag();

  return Object.freeze({
    schemaVersion:
      PROOF_PAYLOAD_SCHEMA_VERSION,

    ...metadata,

    nonce,
    authenticationTag,
    ciphertext,

    ciphertextSha256:
      sha256Hex(ciphertext),
  });
}

export function decryptProofPayload(
  record: EncryptedProofPayload,
  keyValue: Uint8Array,
  nowMs: number,
): unknown {
  const metadata = validateMetadata(record);
  const key = requireKey(keyValue);

  if (
    !Number.isSafeInteger(nowMs)
    || nowMs < 0
  ) {
    throw payloadError(
      "PROOF_PAYLOAD_TIME_INVALID",
      "The current timestamp is invalid.",
    );
  }

  if (nowMs >= metadata.expiresAtMs) {
    throw payloadError(
      "PROOF_PAYLOAD_EXPIRED",
      "The proof payload has expired.",
    );
  }

  requireBufferLength(
    record.nonce,
    NONCE_BYTES,
    "nonce",
  );

  requireBufferLength(
    record.authenticationTag,
    TAG_BYTES,
    "authenticationTag",
  );

  if (
    !Buffer.isBuffer(record.ciphertext)
    || record.ciphertext.length < 1
    || record.ciphertext.length
      > MAX_PAYLOAD_BYTES
  ) {
    throw payloadError(
      "PROOF_PAYLOAD_CIPHERTEXT_INVALID",
      "The encrypted proof payload is invalid.",
    );
  }

  if (
    sha256Hex(record.ciphertext)
      !== record.ciphertextSha256
  ) {
    throw payloadError(
      "PROOF_PAYLOAD_INTEGRITY_FAILED",
      "The encrypted proof payload failed integrity validation.",
    );
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      record.nonce,
    );

    decipher.setAAD(
      buildAdditionalData(metadata),
    );

    decipher.setAuthTag(
      record.authenticationTag,
    );

    const plaintext = Buffer.concat([
      decipher.update(record.ciphertext),
      decipher.final(),
    ]);

    return JSON.parse(
      plaintext.toString("utf8"),
    ) as unknown;
  } catch {
    throw payloadError(
      "PROOF_PAYLOAD_DECRYPTION_FAILED",
      "The encrypted proof payload could not be authenticated.",
    );
  }
}

function validateMetadata(input: {
  payloadReference: string;
  requestFingerprint: string;
  keyVersion: string;
  createdAtMs?: number;
  nowMs?: number;
  expiresAtMs: number;
}): {
  payloadReference: string;
  requestFingerprint: string;
  keyVersion: string;
  createdAtMs: number;
  expiresAtMs: number;
} {
  const createdAtMs =
    input.createdAtMs ?? input.nowMs;

  if (
    !/^[A-Za-z0-9:_-]{1,200}$/u
      .test(input.payloadReference)
  ) {
    throw payloadError(
      "PROOF_PAYLOAD_REFERENCE_INVALID",
      "The proof payload reference is invalid.",
    );
  }

  if (
    !/^veil-proof-intent-v1:[0-9a-f]{64}$/u
      .test(input.requestFingerprint)
  ) {
    throw payloadError(
      "PROOF_PAYLOAD_FINGERPRINT_INVALID",
      "The proof request fingerprint is invalid.",
    );
  }

  if (
    !/^[A-Za-z0-9._-]{1,32}$/u
      .test(input.keyVersion)
  ) {
    throw payloadError(
      "PROOF_PAYLOAD_KEY_VERSION_INVALID",
      "The proof payload key version is invalid.",
    );
  }

  if (
    createdAtMs === undefined
    || !Number.isSafeInteger(createdAtMs)
    || createdAtMs < 0
    || !Number.isSafeInteger(input.expiresAtMs)
    || input.expiresAtMs <= createdAtMs
    || input.expiresAtMs
      > createdAtMs + MAX_LIFETIME_MS
  ) {
    throw payloadError(
      "PROOF_PAYLOAD_LIFETIME_INVALID",
      "The proof payload lifetime is invalid.",
    );
  }

  return Object.freeze({
    payloadReference:
      input.payloadReference,

    requestFingerprint:
      input.requestFingerprint,

    keyVersion:
      input.keyVersion,

    createdAtMs,
    expiresAtMs:
      input.expiresAtMs,
  });
}

function requireKey(
  value: Uint8Array,
): Buffer {
  const key = Buffer.from(value);

  if (key.length !== KEY_BYTES) {
    throw payloadError(
      "PROOF_PAYLOAD_KEY_INVALID",
      "The proof payload encryption key must contain exactly 32 bytes.",
    );
  }

  return key;
}

function requireBufferLength(
  value: Buffer,
  expectedLength: number,
  label: string,
): void {
  if (
    !Buffer.isBuffer(value)
    || value.length !== expectedLength
  ) {
    throw payloadError(
      "PROOF_PAYLOAD_CIPHERTEXT_INVALID",
      `The encrypted proof payload ${label} is invalid.`,
    );
  }
}

function buildAdditionalData(
  metadata: {
    payloadReference: string;
    requestFingerprint: string;
    keyVersion: string;
    createdAtMs: number;
    expiresAtMs: number;
  },
): Buffer {
  return Buffer.from(
    [
      PROOF_PAYLOAD_SCHEMA_VERSION,
      metadata.payloadReference,
      metadata.requestFingerprint,
      metadata.keyVersion,
      metadata.createdAtMs,
      metadata.expiresAtMs,
    ].join("\n"),
    "utf8",
  );
}

function sha256Hex(
  value: Uint8Array,
): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function payloadError(
  code: string,
  message: string,
): ProofPayloadError {
  return new ProofPayloadError(
    code,
    message,
  );
}
