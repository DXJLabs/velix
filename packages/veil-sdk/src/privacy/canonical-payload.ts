import { hash, shortString } from "starknet";
import { stringToFeltChunks } from "../payload-chunks.js";
import { VeilPrivacyError } from "./errors.js";

export const VEIL_CANONICAL_ENVELOPE_VERSION = 1 as const;
export const VEIL_CANONICAL_ENVELOPE_ALGORITHM = "A256GCM" as const;
export const VEIL_CANONICAL_MAX_CHUNKS = 64 as const;
export const VEIL_CANONICAL_MAX_ENVELOPE_BYTES = 1_984 as const;
export const VEIL_CANONICAL_COMMITMENT_DOMAIN = "VEIL_MSG_COMMIT_V1" as const;

const COMMITMENT_DOMAIN_FELT = shortString.encodeShortString(VEIL_CANONICAL_COMMITMENT_DOMAIN);
const BASE64URL = /^[A-Za-z0-9_-]+$/u;
const ENVELOPE_KEYS = ["version", "algorithm", "salt", "nonce", "ciphertext"] as const;

export const VEIL_CANONICAL_OPERATION_DOMAINS = Object.freeze({
  message: "VEIL_MESSAGE_KEY_V1",
  payment_memo: "VEIL_MEMO_KEY_V1",
  offer: "VEIL_OFFER_KEY_V1",
  counter_offer: "VEIL_OFFER_KEY_V1",
  offer_decision: "VEIL_OFFER_KEY_V1",
  escrow_coordination: "VEIL_ESCROW_KEY_V1",
  settlement_evidence: "VEIL_ESCROW_KEY_V1",
} as const);

export type VeilCanonicalOperation = keyof typeof VEIL_CANONICAL_OPERATION_DOMAINS;
export type VeilCanonicalKeyDomain = (typeof VEIL_CANONICAL_OPERATION_DOMAINS)[VeilCanonicalOperation];

export interface VeilCiphertextEnvelopeV1 {
  version: typeof VEIL_CANONICAL_ENVELOPE_VERSION;
  algorithm: typeof VEIL_CANONICAL_ENVELOPE_ALGORITHM;
  salt: string;
  nonce: string;
  ciphertext: string;
}

export interface BuildCanonicalHelperPayloadInput {
  operation: VeilCanonicalOperation | string;
  keyDomain: VeilCanonicalKeyDomain | string;
  envelope: unknown;
  messageLocator: string | bigint;
  claimedCommitment?: string | bigint;
}

export interface CanonicalHelperPayload {
  version: typeof VEIL_CANONICAL_ENVELOPE_VERSION;
  operation: VeilCanonicalOperation;
  keyDomain: VeilCanonicalKeyDomain;
  envelope: VeilCiphertextEnvelopeV1;
  serializedEnvelope: string;
  envelopeByteLength: number;
  messageLocator: string;
  payloadCommitment: string;
  payloadChunks: readonly string[];
  calldata: readonly string[];
}

export function buildCanonicalHelperPayload(input: BuildCanonicalHelperPayloadInput): CanonicalHelperPayload {
  const operation = validateOperation(input.operation);
  const keyDomain = VEIL_CANONICAL_OPERATION_DOMAINS[operation];
  if (input.keyDomain !== keyDomain) {
    throw new VeilPrivacyError(
      "PAYLOAD_MALFORMED",
      "The canonical payload key domain does not match its operation type.",
    );
  }

  const envelope = validateCanonicalEnvelope(input.envelope);
  const serializedEnvelope = JSON.stringify(envelope);
  const envelopeByteLength = new TextEncoder().encode(serializedEnvelope).byteLength;
  if (envelopeByteLength === 0 || envelopeByteLength > VEIL_CANONICAL_MAX_ENVELOPE_BYTES) {
    throw new VeilPrivacyError(
      "PAYLOAD_TOO_LARGE",
      `The canonical ciphertext envelope must be between 1 and ${VEIL_CANONICAL_MAX_ENVELOPE_BYTES} bytes.`,
      { details: { envelopeByteLength, maximumBytes: VEIL_CANONICAL_MAX_ENVELOPE_BYTES } },
    );
  }

  const payloadChunks = stringToFeltChunks(serializedEnvelope);
  if (payloadChunks.length === 0 || payloadChunks.length > VEIL_CANONICAL_MAX_CHUNKS) {
    throw new VeilPrivacyError(
      "PAYLOAD_TOO_LARGE",
      `The canonical ciphertext envelope must use between 1 and ${VEIL_CANONICAL_MAX_CHUNKS} felt chunks.`,
      { details: { payloadChunkCount: payloadChunks.length, maximumChunks: VEIL_CANONICAL_MAX_CHUNKS } },
    );
  }

  const messageLocator = normalizeNonzeroFelt(input.messageLocator, "messageLocator");
  const payloadCommitment = hash.computePoseidonHashOnElements([
    COMMITMENT_DOMAIN_FELT,
    String(VEIL_CANONICAL_ENVELOPE_VERSION),
    messageLocator,
    String(payloadChunks.length),
    ...payloadChunks,
  ]);
  if (
    input.claimedCommitment !== undefined
    && BigInt(normalizeNonzeroFelt(input.claimedCommitment, "claimedCommitment")) !== BigInt(payloadCommitment)
  ) {
    throw new VeilPrivacyError("PAYLOAD_MALFORMED", "The claimed payload commitment does not match the envelope.");
  }

  return Object.freeze({
    version: VEIL_CANONICAL_ENVELOPE_VERSION,
    operation,
    keyDomain,
    envelope,
    serializedEnvelope,
    envelopeByteLength,
    messageLocator,
    payloadCommitment,
    payloadChunks: Object.freeze([...payloadChunks]),
    calldata: Object.freeze([
      String(VEIL_CANONICAL_ENVELOPE_VERSION),
      messageLocator,
      payloadCommitment,
      String(payloadChunks.length),
      ...payloadChunks,
    ]),
  });
}

export function validateCanonicalEnvelope(value: unknown): VeilCiphertextEnvelopeV1 {
  if (!isPlainRecord(value)) {
    throw new VeilPrivacyError("PAYLOAD_MALFORMED", "The canonical ciphertext envelope must be a plain object.");
  }
  const keys = Object.keys(value);
  if (keys.length !== ENVELOPE_KEYS.length || ENVELOPE_KEYS.some((key) => !keys.includes(key))) {
    throw new VeilPrivacyError("PAYLOAD_MALFORMED", "The canonical ciphertext envelope contains unknown or missing fields.");
  }
  if (value.version !== VEIL_CANONICAL_ENVELOPE_VERSION) {
    throw new VeilPrivacyError("PAYLOAD_VERSION_UNSUPPORTED", "Unknown canonical ciphertext envelope version.");
  }
  if (value.algorithm !== VEIL_CANONICAL_ENVELOPE_ALGORITHM) {
    throw new VeilPrivacyError("PAYLOAD_VERSION_UNSUPPORTED", "Unknown canonical ciphertext envelope algorithm.");
  }

  const salt = validateBase64Url(value.salt, "salt", 32);
  const nonce = validateBase64Url(value.nonce, "nonce", 12);
  const ciphertext = validateBase64Url(value.ciphertext, "ciphertext");
  if (decodedBase64UrlLength(ciphertext) <= 16) {
    throw new VeilPrivacyError("PAYLOAD_MALFORMED", "Canonical AES-GCM ciphertext must contain encrypted data and an authentication tag.");
  }

  return Object.freeze({
    version: VEIL_CANONICAL_ENVELOPE_VERSION,
    algorithm: VEIL_CANONICAL_ENVELOPE_ALGORITHM,
    salt,
    nonce,
    ciphertext,
  });
}

function validateOperation(value: string): VeilCanonicalOperation {
  if (!Object.hasOwn(VEIL_CANONICAL_OPERATION_DOMAINS, value)) {
    if (value === "unshield" || value === "withdraw") {
      throw new VeilPrivacyError("UNSHIELD_UNAVAILABLE", "Unshield is outside the VEIL Idea 01 product scope.");
    }
    throw new VeilPrivacyError("PAYLOAD_MALFORMED", "Unknown canonical VEIL operation type.");
  }
  return value as VeilCanonicalOperation;
}

function validateBase64Url(value: unknown, label: string, exactBytes?: number): string {
  if (typeof value !== "string" || !value || !BASE64URL.test(value) || value.length % 4 === 1) {
    throw new VeilPrivacyError("PAYLOAD_MALFORMED", `${label} must be unpadded canonical base64url.`);
  }
  const remainder = value.length % 4;
  const finalIndex = base64UrlIndex(value.at(-1) as string);
  if ((remainder === 2 && (finalIndex & 0x0f) !== 0) || (remainder === 3 && (finalIndex & 0x03) !== 0)) {
    throw new VeilPrivacyError("PAYLOAD_MALFORMED", `${label} contains non-canonical base64url trailing bits.`);
  }
  const byteLength = decodedBase64UrlLength(value);
  if (exactBytes !== undefined && byteLength !== exactBytes) {
    throw new VeilPrivacyError("PAYLOAD_MALFORMED", `${label} must decode to exactly ${exactBytes} bytes.`);
  }
  return value;
}

function decodedBase64UrlLength(value: string): number {
  return Math.floor((value.length * 6) / 8);
}

function base64UrlIndex(value: string): number {
  const code = value.codePointAt(0) as number;
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 71;
  if (code >= 48 && code <= 57) return code + 4;
  return value === "-" ? 62 : 63;
}

function normalizeNonzeroFelt(value: string | bigint, label: string): string {
  let parsed: bigint;
  try {
    parsed = typeof value === "bigint" ? value : BigInt(value.trim());
  } catch (cause) {
    throw new VeilPrivacyError("PAYLOAD_MALFORMED", `${label} must be a Starknet felt.`, { cause });
  }
  if (parsed <= 0n || parsed >= (1n << 251n)) {
    throw new VeilPrivacyError("PAYLOAD_MALFORMED", `${label} must be a nonzero Starknet felt.`);
  }
  return `0x${parsed.toString(16)}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
