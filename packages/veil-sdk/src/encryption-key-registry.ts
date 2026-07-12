import type { StarknetAccountLike, StarknetProviderLike } from "./types";
import { deriveReceiverSharedX } from "./privacy_pool_ecdh";
import { identityError, type VeilEncryptionIdentityService } from "./encryption-identity";

const ADDRESS = /^0x[0-9a-fA-F]{1,64}$/;

function isValidAddress(value: string): boolean {
  try {
    return ADDRESS.test(value) && BigInt(value) > 0n;
  } catch {
    return false;
  }
}

export interface ResolvedEncryptionPublicKey {
  accountAddress: string;
  publicKey: string;
  version: number;
}

export class EncryptionPublicKeyRegistryService {
  readonly #registryAddress: string;
  readonly #provider: StarknetProviderLike;
  readonly #identity: VeilEncryptionIdentityService;
  constructor(input: { registryAddress: string; provider: StarknetProviderLike; identity: VeilEncryptionIdentityService }) {
    if (!isValidAddress(input.registryAddress)) {
      throw identityError("ENCRYPTION_KEY_REGISTRY_UNAVAILABLE", "Encryption key registry is not configured.");
    }
    this.#registryAddress = input.registryAddress;
    this.#provider = input.provider;
    this.#identity = input.identity;
  }

  get registryAddress() { return this.#registryAddress; }
  async getLocalPublicKey() { return this.#identity.getOrCreateIdentity(); }
  buildRegistrationCall(publicKey: string) {
    validatePublicKey(publicKey);
    return { contractAddress: this.#registryAddress, entrypoint: "register_public_key", calldata: [publicKey] };
  }
  async isRegistered(accountAddress: string): Promise<boolean> {
    const remote = await this.resolveOptional(accountAddress);
    if (!remote) return false;
    const local = await this.getLocalPublicKey();
    return remote.publicKey === local.publicKey;
  }
  async registerCurrentUserKey(account: StarknetAccountLike) {
    const local = await this.getLocalPublicKey();
    return account.execute(this.buildRegistrationCall(local.publicKey));
  }
  async rotateCurrentUserKey() {
    const identity = await this.#identity.rotateIdentity();
    return { identity, call: this.buildRegistrationCall(identity.publicKey) };
  }
  async resolveRecipientPublicKey(accountAddress: string): Promise<ResolvedEncryptionPublicKey> {
    const resolved = await this.resolveOptional(accountAddress);
    if (!resolved) {
      throw identityError("RECIPIENT_ENCRYPTION_KEY_NOT_FOUND", "The recipient has not set up an encryption identity yet.");
    }
    return resolved;
  }
  async resolveOptional(accountAddress: string): Promise<ResolvedEncryptionPublicKey | null> {
    if (!isValidAddress(accountAddress)) {
      throw identityError("RECIPIENT_ENCRYPTION_KEY_INVALID", "Recipient account address is invalid.");
    }
    try {
      const [keyResult, versionResult] = await Promise.all([
        this.#provider.callContract?.({ contractAddress: this.#registryAddress, entrypoint: "get_public_key", calldata: [accountAddress] }),
        this.#provider.callContract?.({ contractAddress: this.#registryAddress, entrypoint: "get_key_version", calldata: [accountAddress] }),
      ]);
      const publicKey = firstResult(keyResult);
      const versionValue = BigInt(firstResult(versionResult) || "0");
      if (!publicKey || BigInt(publicKey) === 0n || versionValue === 0n) return null;
      if (versionValue > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw identityError("RECIPIENT_ENCRYPTION_KEY_INVALID", "Recipient encryption key version is invalid.");
      }
      const version = Number(versionValue);
      validatePublicKey(publicKey);
      return { accountAddress, publicKey, version };
    } catch (error) {
      if ((error as { code?: string }).code === "RECIPIENT_ENCRYPTION_KEY_INVALID") throw error;
      throw identityError("ENCRYPTION_KEY_REGISTRY_UNAVAILABLE", "Encryption key registry could not be read.");
    }
  }
}

function firstResult(result: unknown): string {
  const values = Array.isArray(result) ? result : (result as { result?: unknown[] } | undefined)?.result;
  const value = values?.[0];
  return value === undefined ? "" : String(value);
}

export function validatePublicKey(publicKey: string): void {
  try {
    if (!publicKey || BigInt(publicKey) === 0n) throw new Error();
    deriveReceiverSharedX("1", publicKey);
  } catch {
    throw identityError("RECIPIENT_ENCRYPTION_KEY_INVALID", "The recipient encryption public key is invalid.");
  }
}
