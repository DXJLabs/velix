import type { FeltLike } from "./types";

const STARK_FIELD_PRIME = (1n << 251n) + (17n << 192n) + 1n;
const SECRET_BYTES = 32;
const DOMAIN = "VEIL_CONVERSATION_TAG_V1";
const textEncoder = new TextEncoder();

export type ConversationTagSecret = FeltLike | Uint8Array | ArrayBuffer;

export interface DeriveConversationTagInput {
  sharedSecret: ConversationTagSecret;
  context: string;
  crypto?: Crypto;
}

/**
 * Derives a stable, opaque Starknet felt locally. The shared channel material
 * never leaves the device; only the HMAC output is suitable for RPC/indexer use.
 */
export async function deriveOpaqueConversationTag(input: DeriveConversationTagInput): Promise<string> {
  const crypto = input.crypto ?? globalThis.crypto;
  if (!crypto?.subtle) throw new Error("Conversation tag derivation requires WebCrypto.");

  const context = canonicalContext(input.context);
  const secret = secretBytes(input.sharedSecret);
  const key = await crypto.subtle.importKey(
    "raw",
    arrayBuffer(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      arrayBuffer(textEncoder.encode(`${DOMAIN}\u0000${context}`)),
    ),
  );
  const felt = bytesToBigInt(digest) % STARK_FIELD_PRIME;
  if (felt === 0n) throw new Error("Conversation tag derivation produced an invalid zero felt.");
  return `0x${felt.toString(16)}`;
}

function canonicalContext(value: string): string {
  if (typeof value !== "string") throw new Error("Conversation tag context must be a string.");
  const normalized = value.trim();
  if (!normalized || normalized.length > 2_048 || /[\u0000-\u001f]/u.test(normalized)) {
    throw new Error("Conversation tag context is empty, too long, or contains control characters.");
  }
  return normalized;
}

function secretBytes(value: ConversationTagSecret): Uint8Array {
  if (value instanceof Uint8Array) return validateSecretBytes(Uint8Array.from(value));
  if (value instanceof ArrayBuffer) return validateSecretBytes(new Uint8Array(value.slice(0)));

  let bigint: bigint;
  if (typeof value === "bigint") {
    bigint = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Conversation tag secret number must be a safe integer.");
    bigint = BigInt(value);
  } else {
    const normalized = value.trim();
    if (!/^(?:0x[0-9a-fA-F]+|[0-9]+)$/u.test(normalized)) {
      throw new Error("Conversation tag secret must be felt-compatible bytes or an integer.");
    }
    bigint = BigInt(normalized);
  }

  if (bigint <= 0n || bigint >= STARK_FIELD_PRIME) {
    throw new Error("Conversation tag secret must be a nonzero Starknet field element.");
  }
  const output = new Uint8Array(SECRET_BYTES);
  let remaining = bigint;
  for (let index = output.length - 1; index >= 0; index -= 1) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
}

function validateSecretBytes(value: Uint8Array): Uint8Array {
  if (value.byteLength !== SECRET_BYTES || value.every((byte) => byte === 0)) {
    throw new Error("Conversation tag secret must be exactly 32 nonzero bytes.");
  }
  return value;
}

function bytesToBigInt(value: Uint8Array): bigint {
  let result = 0n;
  for (const byte of value) result = (result << 8n) | BigInt(byte);
  return result;
}

function arrayBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer as ArrayBuffer;
}
