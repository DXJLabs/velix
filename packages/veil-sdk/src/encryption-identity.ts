import { derivePrivacyPublicKey, generatePrivacyScalar } from "./privacy_pool_ecdh";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const WRAPPING_KEY_ID = "wrapping-key";
const ACTIVE_VERSION_ID = "active-version";

export interface EncryptionIdentityRecord {
  version: number;
  publicKey: string;
  encryptedPrivateScalar: string;
  iv: string;
  createdAt: number;
}

export interface EncryptionIdentityStore {
  loadWrappingKey(): Promise<CryptoKey | null>;
  saveWrappingKey(key: CryptoKey): Promise<void>;
  loadRecord(version: number): Promise<EncryptionIdentityRecord | null>;
  saveRecord(record: EncryptionIdentityRecord): Promise<void>;
  loadActiveVersion(): Promise<number | null>;
  saveActiveVersion(version: number): Promise<void>;
}

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function bytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function buffer(value: Uint8Array): ArrayBuffer {
  const result = new ArrayBuffer(value.byteLength);
  new Uint8Array(result).set(value);
  return result;
}

function aad(version: number, publicKey: string): Uint8Array {
  return encoder.encode(`veil:encryption-identity:v1:${version}:${publicKey}`);
}

export class MemoryEncryptionIdentityStore implements EncryptionIdentityStore {
  wrappingKey: CryptoKey | null = null;
  activeVersion: number | null = null;
  readonly records = new Map<number, EncryptionIdentityRecord>();
  async loadWrappingKey() { return this.wrappingKey; }
  async saveWrappingKey(key: CryptoKey) { this.wrappingKey = key; }
  async loadRecord(version: number) { return this.records.get(version) ?? null; }
  async saveRecord(record: EncryptionIdentityRecord) { this.records.set(record.version, structuredClone(record)); }
  async loadActiveVersion() { return this.activeVersion; }
  async saveActiveVersion(version: number) { this.activeVersion = version; }
}

export class BrowserEncryptionIdentityStore implements EncryptionIdentityStore {
  readonly #databaseName: string;
  #databasePromise: Promise<IDBDatabase> | undefined;
  constructor(databaseName = "veil-encryption-identity-v1") { this.#databaseName = databaseName; }
  async loadWrappingKey() { return (await this.#get<CryptoKey>(WRAPPING_KEY_ID)) ?? null; }
  async saveWrappingKey(key: CryptoKey) { await this.#put(WRAPPING_KEY_ID, key); }
  async loadRecord(version: number) { return (await this.#get<EncryptionIdentityRecord>(`identity:${version}`)) ?? null; }
  async saveRecord(record: EncryptionIdentityRecord) { await this.#put(`identity:${record.version}`, record); }
  async loadActiveVersion() { return (await this.#get<number>(ACTIVE_VERSION_ID)) ?? null; }
  async saveActiveVersion(version: number) { await this.#put(ACTIVE_VERSION_ID, version); }
  async #get<T>(key: string): Promise<T | undefined> {
    const db = await this.#database();
    return new Promise((resolve, reject) => {
      const request = db.transaction("identity", "readonly").objectStore("identity").get(key);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed."));
      request.onsuccess = () => resolve(request.result as T | undefined);
    });
  }
  async #put(key: string, value: unknown): Promise<void> {
    const db = await this.#database();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("identity", "readwrite");
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed."));
      transaction.oncomplete = () => resolve();
      transaction.objectStore("identity").put(value, key);
    });
  }
  async #database(): Promise<IDBDatabase> {
    if (!globalThis.indexedDB) throw new Error("Encryption identity storage requires IndexedDB.");
    this.#databasePromise ??= new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(this.#databaseName, 1);
      request.onerror = () => reject(request.error ?? new Error("Failed to open encryption identity database."));
      request.onupgradeneeded = () => request.result.createObjectStore("identity");
      request.onsuccess = () => resolve(request.result);
    });
    return this.#databasePromise;
  }
}

export class VeilEncryptionIdentityService {
  readonly #store: EncryptionIdentityStore;
  readonly #now: () => number;
  constructor(store: EncryptionIdentityStore, now = () => Date.now()) { this.#store = store; this.#now = now; }

  async getOrCreateIdentity(): Promise<Pick<EncryptionIdentityRecord, "version" | "publicKey" | "createdAt">> {
    const active = await this.#store.loadActiveVersion();
    if (active !== null) return this.#publicRecord(await this.#requiredRecord(active));
    return this.rotateIdentity();
  }

  async rotateIdentity(): Promise<Pick<EncryptionIdentityRecord, "version" | "publicKey" | "createdAt">> {
    const version = (await this.#store.loadActiveVersion() ?? 0) + 1;
    const privateScalar = generatePrivacyScalar();
    const publicKey = derivePrivacyPublicKey(privateScalar);
    const wrappingKey = await this.#wrappingKey();
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = new Uint8Array(await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: buffer(iv), additionalData: buffer(aad(version, publicKey)) },
      wrappingKey,
      buffer(encoder.encode(privateScalar)),
    ));
    const record: EncryptionIdentityRecord = {
      version, publicKey, encryptedPrivateScalar: base64(encrypted), iv: base64(iv), createdAt: this.#now(),
    };
    await this.#store.saveRecord(record);
    await this.#store.saveActiveVersion(version);
    return this.#publicRecord(record);
  }

  async withPrivateScalar<T>(version: number | undefined, operation: (scalar: string, record: EncryptionIdentityRecord) => Promise<T> | T): Promise<T> {
    const selected = version ?? await this.#store.loadActiveVersion();
    if (selected === null) throw identityError("LOCAL_ENCRYPTION_IDENTITY_MISSING", "Local encryption identity is missing.");
    const record = await this.#requiredRecord(selected);
    const decrypted = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: buffer(bytes(record.iv)), additionalData: buffer(aad(record.version, record.publicKey)) },
      await this.#wrappingKey(),
      buffer(bytes(record.encryptedPrivateScalar)),
    );
    return operation(decoder.decode(decrypted), record);
  }

  async #wrappingKey(): Promise<CryptoKey> {
    const existing = await this.#store.loadWrappingKey();
    if (existing) return existing;
    const key = await globalThis.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await this.#store.saveWrappingKey(key);
    return key;
  }
  async #requiredRecord(version: number) {
    const record = await this.#store.loadRecord(version);
    if (!record) throw identityError("LOCAL_ENCRYPTION_IDENTITY_MISSING", "Local encryption identity is missing.");
    return record;
  }
  #publicRecord(record: EncryptionIdentityRecord) {
    return { version: record.version, publicKey: record.publicKey, createdAt: record.createdAt };
  }
}

export function identityError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}
