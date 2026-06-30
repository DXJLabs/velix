export interface EncryptedPayloadEnvelope {
  version: 1;
  algorithm: "AES-GCM" | "ECDH-HKDF-SHA-256+A256GCM" | "STRK20-PRIVACY-POOL-HKDF-SHA-256+A256GCM";
  encryptedPayload: string;
  payloadHash: string;
  ciphertext: string;
  nonce: string;
  createdAt: number;
  channelId?: string;
  eventType?: number;
  keyId?: string;
}

export interface EncryptedPayloadStore {
  saveEnvelope(envelope: EncryptedPayloadEnvelope): Promise<void>;
  loadEnvelope(encryptedPayload: string): Promise<EncryptedPayloadEnvelope | null>;
  deleteEnvelope(encryptedPayload: string): Promise<void>;
  clear(): Promise<void>;
}

const DEFAULT_DATABASE_NAME = "veil-encrypted-payload-store";
const DEFAULT_STORE_NAME = "payloads";

function hasIndexedDb(): boolean {
  return typeof globalThis.indexedDB !== "undefined";
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.oncomplete = () => resolve();
  });
}

export class MemoryEncryptedPayloadStore implements EncryptedPayloadStore {
  readonly #payloads = new Map<string, EncryptedPayloadEnvelope>();

  async saveEnvelope(envelope: EncryptedPayloadEnvelope): Promise<void> {
    this.#payloads.set(envelope.encryptedPayload, envelope);
  }

  async loadEnvelope(encryptedPayload: string): Promise<EncryptedPayloadEnvelope | null> {
    return this.#payloads.get(encryptedPayload) ?? null;
  }

  async deleteEnvelope(encryptedPayload: string): Promise<void> {
    this.#payloads.delete(encryptedPayload);
  }

  async clear(): Promise<void> {
    this.#payloads.clear();
  }
}

export class BrowserEncryptedPayloadStore implements EncryptedPayloadStore {
  readonly #databaseName: string;
  readonly #storeName: string;
  #databasePromise: Promise<IDBDatabase> | undefined;

  constructor(options: { databaseName?: string; storeName?: string } = {}) {
    this.#databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
    this.#storeName = options.storeName ?? DEFAULT_STORE_NAME;
  }

  async saveEnvelope(envelope: EncryptedPayloadEnvelope): Promise<void> {
    const { store, transaction } = await this.#writableObjectStore();
    store.put(envelope, envelope.encryptedPayload);
    await transactionDone(transaction);
  }

  async loadEnvelope(encryptedPayload: string): Promise<EncryptedPayloadEnvelope | null> {
    const store = await this.#objectStore("readonly");
    const envelope = await requestToPromise<EncryptedPayloadEnvelope | undefined>(
      store.get(encryptedPayload) as IDBRequest<EncryptedPayloadEnvelope | undefined>,
    );
    return envelope ?? null;
  }

  async deleteEnvelope(encryptedPayload: string): Promise<void> {
    const { store, transaction } = await this.#writableObjectStore();
    store.delete(encryptedPayload);
    await transactionDone(transaction);
  }

  async clear(): Promise<void> {
    const { store, transaction } = await this.#writableObjectStore();
    store.clear();
    await transactionDone(transaction);
  }

  async #objectStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const database = await this.#database();
    return database.transaction(this.#storeName, mode).objectStore(this.#storeName);
  }

  async #writableObjectStore(): Promise<{ store: IDBObjectStore; transaction: IDBTransaction }> {
    const database = await this.#database();
    const transaction = database.transaction(this.#storeName, "readwrite");
    return { store: transaction.objectStore(this.#storeName), transaction };
  }

  async #database(): Promise<IDBDatabase> {
    if (!hasIndexedDb()) {
      throw new Error("BrowserEncryptedPayloadStore requires IndexedDB.");
    }

    this.#databasePromise ??= new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(this.#databaseName, 1);
      request.onerror = () => reject(request.error ?? new Error("Failed to open encrypted payload database."));
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(this.#storeName)) {
          database.createObjectStore(this.#storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
    });

    return this.#databasePromise;
  }
}

export function createDefaultEncryptedPayloadStore(): EncryptedPayloadStore {
  return hasIndexedDb() ? new BrowserEncryptedPayloadStore() : new MemoryEncryptedPayloadStore();
}
