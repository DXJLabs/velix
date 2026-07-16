import {
  VEIL_SEPOLIA_CONFIG,
  isStarknetAddress,
  normalizeStarknetChainId,
  requireVeilSepoliaConfig,
} from "../../config/veil-sepolia.js";
import { VEIL_PHASE1_FEATURE_STATUS } from "../domain/feature-status.js";

export const ENCRYPTED_DIRECT_MESSAGE_MODE = "encrypted-direct";
export const STRK20_SHIELDED_MESSAGE_MODE = "strk20-shielded";
export const CHAT_DISPLAY_MODE = ENCRYPTED_DIRECT_MESSAGE_MODE;
export const DIRECT_HELPER_MESSAGE_MODE = ENCRYPTED_DIRECT_MESSAGE_MODE;
export const DEAL_OFFER_AMOUNT = "450 STRK";
export const ACTIVE_DEAL_LABEL = "Deal #381";
export const PAYMENT_RECIPIENT = "Bob";
export const BOB_IDENTITY = "bob.stark";
export const BOB_WALLET_ADDRESS = "0x04c8a3d2f10b7e4c93f6a58219d0de8fa2";
export const BOB_WALLET_SHORT = "0x04...8fa2";
export const LOCAL_CHANNELS_KEY = "veil:local:channels:v1";
export const STARKNET_SEPOLIA_EXPLORER_URL = VEIL_SEPOLIA_CONFIG.explorerUrl;
export const WALLET_INIT_TIMEOUT_MS = 30_000;
export const WALLET_INIT_PENDING_STATES = new Set(["connecting", "creating_account", "deploying", "connecting_paymaster"]);

export function normalizeChainId(value) {
  return normalizeStarknetChainId(value);
}

export function defaultStarknetRpcUrl(chainId) {
  return requireVeilSepoliaConfig(chainId).rpc.defaultUrl;
}

export function reliableRpcUrl(url, fallback) {
  const value = String(url || "").trim();
  return validateHttpUrl(!value || value === "mock-rpc" ? fallback : value, "Starknet RPC URL");
}

export function networkLabel(chainId) {
  const normalized = normalizeChainId(chainId);
  if (normalized === "SN_SEPOLIA") return "Sepolia";
  if (normalized === "SN_MAIN") return "Mainnet";
  return normalized || "Not detected";
}

export function isDirectHelperTimelineMode(timelineMode) {
  return timelineMode === ENCRYPTED_DIRECT_MESSAGE_MODE;
}

export function normalizeTimelineMode(value, env = {}) {
  const requested = String(value || "").trim();
  void env;
  if (!requested) return ENCRYPTED_DIRECT_MESSAGE_MODE;
  if (["direct-helper", "direct-helper-dev", "unshield"].includes(requested)) return ENCRYPTED_DIRECT_MESSAGE_MODE;
  if (["privacy-pool", "shield"].includes(requested)) return STRK20_SHIELDED_MESSAGE_MODE;
  if ([ENCRYPTED_DIRECT_MESSAGE_MODE, STRK20_SHIELDED_MESSAGE_MODE].includes(requested)) return requested;
  return ENCRYPTED_DIRECT_MESSAGE_MODE;
}

export function readAssetDecimals(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function readBooleanEnv(value, name, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === false) return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${name} must be either true or false.`);
}

function readEnumEnv(value, name, allowed, fallback) {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (!allowed.includes(normalized)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}.`);
  }
  return normalized;
}

function validateHttpUrl(value, name) {
  const normalized = String(value || "").trim();
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("unsupported protocol");
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL.`);
  }
  return normalized;
}

function readOptionalHttpUrl(value, name) {
  const normalized = String(value || "").trim();
  return normalized ? validateHttpUrl(normalized, name) : "";
}

function assertRpcNamespace(url, name) {
  const namespace = new URL(url).pathname.match(/\/rpc\/(v\d+_\d+)(?:\/|$)/i)?.[1];
  if (namespace && namespace.toLowerCase() !== VEIL_SEPOLIA_CONFIG.rpc.version.toLowerCase()) {
    throw new Error(
      `${name} uses ${namespace}; VEIL Sepolia is locked to ${VEIL_SEPOLIA_CONFIG.rpc.version}.`,
    );
  }
  return url;
}

function readLockedAddress(value, verifiedAddress, name) {
  const configured = String(value || verifiedAddress).trim();
  if (!isStarknetAddress(configured)) throw new Error(`${name} is not a valid Starknet address.`);
  if (BigInt(configured) !== BigInt(verifiedAddress)) {
    throw new Error(`${name} does not match the verified VEIL Sepolia deployment.`);
  }
  return verifiedAddress;
}

function readOptionalAddress(value, name) {
  const configured = String(value || "").trim();
  if (!configured) return "";
  if (!isStarknetAddress(configured)) throw new Error(`${name} is not a valid Starknet address.`);
  return configured;
}

function createPrivacyRuntimeConfig(env, networkConfig) {
  const sdkEnabled = readBooleanEnv(env.VITE_STRK20_SDK_ENABLED, "VITE_STRK20_SDK_ENABLED", false);
  if (sdkEnabled) {
    throw new Error(
      "The official Privacy SDK foundation is installed, but the production wallet/fallback bootstrap is not E2E-verified.",
    );
  }

  const proverMode = readEnumEnv(
    env.VITE_STRK20_PROVER_MODE,
    "VITE_STRK20_PROVER_MODE",
    ["disabled", "self-hosted", "hosted"],
    "disabled",
  );
  const proverUrl = readOptionalHttpUrl(env.VITE_STRK20_PROVER_URL, "VITE_STRK20_PROVER_URL");
  if (proverMode === "disabled" && proverUrl) {
    throw new Error("VITE_STRK20_PROVER_URL requires a non-disabled VITE_STRK20_PROVER_MODE.");
  }
  if (proverMode !== "disabled" && !proverUrl) {
    throw new Error(`${proverMode} proving requires VITE_STRK20_PROVER_URL.`);
  }

  const discoveryProvider = readEnumEnv(
    env.VITE_STRK20_DISCOVERY_PROVIDER,
    "VITE_STRK20_DISCOVERY_PROVIDER",
    ["contract", "indexer", "disabled"],
    "contract",
  );
  const discoveryUrl = readOptionalHttpUrl(env.VITE_STRK20_DISCOVERY_URL, "VITE_STRK20_DISCOVERY_URL");
  if (discoveryProvider === "indexer" && !discoveryUrl) {
    throw new Error("Indexer discovery requires VITE_STRK20_DISCOVERY_URL.");
  }
  if (discoveryProvider !== "indexer" && discoveryUrl) {
    throw new Error("VITE_STRK20_DISCOVERY_URL is valid only with the indexer discovery provider.");
  }

  const screeningCapable = readBooleanEnv(
    env.VITE_STRK20_SCREENING_CAPABLE,
    "VITE_STRK20_SCREENING_CAPABLE",
    networkConfig.privacyPool.screeningCapable,
  );
  const screeningProvider = readEnumEnv(
    env.VITE_STRK20_SCREENING_PROVIDER,
    "VITE_STRK20_SCREENING_PROVIDER",
    ["none", "wallet", "hosted"],
    "none",
  );
  const screeningUrl = readOptionalHttpUrl(env.VITE_STRK20_SCREENING_URL, "VITE_STRK20_SCREENING_URL");
  if (screeningCapable !== networkConfig.privacyPool.screeningCapable) {
    throw new Error("The verified legacy Sepolia Privacy Pool is not screening-capable.");
  }
  if (screeningProvider !== "none" || screeningUrl) {
    throw new Error("Screening cannot be configured for the verified legacy Sepolia Privacy Pool.");
  }

  return Object.freeze({
    sdk: Object.freeze({
      enabled: false,
      installed: true,
      pin: networkConfig.officialCompatibility.sdk,
    }),
    prover: Object.freeze({ mode: proverMode, url: proverUrl }),
    discovery: Object.freeze({ provider: discoveryProvider, url: discoveryUrl }),
    screening: Object.freeze({
      capable: networkConfig.privacyPool.screeningCapable,
      provider: screeningProvider,
      url: screeningUrl,
    }),
  });
}

export function createRuntimeConfig(
  env = import.meta.env,
  search = typeof window === "undefined" ? "" : window.location.search,
) {
  const runtimeParams = new URLSearchParams(search);
  const demoRuntimeMode = runtimeParams.has("demo") || runtimeParams.get("mode") === "demo";
  const expectedChainId = normalizeChainId(env.VITE_STARKNET_CHAIN_ID || "SN_SEPOLIA");
  const networkConfig = requireVeilSepoliaConfig(expectedChainId);
  const configuredPrivyLoginMethods = (env.VITE_PRIVY_LOGIN_METHODS || "google,wallet")
    .split(",")
    .map((method) => method.trim())
    .filter(Boolean);
  const privyAppId = demoRuntimeMode ? "" : env.VITE_PRIVY_APP_ID || "";
  const privyLoginMethods = [...configuredPrivyLoginMethods];
  if (!privyLoginMethods.length && privyAppId) privyLoginMethods.push("google");

  const privacyPoolAddress = readLockedAddress(
    env.VITE_PRIVACY_POOL_ADDRESS,
    networkConfig.privacyPool.address,
    "VITE_PRIVACY_POOL_ADDRESS",
  );
  const helperAddress = readLockedAddress(
    env.VITE_VEIL_CHANNEL_HELPER_ADDRESS,
    networkConfig.contracts.channelHelper.address,
    "VITE_VEIL_CHANNEL_HELPER_ADDRESS",
  );
  const configuredOfferAddress = String(env.VITE_VEIL_OFFER_ADDRESS || "").trim();
  if (configuredOfferAddress) {
    throw new Error("VITE_VEIL_OFFER_ADDRESS is disabled: the deployed offer predates the hardened VeilOffer source.");
  }
  const offerAddress = "";
  const configuredEscrowAddress = String(env.VITE_VEIL_ESCROW_ADDRESS || "").trim();
  if (configuredEscrowAddress) {
    throw new Error("VITE_VEIL_ESCROW_ADDRESS is disabled: the deployed legacy escrow is not a safe DealEscrow.");
  }
  const escrowAddress = "";
  const unsafeSettlementEnabled = readBooleanEnv(
    env.VITE_VEIL_UNSAFE_SETTLEMENT_ENABLED,
    "VITE_VEIL_UNSAFE_SETTLEMENT_ENABLED",
    false,
  );
  const configuredSettlementAddress = String(env.VITE_VEIL_SETTLEMENT_HELPER_ADDRESS || "").trim();
  if (unsafeSettlementEnabled || configuredSettlementAddress) {
    throw new Error("The deployed VeilSettlementHelper is security-disabled and cannot be enabled by environment flags.");
  }
  const settlementHelperAddress = "";

  const configuredRpcUrl = env.VITE_STARKNET_RPC_URL || "";
  const rpcUrl = assertRpcNamespace(
    reliableRpcUrl(configuredRpcUrl, defaultStarknetRpcUrl(expectedChainId)),
    "VITE_STARKNET_RPC_URL",
  );
  const configuredPrivyStarknetRpcUrl = env.VITE_PRIVY_STARKNET_RPC_URL || "";
  const configuredRegistryChainId = normalizeChainId(env.VITE_VEIL_KEY_REGISTRY_CHAIN_ID || "");
  const encryptionKeyRegistryAddress = readOptionalAddress(
    env.VITE_VEIL_KEY_REGISTRY_ADDRESS,
    "VITE_VEIL_KEY_REGISTRY_ADDRESS",
  );
  if (encryptionKeyRegistryAddress && configuredRegistryChainId !== expectedChainId) {
    throw new Error("VITE_VEIL_KEY_REGISTRY_CHAIN_ID must match the VEIL Sepolia runtime chain.");
  }

  const privacyRuntime = createPrivacyRuntimeConfig(env, networkConfig);
  const demoCounterpartyAddress = readOptionalAddress(
    env.VITE_DEMO_COUNTERPARTY_ADDRESS,
    "VITE_DEMO_COUNTERPARTY_ADDRESS",
  );
  const privyStarknetRpcUrl = assertRpcNamespace(
    reliableRpcUrl(configuredPrivyStarknetRpcUrl, rpcUrl),
    "VITE_PRIVY_STARKNET_RPC_URL",
  );

  return {
    demoRuntimeMode,
    debugLogsEnabled: readBooleanEnv(env.VITE_VEIL_DEBUG_LOGS, "VITE_VEIL_DEBUG_LOGS", false),
    timelineMode: demoRuntimeMode
      ? "mock"
      : normalizeTimelineMode(env.VITE_VEIL_MESSAGE_MODE || env.VEIL_MESSAGE_MODE || env.VITE_VEIL_TIMELINE_MODE, env),
    privyAppId,
    expectedChainId,
    expectedChainIdHex: networkConfig.chainIdHex,
    networkConfig,
    rpcVersion: networkConfig.rpc.version,
    rpcSpecVersion: networkConfig.rpc.specVersion,
    configuredPrivyLoginMethods,
    privyLoginMethods,
    removedPrivyLoginMethods: configuredPrivyLoginMethods.filter((method) => !privyLoginMethods.includes(method)),
    helperAddress,
    offerAddress,
    escrowAddress,
    settlementHelperAddress,
    unsafeSettlementEnabled,
    privacyPoolAddress,
    encryptionKeyRegistryAddress,
    demoCounterpartyAddress,
    rpcUrl,
    configuredChannelKey: env.VITE_VEIL_CHANNEL_KEY || "",
    onchainPayloads: readBooleanEnv(
      env.VITE_VEIL_ONCHAIN_PAYLOADS,
      "VITE_VEIL_ONCHAIN_PAYLOADS",
      false,
    ),
    privyStarknetRpcUrl,
    privacyRuntime,
    featureStatus: VEIL_PHASE1_FEATURE_STATUS,
    veilInviteBaseUrl: env.VITE_VEIL_INVITE_URL || "https://veil.app/invite",
    avnuPaymasterEnabled: (() => {
      const enabled = readBooleanEnv(env.VITE_AVNU_PAYMASTER_ENABLED, "VITE_AVNU_PAYMASTER_ENABLED", false);
      if (enabled) {
        throw new Error("AVNU paymaster is disabled until a proof-aware submission path passes Sepolia E2E.");
      }
      return false;
    })(),
    homeResourceLinks: {
      docs: env.VITE_VEIL_DOCS_URL || "#",
      github: env.VITE_VEIL_GITHUB_URL || "https://github.com/DXJLabs/velix",
      x: env.VITE_VEIL_X_URL || env.VITE_VEIL_TWITTER_URL || "#",
      community: env.VITE_VEIL_DISCORD_URL || env.VITE_VEIL_TELEGRAM_URL || "#",
      changelog: env.VITE_VEIL_CHANGELOG_URL || "#",
      issues: env.VITE_VEIL_ISSUES_URL || "https://github.com/DXJLabs/velix/issues",
      privacy: env.VITE_VEIL_PRIVACY_URL || "#",
      terms: env.VITE_VEIL_TERMS_URL || "#",
      license: env.VITE_VEIL_LICENSE_URL || "#",
    },
    walletAssetConfig: createWalletAssetConfig(env),
  };
}

function createWalletAssetConfig(env) {
  return [
    {
      id: "strk",
      symbol: "STRK",
      name: "Starknet Token",
      detail: "Network fees and settlement",
      contractAddress: readOptionalAddress(
        env.VITE_VEIL_STRK_TOKEN_ADDRESS || env.VITE_STRK_TOKEN_ADDRESS,
        "VITE_VEIL_STRK_TOKEN_ADDRESS",
      ),
      decimals: readAssetDecimals(env.VITE_VEIL_STRK_DECIMALS || env.VITE_STRK_DECIMALS, 18),
      defaultDisplay: "0.0000",
    },
    {
      id: "usdt",
      symbol: "USDT",
      name: "Tether USD",
      detail: "Payments and escrow",
      contractAddress: readOptionalAddress(
        env.VITE_VEIL_USDT_TOKEN_ADDRESS || env.VITE_USDT_TOKEN_ADDRESS,
        "VITE_VEIL_USDT_TOKEN_ADDRESS",
      ),
      decimals: readAssetDecimals(env.VITE_VEIL_USDT_DECIMALS || env.VITE_USDT_DECIMALS, 6),
      defaultDisplay: "0.00",
    },
    {
      id: "strkbtc",
      symbol: "STRKBTC",
      name: "Starknet BTC",
      detail: "Settlement asset",
      contractAddress: readOptionalAddress(
        env.VITE_VEIL_STRKBTC_TOKEN_ADDRESS || env.VITE_STRKBTC_TOKEN_ADDRESS,
        "VITE_VEIL_STRKBTC_TOKEN_ADDRESS",
      ),
      decimals: readAssetDecimals(env.VITE_VEIL_STRKBTC_DECIMALS || env.VITE_STRKBTC_DECIMALS, 8),
      defaultDisplay: "0.00000000",
    },
  ];
}
