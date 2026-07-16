import { VeilPrivacyError } from "./errors.js";

export const VEIL_APPLICATION_KEY_DOMAINS = [
  "VEIL_MESSAGE_KEY_V1",
  "VEIL_MEMO_KEY_V1",
  "VEIL_OFFER_KEY_V1",
  "VEIL_ESCROW_KEY_V1",
] as const;

export type VeilApplicationKeyDomain = (typeof VEIL_APPLICATION_KEY_DOMAINS)[number];

export interface VeilApplicationEncryptionContext {
  chainId: string;
  poolAddress: string;
  roomId: string;
  senderId: string;
  recipientId?: string;
}

export interface VeilApplicationCiphertext {
  version: 1;
  domain: VeilApplicationKeyDomain;
  contextHash: string;
  salt: string;
  nonce: string;
  ciphertext: string;
}

export interface EncryptApplicationPayloadInput {
  domain: VeilApplicationKeyDomain;
  context: VeilApplicationEncryptionContext;
  sharedSecret: Uint8Array;
  plaintext: Uint8Array;
  crypto?: Crypto;
}

export interface DecryptApplicationPayloadInput {
  domain: VeilApplicationKeyDomain;
  context: VeilApplicationEncryptionContext;
  sharedSecret: Uint8Array;
  envelope: VeilApplicationCiphertext;
  crypto?: Crypto;
}

export async function encryptApplicationPayload(
  input: EncryptApplicationPayloadInput,
): Promise<VeilApplicationCiphertext> {
  validateDomain(input.domain);
  validateSecret(input.sharedSecret);
  if (!(input.plaintext instanceof Uint8Array) || input.plaintext.byteLength === 0) {
    throw new Error("Application plaintext must be non-empty bytes.");
  }
  const crypto = requireCrypto(input.crypto);
  const contextBytes = canonicalContext(input.context);
  const contextHash = await digestBase64Url(crypto, contextBytes);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(crypto, input.sharedSecret, salt, input.domain, contextBytes);
  const additionalData = authenticatedData(input.domain, contextHash);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: arrayBuffer(nonce), additionalData: arrayBuffer(additionalData) },
    key,
    arrayBuffer(input.plaintext),
  );
  return {
    version: 1,
    domain: input.domain,
    contextHash,
    salt: base64Url(salt),
    nonce: base64Url(nonce),
    ciphertext: base64Url(new Uint8Array(ciphertext)),
  };
}

export async function decryptApplicationPayload(
  input: DecryptApplicationPayloadInput,
): Promise<Uint8Array> {
  validateDomain(input.domain);
  validateSecret(input.sharedSecret);
  const crypto = requireCrypto(input.crypto);
  if (input.envelope.version !== 1 || input.envelope.domain !== input.domain) {
    throw new VeilPrivacyError("DECRYPTION_FAILED", "Application ciphertext domain/version mismatch.");
  }
  const contextBytes = canonicalContext(input.context);
  const contextHash = await digestBase64Url(crypto, contextBytes);
  if (contextHash !== input.envelope.contextHash) {
    throw new VeilPrivacyError("DECRYPTION_FAILED", "Application ciphertext context mismatch.");
  }
  try {
    const salt = fromBase64Url(input.envelope.salt, 32);
    const nonce = fromBase64Url(input.envelope.nonce, 12);
    const ciphertext = fromBase64Url(input.envelope.ciphertext);
    const key = await deriveKey(crypto, input.sharedSecret, salt, input.domain, contextBytes);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: arrayBuffer(nonce),
        additionalData: arrayBuffer(authenticatedData(input.domain, contextHash)),
      },
      key,
      arrayBuffer(ciphertext),
    );
    return new Uint8Array(plaintext);
  } catch (cause) {
    if (cause instanceof VeilPrivacyError) throw cause;
    throw new VeilPrivacyError("DECRYPTION_FAILED", "Application ciphertext authentication failed.", { cause });
  }
}

async function deriveKey(
  crypto: Crypto,
  sharedSecret: Uint8Array,
  salt: Uint8Array,
  domain: VeilApplicationKeyDomain,
  context: Uint8Array,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", arrayBuffer(sharedSecret), "HKDF", false, ["deriveKey"]);
  const info = join(new TextEncoder().encode(domain), new Uint8Array([0]), context);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: arrayBuffer(salt), info: arrayBuffer(info) },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function canonicalContext(context: VeilApplicationEncryptionContext): Uint8Array {
  const fields = [
    required(context.chainId, "chainId"),
    required(context.poolAddress, "poolAddress").toLowerCase(),
    required(context.roomId, "roomId"),
    required(context.senderId, "senderId"),
    context.recipientId === undefined ? "" : required(context.recipientId, "recipientId"),
  ];
  return new TextEncoder().encode(fields.map((value) => `${value.length}:${value}`).join("|"));
}

function authenticatedData(domain: VeilApplicationKeyDomain, contextHash: string): Uint8Array {
  return new TextEncoder().encode(`VEIL_APPLICATION_CIPHERTEXT_V1|${domain}|${contextHash}`);
}

function validateDomain(domain: string): asserts domain is VeilApplicationKeyDomain {
  if (!(VEIL_APPLICATION_KEY_DOMAINS as readonly string[]).includes(domain)) {
    throw new Error("Unsupported VEIL application encryption domain.");
  }
}

function validateSecret(value: Uint8Array): void {
  if (!(value instanceof Uint8Array) || value.byteLength < 32) {
    throw new Error("A shared secret of at least 32 bytes is required; viewing-key bigint values are not accepted.");
  }
  if (value.every((byte) => byte === 0)) throw new Error("Shared secret cannot be all zero.");
}

function requireCrypto(value?: Crypto): Crypto {
  const crypto = value ?? globalThis.crypto;
  if (!crypto?.subtle) throw new Error("WebCrypto is unavailable.");
  return crypto;
}

async function digestBase64Url(crypto: Crypto, value: Uint8Array): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", arrayBuffer(value))));
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} cannot be empty.`);
  if (/[\u0000-\u001f]/u.test(normalized)) throw new Error(`${label} contains control characters.`);
  return normalized;
}

function join(...values: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(values.reduce((total, value) => total + value.byteLength, 0));
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.byteLength;
  }
  return output;
}

function base64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
}

function fromBase64Url(value: string, expectedLength?: number): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new VeilPrivacyError("DECRYPTION_FAILED", "Invalid base64url ciphertext field.");
  const padded = `${value.replace(/-/gu, "+").replace(/_/gu, "/")}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded);
  const output = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (expectedLength !== undefined && output.byteLength !== expectedLength) {
    throw new VeilPrivacyError("DECRYPTION_FAILED", "Invalid ciphertext field length.");
  }
  return output;
}

function arrayBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer as ArrayBuffer;
}
