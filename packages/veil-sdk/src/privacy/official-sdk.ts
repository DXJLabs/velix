import {
  IndexerDiscoveryProvider,
  ProvingServiceProofProvider,
  SetupRequirement,
  createEmptyRegistry,
  createPrivateTransfers,
  type PoolCapabilityMode,
  type PrivateRegistry,
  type PrivateTransfersInterface,
  type PrivateTransfersUser,
  type ProofProviderConfig,
  type ViewingKeyProvider,
} from "@starkware-libs/starknet-privacy-sdk";
import { VeilPrivacyError } from "./errors.js";
import {
  VEIL_OFFICIAL_PRIVACY_SDK_VERSION,
  createPrivacyNamespace,
  type PrivacyNamespace,
} from "./namespace.js";

export const VEIL_OFFICIAL_POOL_COMPATIBILITY = "PRIVACY-0.14.3-RC.0" as const;
export const VEIL_OFFICIAL_CHAIN_ID = "SN_SEPOLIA" as const;
export const VEIL_OFFICIAL_CHAIN_ID_HEX = "0x534e5f5345504f4c4941" as const;
export const VEIL_OFFICIAL_TRANSACTION_VERSION = 3 as const;
export const VEIL_OFFICIAL_OUTSIDE_EXECUTION_VERSION = "V2" as const;

export interface OfficialPrivacySdkCompatibilityConfig {
  sdkVersion: string;
  poolCompatibility: string;
  compatiblePoolAddresses: readonly (string | bigint)[];
  transactionVersion: string | number;
  outsideExecutionVersion: string | number;
  accountCustody: "integrator-owned" | "user-wallet";
  viewingKeyCustody: "integrator-managed" | "wallet-managed";
}

export interface OfficialPrivacySdkConfig extends OfficialPrivacySdkCompatibilityConfig {
  account: PrivateTransfersUser;
  viewingKeyProvider: ViewingKeyProvider;
  chainId: ProofProviderConfig["chainId"];
  rpcUrl: string;
  poolAddress: string;
  proverUrl: string;
  discoveryUrl: string;
  screeningCapable: boolean;
  poolMode?: PoolCapabilityMode;
  requestTimeoutMs?: number;
  ohttp?: ProofProviderConfig["ohttp"];
}

export interface OfficialPrivacySdkContext {
  transfers: PrivateTransfersInterface;
  registry: PrivateRegistry;
  namespace: PrivacyNamespace;
  screeningCapable: boolean;
  sdkRoute: "createPrivateTransfers";
}

export function createOfficialPrivacySdkContext(config: OfficialPrivacySdkConfig): OfficialPrivacySdkContext {
  assertOfficialPrivacySdkCompatibility(config);
  const proverUrl = validateServiceUrl(config.proverUrl, "proverUrl");
  const discoveryUrl = validateServiceUrl(config.discoveryUrl, "discoveryUrl");
  const rpcUrl = validateServiceUrl(config.rpcUrl, "rpcUrl");
  const provingOptions = {
    ...(config.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: config.requestTimeoutMs }),
    nodeUrl: rpcUrl,
    poolAddress: config.poolAddress,
    ...(config.ohttp === undefined ? {} : { ohttp: config.ohttp }),
  };
  const provingProvider = new ProvingServiceProofProvider(proverUrl, config.chainId, provingOptions);
  const discoveryProvider = new IndexerDiscoveryProvider(discoveryUrl, config.poolAddress);
  const transfers = createPrivateTransfers({
    account: config.account,
    viewingKeyProvider: config.viewingKeyProvider,
    provingProvider,
    discoveryProvider,
    poolContractAddress: config.poolAddress,
    ...(config.poolMode === undefined ? {} : { poolMode: config.poolMode }),
  });
  const namespace = createPrivacyNamespace({
    chainId: String(config.chainId),
    poolAddress: config.poolAddress,
    accountAddress: String(config.account.address),
    provider: "indexer",
    providerIdentity: discoveryUrl,
    sdkVersion: config.sdkVersion,
  });
  return {
    transfers,
    registry: createEmptyRegistry(),
    namespace,
    screeningCapable: config.screeningCapable,
    sdkRoute: "createPrivateTransfers",
  };
}

export function assertOfficialPrivacySdkCompatibility(config: OfficialPrivacySdkConfig): void {
  if (config.sdkVersion !== VEIL_OFFICIAL_PRIVACY_SDK_VERSION) {
    throw new VeilPrivacyError(
      "SDK_VERSION_MISMATCH",
      `Official Privacy SDK ${VEIL_OFFICIAL_PRIVACY_SDK_VERSION} is required.`,
      { details: { expectedVersion: VEIL_OFFICIAL_PRIVACY_SDK_VERSION, receivedVersion: config.sdkVersion } },
    );
  }
  if (!isSepoliaChainId(String(config.chainId))) {
    throw new VeilPrivacyError("CHAIN_ID_MISMATCH", "The official Privacy SDK direct route is locked to Starknet Sepolia.");
  }
  if (config.poolCompatibility !== VEIL_OFFICIAL_POOL_COMPATIBILITY) {
    throw new VeilPrivacyError(
      "POOL_VERSION_MISMATCH",
      `Privacy Pool compatibility ${VEIL_OFFICIAL_POOL_COMPATIBILITY} is required.`,
    );
  }
  const poolAddress = normalizeAddress(config.poolAddress, "poolAddress");
  const compatiblePools = config.compatiblePoolAddresses.map((value) => normalizeAddress(value, "compatiblePoolAddress"));
  if (!compatiblePools.includes(poolAddress)) {
    throw new VeilPrivacyError("POOL_VERSION_MISMATCH", "The configured Privacy Pool address is not allowlisted for the reviewed SDK.");
  }
  if (!isInvokeV3(config.transactionVersion)) {
    throw new VeilPrivacyError("TRANSACTION_VERSION_UNSUPPORTED", "Official privacy submission requires Invoke Transaction V3.");
  }
  if (!isOutsideExecutionV2(config.outsideExecutionVersion)) {
    throw new VeilPrivacyError("AUTHORIZATION_VERSION_UNSUPPORTED", "Official privacy submission requires Outside Execution V2.");
  }
  if (config.accountCustody !== "integrator-owned" || config.viewingKeyCustody !== "integrator-managed") {
    throw new VeilPrivacyError(
      "ACCOUNT_CUSTODY_MISMATCH",
      "The direct SDK route cannot receive or request a user wallet viewing key.",
    );
  }
}

export function assertScreeningCapableDeposit(context: Pick<OfficialPrivacySdkContext, "screeningCapable">): void {
  if (!context.screeningCapable) {
    throw new VeilPrivacyError(
      "POOL_VERSION_MISMATCH",
      "Shield is disabled because the verified Pool deployment is not screening-capable.",
    );
  }
}

export type RecipientPrivacyRequirement =
  | "RECIPIENT_NOT_REGISTERED"
  | "CHANNEL_SETUP_REQUIRED"
  | "TOKEN_SETUP_REQUIRED"
  | "READY";

export function mapSetupRequirement(requirement: SetupRequirement): RecipientPrivacyRequirement {
  switch (requirement) {
    case SetupRequirement.Register:
      return "RECIPIENT_NOT_REGISTERED";
    case SetupRequirement.SetupChannel:
      return "CHANNEL_SETUP_REQUIRED";
    case SetupRequirement.SetupToken:
      return "TOKEN_SETUP_REQUIRED";
    case SetupRequirement.Ready:
      return "READY";
    default:
      throw new VeilPrivacyError("DISCOVERY_FAILED", "Discovery returned an unknown setup requirement.");
  }
}

function validateServiceUrl(value: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (cause) {
    throw new VeilPrivacyError("POOL_VERSION_MISMATCH", `${label} must be an absolute URL.`, { cause });
  }
  if (parsed.username || parsed.password) {
    throw new VeilPrivacyError("POOL_VERSION_MISMATCH", `${label} must not contain embedded credentials.`);
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new VeilPrivacyError("POOL_VERSION_MISMATCH", `${label} must use HTTPS outside local development.`);
  }
  parsed.hash = "";
  return parsed.toString().replace(/\/$/u, "");
}

function normalizeAddress(value: string | bigint, label: string): string {
  let parsed: bigint;
  try {
    parsed = typeof value === "bigint" ? value : BigInt(value.trim());
  } catch (cause) {
    throw new VeilPrivacyError("POOL_VERSION_MISMATCH", `${label} must be a Starknet address felt.`, { cause });
  }
  if (parsed <= 0n || parsed >= (1n << 251n)) {
    throw new VeilPrivacyError("POOL_VERSION_MISMATCH", `${label} must be a nonzero Starknet address felt.`);
  }
  return `0x${parsed.toString(16)}`;
}

function isSepoliaChainId(value: string): boolean {
  const normalized = value.trim().toUpperCase();
  return normalized === VEIL_OFFICIAL_CHAIN_ID || normalized === VEIL_OFFICIAL_CHAIN_ID_HEX.toUpperCase();
}

function isInvokeV3(value: string | number): boolean {
  return value === VEIL_OFFICIAL_TRANSACTION_VERSION || String(value).trim().toLowerCase() === "0x3";
}

function isOutsideExecutionV2(value: string | number): boolean {
  const normalized = String(value).trim().toUpperCase();
  return normalized === VEIL_OFFICIAL_OUTSIDE_EXECUTION_VERSION || normalized === "2";
}
