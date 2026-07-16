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
import { createPrivacyNamespace, type PrivacyNamespace } from "./namespace.js";

export interface OfficialPrivacySdkConfig {
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
  });
  return {
    transfers,
    registry: createEmptyRegistry(),
    namespace,
    screeningCapable: config.screeningCapable,
    sdkRoute: "createPrivateTransfers",
  };
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
