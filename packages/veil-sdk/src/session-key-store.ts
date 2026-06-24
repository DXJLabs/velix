import type { VeilSessionKeyStore, VeilSessionRecord } from "./session-key-types";

const DEFAULT_DATABASE_NAME = "veil-session-key-store";
const DEFAULT_STORE_NAME = "active-session";
const ACTIVE_SESSION_KEY = "active";

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

export class MemorySessionKeyStore implements VeilSessionKeyStore {
  #session: VeilSessionRecord | null = null;

  async loadActiveSession(): Promise<VeilSessionRecord | null> {
    return this.#session;
  }

  async saveActiveSession(session: VeilSessionRecord): Promise<void> {
    this.#session = session;
  }

  async removeSession(sessionId: string): Promise<void> {
    if (this.#session?.sessionId === sessionId) {
      this.#session = null;
    }
  }

  async clear(): Promise<void> {
    this.#session = null;
  }
}

export class BrowserSessionKeyStore implements VeilSessionKeyStore {
  readonly #databaseName: string;
  readonly #storeName: string;
  #databasePromise: Promise<IDBDatabase> | undefined;

  constructor(options: { databaseName?: string; storeName?: string } = {}) {
    this.#databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
    this.#storeName = options.storeName ?? DEFAULT_STORE_NAME;
  }

  async loadActiveSession(): Promise<VeilSessionRecord | null> {
    const store = await this.#objectStore("readonly");
    const session = await requestToPromise<VeilSessionRecord | undefined>(
      store.get(ACTIVE_SESSION_KEY) as IDBRequest<VeilSessionRecord | undefined>,
    );
    return session ?? null;
  }

  async saveActiveSession(session: VeilSessionRecord): Promise<void> {
    const { store, transaction } = await this.#writableObjectStore();
    store.put(session, ACTIVE_SESSION_KEY);
    await transactionDone(transaction);
  }

  async removeSession(sessionId: string): Promise<void> {
    const current = await this.loadActiveSession();
    if (current?.sessionId !== sessionId) {
      return;
    }

    const { store, transaction } = await this.#writableObjectStore();
    store.delete(ACTIVE_SESSION_KEY);
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
      throw new Error("BrowserSessionKeyStore requires IndexedDB.");
    }

    this.#databasePromise ??= new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(this.#databaseName, 1);
      request.onerror = () => reject(request.error ?? new Error("Failed to open session key database."));
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

export function createDefaultSessionKeyStore(): VeilSessionKeyStore {
  return hasIndexedDb() ? new BrowserSessionKeyStore() : new MemorySessionKeyStore();
}
