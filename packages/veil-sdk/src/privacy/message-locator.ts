import { VeilPrivacyError } from "./errors.js";

const FELT_BOUND = 1n << 251n;
const LOCATOR_RANDOM_BYTES = 32;
const LOCATOR_MAX_RETRIES = 8;

export const VEIL_MESSAGE_LOCATOR_ENTROPY_BITS = 251 as const;

export function generateMessageLocator(crypto: Crypto = globalThis.crypto): string {
  if (!crypto || typeof crypto.getRandomValues !== "function") {
    throw new VeilPrivacyError(
      "PAYLOAD_MALFORMED",
      "Secure randomness is unavailable; cannot generate a message locator.",
    );
  }
  for (let attempt = 0; attempt < LOCATOR_MAX_RETRIES; attempt += 1) {
    const bytes = crypto.getRandomValues(new Uint8Array(LOCATOR_RANDOM_BYTES));
    const head = bytes[0] as number;
    bytes[0] = head & 0x07;
    const hex = bytesToHex(bytes);
    const value = BigInt(hex);
    if (value > 0n && value < FELT_BOUND) {
      return `0x${value.toString(16)}`;
    }
  }
  throw new VeilPrivacyError(
    "PAYLOAD_MALFORMED",
    "Secure randomness source produced degenerate output; cannot generate a message locator.",
  );
}

export function normalizeMessageLocator(value: string | bigint): string {
  let parsed: bigint;
  try {
    parsed = typeof value === "bigint" ? value : BigInt(String(value).trim());
  } catch (cause) {
    throw new VeilPrivacyError(
      "PAYLOAD_MALFORMED",
      "messageLocator must be a nonzero Starknet felt.",
      { cause },
    );
  }
  if (parsed <= 0n || parsed >= FELT_BOUND) {
    throw new VeilPrivacyError(
      "PAYLOAD_MALFORMED",
      "messageLocator must be a nonzero Starknet felt.",
    );
  }
  return `0x${parsed.toString(16)}`;
}

export interface MessageLocatorResolver {
  resolve(input: {
    explicitLocator?: string | bigint;
    messageId: string;
  }): string;
  has(messageId: string): boolean;
  peek(messageId: string): string | undefined;
}

export function createMessageLocatorResolver(
  crypto: Crypto = globalThis.crypto,
): MessageLocatorResolver {
  const registry = new Map<string, string>();

  return {
    resolve(input) {
      const messageId = validateMessageId(input.messageId);
      if (input.explicitLocator !== undefined) {
        const normalized = normalizeMessageLocator(input.explicitLocator);
        const existing = registry.get(messageId);
        if (existing !== undefined) {
          if (existing !== normalized) {
            throw new VeilPrivacyError(
              "PAYLOAD_MALFORMED",
              "A different locator has already been registered for this messageId.",
            );
          }
          return existing;
        }
        registry.set(messageId, normalized);
        return normalized;
      }
      const existing = registry.get(messageId);
      if (existing !== undefined) return existing;
      const locator = generateMessageLocator(crypto);
      registry.set(messageId, locator);
      return locator;
    },
    has(messageId) {
      return registry.has(validateMessageId(messageId));
    },
    peek(messageId) {
      return registry.get(validateMessageId(messageId));
    },
  };
}

function validateMessageId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 256 || /[\u0000-\u001f]/u.test(trimmed)) {
    throw new VeilPrivacyError(
      "PAYLOAD_MALFORMED",
      "messageId must be a non-empty bounded string without control characters.",
    );
  }
  return trimmed;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let index = 0; index < bytes.length; index += 1) {
    hex += (bytes[index] as number).toString(16).padStart(2, "0");
  }
  return `0x${hex}`;
}
