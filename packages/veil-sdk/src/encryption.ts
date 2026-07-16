import type { EncryptedPayload, EncryptionAdapter, TimelineItem, VeilTimelinePayload } from "./types";
import { feltChunksToString, stringToFeltChunks } from "./payload-chunks";

const FELT_MODULUS = 2n ** 251n + 17n * 2n ** 192n + 1n;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  const binary = [...bytes].map((byte) => String.fromCharCode(byte)).join("");
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function feltFromHex(hex: string): string {
  const value = BigInt(`0x${hex}`) % FELT_MODULUS;
  return value.toString();
}

function fallbackHash(value: string): string {
  let hash = 1469598103934665603n;
  for (const byte of textEncoder.encode(value)) {
    hash ^= BigInt(byte);
    hash = (hash * 1099511628211n) % FELT_MODULUS;
  }
  return hash.toString();
}

export async function hashToFelt(value: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", textEncoder.encode(value));
    return feltFromHex(bytesToHex(new Uint8Array(digest)));
  }

  return fallbackHash(value);
}

export class MockEncryptionAdapter implements EncryptionAdapter {
  readonly #payloadCache = new Map<string, VeilTimelinePayload>();

  async encryptPayload(payload: VeilTimelinePayload): Promise<EncryptedPayload> {
    const serializedPayload = JSON.stringify(payload);
    const ciphertext = bytesToBase64(textEncoder.encode(serializedPayload));
    const encryptedPayload = await hashToFelt(`veil:encrypted:${ciphertext}`);
    const envelopeHash = await hashToFelt(`veil:payload:${serializedPayload}`);
    const payloadChunks = stringToFeltChunks(JSON.stringify({
      version: 1,
      algorithm: "mock-base64",
      encryptedPayload,
      envelopeHash,
      payloadHash: envelopeHash,
      ciphertext,
    }));

    this.#payloadCache.set(encryptedPayload, payload);

    return { encryptedPayload, payloadHash: envelopeHash, envelopeHash, payloadChunks };
  }

  async decryptPayload(item: TimelineItem): Promise<VeilTimelinePayload | null> {
    const cached = this.#payloadCache.get(item.encryptedPayload) ?? item.payload;
    if (cached) return cached;

    if (item.payloadChunks?.length) {
      const envelope = JSON.parse(feltChunksToString(item.payloadChunks)) as {
        algorithm?: string;
        ciphertext?: string;
      };
      if (envelope.algorithm === "mock-base64" && envelope.ciphertext) {
        const payload = JSON.parse(textDecoder.decode(base64ToBytes(envelope.ciphertext))) as VeilTimelinePayload;
        this.#payloadCache.set(item.encryptedPayload, payload);
        return payload;
      }
    }

    return null;
  }

  importPayload(encryptedPayload: string, encodedPayload: string): VeilTimelinePayload {
    const payload = JSON.parse(textDecoder.decode(base64ToBytes(encodedPayload))) as VeilTimelinePayload;
    this.#payloadCache.set(encryptedPayload, payload);
    return payload;
  }
}
