import {
  type EncryptedPayloadEnvelope,
  type EncryptedPayloadStore,
  createDefaultEncryptedPayloadStore,
} from "./encrypted-payload-store";
import { hashToFelt } from "./encryption";
import { feltChunksToString, stringToFeltChunks } from "./payload-chunks";
import type {
  EncryptedPayload,
  EncryptionAdapter,
  EncryptionContext,
  FeltLike,
  TimelineItem,
  VeilTimelinePayload,
} from "./types";

const HKDF_ALGORITHM = "HKDF";
const AES_GCM_ALGORITHM = "AES-GCM";
const PRIVACY_POOL_A256GCM_ALGORITHM = "STRK20-PRIVACY-POOL-HKDF-SHA-256+A256GCM" as const;
const NONCE_BYTES = 12;
const KEY_BITS = 256;
const FELT_BYTES = 32;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type PrivacyPoolSecretMaterial = FeltLike | Uint8Array | ArrayBuffer;
/** @deprecated Browser ECDH key material is not STRK20 Privacy Pool-compatible. */
export type EcdhPrivateKeyMaterial = CryptoKey;
/** @deprecated Browser ECDH key material is not STRK20 Privacy Pool-compatible. */
export type EcdhPublicKeyMaterial = CryptoKey | JsonWebKey;

export interface EcdhKeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyJwk: JsonWebKey;
}

export interface DeriveSharedSecretInput {
  /** @deprecated Use `privacyPoolSharedSecret` or `channelKey` recovered through STRK20 Privacy Pool. */
  privateKey?: EcdhPrivateKeyMaterial;
  /** @deprecated Use `privacyPoolSharedSecret` or `channelKey` recovered through STRK20 Privacy Pool. */
  publicKey?: EcdhPublicKeyMaterial;
  /** @deprecated Use `privacyPoolSharedSecret` or `channelKey` recovered through STRK20 Privacy Pool. */
  localPublicKey?: EcdhPublicKeyMaterial;
  /**
   * Secret material recovered through the official STRK20 Privacy Pool flow.
   *
   * This must be the output of the canonical Cairo protocol path, such as the
   * shared x-coordinate from `_compute_shared_x()` or a recovered Privacy Pool
   * channel key. The SDK intentionally does not compute Stark-curve ECDH,
   * channel keys, note ids, nullifiers, or Poseidon hashes.
   */
  privacyPoolSharedSecret?: PrivacyPoolSecretMaterial;
  /**
   * Alias for `privacyPoolSharedSecret` when the application has already
   * recovered the official `channel_key` from `EncChannelInfo`.
   */
  channelKey?: PrivacyPoolSecretMaterial;
  channelId: string;
  info?: string;
  salt?: PrivacyPoolSecretMaterial;
}

export interface EcdhChannelEncryptionAdapterConfig extends DeriveSharedSecretInput {
  payloadStore?: EncryptedPayloadStore;
  keyId?: string;
  now?: () => number;
}

export type PrivacyPoolChannelEncryptionAdapterConfig = EcdhChannelEncryptionAdapterConfig;

export interface EncryptMessageInput {
  payload: VeilTimelinePayload;
  key: CryptoKey;
  context?: EncryptionContext;
  payloadStore?: EncryptedPayloadStore;
  keyId?: string;
  now?: () => number;
}

export interface DecryptMessageInput {
  item: TimelineItem;
  key: CryptoKey;
  context?: EncryptionContext;
  payloadStore?: EncryptedPayloadStore;
}

function assertWebCrypto(): SubtleCrypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error("VEIL Privacy Pool message encryption requires Web Crypto.");
  }

  return globalThis.crypto.subtle;
}

function bytesToBase64(bytes: Uint8Array): string {
  const binary = [...bytes].map((byte) => String.fromCharCode(byte)).join("");
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function bigintToFixedBytes(value: bigint, byteLength: number): Uint8Array {
  if (value < 0n) {
    throw new Error("Privacy Pool secret material must be non-negative.");
  }

  const bytes = new Uint8Array(byteLength);
  let remaining = value;
  for (let index = byteLength - 1; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  if (remaining > 0n) {
    throw new Error("Privacy Pool secret material exceeds 252-bit felt capacity.");
  }
  return bytes;
}

function normalizeFeltString(value: string): bigint {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Privacy Pool secret material cannot be empty.");
  }
  return BigInt(trimmed);
}

function secretMaterialToBytes(value: PrivacyPoolSecretMaterial, label: string): Uint8Array {
  if (value instanceof Uint8Array) {
    if (value.byteLength === 0) {
      throw new Error(`${label} cannot be empty.`);
    }
    return value;
  }

  if (value instanceof ArrayBuffer) {
    if (value.byteLength === 0) {
      throw new Error(`${label} cannot be empty.`);
    }
    return new Uint8Array(value);
  }

  if (typeof value === "bigint") {
    return bigintToFixedBytes(value, FELT_BYTES);
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative safe integer.`);
    }
    return bigintToFixedBytes(BigInt(value), FELT_BYTES);
  }

  return bigintToFixedBytes(normalizeFeltString(value), FELT_BYTES);
}

function associatedData(context: EncryptionContext | undefined): Uint8Array | undefined {
  if (!context) {
    return undefined;
  }

  return textEncoder.encode(JSON.stringify({ channelId: context.channelId, eventType: context.eventType }));
}

function aesGcmParams(nonce: Uint8Array, context: EncryptionContext | undefined): AesGcmParams {
  const params: AesGcmParams = {
    name: AES_GCM_ALGORITHM,
    iv: bytesToArrayBuffer(nonce),
  };
  const data = associatedData(context);
  if (data) {
    params.additionalData = bytesToArrayBuffer(data);
  }
  return params;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

async function defaultHkdfSalt(input: DeriveSharedSecretInput): Promise<Uint8Array> {
  const saltMaterial = stableJson({
    channelId: input.channelId,
    protocol: "STRK20_PRIVACY_POOL",
    purpose: "VEIL_MESSAGE_ENCRYPTION",
  });
  const digest = await assertWebCrypto().digest("SHA-256", textEncoder.encode(saltMaterial));
  return new Uint8Array(digest);
}

export async function generateEcdhKeyPair(): Promise<EcdhKeyPair> {
  throw new Error(
    "generateEcdhKeyPair is disabled for production. Use the official STRK20 Privacy Pool/Starknet key flow; VEIL session keys are not encryption keys.",
  );
}

export async function exportEcdhPublicKey(_publicKey?: CryptoKey): Promise<JsonWebKey> {
  throw new Error(
    "exportEcdhPublicKey is disabled for production. Public viewing keys must come from the official STRK20 Privacy Pool flow.",
  );
}

export async function deriveSharedSecret(input: DeriveSharedSecretInput): Promise<CryptoKey> {
  const subtle = assertWebCrypto();
  const secret = input.privacyPoolSharedSecret ?? input.channelKey;
  if (secret === undefined) {
    if (input.privateKey || input.publicKey || input.localPublicKey) {
      throw new Error(
        "Browser ECDH inputs are not STRK20 Privacy Pool-compatible. Provide secret material recovered through the official Privacy Pool protocol.",
      );
    }
    throw new Error(
      "deriveSharedSecret requires Privacy Pool secret material recovered through the official STRK20 protocol.",
    );
  }

  const secretBytes = secretMaterialToBytes(secret, "Privacy Pool secret material");
  const hkdfKey = await subtle.importKey("raw", bytesToArrayBuffer(secretBytes), HKDF_ALGORITHM, false, [
    "deriveKey",
  ]);
  const salt = input.salt
    ? secretMaterialToBytes(input.salt, "HKDF salt")
    : await defaultHkdfSalt(input);
  const info = textEncoder.encode(input.info ?? "veil:privacy-pool-message:v1");

  return subtle.deriveKey(
    {
      name: HKDF_ALGORITHM,
      hash: "SHA-256",
      salt: bytesToArrayBuffer(salt),
      info: bytesToArrayBuffer(info),
    },
    hkdfKey,
    { name: AES_GCM_ALGORITHM, length: KEY_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptMessage(input: EncryptMessageInput): Promise<EncryptedPayload> {
  const subtle = assertWebCrypto();
  const now = input.now ?? (() => Date.now());
  const payloadStore = input.payloadStore ?? createDefaultEncryptedPayloadStore();
  const serializedPayload = JSON.stringify(input.payload);
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ciphertextBytes = new Uint8Array(
    await subtle.encrypt(
      aesGcmParams(nonce, input.context),
      input.key,
      bytesToArrayBuffer(textEncoder.encode(serializedPayload)),
    ),
  );
  const ciphertext = bytesToBase64(ciphertextBytes);
  const nonceValue = bytesToBase64(nonce);
  const payloadHash = await hashToFelt(
    `veil:privacy-pool:ciphertext:${ciphertext}:nonce:${nonceValue}:aad:${stableJson(input.context ?? {})}`,
  );
  const encryptedPayload = await hashToFelt(`veil:privacy-pool:payload-ref:${payloadHash}:${nonceValue}`);
  const envelope: EncryptedPayloadEnvelope = {
    version: 1,
    algorithm: PRIVACY_POOL_A256GCM_ALGORITHM,
    encryptedPayload,
    payloadHash,
    ciphertext,
    nonce: nonceValue,
    createdAt: now(),
  };
  if (input.context) {
    envelope.channelId = input.context.channelId;
    envelope.eventType = input.context.eventType;
  }
  if (input.keyId) {
    envelope.keyId = input.keyId;
  }

  await payloadStore.saveEnvelope(envelope);
  return {
    encryptedPayload,
    payloadHash,
    nonce: nonceValue,
    payloadChunks: stringToFeltChunks(JSON.stringify(envelope)),
  };
}

export async function decryptMessage(input: DecryptMessageInput): Promise<VeilTimelinePayload | null> {
  const subtle = assertWebCrypto();
  const payloadStore = input.payloadStore ?? createDefaultEncryptedPayloadStore();
  let envelope = await payloadStore.loadEnvelope(input.item.encryptedPayload);
  if (!envelope && input.item.payloadChunks?.length) {
    envelope = JSON.parse(feltChunksToString(input.item.payloadChunks)) as EncryptedPayloadEnvelope;
    if (envelope.encryptedPayload === input.item.encryptedPayload) {
      await payloadStore.saveEnvelope(envelope);
    }
  }
  if (!envelope) {
    return input.item.payload ?? null;
  }
  if (envelope.payloadHash !== input.item.payloadHash) {
    throw new Error("Encrypted payload hash mismatch.");
  }
  if (envelope.algorithm !== PRIVACY_POOL_A256GCM_ALGORITHM) {
    throw new Error("Encrypted payload was not produced by the Privacy Pool message encryption adapter.");
  }

  const nonce = base64ToBytes(envelope.nonce);
  if (nonce.byteLength !== NONCE_BYTES) {
    throw new Error("Invalid AES-GCM nonce length.");
  }

  const plaintext = await subtle.decrypt(
    aesGcmParams(nonce, input.context),
    input.key,
    bytesToArrayBuffer(base64ToBytes(envelope.ciphertext)),
  );

  return JSON.parse(textDecoder.decode(plaintext)) as VeilTimelinePayload;
}

export class PrivacyPoolChannelEncryptionAdapter implements EncryptionAdapter {
  readonly #config: PrivacyPoolChannelEncryptionAdapterConfig;
  readonly #payloadStore: EncryptedPayloadStore;
  #keyPromise: Promise<CryptoKey> | undefined;

  constructor(config: PrivacyPoolChannelEncryptionAdapterConfig) {
    this.#config = config;
    this.#payloadStore = config.payloadStore ?? createDefaultEncryptedPayloadStore();
  }

  async encryptPayload(payload: VeilTimelinePayload, context?: EncryptionContext): Promise<EncryptedPayload> {
    const input: EncryptMessageInput = {
      payload,
      key: await this.#key(),
      payloadStore: this.#payloadStore,
    };
    if (context) input.context = context;
    if (this.#config.keyId) input.keyId = this.#config.keyId;
    if (this.#config.now) input.now = this.#config.now;
    return encryptMessage(input);
  }

  async decryptPayload(item: TimelineItem, context?: EncryptionContext): Promise<VeilTimelinePayload | null> {
    const input: DecryptMessageInput = {
      item,
      key: await this.#key(),
      payloadStore: this.#payloadStore,
    };
    if (context) input.context = context;
    return decryptMessage(input);
  }

  #key(): Promise<CryptoKey> {
    this.#keyPromise ??= deriveSharedSecret(this.#config);
    return this.#keyPromise;
  }
}

export class EcdhChannelEncryptionAdapter extends PrivacyPoolChannelEncryptionAdapter {}

export function validateTimelineNonces(items: readonly TimelineItem[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    const nonce = item.nonce;
    if (!nonce) {
      continue;
    }

    const key = `${item.channelId}:${item.mode ?? "unshield"}:${nonce}`;
    if (seen.has(key)) {
      throw new Error(`Replay protection failed: duplicate nonce in channel ${item.channelId}.`);
    }
    seen.add(key);
  }
}
