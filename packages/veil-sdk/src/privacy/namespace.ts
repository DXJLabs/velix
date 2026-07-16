import { VeilPrivacyError } from "./errors.js";

export const VEIL_PRIVACY_PROFILE_VERSION = 1 as const;
export const VEIL_OFFICIAL_PRIVACY_SDK_VERSION = "0.14.3-rc.2" as const;

export type DiscoveryProviderKind = "contract" | "indexer";

export interface PrivacyNamespaceInput {
  chainId: string;
  poolAddress: string | bigint;
  accountAddress: string | bigint;
  provider: DiscoveryProviderKind;
  providerIdentity: string;
  sdkVersion?: string;
}

export interface PrivacyNamespace {
  version: typeof VEIL_PRIVACY_PROFILE_VERSION;
  chainId: string;
  poolAddress: string;
  accountAddress: string;
  provider: DiscoveryProviderKind;
  providerIdentity: string;
  sdkVersion: string;
  key: string;
}

export function normalizeAddressBigint(value: string | bigint, label = "address"): bigint {
  let normalized: bigint;
  try {
    normalized = typeof value === "bigint" ? value : BigInt(value.trim());
  } catch (cause) {
    throw new VeilPrivacyError("POOL_VERSION_MISMATCH", `${label} is not a valid felt address.`, { cause });
  }
  if (normalized <= 0n || normalized >= (1n << 251n)) {
    throw new VeilPrivacyError("POOL_VERSION_MISMATCH", `${label} must be a nonzero Starknet address felt.`);
  }
  return normalized;
}

export function normalizeAddress(value: string | bigint, label?: string): string {
  return `0x${normalizeAddressBigint(value, label).toString(16)}`;
}

export function createPrivacyNamespace(input: PrivacyNamespaceInput): PrivacyNamespace {
  const chainId = requiredPublicComponent(input.chainId, "chainId");
  const poolAddress = normalizeAddress(input.poolAddress, "poolAddress");
  const accountAddress = normalizeAddress(input.accountAddress, "accountAddress");
  const providerIdentity = normalizeProviderIdentity(input.providerIdentity);
  const sdkVersion = requiredPublicComponent(
    input.sdkVersion ?? VEIL_OFFICIAL_PRIVACY_SDK_VERSION,
    "sdkVersion",
  );
  const parts = [
    `v${VEIL_PRIVACY_PROFILE_VERSION}`,
    encodeURIComponent(chainId),
    poolAddress,
    accountAddress,
    input.provider,
    encodeURIComponent(providerIdentity),
    encodeURIComponent(sdkVersion),
  ];
  return {
    version: VEIL_PRIVACY_PROFILE_VERSION,
    chainId,
    poolAddress,
    accountAddress,
    provider: input.provider,
    providerIdentity,
    sdkVersion,
    key: parts.join(":"),
  };
}

export interface NamespacedCursor<T> {
  namespaceKey: string;
  provider: DiscoveryProviderKind;
  cursor: T;
}

export function wrapDiscoveryCursor<T>(namespace: PrivacyNamespace, cursor: T): NamespacedCursor<T> {
  return { namespaceKey: namespace.key, provider: namespace.provider, cursor };
}

export function readDiscoveryCursor<T>(namespace: PrivacyNamespace, value: NamespacedCursor<T>): T {
  if (value.namespaceKey !== namespace.key || value.provider !== namespace.provider) {
    throw new VeilPrivacyError(
      "REGISTRY_CORRUPTED",
      "Discovery cursor namespace does not match the active chain, Pool, account, provider, or SDK version.",
    );
  }
  return value.cursor;
}

function requiredPublicComponent(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} cannot be empty.`);
  if (/[\u0000-\u001f]/u.test(normalized)) throw new Error(`${label} contains control characters.`);
  return normalized;
}

function normalizeProviderIdentity(value: string): string {
  const normalized = requiredPublicComponent(value, "providerIdentity");
  try {
    const url = new URL(normalized);
    url.username = "";
    url.password = "";
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/u, "");
  } catch {
    return normalized;
  }
}
