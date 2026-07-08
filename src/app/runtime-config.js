export const CHAT_DISPLAY_MODE = "shield";
export const DIRECT_HELPER_MESSAGE_MODE = "unshield";
export const DEAL_OFFER_AMOUNT = "450 STRK";
export const ACTIVE_DEAL_LABEL = "Deal #381";
export const PAYMENT_RECIPIENT = "Bob";
export const BOB_IDENTITY = "bob.stark";
export const BOB_WALLET_ADDRESS = "0x04c8a3d2f10b7e4c93f6a58219d0de8fa2";
export const BOB_WALLET_SHORT = "0x04...8fa2";
export const LOCAL_CHANNELS_KEY = "veil:local:channels:v1";
export const STARKNET_SEPOLIA_EXPLORER_URL = "https://sepolia.voyager.online";
export const WALLET_INIT_TIMEOUT_MS = 30_000;
export const WALLET_INIT_PENDING_STATES = new Set(["connecting", "creating_account", "deploying", "connecting_paymaster"]);

const LEGACY_CHANNEL_HELPER_ADDRESSES = new Set([
  "0x0333e805547d0e91cec741045bf7305e8ff58e8b7d1e9f70ecb3ca559712ef6c",
  "0x018b25f0b870610e9d28a764c432dd17c18cad7d3c09aebb6e61b4efdef4efd7",
]);
const DEPLOYED_CHANNEL_HELPER_ADDRESS = "0x0335b9a8b03e4d4478e29cfa77dba3672e0f87873a369c54353314ae033e1d5c";

export function normalizeChainId(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "";
  if (normalized === "SN_SEPOLIA" || normalized === "0X534E5F5345504F4C4941") return "SN_SEPOLIA";
  if (normalized === "SN_MAIN" || normalized === "0X534E5F4D41494E") return "SN_MAIN";
  return normalized;
}

export function defaultStarknetRpcUrl(chainId) {
  return normalizeChainId(chainId) === "SN_MAIN"
    ? "https://api.zan.top/public/starknet-mainnet/rpc/v0_8"
    : "https://api.zan.top/public/starknet-sepolia/rpc/v0_8";
}

export function reliableRpcUrl(url, fallback) {
  const value = String(url || "").trim();
  if (!value || value === "mock-rpc") return fallback;
  return value;
}

export function networkLabel(chainId) {
  const normalized = normalizeChainId(chainId);
  if (normalized === "SN_SEPOLIA") return "Sepolia";
  if (normalized === "SN_MAIN") return "Mainnet";
  return normalized || "Not detected";
}

export function readAssetDecimals(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function createRuntimeConfig(env = import.meta.env, search = window.location.search) {
  const runtimeParams = new URLSearchParams(search);
  const demoRuntimeMode = runtimeParams.has("demo") || runtimeParams.get("mode") === "demo";
  const expectedChainId = normalizeChainId(env.VITE_STARKNET_CHAIN_ID || "SN_SEPOLIA");
  const configuredPrivyLoginMethods = (env.VITE_PRIVY_LOGIN_METHODS || "google,wallet")
    .split(",")
    .map((method) => method.trim())
    .filter(Boolean);
  const privyAppId = demoRuntimeMode ? "" : env.VITE_PRIVY_APP_ID || "";
  const privyLoginMethods = [...configuredPrivyLoginMethods];
  if (!privyLoginMethods.length && privyAppId) privyLoginMethods.push("google");

  const configuredHelperAddress = env.VITE_VEIL_CHANNEL_HELPER_ADDRESS || "";
  const helperAddress = LEGACY_CHANNEL_HELPER_ADDRESSES.has(configuredHelperAddress.toLowerCase())
    ? DEPLOYED_CHANNEL_HELPER_ADDRESS
    : configuredHelperAddress || DEPLOYED_CHANNEL_HELPER_ADDRESS;
  const configuredRpcUrl = env.VITE_STARKNET_RPC_URL || "";
  const rpcUrl = reliableRpcUrl(configuredRpcUrl, defaultStarknetRpcUrl(expectedChainId));
  const configuredPrivyStarknetRpcUrl = env.VITE_PRIVY_STARKNET_RPC_URL || "";

  return {
    demoRuntimeMode,
    debugLogsEnabled: (env.VITE_VEIL_DEBUG_LOGS || "false").toLowerCase() === "true",
    timelineMode: demoRuntimeMode ? "mock" : env.VITE_VEIL_TIMELINE_MODE || "direct-helper",
    privyAppId,
    expectedChainId,
    configuredPrivyLoginMethods,
    privyLoginMethods,
    removedPrivyLoginMethods: configuredPrivyLoginMethods.filter((method) => !privyLoginMethods.includes(method)),
    helperAddress,
    offerAddress: env.VITE_VEIL_OFFER_ADDRESS || "",
    escrowAddress: env.VITE_VEIL_ESCROW_ADDRESS || "",
    settlementHelperAddress: env.VITE_VEIL_SETTLEMENT_HELPER_ADDRESS || "",
    privacyPoolAddress: env.VITE_PRIVACY_POOL_ADDRESS || "mock-privacy-pool",
    rpcUrl,
    configuredChannelKey: env.VITE_VEIL_CHANNEL_KEY || "",
    onchainPayloads: (env.VITE_VEIL_ONCHAIN_PAYLOADS || "false").toLowerCase() === "true"
      || helperAddress.toLowerCase() === DEPLOYED_CHANNEL_HELPER_ADDRESS,
    privyStarknetRpcUrl: reliableRpcUrl(
      configuredPrivyStarknetRpcUrl || rpcUrl.replace("/v0_10", "/v0_8"),
      defaultStarknetRpcUrl(expectedChainId),
    ),
    veilInviteBaseUrl: env.VITE_VEIL_INVITE_URL || "https://veil.app/invite",
    avnuPaymasterEnabled: (env.VITE_AVNU_PAYMASTER_ENABLED || "true").toLowerCase() !== "false",
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
      contractAddress: env.VITE_VEIL_STRK_TOKEN_ADDRESS || env.VITE_STRK_TOKEN_ADDRESS || "",
      decimals: readAssetDecimals(env.VITE_VEIL_STRK_DECIMALS || env.VITE_STRK_DECIMALS, 18),
      defaultDisplay: "0.0000",
    },
    {
      id: "usdt",
      symbol: "USDT",
      name: "Tether USD",
      detail: "Payments and escrow",
      contractAddress: env.VITE_VEIL_USDT_TOKEN_ADDRESS || env.VITE_USDT_TOKEN_ADDRESS || "",
      decimals: readAssetDecimals(env.VITE_VEIL_USDT_DECIMALS || env.VITE_USDT_DECIMALS, 6),
      defaultDisplay: "0.00",
    },
    {
      id: "strkbtc",
      symbol: "STRKBTC",
      name: "Starknet BTC",
      detail: "Private settlement asset",
      contractAddress: env.VITE_VEIL_STRKBTC_TOKEN_ADDRESS || env.VITE_STRKBTC_TOKEN_ADDRESS || "",
      decimals: readAssetDecimals(env.VITE_VEIL_STRKBTC_DECIMALS || env.VITE_STRKBTC_DECIMALS, 8),
      defaultDisplay: "0.00000000",
    },
  ];
}
