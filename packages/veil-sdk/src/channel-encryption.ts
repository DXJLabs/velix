import {
  type EncryptedPayloadEnvelope,
  type EncryptedPayloadStore,
  createDefaultEncryptedPayloadStore,
} from "./encrypted-payload-store";
import { hashToFelt } from "./encryption";
import {
  type EncryptedPayload,
  type EncryptionAdapter,
  type EncryptionContext,
  type TimelineItem,
  type VeilTimelinePayload,
} from "./types";
import { feltChunksToString, stringToFeltChunks } from "./payload-chunks";

const AES_GCM_ALGORITHM = "AES-GCM";
const NONCE_BYTES = 12;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type ChannelKeyMaterial = CryptoKey | JsonWebKey | Uint8Array | ArrayBuffer | string;

export interface ChannelEncryptionAdapterConfig {
  channelKey: ChannelKeyMaterial;
  payloadStore?: EncryptedPayloadStore;
  keyId?: string;
  now?: () => number;
}

function bytesToBase64(bytes: Uint8Array): string {
  const binary = [...bytes].map((byte) => String.fromCharCode(byte)).join("");
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return base64ToBytes(padded);
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function hexToBytes(value: string): Uint8Array {
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("Invalid hex channel key.");
  }

  return Uint8Array.from(hex.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}

function stringKeyToBytes(value: string): Uint8Array {
  const trimmed = value.trim();
  if (trimmed.startsWith("0x")) {
    return hexToBytes(trimmed);
  }

  try {
    const decoded = base64ToBytes(trimmed);
    if (decoded.byteLength === 16 || decoded.byteLength === 24 || decoded.byteLength === 32) {
      return decoded;
    }
  } catch {
    // Fall back to UTF-8 below.
  }

  return textEncoder.encode(trimmed);
}

function assertAesKeyLength(keyBytes: Uint8Array): void {
  if (![16, 24, 32].includes(keyBytes.byteLength)) {
    throw new Error("Channel key must be 128, 192, or 256 bits for AES-GCM.");
  }
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

async function importChannelKey(key: ChannelKeyMaterial): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("ChannelEncryptionAdapter requires Web Crypto.");
  }

  if (typeof CryptoKey !== "undefined" && key instanceof CryptoKey) {
    return key;
  }

  if (key instanceof ArrayBuffer) {
    const bytes = new Uint8Array(key);
    assertAesKeyLength(bytes);
    return globalThis.crypto.subtle.importKey("raw", bytesToArrayBuffer(bytes), AES_GCM_ALGORITHM, false, [
      "encrypt",
      "decrypt",
    ]);
  }

  if (key instanceof Uint8Array) {
    assertAesKeyLength(key);
    return globalThis.crypto.subtle.importKey("raw", bytesToArrayBuffer(key), AES_GCM_ALGORITHM, false, [
      "encrypt",
      "decrypt",
    ]);
  }

  if (typeof key === "string") {
    const bytes = stringKeyToBytes(key);
    assertAesKeyLength(bytes);
    return globalThis.crypto.subtle.importKey("raw", bytesToArrayBuffer(bytes), AES_GCM_ALGORITHM, false, [
      "encrypt",
      "decrypt",
    ]);
  }

  const jwk = key as JsonWebKey;
  if (typeof jwk.k !== "string") {
    throw new Error("AES-GCM JWK channel key must contain a symmetric k field.");
  }

  const bytes = base64UrlToBytes(jwk.k);
  assertAesKeyLength(bytes);
  return globalThis.crypto.subtle.importKey("raw", bytesToArrayBuffer(bytes), AES_GCM_ALGORITHM, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function generateChannelKey(): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("generateChannelKey requires Web Crypto.");
  }

  return globalThis.crypto.subtle.generateKey({ name: AES_GCM_ALGORITHM, length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportChannelKey(key: CryptoKey): Promise<JsonWebKey> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("exportChannelKey requires Web Crypto.");
  }

  return globalThis.crypto.subtle.exportKey("jwk", key);
}

export class ChannelEncryptionAdapter implements EncryptionAdapter {
  readonly #keyPromise: Promise<CryptoKey>;
  readonly #payloadStore: EncryptedPayloadStore;
  readonly #keyId: string | undefined;
  readonly #now: () => number;

  constructor(config: ChannelEncryptionAdapterConfig) {
    this.#keyPromise = importChannelKey(config.channelKey);
    this.#payloadStore = config.payloadStore ?? createDefaultEncryptedPayloadStore();
    this.#keyId = config.keyId;
    this.#now = config.now ?? (() => Date.now());
  }

  async encryptPayload(payload: VeilTimelinePayload, context?: EncryptionContext): Promise<EncryptedPayload> {
    if (!globalThis.crypto?.getRandomValues || !globalThis.crypto.subtle) {
      throw new Error("ChannelEncryptionAdapter requires Web Crypto.");
    }

    const serializedPayload = JSON.stringify(payload);
    const nonce = globalThis.crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
    const ciphertextBytes = new Uint8Array(
      await globalThis.crypto.subtle.encrypt(
        aesGcmParams(nonce, context),
        await this.#keyPromise,
        bytesToArrayBuffer(textEncoder.encode(serializedPayload)),
      ),
    );
    const ciphertext = bytesToBase64(ciphertextBytes);
    const nonceValue = bytesToBase64(nonce);
    const payloadHash = await hashToFelt(`veil:ciphertext:${ciphertext}`);
    const encryptedPayload = await hashToFelt(`veil:payload-ref:${payloadHash}:${nonceValue}`);
    const envelope: EncryptedPayloadEnvelope = {
      version: 1,
      algorithm: AES_GCM_ALGORITHM,
      encryptedPayload,
      payloadHash,
      ciphertext,
      nonce: nonceValue,
      createdAt: this.#now(),
    };
    if (context) {
      envelope.channelId = context.channelId;
      envelope.eventType = context.eventType;
    }
    if (this.#keyId) {
      envelope.keyId = this.#keyId;
    }

    await this.#payloadStore.saveEnvelope(envelope);
    return { encryptedPayload, payloadHash, nonce: nonceValue, payloadChunks: stringToFeltChunks(JSON.stringify(envelope)) };
  }

  async decryptPayload(item: TimelineItem, context?: EncryptionContext): Promise<VeilTimelinePayload | null> {
    if (!globalThis.crypto?.subtle) {
      throw new Error("ChannelEncryptionAdapter requires Web Crypto.");
    }

    let envelope = await this.#payloadStore.loadEnvelope(item.encryptedPayload);
    if (!envelope && item.payloadChunks?.length) {
      envelope = JSON.parse(feltChunksToString(item.payloadChunks)) as EncryptedPayloadEnvelope;
      if (envelope.encryptedPayload === item.encryptedPayload) {
        await this.#payloadStore.saveEnvelope(envelope);
      }
    }
    if (!envelope) {
      return item.payload ?? null;
    }

    if (envelope.payloadHash !== item.payloadHash) {
      throw new Error("Encrypted payload hash mismatch.");
    }

    const nonce = base64ToBytes(envelope.nonce);
    if (nonce.byteLength !== NONCE_BYTES) {
      throw new Error("Invalid AES-GCM nonce length.");
    }

    const plaintext = await globalThis.crypto.subtle.decrypt(
      aesGcmParams(nonce, context),
      await this.#keyPromise,
      bytesToArrayBuffer(base64ToBytes(envelope.ciphertext)),
    );

    return JSON.parse(textDecoder.decode(plaintext)) as VeilTimelinePayload;
  }
}
