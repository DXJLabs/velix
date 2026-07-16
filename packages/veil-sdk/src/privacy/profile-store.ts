import { VeilPrivacyError } from "./errors.js";
import type { PrivacyNamespace } from "./namespace.js";

const PROFILE_DB_VERSION = 1;
const PROFILE_STORE = "encrypted-profiles";
const AES_GCM_IV_BYTES = 12;

interface EncryptedProfileRecord {
  namespaceKey: string;
  version: number;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
  updatedAt: number;
}

export interface EncryptedPrivacyProfileStore {
  get(namespace: PrivacyNamespace): Promise<Uint8Array | undefined>;
  put(namespace: PrivacyNamespace, serializedRegistry: Uint8Array): Promise<void>;
  delete(namespace: PrivacyNamespace): Promise<void>;
}

export interface BrowserEncryptedPrivacyProfileStoreConfig {
  getDeviceStorageKey(): Promise<CryptoKey>;
  databaseName?: string;
  indexedDb?: IDBFactory;
  crypto?: Crypto;
  now?: () => number;
}

export class BrowserEncryptedPrivacyProfileStore implements EncryptedPrivacyProfileStore {
  readonly #getDeviceStorageKey: () => Promise<CryptoKey>;
  readonly #databaseName: string;
  readonly #indexedDb: IDBFactory;
  readonly #crypto: Crypto;
  readonly #now: () => number;

  constructor(config: BrowserEncryptedPrivacyProfileStoreConfig) {
    this.#getDeviceStorageKey = config.getDeviceStorageKey;
    this.#databaseName = config.databaseName ?? "veil-private-profile-v1";
    const indexedDb = config.indexedDb ?? globalThis.indexedDB;
    const crypto = config.crypto ?? globalThis.crypto;
    if (!indexedDb || !crypto?.subtle) {
      throw new VeilPrivacyError("REGISTRY_CORRUPTED", "Encrypted IndexedDB profile storage is unavailable.");
    }
    this.#indexedDb = indexedDb;
    this.#crypto = crypto;
    this.#now = config.now ?? (() => Date.now());
  }

  async get(namespace: PrivacyNamespace): Promise<Uint8Array | undefined> {
    const record = await this.#read(namespace.key);
    if (!record) return undefined;
    if (record.version !== namespace.version || record.namespaceKey !== namespace.key) {
      throw new VeilPrivacyError("REGISTRY_CORRUPTED", "Encrypted privacy profile namespace/version mismatch.");
    }
    try {
      const plaintext = await this.#crypto.subtle.decrypt(
        { name: "AES-GCM", iv: record.iv, additionalData: encode(namespace.key) },
        await this.#validatedKey(),
        record.ciphertext,
      );
      return new Uint8Array(plaintext);
    } catch (cause) {
      throw new VeilPrivacyError(
        "REGISTRY_CORRUPTED",
        "Encrypted privacy profile authentication failed; rebuild from discovery where possible.",
        { cause },
      );
    }
  }

  async put(namespace: PrivacyNamespace, serializedRegistry: Uint8Array): Promise<void> {
    if (!(serializedRegistry instanceof Uint8Array) || serializedRegistry.byteLength === 0) {
      throw new VeilPrivacyError("REGISTRY_CORRUPTED", "Serialized private registry must be non-empty bytes.");
    }
    const iv = this.#crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES)).buffer as ArrayBuffer;
    const ciphertext = await this.#crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: encode(namespace.key) },
      await this.#validatedKey(),
      toArrayBuffer(serializedRegistry),
    );
    const record: EncryptedProfileRecord = {
      namespaceKey: namespace.key,
      version: namespace.version,
      iv,
      ciphertext,
      updatedAt: this.#now(),
    };
    await this.#write(record);
  }

  async delete(namespace: PrivacyNamespace): Promise<void> {
    const database = await this.#open();
    await transactionPromise(database, "readwrite", (store) => store.delete(namespace.key));
    database.close();
  }

  async #validatedKey(): Promise<CryptoKey> {
    const key = await this.#getDeviceStorageKey();
    if (key.algorithm.name !== "AES-GCM" || !key.usages.includes("encrypt") || !key.usages.includes("decrypt")) {
      throw new VeilPrivacyError("REGISTRY_CORRUPTED", "Device storage key must be AES-GCM with encrypt/decrypt usage.");
    }
    return key;
  }

  async #read(namespaceKey: string): Promise<EncryptedProfileRecord | undefined> {
    const database = await this.#open();
    const result = await transactionPromise(database, "readonly", (store) => store.get(namespaceKey));
    database.close();
    return result as EncryptedProfileRecord | undefined;
  }

  async #write(record: EncryptedProfileRecord): Promise<void> {
    const database = await this.#open();
    await transactionPromise(database, "readwrite", (store) => store.put(record));
    database.close();
  }

  #open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.#indexedDb.open(this.#databaseName, PROFILE_DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(PROFILE_STORE)) {
          request.result.createObjectStore(PROFILE_STORE, { keyPath: "namespaceKey" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new VeilPrivacyError("REGISTRY_CORRUPTED", "Unable to open encrypted profile store.", { cause: request.error }));
    });
  }
}

export async function generateDeviceStorageKey(crypto: Crypto = globalThis.crypto): Promise<CryptoKey> {
  if (!crypto?.subtle) throw new Error("WebCrypto is unavailable.");
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

function encode(value: string): ArrayBuffer {
  return toArrayBuffer(new TextEncoder().encode(value));
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer as ArrayBuffer;
}

function transactionPromise(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PROFILE_STORE, mode);
    const request = operation(transaction.objectStore(PROFILE_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
