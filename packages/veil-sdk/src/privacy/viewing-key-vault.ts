import type { ViewingKeyProvider } from "@starkware-libs/starknet-privacy-sdk";
import { VeilPrivacyError } from "./errors.js";
import type { PrivacyNamespace } from "./namespace.js";
import type { EncryptedPrivacyProfileStore } from "./profile-store.js";
import { assertViewingKey } from "./viewing-key.js";

const VIEWING_KEY_BYTES = 32;
const VIEWING_KEY_NAMESPACE_SUFFIX = ":viewing-key:v1";

export interface EncryptedViewingKeyVault {
  get(namespace: PrivacyNamespace): Promise<bigint | undefined>;
  put(namespace: PrivacyNamespace, viewingKey: bigint): Promise<void>;
  delete(namespace: PrivacyNamespace): Promise<void>;
  createProvider(namespace: PrivacyNamespace): ViewingKeyProvider;
}

export class PrivacyProfileViewingKeyVault implements EncryptedViewingKeyVault {
  readonly #store: EncryptedPrivacyProfileStore;

  constructor(store: EncryptedPrivacyProfileStore) {
    this.#store = store;
  }

  async get(namespace: PrivacyNamespace): Promise<bigint | undefined> {
    const bytes = await this.#store.get(viewingKeyNamespace(namespace));
    if (bytes === undefined) return undefined;
    if (bytes.byteLength !== VIEWING_KEY_BYTES) {
      throw new VeilPrivacyError(
        "REGISTRY_CORRUPTED",
        "Encrypted viewing-key record has an invalid length.",
      );
    }

    const viewingKey = bytesToBigint(bytes);
    try {
      assertViewingKey(viewingKey);
    } catch (cause) {
      throw new VeilPrivacyError(
        "REGISTRY_CORRUPTED",
        "Encrypted viewing-key record is outside the official SDK range.",
        { cause },
      );
    }
    return viewingKey;
  }

  async put(namespace: PrivacyNamespace, viewingKey: bigint): Promise<void> {
    assertViewingKey(viewingKey);
    await this.#store.put(
      viewingKeyNamespace(namespace),
      bigintToBytes(viewingKey),
    );
  }

  async delete(namespace: PrivacyNamespace): Promise<void> {
    await this.#store.delete(viewingKeyNamespace(namespace));
  }

  createProvider(namespace: PrivacyNamespace): ViewingKeyProvider {
    return {
      getViewingKey: async () => {
        const viewingKey = await this.get(namespace);
        if (viewingKey === undefined) {
          throw new VeilPrivacyError(
            "VIEWING_KEY_UNAVAILABLE",
            "No encrypted viewing key is available for this wallet, Pool, and device.",
          );
        }
        return viewingKey;
      },
    };
  }
}

export function viewingKeyNamespace(
  namespace: PrivacyNamespace,
): PrivacyNamespace {
  return {
    ...namespace,
    key: `${namespace.key}${VIEWING_KEY_NAMESPACE_SUFFIX}`,
  };
}

function bigintToBytes(value: bigint): Uint8Array {
  const bytes = new Uint8Array(VIEWING_KEY_BYTES);
  let remaining = value;
  for (let index = VIEWING_KEY_BYTES - 1; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  if (remaining !== 0n) {
    throw new VeilPrivacyError(
      "INVALID_VIEWING_KEY",
      "Viewing key does not fit the encrypted vault record.",
    );
  }
  return bytes;
}

function bytesToBigint(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}
