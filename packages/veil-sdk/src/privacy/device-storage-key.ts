import { VeilPrivacyError } from "./errors.js";
import { generateDeviceStorageKey } from "./profile-store.js";

const DEVICE_KEY_DB_VERSION = 1;
const DEVICE_KEY_STORE = "device-keys";
const DEFAULT_DEVICE_KEY_ID = "veil-device-aes-gcm-v1";

interface DeviceStorageKeyRecord {
  id: string;
  version: number;
  key: CryptoKey;
  createdAt: number;
}

export interface DeviceStorageKeyRepository {
  get(id: string): Promise<CryptoKey | undefined>;
  put(id: string, key: CryptoKey): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface BrowserIndexedDbDeviceStorageKeyRepositoryConfig {
  databaseName?: string;
  indexedDb?: IDBFactory;
  now?: () => number;
}

export class BrowserIndexedDbDeviceStorageKeyRepository
implements DeviceStorageKeyRepository {
  readonly #databaseName: string;
  readonly #indexedDb: IDBFactory;
  readonly #now: () => number;

  constructor(config: BrowserIndexedDbDeviceStorageKeyRepositoryConfig = {}) {
    this.#databaseName = config.databaseName ?? "veil-device-storage-key-v1";
    const indexedDb = config.indexedDb ?? globalThis.indexedDB;
    if (!indexedDb) {
      throw new VeilPrivacyError(
        "REGISTRY_CORRUPTED",
        "Persistent device-key storage is unavailable.",
      );
    }
    this.#indexedDb = indexedDb;
    this.#now = config.now ?? (() => Date.now());
  }

  async get(id: string): Promise<CryptoKey | undefined> {
    const record = await this.#read(requiredKeyId(id));
    if (!record) return undefined;
    if (
      record.id !== id
      || record.version !== DEVICE_KEY_DB_VERSION
      || !(record.key instanceof CryptoKey)
    ) {
      throw new VeilPrivacyError(
        "REGISTRY_CORRUPTED",
        "Persistent device-key record is malformed.",
      );
    }
    return record.key;
  }

  async put(id: string, key: CryptoKey): Promise<void> {
    const normalizedId = requiredKeyId(id);
    validateDeviceStorageKey(key);
    const database = await this.#open();
    await transactionPromise(
      database,
      "readwrite",
      (store) => store.put({
        id: normalizedId,
        version: DEVICE_KEY_DB_VERSION,
        key,
        createdAt: this.#now(),
      } satisfies DeviceStorageKeyRecord),
    );
    database.close();
  }

  async delete(id: string): Promise<void> {
    const database = await this.#open();
    await transactionPromise(
      database,
      "readwrite",
      (store) => store.delete(requiredKeyId(id)),
    );
    database.close();
  }

  async #read(id: string): Promise<DeviceStorageKeyRecord | undefined> {
    const database = await this.#open();
    const result = await transactionPromise(
      database,
      "readonly",
      (store) => store.get(id),
    );
    database.close();
    return result as DeviceStorageKeyRecord | undefined;
  }

  #open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.#indexedDb.open(
        this.#databaseName,
        DEVICE_KEY_DB_VERSION,
      );
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DEVICE_KEY_STORE)) {
          request.result.createObjectStore(
            DEVICE_KEY_STORE,
            { keyPath: "id" },
          );
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(
        new VeilPrivacyError(
          "REGISTRY_CORRUPTED",
          "Unable to open persistent device-key storage.",
          { cause: request.error },
        ),
      );
    });
  }
}

export interface PersistentDeviceStorageKeyProviderConfig {
  repository: DeviceStorageKeyRepository;
  crypto?: Crypto;
  keyId?: string;
}

export class PersistentDeviceStorageKeyProvider {
  readonly #repository: DeviceStorageKeyRepository;
  readonly #crypto: Crypto;
  readonly #keyId: string;
  #pending: Promise<CryptoKey> | undefined;

  constructor(config: PersistentDeviceStorageKeyProviderConfig) {
    this.#repository = config.repository;
    const crypto = config.crypto ?? globalThis.crypto;
    if (!crypto?.subtle) {
      throw new VeilPrivacyError(
        "REGISTRY_CORRUPTED",
        "WebCrypto is unavailable for persistent device-key storage.",
      );
    }
    this.#crypto = crypto;
    this.#keyId = requiredKeyId(
      config.keyId ?? DEFAULT_DEVICE_KEY_ID,
    );
  }

  getDeviceStorageKey(): Promise<CryptoKey> {
    if (!this.#pending) {
      this.#pending = this.#loadOrCreate().catch((error: unknown) => {
        this.#pending = undefined;
        throw error;
      });
    }
    return this.#pending;
  }

  async deleteDeviceStorageKey(): Promise<void> {
    this.#pending = undefined;
    await this.#repository.delete(this.#keyId);
  }

  async #loadOrCreate(): Promise<CryptoKey> {
    const existing = await this.#repository.get(this.#keyId);
    if (existing) {
      validateDeviceStorageKey(existing);
      return existing;
    }

    const generated = await generateDeviceStorageKey(this.#crypto);
    validateDeviceStorageKey(generated);
    await this.#repository.put(this.#keyId, generated);

    const persisted = await this.#repository.get(this.#keyId);
    if (!persisted) {
      throw new VeilPrivacyError(
        "REGISTRY_CORRUPTED",
        "Generated device storage key was not persisted.",
      );
    }
    validateDeviceStorageKey(persisted);
    return persisted;
  }
}

export function createPersistentDeviceStorageKeyGetter(
  config: PersistentDeviceStorageKeyProviderConfig,
): () => Promise<CryptoKey> {
  const provider = new PersistentDeviceStorageKeyProvider(config);
  return () => provider.getDeviceStorageKey();
}

export function validateDeviceStorageKey(
  key: CryptoKey,
): asserts key is CryptoKey {
  if (
    !(key instanceof CryptoKey)
    || key.type !== "secret"
    || key.algorithm.name !== "AES-GCM"
    || key.extractable
    || !key.usages.includes("encrypt")
    || !key.usages.includes("decrypt")
  ) {
    throw new VeilPrivacyError(
      "REGISTRY_CORRUPTED",
      "Device storage key must be non-extractable AES-GCM with encrypt/decrypt usage.",
    );
  }
}

function requiredKeyId(value: string): string {
  const normalized = value.trim();
  if (!normalized || /[\u0000-\u001f]/u.test(normalized)) {
    throw new VeilPrivacyError(
      "REGISTRY_CORRUPTED",
      "Persistent device-key identifier is invalid.",
    );
  }
  return normalized;
}

function transactionPromise(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DEVICE_KEY_STORE, mode);
    const request = operation(transaction.objectStore(DEVICE_KEY_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
