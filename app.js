import { ChannelEncryptionAdapter, DirectHelperTransport, VeilClient, VeilEventType } from "./packages/veil-sdk/src/index.ts";
import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { StarkZap } from "starkzap-sdk";
import { accountPresets } from "starkzap-account-presets";
import { ChainId } from "starkzap-config";
import { OnboardStrategy } from "starkzap-onboard";

const runtimeParams = new URLSearchParams(window.location.search);
const demoRuntimeMode = runtimeParams.has("demo") || runtimeParams.get("mode") === "demo";
const timelineMode = demoRuntimeMode ? "mock" : import.meta.env.VITE_VEIL_TIMELINE_MODE || "direct-helper";
const privyAppId = demoRuntimeMode ? "" : import.meta.env.VITE_PRIVY_APP_ID || "";
const configuredPrivyLoginMethods = (import.meta.env.VITE_PRIVY_LOGIN_METHODS || "email,google")
  .split(",")
  .map((method) => method.trim())
  .filter(Boolean);
const privyLoginMethods = configuredPrivyLoginMethods
  .filter((method) => !(timelineMode === "direct-helper" && method === "wallet"));
if (!privyLoginMethods.length && privyAppId) {
  privyLoginMethods.push("google");
}
const removedPrivyLoginMethods = configuredPrivyLoginMethods
  .filter((method) => !privyLoginMethods.includes(method));
const LEGACY_CHANNEL_HELPER_ADDRESS = "0x0333e805547d0e91cec741045bf7305e8ff58e8b7d1e9f70ecb3ca559712ef6c";
const DEPLOYED_CHANNEL_HELPER_ADDRESS = "0x018b25f0b870610e9d28a764c432dd17c18cad7d3c09aebb6e61b4efdef4efd7";
const configuredHelperAddress = import.meta.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS || "";
const helperAddress = configuredHelperAddress.toLowerCase() === LEGACY_CHANNEL_HELPER_ADDRESS
  ? DEPLOYED_CHANNEL_HELPER_ADDRESS
  : configuredHelperAddress || DEPLOYED_CHANNEL_HELPER_ADDRESS;
const privacyPoolAddress = import.meta.env.VITE_PRIVACY_POOL_ADDRESS || "mock-privacy-pool";
const rpcUrl = import.meta.env.VITE_STARKNET_RPC_URL || "mock-rpc";
const configuredChannelKey = import.meta.env.VITE_VEIL_CHANNEL_KEY || "";
const browserFallbackChannelKey = !configuredChannelKey && timelineMode === "direct-helper"
  ? readOrCreateBrowserFallbackChannelKey()
  : "";
const channelKey = configuredChannelKey || browserFallbackChannelKey;
const channelKeySource = configuredChannelKey ? "env" : browserFallbackChannelKey ? "browser-testnet-fallback" : "missing";
const channelKeyId = configuredChannelKey ? "veil-env-channel" : browserFallbackChannelKey ? "veil-browser-testnet-channel" : undefined;
const onchainPayloads = (import.meta.env.VITE_VEIL_ONCHAIN_PAYLOADS || "false").toLowerCase() === "true"
  || helperAddress.toLowerCase() === DEPLOYED_CHANNEL_HELPER_ADDRESS;
const STARKNET_SEPOLIA_EXPLORER_URL = "https://sepolia.voyager.online";
const privyStarknetRpcUrl = import.meta.env.VITE_PRIVY_STARKNET_RPC_URL
  || rpcUrl.replace("/v0_10", "/v0_8")
  || "https://starknet-sepolia.public.blastapi.io/rpc/v0_8";
const expectedChainId = normalizeChainId(import.meta.env.VITE_STARKNET_CHAIN_ID || "SN_SEPOLIA");
const CHAT_DISPLAY_MODE = "shield";
const DIRECT_HELPER_MESSAGE_MODE = "unshield";
const DEAL_OFFER_AMOUNT = "450 STRK";
const FEE_ESTIMATE_PENDING = "Fee will be calculated before wallet signature";
const TOTAL_ESTIMATE_PENDING = "Calculated in wallet";
const PAYMENT_RECIPIENT = "Bob";
const homeResourceLinks = {
  docs: import.meta.env.VITE_VEIL_DOCS_URL || "#",
  github: import.meta.env.VITE_VEIL_GITHUB_URL || "https://github.com/DXJLabs/velix",
  x: import.meta.env.VITE_VEIL_X_URL || import.meta.env.VITE_VEIL_TWITTER_URL || "#",
  community: import.meta.env.VITE_VEIL_DISCORD_URL || import.meta.env.VITE_VEIL_TELEGRAM_URL || "#",
  changelog: import.meta.env.VITE_VEIL_CHANGELOG_URL || "#",
  issues: import.meta.env.VITE_VEIL_ISSUES_URL || "https://github.com/DXJLabs/velix/issues",
  privacy: import.meta.env.VITE_VEIL_PRIVACY_URL || "#",
  terms: import.meta.env.VITE_VEIL_TERMS_URL || "#",
  license: import.meta.env.VITE_VEIL_LICENSE_URL || "#",
};
const walletAssetConfig = [
  {
    id: "strk",
    symbol: "STRK",
    name: "Starknet Token",
    detail: "Network fees and settlement",
    contractAddress: import.meta.env.VITE_VEIL_STRK_TOKEN_ADDRESS || import.meta.env.VITE_STRK_TOKEN_ADDRESS || "",
    decimals: readAssetDecimals(import.meta.env.VITE_VEIL_STRK_DECIMALS || import.meta.env.VITE_STRK_DECIMALS, 18),
    defaultDisplay: "0.0000",
  },
  {
    id: "usdt",
    symbol: "USDT",
    name: "Tether USD",
    detail: "Payments and escrow",
    contractAddress: import.meta.env.VITE_VEIL_USDT_TOKEN_ADDRESS || import.meta.env.VITE_USDT_TOKEN_ADDRESS || "",
    decimals: readAssetDecimals(import.meta.env.VITE_VEIL_USDT_DECIMALS || import.meta.env.VITE_USDT_DECIMALS, 6),
    defaultDisplay: "0.00",
  },
  {
    id: "strkbtc",
    symbol: "STRKBTC",
    name: "Starknet BTC",
    detail: "Private settlement asset",
    contractAddress: import.meta.env.VITE_VEIL_STRKBTC_TOKEN_ADDRESS || import.meta.env.VITE_STRKBTC_TOKEN_ADDRESS || "",
    decimals: readAssetDecimals(import.meta.env.VITE_VEIL_STRKBTC_DECIMALS || import.meta.env.VITE_STRKBTC_DECIMALS, 8),
    defaultDisplay: "0.00000000",
  },
];
const avnuPaymasterEnabled = (import.meta.env.VITE_AVNU_PAYMASTER_ENABLED || "true").toLowerCase() !== "false";
const WALLET_INIT_TIMEOUT_MS = 30_000;
const WALLET_INIT_PENDING_STATES = new Set(["connecting", "creating_account", "deploying", "connecting_paymaster"]);

const now = Date.now();
const minute = 60_000;
const activeDealId = "20260625";
const LOCAL_CHANNELS_KEY = "veil:local:channels:v1";

const channels = [
  {
    id: activeDealId,
    title: "Rights Transfer",
    person: "Bob",
    avatar: "B",
    mode: "Private",
    status: "Escrow Active",
    unread: 2,
    time: "9:41 AM",
    last: "Counter offer accepted",
  },
  {
    id: "design-milestone",
    title: "Design Milestone",
    person: "Mira",
    avatar: "M",
    mode: "Private",
    status: "Negotiating",
    unread: 1,
    time: "9:20 AM",
    last: "AI note requested",
  },
  {
    id: "northline-goods",
    title: "Northline Goods",
    person: "Northline",
    avatar: "N",
    mode: "Public",
    status: "Waiting Deposit",
    unread: 0,
    time: "8:15 AM",
    last: "Buyer deposited funds",
  },
  {
    id: "greylock-ops",
    title: "Greylock Ops",
    person: "Ari",
    avatar: "G",
    mode: "Private",
    status: "Settlement",
    unread: 0,
    time: "Yesterday",
    last: "Settlement proof generated",
  },
  {
    id: "product-supply",
    title: "Product Supply",
    person: "Nadia",
    avatar: "P",
    mode: "Public",
    status: "Settlement",
    unread: 0,
    time: "Mon",
    last: "Escrow completed",
  },
];

const messages = {
  [activeDealId]: [
    {
      type: "message",
      sender: "Bob",
      body: "Here is my offer.",
      time: now - 42 * minute,
    },
    {
      type: "offer",
      title: "Offer #1",
      amount: "450 STRK",
      subtitle: "Rights Transfer",
      time: now - 39 * minute,
    },
    {
      type: "message",
      sender: "You",
      body: "Thanks. I will review and get back to you.",
      time: now - 31 * minute,
      self: true,
    },
    {
      type: "message",
      sender: "Bob",
      body: "Sure, let me know.",
      time: now - 9 * minute,
    },
    {
      type: "event",
      title: "Bob accepted your offer",
      subtitle: "Escrow is ready to create.",
      time: now - 4 * minute,
    },
  ],
  "design-milestone": [
    {
      type: "message",
      sender: "Mira",
      body: "Can you attach the AI review before release?",
      time: now - 18 * minute,
    },
  ],
  "northline-goods": [
    {
      type: "message",
      sender: "Northline",
      body: "Seller deposit is pending.",
      time: now - 70 * minute,
    },
  ],
  "greylock-ops": [
    {
      type: "event",
      title: "Payment proof received",
      subtitle: "Settlement completed.",
      time: now - 2 * 24 * 60 * minute,
    },
  ],
  "product-supply": [
    {
      type: "event",
      title: "Deal completed",
      subtitle: "Proof attached.",
      time: now - 4 * 24 * 60 * minute,
    },
  ],
};

const state = {
  screen: "unlock",
  channelId: activeDealId,
  paymentMode: "shield",
  messageMode: CHAT_DISPLAY_MODE,
  defaultPrivacyMode: "shield",
  autoShield: true,
  walletConnected: false,
  walletAddress: "",
  walletNetwork: expectedChainId,
  walletSource: privyAppId ? "Privy" : "Demo",
  helperVerified: false,
  privyReady: false,
  privyAuthenticated: false,
  privyWallet: null,
  privyAccount: null,
  privyProvider: null,
  privyAccountDeployed: false,
  walletInitState: "idle",
  walletInitMessage: "Connect Wallet",
  walletInitError: "",
  walletInitStartedAt: 0,
  walletInitTraceId: "",
  walletAssetBalances: createDefaultWalletAssetBalances(),
  walletAssetSyncKey: "",
  walletAssetSyncStatus: "idle",
  offerAccepted: false,
  paymentSent: false,
  escrowReleased: false,
  escrowConfirmations: {
    buyer: false,
    seller: false,
  },
  escrowDisputeOpened: false,
  proofExported: false,
};

let toastTimer;
let walletInitTimer;
let directTransport;
let encryptionConfigWarningShown = false;
let veilClient = createClient();
let starknetReadProvider;
let starkzapSdk;
let starkzapOnboardResult;

const screens = document.querySelectorAll("[data-screen]");
const bottomNav = document.querySelector(".bottom-nav");
const navItems = document.querySelectorAll("[data-top-nav]");
const conversationList = document.querySelector("#conversation-list");
const conversationSearch = document.querySelector("#conversation-search");
const messageFeed = document.querySelector("#message-feed");
const composerForm = document.querySelector("#composer-form");
const messageInput = document.querySelector("#message-input");
const attachmentInput = document.querySelector("#attachment-input");
const toast = document.querySelector("#toast");
const offerReviewModal = document.querySelector("#offer-review-modal");
const paymentReviewModal = document.querySelector("#payment-review-modal");
const privyAuthRoot = document.querySelector("#privy-auth-root");

function createClient(transport) {
  const encryption = channelKey
    ? new ChannelEncryptionAdapter({ channelKey, keyId: channelKeyId })
    : timelineMode === "mock"
      ? undefined
      : createFailClosedEncryptionAdapter()
  ;
  const activeTransport = transport || (timelineMode === "mock" ? undefined : createFailClosedTransport());
  if (timelineMode !== "mock" && !encryptionConfigWarningShown) {
    encryptionConfigWarningShown = true;
    if (channelKeySource === "browser-testnet-fallback") {
      veilLog("warn", "encryption.browser_testnet_fallback.enabled", {
        where: "createClient",
        timelineMode,
        helperAddress,
        why: "VITE_VEIL_CHANNEL_KEY is not configured, so this browser generated a local direct-helper testnet encryption key.",
        howToFix: "Configure Privacy Pool-derived encryption for Shield mode, or set VITE_VEIL_CHANNEL_KEY when a shared direct-helper testnet key is required.",
      });
    } else if (!channelKey) {
      veilLog("warn", "encryption.config.missing", {
        where: "createClient",
        howToFix: "Configure Privacy Pool-derived message encryption in production. VITE_VEIL_CHANNEL_KEY remains a legacy testnet fallback only.",
      });
    }
  }

  return new VeilClient({
    privacyPoolAddress,
    helperAddress: helperAddress || "mock-veil-helper",
    rpcUrl,
    ...(encryption ? { encryption } : {}),
    ...(activeTransport ? { transport: activeTransport } : {}),
    allowMock: timelineMode === "mock",
  });
}

function createFailClosedEncryptionAdapter() {
  return {
    async encryptPayload() {
      throw new Error("Production messaging requires Privacy Pool-derived encryption before submitting onchain messages.");
    },
    async decryptPayload() {
      return null;
    },
  };
}

function readOrCreateBrowserFallbackChannelKey() {
  if (!globalThis.crypto?.getRandomValues) {
    return "";
  }

  const storageKey = `veil:direct-helper:channel-key:${helperAddress || "default"}:v1`;
  try {
    const storage = window.localStorage;
    const existing = storage.getItem(storageKey);
    if (/^0x[0-9a-fA-F]{64}$/.test(existing || "")) {
      return existing;
    }

    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    const generated = `0x${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    storage.setItem(storageKey, generated);
    return generated;
  } catch (error) {
    veilLog("warn", "encryption.browser_testnet_fallback.failed", {
      where: "readOrCreateBrowserFallbackChannelKey",
      why: error?.message || String(error),
      howToFix: "Enable browser storage or configure VITE_VEIL_CHANNEL_KEY for direct-helper testnet messaging.",
    });
    return "";
  }
}

function createFailClosedTransport() {
  const error = () => new Error("Connect a Starknet account before submitting or reading production onchain messages.");
  return {
    supportedModes: ["unshield"],
    async invokeExternal() {
      throw error();
    },
    async getEventCount() {
      throw error();
    },
    async getEvent() {
      throw error();
    },
    async getTimeline() {
      throw error();
    },
  };
}

function veilLog(level, event, details = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitizeLogDetails(details),
  };
  const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
  console[method](JSON.stringify(payload));
}

function veilError(event, error, details = {}) {
  const errorDetails = serializeError(error);
  veilLog("error", event, {
    where: details.where || "frontend",
    why: errorDetails.errorMessage || String(error),
    howToFix: details.howToFix || "Check the preceding VEIL structured logs and retry the failed action.",
    ...errorDetails,
    ...details,
  });
  if (error instanceof Error) {
    console.error(error);
  }
}

function sanitizeLogDetails(details) {
  return Object.fromEntries(
    Object.entries(details)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        if (/token|secret|authorization/i.test(key)) return [key, "[redacted]"];
        return [key, value];
      }),
  );
}

function serializeError(error) {
  if (!error) return {};
  const cause = error.cause;
  return {
    errorName: error.name,
    errorMessage: error.message || String(error),
    errorStack: error.stack,
    errorCauseName: cause?.name,
    errorCauseMessage: cause?.message || (cause ? String(cause) : undefined),
    errorCauseStack: cause?.stack,
  };
}

function createTraceId(scope) {
  return `${scope}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

function tracePrivyStarkZap(traceId, step, details = {}) {
  veilLog("info", `trace.privy_starkzap.${step}`, {
    traceId,
    step,
    ...details,
  });
}

function isGoogleLinkedAccount(account) {
  const values = [
    account?.type,
    account?.provider,
    account?.providerId,
    account?.oauthProvider,
    account?.loginMethod,
  ].map((value) => String(value || "").toLowerCase());
  return values.some((value) => value.includes("google"));
}

function summarizePrivyUser(user) {
  const linkedAccounts = Array.isArray(user?.linkedAccounts) ? user.linkedAccounts : [];
  const linkedAccountTypes = [...new Set(linkedAccounts
    .map((account) => account?.type || account?.provider || account?.loginMethod)
    .filter(Boolean))];

  return {
    userPresent: Boolean(user?.id || user?.did),
    googleLinked: linkedAccounts.some(isGoogleLinkedAccount),
    linkedAccountTypes,
    embeddedWalletLinked: linkedAccounts.some((account) => String(account?.type || "").includes("wallet"))
      || Boolean(user?.wallet?.address),
  };
}

function summarizePrivyBridge(bridge) {
  return {
    ready: Boolean(bridge?.ready),
    authenticated: Boolean(bridge?.authenticated),
    walletCount: Array.isArray(bridge?.wallets) ? bridge.wallets.length : 0,
    ...summarizePrivyUser(bridge?.user),
  };
}

async function readResponsePayload(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { rawBody: text.slice(0, 1_000) };
  }
}

function currentOrigin() {
  return window.location.origin;
}

async function mountPrivy() {
  if (!privyAppId || !privyAuthRoot) return;
  veilLog("info", "auth.privy.mount.start", {
    where: "mountPrivy",
    appIdConfigured: Boolean(privyAppId),
    configuredLoginMethods: configuredPrivyLoginMethods,
    loginMethods: privyLoginMethods,
    removedLoginMethods: removedPrivyLoginMethods.length ? removedPrivyLoginMethods : undefined,
    currentOrigin: currentOrigin(),
    howToFix: privyLoginMethods.includes("google")
      ? "For Google OAuth, add this origin to Privy Allowed OAuth Redirect URLs and Google Authorized JavaScript Origins."
      : undefined,
  });

  function PrivyStateBridge() {
    const privy = usePrivy();
    const walletState = useWallets();
    const wallets = walletState?.wallets || [];

    useEffect(() => {
      const bridgeState = {
        ready: Boolean(privy.ready),
        authenticated: Boolean(privy.authenticated),
        user: privy.user || null,
        wallets,
      };
      window.__veilPrivy = {
        ...bridgeState,
        login: privy.login,
        logout: privy.logout,
        getAccessToken: privy.getAccessToken,
      };

      veilLog("info", "auth.privy.bridge.state", {
        where: "PrivyStateBridge",
        ...summarizePrivyBridge(window.__veilPrivy),
      });

      window.dispatchEvent(new CustomEvent("veil:privy-state", {
        detail: bridgeState,
      }));
    }, [privy.ready, privy.authenticated, privy.user, privy.login, privy.logout, privy.getAccessToken, wallets]);

    return null;
  }

  createRoot(privyAuthRoot).render(
    React.createElement(
      PrivyProvider,
      {
        appId: privyAppId,
        config: {
          appearance: {
            accentColor: "#10b981",
            theme: "light",
          },
          loginMethods: privyLoginMethods,
        },
      },
      React.createElement(PrivyStateBridge),
    ),
  );
  veilLog("info", "auth.privy.mount.success", {
    where: "mountPrivy",
    appIdConfigured: Boolean(privyAppId),
  });
}

function currentChannel() {
  return channels.find((channel) => channel.id === state.channelId) || channels[0];
}

function channelMessages() {
  messages[state.channelId] ||= [];
  return messages[state.channelId];
}

function loadLocalChannels() {
  try {
    const payload = JSON.parse(window.localStorage.getItem(LOCAL_CHANNELS_KEY) || "[]");
    if (!Array.isArray(payload)) return;
    payload.forEach((entry) => {
      if (!entry?.channel?.id || channels.some((channel) => channel.id === entry.channel.id)) return;
      channels.unshift({ ...entry.channel, local: true });
      messages[entry.channel.id] = Array.isArray(entry.messages) ? entry.messages : [];
    });
  } catch (error) {
    veilError("channel.local.load.failed", error, {
      where: "loadLocalChannels",
      howToFix: "Clear local VEIL cache if local draft channels cannot be parsed.",
    });
  }
}

function saveLocalChannels() {
  try {
    const localChannels = channels
      .filter((channel) => channel.local)
      .map((channel) => ({
        channel,
        messages: messages[channel.id] || [],
      }));
    window.localStorage.setItem(LOCAL_CHANNELS_KEY, JSON.stringify(localChannels));
  } catch (error) {
    veilError("channel.local.save.failed", error, {
      where: "saveLocalChannels",
      howToFix: "Check browser storage availability before relying on local draft channels.",
    });
  }
}

function createLocalChannelModel() {
  const channelNumber = channels.length + 1;
  const channelId = `channel-${Date.now().toString(36)}`;
  return {
    id: channelId,
    title: `Deal Channel #${channelNumber}`,
    person: "Counterparty",
    avatar: "C",
    mode: "Private",
    status: "Negotiating",
    unread: 0,
    time: "now",
    last: "Channel created",
    local: true,
  };
}

async function createNewChannel() {
  if (!state.walletConnected) {
    const connected = await connectWallet({ goToInbox: false });
    if (!connected) return;
  }

  const channel = createLocalChannelModel();
  channels.unshift(channel);
  messages[channel.id] = [
    {
      type: "event",
      title: "Channel created",
      subtitle: "Secure on-chain deal channel ready.",
      time: Date.now(),
    },
  ];
  if (conversationSearch) conversationSearch.value = "";
  saveLocalChannels();
  renderConversationList();
  openChannel(channel.id);

  try {
    await veilClient.createChannel({
      channelId: channel.id,
      title: channel.title,
    });
    showToast("Channel created.");
  } catch (error) {
    veilError("channel.create.failed", error, {
      where: "createNewChannel",
      channelId: channel.id,
      howToFix: "Confirm wallet connection and helper transport before creating a production on-chain channel.",
    });
    showToast("Channel created locally.");
  }
}

function getWallet() {
  return state.privyAccount
    || window.veilDemoWallet
    || getInjectedStarknetWallet()
    || null;
}

function getInjectedStarknetWallet() {
  return getInjectedStarknetWalletEntry()?.wallet || null;
}

function getWindowValue(key) {
  try {
    return window[key];
  } catch {
    return null;
  }
}

function isInjectedStarknetWallet(wallet) {
  return Boolean(wallet)
    && typeof wallet === "object"
    && (
      typeof wallet.enable === "function"
      || typeof wallet.request === "function"
      || Boolean(wallet.account)
      || Boolean(wallet.provider)
    );
}

function getInjectedStarknetWalletEntry() {
  const keys = [
    "starknet_argentX",
    "starknet_ready",
    "starknet_readyX",
    "starknet_argent",
    "starknet",
    "starknet_braavos",
  ];

  const discoveredKeys = Object.getOwnPropertyNames(window)
    .filter((key) => /^starknet/i.test(key) && !keys.includes(key));

  return [...keys, ...discoveredKeys]
    .map((key) => ({ key, wallet: getWindowValue(key) }))
    .filter((entry) => isInjectedStarknetWallet(entry.wallet))
    .sort((first, second) => walletPriority(first) - walletPriority(second))[0] || null;
}

function walletPriority(entry) {
  const label = `${entry.key} ${walletSourceLabel(entry.wallet)}`;
  if (/argent|ready/i.test(label)) return 0;
  if (/braavos/i.test(label)) return 1;
  if (entry.key === "starknet") return 2;
  return 3;
}

async function waitForInjectedStarknetWallet(timeout = 2_000) {
  const existing = getInjectedStarknetWalletEntry();
  if (existing) return existing;

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const entry = getInjectedStarknetWalletEntry();
    if (entry) return entry;
  }

  return null;
}

function walletSourceLabel(wallet) {
  const name = wallet?.name || wallet?.id || wallet?.metadata?.name || "";
  if (/argent|ready/i.test(name)) return "Argent";
  if (/braavos/i.test(name)) return "Braavos";
  return name || "Starknet wallet";
}

function ensureHex(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.startsWith("0x") ? normalized : `0x${normalized}`;
}

function splitPrivySignature(signature) {
  if (Array.isArray(signature) && signature.length >= 2) {
    return [ensureHex(signature[0]), ensureHex(signature[1])];
  }

  const raw = typeof signature === "string"
    ? signature
    : signature?.signature || signature?.rawSignature || signature?.raw_signature || "";
  const hex = ensureHex(raw).slice(2);
  if (hex.length < 128) {
    throw new Error("Privy signature is not a 64-byte Stark signature.");
  }
  return [`0x${hex.slice(0, 64)}`, `0x${hex.slice(64, 128)}`];
}

function normalizeChainId(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "";
  if (normalized === "SN_SEPOLIA" || normalized === "0X534E5F5345504F4C4941") return "SN_SEPOLIA";
  if (normalized === "SN_MAIN" || normalized === "0X534E5F4D41494E") return "SN_MAIN";
  return normalized;
}

function networkLabel(chainId = state.walletNetwork) {
  const normalized = normalizeChainId(chainId);
  if (normalized === "SN_SEPOLIA") return "Sepolia";
  if (normalized === "SN_MAIN") return "Mainnet";
  return normalized || "Not detected";
}

function shortAddress(address) {
  if (!address) return "Not connected";
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function readAssetDecimals(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function createDefaultWalletAssetBalances() {
  return Object.fromEntries(
    walletAssetConfig.map((asset) => [asset.id, { display: asset.defaultDisplay, status: "idle" }]),
  );
}

function feltToBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  const text = String(value ?? "0");
  return BigInt(text || "0");
}

function parseU256Balance(response) {
  const result = Array.isArray(response) ? response : response?.result;
  const low = feltToBigInt(result?.[0] ?? 0);
  const high = feltToBigInt(result?.[1] ?? 0);
  return low + (high << 128n);
}

function formatAssetBalance(rawAmount, asset) {
  if (rawAmount === 0n) return asset.defaultDisplay;
  const decimals = Math.max(asset.decimals, 0);
  if (!decimals) return rawAmount.toString();
  const scale = 10n ** BigInt(decimals);
  const whole = rawAmount / scale;
  const fraction = rawAmount % scale;
  const displayDecimals = asset.id === "strkbtc" ? Math.min(decimals, 8) : asset.id === "strk" ? Math.min(decimals, 4) : Math.min(decimals, 2);
  const fractionText = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, displayDecimals)
    .replace(/0+$/, "");
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}

function getPrivyBridge() {
  return window.__veilPrivy || null;
}

function walletInitLabel(status = state.walletInitState) {
  switch (status) {
    case "connecting":
      return "Connecting wallet...";
    case "creating_account":
      return "Connecting wallet...";
    case "deploying":
      return "Connecting wallet...";
    case "connecting_paymaster":
      return "Connecting Paymaster...";
    case "ready":
      return "Connected";
    case "failed":
      return "Retry";
    default:
      return privyAppId && !state.privyReady ? "Loading Privy" : "Connect Wallet";
  }
}

function isWalletInitializationPending(status = state.walletInitState) {
  return WALLET_INIT_PENDING_STATES.has(status);
}

function renderWalletInitializationState() {
  refreshConnectLabels();
  renderHomeStatus();
  if (state.screen === "wallet") renderWallet();
  if (state.screen === "settings") renderSettings();
}

function setWalletInitializationState(nextState, details = {}) {
  const previousState = state.walletInitState;
  state.walletInitState = nextState;
  state.walletInitMessage = details.message || walletInitLabel(nextState);
  state.walletInitError = details.errorMessage || "";
  if (details.traceId) state.walletInitTraceId = details.traceId;
  if (nextState === "connecting") state.walletInitStartedAt = Date.now();
  if (nextState === "idle") {
    state.walletInitStartedAt = 0;
    state.walletInitTraceId = "";
  }

  veilLog("info", "wallet.init.state.changed", {
    traceId: state.walletInitTraceId || details.traceId,
    where: "setWalletInitializationState",
    previousState,
    nextState,
    message: state.walletInitMessage,
    error: state.walletInitError || undefined,
  });
  renderWalletInitializationState();
}

function beginWalletInitialization(traceId) {
  clearTimeout(walletInitTimer);
  setWalletInitializationState("connecting", { traceId });
  walletInitTimer = setTimeout(() => {
    if (state.walletInitTraceId !== traceId || !isWalletInitializationPending()) return;
    veilLog("warn", "wallet.init.timeout", {
      traceId,
      where: "beginWalletInitialization",
      timeoutMs: WALLET_INIT_TIMEOUT_MS,
      why: "Wallet initialization did not reach ready before the production timeout.",
      howToFix: "Check the preceding Privy, StarkZap, AVNU Paymaster, and RPC logs for the first failed step.",
    });
    setWalletInitializationState("failed", {
      traceId,
      message: "Unable to connect wallet.",
      errorMessage: `Wallet initialization exceeded ${WALLET_INIT_TIMEOUT_MS / 1000} seconds.`,
    });
    showToast("Unable to connect wallet.");
  }, WALLET_INIT_TIMEOUT_MS);
}

function updateWalletInitialization(step, traceId, details = {}) {
  if (state.walletInitTraceId && state.walletInitTraceId !== traceId) return;
  if (!isWalletInitializationPending(step) && step !== "ready" && step !== "failed") return;
  setWalletInitializationState(step, { traceId, ...details });
}

function completeWalletInitialization(traceId) {
  clearTimeout(walletInitTimer);
  setWalletInitializationState("ready", { traceId, message: "Wallet connected" });
}

function failWalletInitialization(error, traceId, details = {}) {
  clearTimeout(walletInitTimer);
  const errorMessage = error?.message || details.errorMessage || "Wallet initialization failed.";
  setWalletInitializationState("failed", {
    traceId,
    message: "Unable to connect wallet.",
    errorMessage,
  });
  veilError("wallet.init.failed", error instanceof Error ? error : new Error(errorMessage), {
    traceId,
    where: details.where || "failWalletInitialization",
    howToFix: details.howToFix || "Open the browser console and Vercel function logs for the matching traceId, then retry wallet connection.",
  });
  showToast("Unable to connect wallet.");
  return false;
}

function refreshConnectLabels() {
  const label = isWalletInitializationPending() || state.walletInitState === "failed"
    ? walletInitLabel()
    : state.walletConnected
    ? "Connected"
    : demoRuntimeMode
      ? "Open Demo"
    : privyAppId && !state.privyReady
      ? "Loading Privy"
      : "Connect Wallet";

  document.querySelectorAll("[data-wallet-label]").forEach((node) => {
    node.textContent = label;
  });

  document.querySelectorAll("[data-connect-wallet]").forEach((button) => {
    button.toggleAttribute("aria-busy", isWalletInitializationPending());
  });
}

function waitForPrivyState(predicate, timeout = WALLET_INIT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const current = getPrivyBridge();
    if (current && predicate(current)) {
      resolve(current);
      return;
    }

    const timer = setTimeout(() => {
      window.removeEventListener("veil:privy-state", onState);
      resolve(getPrivyBridge());
    }, timeout);

    function onState() {
      const bridge = getPrivyBridge();
      if (!bridge || !predicate(bridge)) return;
      clearTimeout(timer);
      window.removeEventListener("veil:privy-state", onState);
      resolve(bridge);
    }

    window.addEventListener("veil:privy-state", onState);
  });
}

async function ensurePrivyAuthenticated(traceId = createTraceId("privy-auth")) {
  if (!privyAppId) return null;

  tracePrivyStarkZap(traceId, "privy_ready.wait", {
    where: "ensurePrivyAuthenticated",
    currentOrigin: currentOrigin(),
    loginMethods: privyLoginMethods,
  });
  veilLog("info", "auth.privy.ready.wait", {
    traceId,
    where: "ensurePrivyAuthenticated",
    currentOrigin: currentOrigin(),
  });
  const readyBridge = await waitForPrivyState((bridge) => bridge.ready);
  if (!readyBridge?.ready) {
    tracePrivyStarkZap(traceId, "privy_ready.timeout", {
      where: "ensurePrivyAuthenticated",
      ...summarizePrivyBridge(readyBridge),
      why: "Privy did not become ready before the login timeout.",
      howToFix: "Confirm VITE_PRIVY_APP_ID is set and the current origin is allowed in the Privy dashboard.",
    });
    veilLog("warn", "auth.privy.ready.timeout", {
      traceId,
      where: "ensurePrivyAuthenticated",
      why: "Privy did not become ready before the login timeout.",
      howToFix: "Confirm VITE_PRIVY_APP_ID is set and the current origin is allowed in the Privy dashboard.",
    });
    return null;
  }

  tracePrivyStarkZap(traceId, "privy_ready.success", {
    where: "ensurePrivyAuthenticated",
    ...summarizePrivyBridge(readyBridge),
  });

  if (!readyBridge.authenticated) {
    tracePrivyStarkZap(traceId, "google_login.start", {
      where: "ensurePrivyAuthenticated",
      authenticated: false,
      loginMethods: privyLoginMethods,
      currentOrigin: currentOrigin(),
      howToFix: "If Google opens but returns redirect_uri_mismatch, add the current Privy redirect URL/origin in Google OAuth and Privy dashboard settings.",
    });
    veilLog("info", "auth.privy.login.start", {
      traceId,
      where: "ensurePrivyAuthenticated",
      loginMethods: privyLoginMethods,
      currentOrigin: currentOrigin(),
    });
    try {
      await readyBridge.login();
      tracePrivyStarkZap(traceId, "google_login.modal_resolved", {
        where: "ensurePrivyAuthenticated",
      });
    } catch (error) {
      veilError("trace.privy_starkzap.google_login.failed", error, {
        traceId,
        where: "ensurePrivyAuthenticated",
        howToFix: "Check Google OAuth Authorized JavaScript Origins, Google Authorized Redirect URIs, and Privy OAuth redirect settings for the current origin.",
      });
      throw error;
    }
  }

  tracePrivyStarkZap(traceId, "authenticated.wait", {
    where: "ensurePrivyAuthenticated",
  });
  const authenticatedBridge = await waitForPrivyState((bridge) => bridge.ready && bridge.authenticated);
  if (!authenticatedBridge?.authenticated) {
    tracePrivyStarkZap(traceId, "authenticated.timeout", {
      where: "ensurePrivyAuthenticated",
      ...summarizePrivyBridge(authenticatedBridge),
      why: "Privy login resolved but authenticated never became true.",
      howToFix: "Retry login, then check Privy dashboard auth logs and browser console for OAuth callback errors.",
    });
    veilLog("warn", "auth.privy.login.incomplete", {
      traceId,
      where: "ensurePrivyAuthenticated",
      why: "Privy login did not complete.",
      howToFix: "Complete the Privy login modal, or fix OAuth provider settings if Google returned redirect_uri_mismatch.",
    });
    return null;
  }

  tracePrivyStarkZap(traceId, "authenticated.true", {
    where: "ensurePrivyAuthenticated",
    ...summarizePrivyBridge(authenticatedBridge),
  });
  veilLog("info", "auth.privy.login.success", {
    traceId,
    where: "ensurePrivyAuthenticated",
    ...summarizePrivyBridge(authenticatedBridge),
  });
  return authenticatedBridge;
}

async function fetchPrivyStarknetWallet(bridge, traceId = createTraceId("privy-wallet")) {
  if (state.privyWallet) {
    tracePrivyStarkZap(traceId, "wallet.cached_state.hit", {
      where: "fetchPrivyStarknetWallet",
      walletId: state.privyWallet.id,
      address: state.privyWallet.address,
    });
    return state.privyWallet;
  }

  tracePrivyStarkZap(traceId, "get_access_token.start", {
    where: "fetchPrivyStarknetWallet",
    ...summarizePrivyBridge(bridge),
  });
  const accessToken = await bridge.getAccessToken?.();
  if (!accessToken) {
    const error = new Error("Privy access token is missing.");
    veilError("trace.privy_starkzap.get_access_token.failed", error, {
      traceId,
      where: "fetchPrivyStarknetWallet",
      howToFix: "Confirm authenticated === true before requesting the Starknet wallet, then retry after refreshing the Privy session.",
    });
    throw error;
  }
  tracePrivyStarkZap(traceId, "get_access_token.success", {
    where: "fetchPrivyStarknetWallet",
    accessTokenPresent: true,
  });

  const userId = bridge.user?.id || bridge.user?.did || "veil-user";
  const cacheKey = `veil:privy:starknet:v2:${userId}`;
  const cachedWallet = JSON.parse(window.localStorage.getItem(cacheKey) || "null");
  if (cachedWallet?.id && cachedWallet?.publicKey) {
    tracePrivyStarkZap(traceId, "wallet.local_storage.hit", {
      where: "fetchPrivyStarknetWallet",
      walletId: cachedWallet.id,
      address: cachedWallet.address,
      publicKeyPresent: Boolean(cachedWallet.publicKey),
    });
    veilLog("info", "wallet.starknet.cache.hit", {
      traceId,
      where: "fetchPrivyStarknetWallet",
      walletId: cachedWallet.id,
      address: cachedWallet.address,
    });
    state.privyWallet = cachedWallet;
    state.walletAddress = cachedWallet.address || state.walletAddress;
    state.walletSource = "Privy";
    return cachedWallet;
  }

  tracePrivyStarkZap(traceId, "wallet_api.request", {
    where: "fetchPrivyStarknetWallet",
    endpoint: "/api/wallet/starknet",
    method: "POST",
  });
  veilLog("info", "wallet.starknet.api.request", {
    traceId,
    where: "fetchPrivyStarknetWallet",
    endpoint: "/api/wallet/starknet",
  });
  const response = await fetch("/api/wallet/starknet", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({}),
  });
  const payload = await readResponsePayload(response);

  tracePrivyStarkZap(traceId, "wallet_api.response", {
    where: "fetchPrivyStarknetWallet",
    endpoint: "/api/wallet/starknet",
    status: response.status,
    ok: response.ok,
    requestId: payload.requestId,
    code: payload.code,
  });

  if (!response.ok) {
    const error = new Error(payload.error || payload.why || "Failed to create Starknet wallet with Privy.");
    veilError("trace.privy_starkzap.wallet_api.failed", error, {
      traceId,
      where: "fetchPrivyStarknetWallet",
      endpoint: "/api/wallet/starknet",
      status: response.status,
      requestId: payload.requestId,
      code: payload.code,
      apiWhere: payload.where,
      apiWhy: payload.why,
      apiHowToFix: payload.howToFix,
      howToFix: payload.howToFix || "Open Vercel function logs for this requestId and verify PRIVY_APP_ID, PRIVY_APP_SECRET, and PRIVY_VERIFICATION_KEY.",
    });
    throw error;
  }

  const { wallet } = payload;
  const walletValid = Boolean(wallet?.id && wallet?.publicKey);
  tracePrivyStarkZap(traceId, "wallet_response.validated", {
    where: "fetchPrivyStarknetWallet",
    valid: walletValid,
    walletIdPresent: Boolean(wallet?.id),
    publicKeyPresent: Boolean(wallet?.publicKey),
    addressPresent: Boolean(wallet?.address),
    walletId: wallet?.id,
    address: wallet?.address,
  });
  if (!walletValid) {
    const error = new Error("Privy Starknet wallet response is missing wallet.id or wallet.publicKey.");
    veilError("trace.privy_starkzap.wallet_response.invalid", error, {
      traceId,
      where: "fetchPrivyStarknetWallet",
      endpoint: "/api/wallet/starknet",
      responseKeys: Object.keys(payload || {}),
      howToFix: "Return { wallet: { id, address, publicKey } } from /api/wallet/starknet.",
    });
    throw error;
  }

  veilLog("info", "wallet.starknet.api.success", {
    traceId,
    where: "fetchPrivyStarknetWallet",
    walletId: wallet?.id,
    address: wallet?.address,
  });
  state.privyWallet = wallet;
  state.walletAddress = wallet?.address || state.walletAddress;
  state.walletSource = "Privy";
  window.localStorage.setItem(cacheKey, JSON.stringify(wallet));
  return wallet;
}

async function loadStarknetSdk() {
  if (window.__veilStarknetSdk) return window.__veilStarknetSdk;
  window.__veilStarknetSdk = await import("https://esm.sh/starknet@7.6.4?target=es2022");
  return window.__veilStarknetSdk;
}

async function getStarknetReadProvider() {
  if (starknetReadProvider) return starknetReadProvider;
  const { RpcProvider } = await loadStarknetSdk();
  starknetReadProvider = new RpcProvider({ nodeUrl: privyStarknetRpcUrl });
  return starknetReadProvider;
}

async function readWalletTokenBalance(provider, asset, walletAddress) {
  const response = await provider.callContract({
    contractAddress: asset.contractAddress,
    entrypoint: "balance_of",
    calldata: [walletAddress],
  });
  return parseU256Balance(response);
}

async function refreshWalletAssets(options = {}) {
  const walletAddress = walletAddressValue();
  const configuredAssets = walletAssetConfig.filter((asset) => asset.contractAddress);
  if (!state.walletConnected || !walletAddress) {
    state.walletAssetBalances = createDefaultWalletAssetBalances();
    state.walletAssetSyncKey = "";
    state.walletAssetSyncStatus = "idle";
    renderWalletAssets();
    return;
  }

  if (!configuredAssets.length) {
    renderWalletAssets();
    return;
  }

  const syncKey = [
    walletAddress,
    expectedChainId,
    ...configuredAssets.map((asset) => `${asset.id}:${asset.contractAddress}`),
  ].join(":");
  if (!options.force && state.walletAssetSyncKey === syncKey && ["loading", "ready"].includes(state.walletAssetSyncStatus)) {
    return;
  }

  state.walletAssetSyncKey = syncKey;
  state.walletAssetSyncStatus = "loading";
  configuredAssets.forEach((asset) => {
    state.walletAssetBalances[asset.id] = { display: "Syncing", status: "loading" };
  });
  renderWalletAssets();

  let results;
  try {
    const provider = await getStarknetReadProvider();
    results = await Promise.allSettled(
      configuredAssets.map(async (asset) => {
        const balance = await readWalletTokenBalance(provider, asset, walletAddress);
        return { asset, display: formatAssetBalance(balance, asset) };
      }),
    );
  } catch (error) {
    configuredAssets.forEach((asset) => {
      state.walletAssetBalances[asset.id] = { display: asset.defaultDisplay, status: "error" };
    });
    state.walletAssetSyncStatus = "failed";
    veilError("wallet.asset.sync.failed", error, {
      where: "refreshWalletAssets",
      howToFix: "Check Starknet RPC availability before relying on live wallet asset balances.",
    });
    renderWalletAssets();
    return;
  }

  results.forEach((result, index) => {
    const asset = configuredAssets[index];
    if (result.status === "fulfilled") {
      state.walletAssetBalances[asset.id] = { display: result.value.display, status: "ready" };
      return;
    }
    state.walletAssetBalances[asset.id] = { display: asset.defaultDisplay, status: "error" };
    veilError("wallet.asset.balance.failed", result.reason, {
      where: "refreshWalletAssets",
      asset: asset.symbol,
      tokenAddress: asset.contractAddress,
      howToFix: "Check the token contract address and RPC before relying on live wallet asset balances.",
    });
  });
  state.walletAssetSyncStatus = results.some((result) => result.status === "fulfilled") ? "ready" : "failed";
  renderWalletAssets();
}

function getStarkZapChainId() {
  if (expectedChainId === "SN_MAIN") return ChainId.MAINNET;
  if (expectedChainId === "SN_SEPOLIA") return ChainId.SEPOLIA;
  throw new Error(`Unsupported StarkZap chain id ${expectedChainId}.`);
}

function getStarkZapSdk(options = {}) {
  if (!options.paymasterAccessToken && starkzapSdk) return starkzapSdk;
  const paymasterNodeUrl = new URL("/api/paymaster", currentOrigin()).toString();
  const paymasterConfig = options.paymasterAccessToken
    ? {
        paymaster: {
          nodeUrl: paymasterNodeUrl,
          headers: {
            Authorization: `Bearer ${options.paymasterAccessToken}`,
          },
        },
      }
    : {};
  starkzapSdk = new StarkZap({
    rpcUrl: privyStarknetRpcUrl,
    chainId: getStarkZapChainId(),
    ...paymasterConfig,
    logging: {
      logger: console,
      logLevel: "info",
    },
  });
  veilLog("info", "starkzap.sdk.created", {
    where: "getStarkZapSdk",
    chainId: expectedChainId,
    rpcConfigured: Boolean(privyStarknetRpcUrl),
    paymasterConfigured: Boolean(options.paymasterAccessToken),
    paymasterNodeUrl: options.paymasterAccessToken ? paymasterNodeUrl : undefined,
  });
  return starkzapSdk;
}

async function signWithPrivy(walletId, messageHash, bridge, traceId = createTraceId("privy-sign")) {
  tracePrivyStarkZap(traceId, "sign.get_access_token.start", {
    where: "signWithPrivy",
    walletId,
  });
  const accessToken = await bridge.getAccessToken?.();
  if (!accessToken) {
    const error = new Error("Privy access token is missing before wallet signing.");
    veilError("trace.privy_starkzap.sign.get_access_token.failed", error, {
      traceId,
      where: "signWithPrivy",
      walletId,
      howToFix: "Confirm the Privy session is still authenticated, then retry the signing action.",
    });
    throw error;
  }
  tracePrivyStarkZap(traceId, "sign.get_access_token.success", {
    where: "signWithPrivy",
    walletId,
    accessTokenPresent: true,
  });
  veilLog("info", "wallet.sign.api.request", {
    traceId,
    where: "signWithPrivy",
    walletId,
    endpoint: "/api/wallet/sign",
  });
  const response = await fetch("/api/wallet/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ walletId, hash: messageHash }),
  });
  const payload = await readResponsePayload(response);

  tracePrivyStarkZap(traceId, "sign_api.response", {
    where: "signWithPrivy",
    endpoint: "/api/wallet/sign",
    walletId,
    status: response.status,
    ok: response.ok,
    requestId: payload.requestId,
    code: payload.code,
  });

  if (!response.ok) {
    const error = new Error(payload.error || payload.why || "Privy raw sign failed.");
    veilError("trace.privy_starkzap.sign_api.failed", error, {
      traceId,
      where: "signWithPrivy",
      endpoint: "/api/wallet/sign",
      walletId,
      status: response.status,
      requestId: payload.requestId,
      code: payload.code,
      apiWhere: payload.where,
      apiWhy: payload.why,
      apiHowToFix: payload.howToFix,
      howToFix: payload.howToFix || "Open Vercel function logs for this requestId and confirm the wallet id belongs to the authenticated Privy user.",
    });
    throw error;
  }

  veilLog("info", "wallet.sign.api.success", {
    traceId,
    where: "signWithPrivy",
    walletId,
  });
  return splitPrivySignature(payload.signature);
}

async function createPrivyStarknetAccount(bridge, traceId = createTraceId("starkzap-onboard")) {
  if (state.privyAccount && state.privyProvider) {
    tracePrivyStarkZap(traceId, "sdk_onboard.cached_account.hit", {
      where: "createPrivyStarknetAccount",
      address: state.walletAddress,
      deployed: state.privyAccountDeployed,
    });
    return { account: state.privyAccount, provider: state.privyProvider };
  }

  updateWalletInitialization("creating_account", traceId, {
    message: "Connecting wallet...",
  });
  const wallet = await fetchPrivyStarknetWallet(bridge, traceId);
  const publicKey = ensureHex(wallet.publicKey || wallet.public_key);
  if (!wallet.id || !publicKey) {
    const error = new Error("Privy Starknet wallet is missing wallet id or public key.");
    veilError("trace.privy_starkzap.wallet.invalid_for_onboard", error, {
      traceId,
      where: "createPrivyStarknetAccount",
      walletIdPresent: Boolean(wallet.id),
      publicKeyPresent: Boolean(publicKey),
      howToFix: "Ensure /api/wallet/starknet returns wallet.id and wallet.publicKey exactly as StarkZap Privy onboarding expects.",
    });
    throw error;
  }

  tracePrivyStarkZap(traceId, "sdk_onboard.start", {
    where: "createPrivyStarknetAccount",
    walletId: wallet.id,
    chainId: expectedChainId,
    deploy: "if_needed",
    feeMode: avnuPaymasterEnabled ? "paymaster" : "user_pays",
    accountPreset: "argentXV050",
  });
  veilLog("info", "starkzap.privy.onboard.start", {
    traceId,
    where: "createPrivyStarknetAccount",
    walletId: wallet.id,
    chainId: expectedChainId,
    feeMode: avnuPaymasterEnabled ? "paymaster" : "user_pays",
  });
  let paymasterAccessToken = "";
  if (avnuPaymasterEnabled) {
    updateWalletInitialization("connecting_paymaster", traceId, {
      message: "Connecting Paymaster...",
    });
    tracePrivyStarkZap(traceId, "paymaster.get_access_token.start", {
      where: "createPrivyStarknetAccount",
      walletId: wallet.id,
    });
    paymasterAccessToken = await bridge.getAccessToken?.();
    if (!paymasterAccessToken) {
      const error = new Error("Privy access token is missing for AVNU Paymaster proxy.");
      veilError("trace.privy_starkzap.paymaster.get_access_token.failed", error, {
        traceId,
        where: "createPrivyStarknetAccount",
        walletId: wallet.id,
        howToFix: "Refresh the Privy session before onboarding so /api/paymaster can authenticate the sponsorship request.",
      });
      throw error;
    }
    tracePrivyStarkZap(traceId, "paymaster.configured", {
      where: "createPrivyStarknetAccount",
      walletId: wallet.id,
      nodeUrl: new URL("/api/paymaster", currentOrigin()).toString(),
    });
  }
  const sdk = getStarkZapSdk({ paymasterAccessToken });
  const signEndpoint = new URL("/api/wallet/sign", currentOrigin()).toString();

  try {
    updateWalletInitialization("deploying", traceId, {
      message: "Connecting wallet...",
    });
    starkzapOnboardResult = await sdk.onboard({
      strategy: OnboardStrategy.Privy,
      accountPreset: accountPresets.argentXV050,
      deploy: "if_needed",
      ...(avnuPaymasterEnabled ? { feeMode: { type: "paymaster" } } : {}),
      privy: {
        resolve: async () => {
          tracePrivyStarkZap(traceId, "sdk_onboard.resolve.start", {
            where: "createPrivyStarknetAccount",
            walletId: wallet.id,
            signEndpoint,
          });
          tracePrivyStarkZap(traceId, "sdk_onboard.resolve.success", {
            where: "createPrivyStarknetAccount",
            walletId: wallet.id,
            publicKeyPresent: Boolean(publicKey),
            serverUrl: signEndpoint,
          });
          return {
            walletId: wallet.id,
            publicKey,
            serverUrl: signEndpoint,
            headers: async () => {
              tracePrivyStarkZap(traceId, "sdk_onboard.headers.get_access_token.start", {
                where: "createPrivyStarknetAccount",
                walletId: wallet.id,
              });
              const accessToken = await bridge.getAccessToken?.();
              if (!accessToken) {
                throw new Error("Privy access token is missing.");
              }
              tracePrivyStarkZap(traceId, "sdk_onboard.headers.get_access_token.success", {
                where: "createPrivyStarknetAccount",
                walletId: wallet.id,
                accessTokenPresent: true,
              });
              return { Authorization: `Bearer ${accessToken}` };
            },
            metadata: {
              privyWalletAddress: wallet.address,
            },
          };
        },
      },
      onProgress: (event) => {
        const progress = String(event?.step || event?.status || event?.type || "").toLowerCase();
        if (progress.includes("paymaster")) {
          updateWalletInitialization("connecting_paymaster", traceId, {
            message: "Connecting Paymaster...",
          });
        } else if (progress.includes("deploy")) {
          updateWalletInitialization("deploying", traceId, {
            message: "Connecting wallet...",
          });
        } else if (progress.includes("wallet") || progress.includes("account") || progress.includes("resolve")) {
          updateWalletInitialization("creating_account", traceId, {
            message: "Connecting wallet...",
          });
        }
        tracePrivyStarkZap(traceId, "sdk_onboard.progress", {
          where: "createPrivyStarknetAccount",
          walletId: wallet.id,
          ...event,
        });
        veilLog("info", "starkzap.privy.onboard.progress", {
          traceId,
          where: "createPrivyStarknetAccount",
          walletId: wallet.id,
          ...event,
        });
      },
    });
  } catch (error) {
    veilError("trace.privy_starkzap.sdk_onboard.failed", error, {
      traceId,
      where: "createPrivyStarknetAccount",
      walletId: wallet.id,
      chainId: expectedChainId,
      signEndpoint,
      howToFix: "Check the preceding trace for wallet response validity, /api/wallet/sign status, Starknet RPC/network, and StarkZap deploy/sign errors.",
    });
    throw error;
  }

  const connectedWallet = starkzapOnboardResult.wallet;
  const account = connectedWallet.getAccount();
  const provider = connectedWallet.getProvider();
  const accountAddress = connectedWallet.address || account.address;

  state.privyAccount = connectedWallet;
  state.privyProvider = provider;
  state.walletAddress = accountAddress;
  state.walletSource = "Privy";
  state.privyWallet = { ...wallet, address: accountAddress, publicKey };
  state.privyAccountDeployed = Boolean(starkzapOnboardResult.deployed);

  tracePrivyStarkZap(traceId, "sdk_onboard.success", {
    where: "createPrivyStarknetAccount",
    walletId: wallet.id,
    address: accountAddress,
    deployed: state.privyAccountDeployed,
    feeMode: avnuPaymasterEnabled ? "paymaster" : "user_pays",
  });
  veilLog("info", "starkzap.privy.onboard.success", {
    traceId,
    where: "createPrivyStarknetAccount",
    walletId: wallet.id,
    address: accountAddress,
    deployed: state.privyAccountDeployed,
    feeMode: avnuPaymasterEnabled ? "paymaster" : "user_pays",
  });

  return { account: connectedWallet, provider, starknetAccount: account, wallet: connectedWallet };
}

async function resolveWalletChain(wallet, provider) {
  const candidates = [
    () => provider?.getChainId?.(),
    () => wallet?.getChainId?.(),
    () => wallet?.request?.({ type: "wallet_requestChainId" }),
    () => wallet?.request?.({ type: "wallet_getChainId" }),
    () => provider?.chainId,
    () => wallet?.chainId,
  ];

  for (const candidate of candidates) {
    try {
      const value = await candidate();
      const normalized = normalizeChainId(value);
      if (normalized) return normalized;
    } catch {
      // Try the next wallet/provider shape.
    }
  }

  return "";
}

async function ensureExpectedNetwork(wallet, provider) {
  if (timelineMode !== "direct-helper") return true;

  const detected = await resolveWalletChain(wallet, provider);
  if (detected) {
    state.walletNetwork = detected;
  }

  if (detected && detected !== expectedChainId) {
    renderWallet();
    return false;
  }

  state.walletNetwork = expectedChainId;
  return true;
}

async function verifyHelperDeployment() {
  if (timelineMode !== "direct-helper") return true;
  if (!helperAddress) {
    return false;
  }

  try {
    await veilClient.getEventCount(state.channelId);
    state.helperVerified = true;
    renderWallet();
    return true;
  } catch (error) {
    veilError("wallet.helper.verify.failed", error, {
      where: "verifyHelperDeployment",
      howToFix: "Confirm VITE_VEIL_CHANNEL_HELPER_ADDRESS is deployed on the configured Starknet RPC/network.",
    });
    state.helperVerified = false;
    renderWallet();
    return false;
  }
}

async function connectWallet(options = {}) {
  const goToInbox = options.goToInbox ?? state.screen === "unlock";
  const traceId = createTraceId("wallet-connect");
  tracePrivyStarkZap(traceId, "connect.start", {
    where: "connectWallet",
    timelineMode,
    goToInbox,
    screen: state.screen,
    privyAppIdConfigured: Boolean(privyAppId),
  });
  beginWalletInitialization(traceId);

  if (timelineMode !== "direct-helper") {
    if (privyAppId) {
      try {
        const bridge = await ensurePrivyAuthenticated(traceId);
        if (!bridge) {
          tracePrivyStarkZap(traceId, "connect.stopped", {
            where: "connectWallet",
            stoppedAt: "ensurePrivyAuthenticated",
            why: "Privy bridge was not ready or authenticated.",
            howToFix: "Check earlier trace steps for privy_ready.timeout or authenticated.timeout.",
          });
          return failWalletInitialization(new Error("Privy authentication did not complete."), traceId, {
            where: "connectWallet",
            howToFix: "Check earlier trace steps for privy_ready.timeout or authenticated.timeout.",
          });
        }
        updateWalletInitialization("creating_account", traceId, {
          message: "Connecting wallet...",
        });
        await fetchPrivyStarknetWallet(bridge, traceId);
      } catch (error) {
        veilError("wallet.privy.setup.failed", error, {
          traceId,
          where: "connectWallet",
          howToFix: "Check Privy app credentials, token verification env vars, and /api/wallet/starknet logs.",
        });
        return failWalletInitialization(error, traceId, {
          where: "connectWallet",
          howToFix: "Check Privy app credentials, token verification env vars, and /api/wallet/starknet logs.",
        });
      }
    }
    state.walletConnected = true;
    state.walletNetwork = expectedChainId;
    completeWalletInitialization(traceId);
    renderWallet();
    refreshConnectLabels();
    showToast("Wallet connected.");
    if (goToInbox) showScreen("conversations");
    tracePrivyStarkZap(traceId, "connect.success", {
      where: "connectWallet",
      walletSource: state.walletSource,
      walletAddress: state.walletAddress,
      directHelper: false,
    });
    return true;
  }

  if (!helperAddress) {
    tracePrivyStarkZap(traceId, "connect.stopped", {
      where: "connectWallet",
      stoppedAt: "helper_address",
      why: "VITE_VEIL_CHANNEL_HELPER_ADDRESS is missing.",
      howToFix: "Set VITE_VEIL_CHANNEL_HELPER_ADDRESS to the deployed helper contract for the selected Starknet network.",
    });
    return failWalletInitialization(new Error("Wallet helper address is not configured."), traceId, {
      where: "connectWallet",
      howToFix: "Set VITE_VEIL_CHANNEL_HELPER_ADDRESS to the deployed helper contract for the selected Starknet network.",
    });
  }

  let injectedWalletEntry = null;
  let injectedWallet = null;
  let privyAccountContext = null;
  if (privyAppId) {
    try {
      const bridge = await ensurePrivyAuthenticated(traceId);
      if (!bridge) {
        tracePrivyStarkZap(traceId, "connect.stopped", {
          where: "connectWallet",
          stoppedAt: "ensurePrivyAuthenticated",
          why: "Privy bridge was not ready or authenticated.",
          howToFix: "Check earlier trace steps for privy_ready.timeout or authenticated.timeout.",
        });
        return failWalletInitialization(new Error("Privy authentication did not complete."), traceId, {
          where: "connectWallet",
          howToFix: "Check earlier trace steps for privy_ready.timeout or authenticated.timeout.",
        });
      }
      updateWalletInitialization("creating_account", traceId, {
        message: "Connecting wallet...",
      });
      privyAccountContext = await createPrivyStarknetAccount(bridge, traceId);
    } catch (error) {
      veilError("starkzap.privy.onboard.failed", error, {
        traceId,
        where: "connectWallet",
        howToFix: "Fund the counterfactual account if user-pays deployment is required, verify /api/wallet/sign, and confirm the RPC matches VITE_STARKNET_CHAIN_ID.",
      });
      tracePrivyStarkZap(traceId, "injected_wallet.fallback.wait", {
        where: "connectWallet",
      });
      injectedWalletEntry = await waitForInjectedStarknetWallet();
      injectedWallet = injectedWalletEntry?.wallet || null;
      tracePrivyStarkZap(traceId, "injected_wallet.fallback.result", {
        where: "connectWallet",
        found: Boolean(injectedWallet),
        source: injectedWallet ? walletSourceLabel(injectedWallet) : undefined,
      });
      if (!injectedWallet) {
        return failWalletInitialization(error, traceId, {
          where: "connectWallet",
          howToFix: "Check StarkZap/Privy logs for sdk.onboard(), AVNU Paymaster sponsorship, /api/wallet/sign, and RPC errors.",
        });
      }
      veilLog("warn", "wallet.init.injected_fallback.used", {
        traceId,
        where: "connectWallet",
        source: walletSourceLabel(injectedWallet),
        why: "Privy StarkZap onboarding failed, but an injected Starknet wallet was available.",
      });
    }
  }

  if (!privyAccountContext && !injectedWallet) {
    tracePrivyStarkZap(traceId, "injected_wallet.wait", {
      where: "connectWallet",
    });
    injectedWalletEntry = await waitForInjectedStarknetWallet();
    injectedWallet = injectedWalletEntry?.wallet || null;
    tracePrivyStarkZap(traceId, "injected_wallet.result", {
      where: "connectWallet",
      found: Boolean(injectedWallet),
      source: injectedWallet ? walletSourceLabel(injectedWallet) : undefined,
    });
  }

  const wallet = privyAccountContext?.account || injectedWallet || getWallet();
  if (!wallet) {
    tracePrivyStarkZap(traceId, "connect.stopped", {
      where: "connectWallet",
      stoppedAt: "wallet_selection",
      why: "No Privy Starknet account or injected Starknet wallet was available.",
      howToFix: "Check prior Privy trace steps, or install/connect an injected Starknet wallet as fallback.",
    });
    return failWalletInitialization(new Error("No Privy Starknet account or injected Starknet wallet was available."), traceId, {
      where: "connectWallet",
      howToFix: "Check prior Privy trace steps, or install/connect an injected Starknet wallet as fallback.",
    });
  }

  if (!wallet.account && typeof wallet.enable === "function") {
    await wallet.enable();
  }

  const account = wallet.account || wallet;
  const walletProvider = privyAccountContext?.provider || state.privyProvider || wallet.provider || wallet.account?.provider;
  const readProvider = await getStarknetReadProvider().catch((error) => {
    veilError("wallet.rpc.provider.failed", error, {
      where: "connectWallet",
      howToFix: "Set VITE_PRIVY_STARKNET_RPC_URL or VITE_STARKNET_RPC_URL to a reachable Starknet RPC for the selected chain.",
    });
    return walletProvider;
  });
  if (!account?.execute) {
    tracePrivyStarkZap(traceId, "connect.stopped", {
      where: "connectWallet",
      stoppedAt: "account_execute",
      why: "Selected wallet/account does not expose execute().",
      howToFix: "Check StarkZap onboard result account shape or connect a Starknet wallet that supports account.execute().",
    });
    return failWalletInitialization(new Error("Selected wallet account does not expose execute()."), traceId, {
      where: "connectWallet",
      howToFix: "Check StarkZap onboard result account shape or connect a Starknet wallet that supports account.execute().",
    });
  }
  if (!walletProvider) {
    tracePrivyStarkZap(traceId, "connect.stopped", {
      where: "connectWallet",
      stoppedAt: "wallet_provider",
      why: "No Starknet provider was available from Privy/StarkZap or injected wallet.",
      howToFix: "Check sdk.onboard() result and VITE_PRIVY_STARKNET_RPC_URL.",
    });
    return failWalletInitialization(new Error("No Starknet provider was available from Privy/StarkZap or injected wallet."), traceId, {
      where: "connectWallet",
      howToFix: "Check sdk.onboard() result and VITE_PRIVY_STARKNET_RPC_URL.",
    });
  }

  const isExpectedNetwork = await ensureExpectedNetwork(wallet, walletProvider);
  if (!isExpectedNetwork) {
    tracePrivyStarkZap(traceId, "connect.stopped", {
      where: "connectWallet",
      stoppedAt: "network_check",
      detected: state.walletNetwork,
      expected: expectedChainId,
      why: "Wallet/provider is connected to a different Starknet network.",
      howToFix: `Switch wallet/provider to ${networkLabel(expectedChainId)} or update VITE_STARKNET_CHAIN_ID.`,
    });
    return failWalletInitialization(new Error(`Wallet/provider is not connected to ${networkLabel(expectedChainId)}.`), traceId, {
      where: "connectWallet",
      howToFix: `Switch wallet/provider to ${networkLabel(expectedChainId)} or update VITE_STARKNET_CHAIN_ID.`,
    });
  }

  directTransport = new DirectHelperTransport({
    helperAddress,
    account,
    ...(readProvider ? { provider: readProvider } : {}),
    storePayloadChunks: onchainPayloads,
  });
  veilClient = createClient(directTransport);

  if (!(await verifyHelperDeployment())) {
    tracePrivyStarkZap(traceId, "connect.stopped", {
      where: "connectWallet",
      stoppedAt: "helper_deployment",
      helperAddress,
      why: "Helper contract verification failed on the configured RPC/network.",
      howToFix: "Confirm VITE_VEIL_CHANNEL_HELPER_ADDRESS is deployed on VITE_PRIVY_STARKNET_RPC_URL / VITE_STARKNET_RPC_URL.",
    });
    return failWalletInitialization(new Error("Helper contract verification failed on the configured RPC/network."), traceId, {
      where: "connectWallet",
      howToFix: "Confirm VITE_VEIL_CHANNEL_HELPER_ADDRESS is deployed on VITE_PRIVY_STARKNET_RPC_URL / VITE_STARKNET_RPC_URL.",
    });
  }

  state.walletConnected = true;
  state.walletAddress = account.address || state.privyWallet?.address || state.walletAddress;
  if (injectedWallet) state.walletSource = walletSourceLabel(injectedWallet);
  completeWalletInitialization(traceId);
  renderWallet();
  refreshConnectLabels();
  showToast("Wallet connected.");
  if (goToInbox) showScreen("conversations");
  tracePrivyStarkZap(traceId, "connect.success", {
    where: "connectWallet",
    walletSource: state.walletSource,
    walletAddress: state.walletAddress,
    directHelper: true,
    network: state.walletNetwork,
  });
  return true;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
}

function iconRefresh() {
  if (window.lucide) window.lucide.createIcons();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

function transactionExplorerUrl(txHash) {
  if (!txHash || String(txHash).startsWith("mock-")) return "";
  return `${STARKNET_SEPOLIA_EXPLORER_URL}/tx/${encodeURIComponent(txHash)}`;
}

function shortHash(value) {
  const text = String(value || "");
  if (!text) return "";
  return text.length > 18 ? `${text.slice(0, 10)}...${text.slice(-6)}` : text;
}

function transactionStatusInfo(item) {
  const status = String(item.status || "").toLowerCase();
  if (status === "failed") {
    const label = item.errorLabel || "Failed";
    return { kind: "failed", label: "⚠", ariaLabel: label, detail: label };
  }
  if (status === "read") {
    return { kind: "read", label: "✓✓", ariaLabel: "Read" };
  }
  if (["encrypting", "signing", "pending"].includes(status) || !item.txHash) {
    return { kind: "pending", label: "⏳", ariaLabel: "Processing" };
  }
  return { kind: "confirmed", label: "✓", ariaLabel: "Confirmed" };
}

function renderTransactionLink(item) {
  const txUrl = transactionExplorerUrl(item.txHash);
  if (!txUrl) {
    const title = item.txHash ? `Transaction hash: ${item.txHash}` : "Transaction hash is not available yet";
    return `<a class="tx-link" href="${STARKNET_SEPOLIA_EXPLORER_URL}" target="_blank" rel="noreferrer" data-transaction-pending title="${escapeHtml(title)}">View Transaction</a>`;
  }
  return `<a class="tx-link" href="${escapeHtml(txUrl)}" target="_blank" rel="noreferrer" title="${escapeHtml(item.txHash)}">View Transaction</a>`;
}

function renderShieldBadge(statusInfo) {
  const warning = statusInfo.kind === "failed"
    ? `<span class="shield-warning" aria-label="Failed">⚠</span>`
    : "";
  return `<span class="shield-badge">🛡 Shielded${warning}</span>`;
}

function renderFailureActions(item, statusInfo) {
  if (statusInfo.kind !== "failed") return "";
  const errorText = item.errorMessage || statusInfo.detail || "Transaction failed.";
  return [
    `<button class="tx-action" type="button" data-transaction-retry aria-label="Retry" title="Retry">↻</button>`,
    `<button class="tx-action" type="button" data-transaction-error="${escapeHtml(errorText)}" aria-label="View error" title="View error">!</button>`,
  ].join("");
}

function renderChainMeta(item, alignRight = false) {
  const statusInfo = transactionStatusInfo(item);
  const parts = [];
  parts.push(renderShieldBadge(statusInfo));
  parts.push(`<span class="tx-status ${statusInfo.kind}" aria-label="${escapeHtml(statusInfo.ariaLabel)}" title="${escapeHtml(statusInfo.ariaLabel)}">${escapeHtml(statusInfo.label)}</span>`);
  if (item.time) parts.push(`<time>${escapeHtml(formatTime(item.time))}</time>`);
  if (item.blockNumber !== undefined) parts.push(`<span>Block ${escapeHtml(item.blockNumber)}</span>`);
  if (item.txHash) parts.push(`<span class="tx-hash">${escapeHtml(shortHash(item.txHash))}</span>`);
  parts.push(renderFailureActions(item, statusInfo));
  parts.push(renderTransactionLink(item));

  return `<div class="chain-meta ${alignRight ? "right" : ""}">${parts.join("")}</div>`;
}

function itemStateClass(item) {
  const status = transactionStatusInfo(item).kind;
  if (status === "failed") return "failed";
  if (status === "pending") return "processing";
  return status;
}

function showScreen(screen, options = {}) {
  state.screen = screen;
  screens.forEach((panel) => panel.classList.toggle("hidden", panel.dataset.screen !== screen));

  const rootScreens = ["conversations", "activity", "wallet", "settings"];
  bottomNav.classList.toggle("hidden-nav", !rootScreens.includes(screen));
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.topNav === screen));

  if (screen === "conversations") renderConversationList();
  if (screen === "unlock") renderHomeStatus();
  if (screen === "channel") renderChannel();
  if (screen === "deal") renderDeal();
  if (screen === "escrow") renderEscrow();
  if (screen === "payment") renderPayment();
  if (screen === "wallet") renderWallet();
  if (screen === "settings") renderSettings();
  if (screen === "settlement") renderSettlement();
  if (screen === "proof") renderProof();
  renderWorkflowProgress();

  if (!options.keepScroll) window.scrollTo({ top: 0, behavior: "auto" });
  iconRefresh();
}

function openChannel(channelId) {
  state.channelId = channelId;
  const channel = currentChannel();
  channel.unread = 0;
  showScreen("channel");
  loadIndexedChannelTimeline(channelId);
}

async function loadIndexedChannelTimeline(channelId) {
  if (timelineMode !== "direct-helper" || !helperAddress) return;

  try {
    const response = await fetch(`/api/indexer/messages?channelId=${encodeURIComponent(channelId)}`);
    if (!response.ok) return;
    const payload = await response.json();
    const indexedItems = Array.isArray(payload.messages) ? payload.messages : [];
    if (!indexedItems.length) return;

    const feedItems = [];
    for (const indexedItem of indexedItems) {
      const timelineItem = {
        ...indexedItem,
        channelId,
        eventType: Number(indexedItem.eventType),
        timestamp: Number(indexedItem.timestamp || Date.now()),
      };
      const decrypted = await veilClient.encryption.decryptPayload(timelineItem).catch(() => null);
      const feedItem = decrypted ? timelinePayloadToFeedItem(timelineItem, decrypted) : null;
      if (feedItem) feedItems.push(feedItem);
    }

    if (!feedItems.length) return;
    messages[channelId] = feedItems;
    const channel = channels.find((item) => item.id === channelId);
    const lastItem = feedItems[feedItems.length - 1];
    if (channel && lastItem) {
      channel.last = lastItem.type === "message" ? `${lastItem.sender}: ${lastItem.body}` : lastItem.title;
      channel.time = "now";
    }
    if (state.channelId === channelId && state.screen === "channel") {
      renderChannel();
    }
  } catch (error) {
    veilError("indexer.timeline.load.failed", error, {
      where: "loadIndexedChannelTimeline",
      howToFix: "Check /api/indexer/messages, VEIL_INDEXER_FROM_BLOCK, and the helper deployment address for this channel.",
    });
  }
}

function timelinePayloadToFeedItem(item, payload) {
  const sender = payload.sender === "you" ? "You" : payload.sender || "Peer";
  const base = {
    time: item.timestamp,
    txHash: item.transactionHash,
    blockNumber: item.blockNumber,
    status: item.status || "confirmed",
    mode: item.mode || CHAT_DISPLAY_MODE,
  };

  if (payload.kind === "chat") {
    return {
      ...base,
      mode: CHAT_DISPLAY_MODE,
      type: "message",
      sender,
      body: payload.message,
      self: sender === "You",
    };
  }

  if (payload.kind === "offer" || payload.kind === "counter_offer") {
    return {
      ...base,
      type: "offer",
      title: payload.kind === "counter_offer" ? "Counter offer" : "Offer",
      amount: `${payload.amount}${payload.currency ? ` ${payload.currency}` : ""}`,
      subtitle: payload.terms || "Private terms",
    };
  }

  const titles = {
    accept_offer: "Offer accepted",
    reject_offer: "Offer rejected",
    payment_memo: "AI note attached",
    escrow: "Escrow updated",
    proof: "Proof attached",
  };

  return {
    ...base,
    type: "inline",
    title: titles[payload.kind] || "Channel event",
    subtitle: payload.memo || payload.details || payload.label || payload.reason || "Encrypted event",
  };
}

function statusPillClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("negotiating")) return "status-pill negotiating";
  if (normalized.includes("escrow")) return "status-pill escrow-active";
  if (normalized.includes("waiting")) return "status-pill waiting-deposit";
  if (normalized.includes("settlement")) return "status-pill settlement";
  return "status-pill deal-status";
}

function renderConversationList() {
  const query = conversationSearch?.value.trim().toLowerCase() || "";
  const rows = channels.filter((channel) => {
    const value = `${channel.title} ${channel.person} ${channel.last} ${channel.status}`.toLowerCase();
    return value.includes(query);
  });

  conversationList.innerHTML = rows.map((channel) => `
    <button class="conversation-row" type="button" data-open-channel="${escapeHtml(channel.id)}">
      <span class="avatar">${escapeHtml(channel.avatar)}</span>
      <span class="min-w-0">
        <span class="flex min-w-0 items-center gap-2">
          <strong class="truncate text-[.98rem]">${escapeHtml(channel.title)}</strong>
          <span class="${statusPillClass(channel.status)}">${escapeHtml(channel.status)}</span>
        </span>
        <span class="mt-1 block truncate text-sm font-semibold text-slate-500">${escapeHtml(channel.last)}</span>
        <span class="mt-1 flex items-center gap-2 text-xs font-bold text-slate-400">
          <span class="status-dot"></span>
          ${escapeHtml(channel.person)}
        </span>
      </span>
      <span class="grid justify-items-end gap-2">
        <time class="text-xs font-bold text-slate-400">${escapeHtml(channel.time)}</time>
        ${channel.unread ? `<span class="unread">${channel.unread}</span>` : "<span class=\"size-2 rounded-full bg-slate-200\"></span>"}
      </span>
    </button>
  `).join("");
  iconRefresh();
}

function renderChannel() {
  const channel = currentChannel();
  document.querySelector("#channel-title").textContent = channel.title;
  document.querySelector("#channel-meta").textContent = `${channel.person} - ${channel.status}`;
  const contextTitle = document.querySelector("#channel-context-title");
  const contextParty = document.querySelector("#channel-context-party");
  const contextStatus = document.querySelector("#channel-context-status");
  if (contextTitle) contextTitle.textContent = channel.title;
  if (contextParty) contextParty.textContent = channel.person;
  if (contextStatus) {
    contextStatus.textContent = channel.status;
    contextStatus.className = statusPillClass(channel.status);
  }
  messageFeed.innerHTML = `
    <div class="timeline-day"><span>Today</span></div>
    ${channelMessages().map(renderFeedItem).join("")}
  `;
  iconRefresh();
}

function renderFeedItem(item) {
  if (item.type === "message") return renderMessage(item);
  if (item.type === "offer") return renderOfferCard(item);
  return renderInlineEvent(item);
}

function renderMessage(item) {
  const self = item.self || item.sender === "You";
  return `
    <article class="message ${self ? "self" : ""} ${itemStateClass(item)}">
      <div class="message-stack ${self ? "right" : ""}">
        <div class="message-meta ${self ? "text-right" : ""}">
          <span>${escapeHtml(self ? "You" : item.sender)}</span>
          <time>${escapeHtml(formatTime(item.time))}</time>
        </div>
        <p class="bubble">${escapeHtml(item.body)}</p>
        ${renderChainMeta(item, self)}
      </div>
    </article>
  `;
}

function timelineIcon(item) {
  const label = `${item.title || ""} ${item.subtitle || ""}`.toLowerCase();
  if (label.includes("channel")) return "network";
  if (label.includes("payment") || label.includes("memo")) return "file-text";
  if (label.includes("escrow")) return "shield-check";
  if (label.includes("offer") || label.includes("counter")) return "badge-dollar-sign";
  return "shield";
}

function renderOfferCard(item) {
  return `
    <article class="timeline-event offer-timeline ${itemStateClass(item)}">
      <span class="timeline-marker"><i data-lucide="${timelineIcon(item)}" class="size-4"></i></span>
      <div class="timeline-card">
        <strong>${escapeHtml(item.title)}</strong>
        <b>${escapeHtml(item.amount)}</b>
        <small>${escapeHtml(item.subtitle)}</small>
        ${renderChainMeta(item)}
      </div>
      <button type="button" data-open-route="deal">Open</button>
    </article>
  `;
}

function renderInlineEvent(item) {
  return `
    <article class="timeline-event ${itemStateClass(item)}">
      <span class="timeline-marker"><i data-lucide="${timelineIcon(item)}" class="size-4"></i></span>
      <div class="timeline-card">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.subtitle || formatTime(item.time))}</small>
        ${renderChainMeta(item)}
      </div>
    </article>
  `;
}

function currentOfferProofItem() {
  const offerItem = [...channelMessages()]
    .reverse()
    .find((item) => {
      if (item.type === "offer") return true;
      const label = `${item.title || ""} ${item.subtitle || ""}`.toLowerCase();
      return label.includes("counter offer") && !label.includes("accepted");
    });
  return {
    ...(offerItem || {}),
    type: "inline",
    title: offerItem?.title || "Current offer",
    time: offerItem?.time || now - 2 * minute,
    mode: CHAT_DISPLAY_MODE,
  };
}

function setElementText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function offerPrivacyMode() {
  return state.defaultPrivacyMode === "unshield" ? "unshield" : "shield";
}

function offerPrivacyLabel() {
  return offerPrivacyMode() === "shield" ? "Shielded" : "Unshielded";
}

function renderDealTransactionSummary() {
  const isShielded = offerPrivacyMode() === "shield";
  const privacyFeeRow = document.querySelector("#deal-privacy-fee-row");

  setElementText("#deal-price", DEAL_OFFER_AMOUNT);
  setElementText("#deal-summary-offer", DEAL_OFFER_AMOUNT);
  setElementText("#deal-network-fee", FEE_ESTIMATE_PENDING);
  setElementText("#deal-privacy-fee", FEE_ESTIMATE_PENDING);
  setElementText("#deal-summary-total", TOTAL_ESTIMATE_PENDING);
  setElementText("#offer-review-amount", DEAL_OFFER_AMOUNT);
  setElementText("#offer-review-privacy", offerPrivacyLabel());
  setElementText("#offer-review-fee", FEE_ESTIMATE_PENDING);
  setElementText("#offer-review-total", TOTAL_ESTIMATE_PENDING);

  if (privacyFeeRow) privacyFeeRow.classList.toggle("hidden", !isShielded);
}

function showOfferReview() {
  renderDealTransactionSummary();
  if (!offerReviewModal) return;
  offerReviewModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  iconRefresh();
  offerReviewModal.querySelector("[data-offer-review-sign]")?.focus();
}

function hideOfferReview() {
  if (!offerReviewModal) return;
  offerReviewModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function paymentAmountLabel() {
  const amount = document.querySelector("#payment-amount")?.value.trim() || "450";
  const asset = document.querySelector("#payment-asset")?.value.trim() || "STRK";
  return `${amount} ${asset}`;
}

function paymentPrivacyLabel() {
  return state.paymentMode === "shield" ? "Shield" : "Unshield";
}

function paymentMemoValue() {
  return document.querySelector("#payment-memo")?.value.trim() || "Final settlement for rights transfer.";
}

function renderPaymentTransactionSummary() {
  const isShielded = state.paymentMode === "shield";
  const privacyFeeRow = document.querySelector("#payment-privacy-fee-row");

  setElementText("#payment-summary-amount", paymentAmountLabel());
  setElementText("#payment-network-fee", FEE_ESTIMATE_PENDING);
  setElementText("#payment-privacy-fee", FEE_ESTIMATE_PENDING);
  setElementText("#payment-summary-total", TOTAL_ESTIMATE_PENDING);
  setElementText("#payment-review-recipient", PAYMENT_RECIPIENT);
  setElementText("#payment-review-amount", paymentAmountLabel());
  setElementText("#payment-review-privacy", paymentPrivacyLabel());
  setElementText("#payment-review-fee", FEE_ESTIMATE_PENDING);
  setElementText("#payment-review-memo", paymentMemoValue());
  setElementText("#payment-review-total", TOTAL_ESTIMATE_PENDING);

  if (privacyFeeRow) privacyFeeRow.classList.toggle("hidden", !isShielded);
}

function showPaymentReview() {
  renderPaymentTransactionSummary();
  if (!paymentReviewModal) return;
  paymentReviewModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  iconRefresh();
  paymentReviewModal.querySelector("[data-payment-review-sign]")?.focus();
}

function hidePaymentReview() {
  if (!paymentReviewModal) return;
  paymentReviewModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function workflowStageData() {
  const status = String(currentChannel().status || "").toLowerCase();
  const escrowSettlementComplete = state.escrowReleased && !state.paymentSent;
  const settlementReady = status.includes("settlement ready");
  const settlementStatusComplete = status.includes("settlement") && !status.includes("ready");
  const channelInEscrow = status.includes("escrow") || status.includes("settlement");
  const negotiationComplete = state.offerAccepted || settlementReady || escrowSettlementComplete || state.paymentSent || channelInEscrow;
  const escrowComplete = escrowSettlementComplete || settlementReady || state.paymentSent || settlementStatusComplete;
  const settlementComplete = escrowSettlementComplete || state.paymentSent || settlementStatusComplete;
  const activeStage = settlementComplete || settlementReady || state.screen === "payment" || state.screen === "settlement" || state.screen === "proof"
    ? "settlement"
    : negotiationComplete || state.screen === "escrow"
      ? "escrow"
      : "negotiation";

  return [
    { id: "negotiation", label: "Negotiation", done: negotiationComplete, active: activeStage === "negotiation" },
    { id: "escrow", label: "Escrow", done: escrowComplete, active: activeStage === "escrow" },
    { id: "settlement", label: "Settlement", done: settlementComplete, active: activeStage === "settlement" },
  ];
}

function renderWorkflowProgress() {
  const stages = workflowStageData();
  document.querySelectorAll("[data-workflow-progress]").forEach((container) => {
    container.innerHTML = `
      <strong>${escapeHtml(currentChannel().title || "Rights Transfer")}</strong>
      <ol>
        ${stages.map((stage) => {
          const stateClass = stage.done ? "complete" : stage.active ? "active" : "pending";
          const icon = stage.done ? "check" : stage.active ? "circle-dot" : "circle";
          return `<li class="${stateClass}"><span><i data-lucide="${icon}" class="size-3.5"></i></span><em>${escapeHtml(stage.label)}</em></li>`;
        }).join("")}
      </ol>
    `;
  });
}

function latestChannelItem(predicate) {
  return [...channelMessages()].reverse().find(predicate);
}

function escrowFundingProofItem() {
  const item = latestChannelItem((entry) => {
    const label = `${entry.title || ""} ${entry.subtitle || ""}`.toLowerCase();
    return label.includes("deposit") || label.includes("escrow is ready") || label.includes("offer accepted");
  });
  return {
    ...(item || {}),
    type: "inline",
    title: item?.title || "Escrow funding",
    time: item?.time || now - 3 * minute,
    mode: CHAT_DISPLAY_MODE,
  };
}

function escrowReleaseProofItem() {
  const item = latestChannelItem((entry) => {
    const label = `${entry.title || ""} ${entry.subtitle || ""}`.toLowerCase();
    return label.includes("escrow released") || label.includes("settlement can complete");
  });
  return {
    ...(item || {}),
    type: "inline",
    title: item?.title || "Escrow release",
    time: item?.time || (state.escrowReleased ? Date.now() : undefined),
    mode: CHAT_DISPLAY_MODE,
  };
}

function hasRealTransactionHash(item) {
  return Boolean(item?.txHash && !String(item.txHash).startsWith("mock-"));
}

function renderEscrowProofMeta(item) {
  return hasRealTransactionHash(item) ? renderChainMeta(item) : "";
}

function setLucideIcon(container, iconName, sizeClass = "size-5") {
  const icon = container?.querySelector("svg, i");
  if (icon) icon.outerHTML = `<i data-lucide="${iconName}" class="${sizeClass}"></i>`;
}

function escrowConfirmationsComplete() {
  return Boolean(state.escrowConfirmations.buyer && state.escrowConfirmations.seller);
}

function renderDeal() {
  const accepted = state.offerAccepted || state.escrowReleased || state.paymentSent;
  const currentStatus = accepted ? "Accepted" : "Negotiating";
  const currentStatusEl = document.querySelector("#deal-current-status");
  const dealStatusEl = document.querySelector("#deal-status");
  const negotiationActions = document.querySelector("#deal-negotiation-actions");
  const escrowAction = document.querySelector("#deal-escrow-action");
  const nextStepCopy = document.querySelector("#deal-next-step-copy");
  const waitingStep = document.querySelector("#offer-history-waiting");
  const offerProof = document.querySelector("#deal-offer-proof");
  renderDealTransactionSummary();
  if (currentStatusEl) currentStatusEl.textContent = currentStatus;
  if (dealStatusEl) {
    dealStatusEl.textContent = currentStatus;
    dealStatusEl.className = accepted ? "status-pill escrow-active" : statusPillClass(currentStatus);
  }
  if (negotiationActions) negotiationActions.classList.toggle("hidden", accepted);
  if (escrowAction) escrowAction.classList.toggle("hidden", !accepted);
  if (nextStepCopy) nextStepCopy.textContent = accepted
    ? "Continue to Escrow to secure the accepted proposal."
    : "Accept this proposal to continue to Escrow.";
  if (waitingStep) {
    waitingStep.classList.toggle("complete", accepted);
    waitingStep.classList.toggle("active", !accepted);
    waitingStep.querySelector("span").textContent = accepted ? "Proposal Accepted" : "Waiting for Response";
    waitingStep.querySelector("strong").textContent = accepted ? "Ready" : "Open";
  }
  if (offerProof) offerProof.innerHTML = renderChainMeta(currentOfferProofItem());
}

function renderEscrow() {
  const releaseDone = state.escrowReleased || state.paymentSent;
  const releaseReady = releaseDone || escrowConfirmationsComplete();
  const escrowDisplayStatus = releaseDone ? "Settlement" : "Escrow Active";
  const fundingItem = escrowFundingProofItem();
  const releaseItem = escrowReleaseProofItem();
  const fundingProof = document.querySelector("#escrow-funding-proof");
  const fundingProofTimeline = document.querySelector("#escrow-funding-proof-timeline");
  const releaseProof = document.querySelector("#escrow-release-proof");
  const releaseAction = document.querySelector("#escrow-release-action");
  const releaseStep = document.querySelector("#escrow-release-proof-step");
  const settlementAction = document.querySelector("#escrow-settlement-action");
  const disputeAction = document.querySelector("#escrow-dispute-action");
  const escrowChannelStatus = document.querySelector("#escrow-channel-status");

  if (escrowChannelStatus) {
    escrowChannelStatus.textContent = escrowDisplayStatus;
    escrowChannelStatus.className = statusPillClass(escrowDisplayStatus);
  }

  [
    ["#escrow-buyer-confirmed", "buyer"],
    ["#escrow-seller-confirmed", "seller"],
  ].forEach(([selector, key]) => {
    const item = document.querySelector(selector);
    if (!item) return;
    const complete = releaseDone || Boolean(state.escrowConfirmations[key]);
    item.classList.toggle("complete", complete);
    setLucideIcon(item, complete ? "check" : "circle");
    const status = item.querySelector("small");
    if (status) status.textContent = complete ? "Confirmed" : "Waiting";
  });

  setElementText("#escrow-funding-status", "Deposits recorded");
  setElementText("#escrow-release-status", releaseDone ? "Released" : "Waiting for both approvals");
  setElementText("#escrow-release-copy", releaseDone
    ? "Escrow released. Settlement proof is ready."
    : releaseReady
      ? "Ready for wallet signature."
      : "Waiting for both approvals");
  if (fundingProof) fundingProof.innerHTML = renderEscrowProofMeta(fundingItem);
  if (fundingProofTimeline) fundingProofTimeline.innerHTML = renderEscrowProofMeta(fundingItem);
  if (releaseProof) releaseProof.innerHTML = releaseDone ? renderEscrowProofMeta(releaseItem) : "";
  if (releaseStep) {
    releaseStep.classList.toggle("complete", releaseDone);
    releaseStep.classList.toggle("pending", !releaseDone);
    setLucideIcon(releaseStep, releaseDone ? "check" : "circle", "size-4");
  }
  if (releaseAction) {
    releaseAction.disabled = !releaseReady || releaseDone;
    releaseAction.classList.toggle("disabled", !releaseReady || releaseDone);
    releaseAction.innerHTML = releaseDone
      ? `<i data-lucide="check" class="size-5"></i><span>Released</span>`
      : releaseReady
        ? `<i data-lucide="unlock" class="size-5"></i><span>Release Escrow</span>`
        : `<i data-lucide="lock" class="size-5"></i><span>Release Escrow</span><small>Locked</small>`;
  }
  if (settlementAction) {
    if (releaseDone) {
      settlementAction.disabled = false;
      settlementAction.classList.remove("disabled");
      settlementAction.dataset.openRoute = "settlement";
      settlementAction.innerHTML = `<i data-lucide="check" class="size-5"></i><span>View Settlement Proof</span>`;
      setElementText("#escrow-settlement-copy", "Settlement proof is ready.");
    } else {
      settlementAction.disabled = true;
      settlementAction.classList.add("disabled");
      settlementAction.dataset.openRoute = "settlement";
      settlementAction.innerHTML = `<i data-lucide="lock" class="size-5"></i><span>Settlement Locked</span>`;
      setElementText("#escrow-settlement-copy", "Release escrow to generate settlement proof.");
    }
  }

  if (disputeAction) {
    disputeAction.textContent = state.escrowDisputeOpened ? "Dispute Opened" : "Dispute";
    disputeAction.disabled = state.escrowDisputeOpened;
    disputeAction.classList.toggle("disabled", state.escrowDisputeOpened);
  }
  iconRefresh();
}

function renderPayment() {
  const paymentDealStatus = document.querySelector("#payment-deal-status");
  const settlementAction = document.querySelector("#payment-settlement-action");
  if (paymentDealStatus) {
    paymentDealStatus.textContent = state.paymentSent
      ? "Settlement Complete"
      : state.escrowReleased
        ? "Settlement Ready"
        : "Escrow Active";
  }
  document.querySelectorAll("[data-payment-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.paymentMode === state.paymentMode);
  });
  renderPaymentTransactionSummary();
  if (settlementAction) {
    settlementAction.disabled = !state.paymentSent;
    settlementAction.classList.toggle("disabled", !state.paymentSent);
    settlementAction.innerHTML = state.paymentSent
      ? `<i data-lucide="check" class="size-5"></i><span>View Settlement</span>`
      : `<i data-lucide="lock" class="size-5"></i><span>Settlement Locked</span>`;
    setElementText("#payment-settlement-copy", state.paymentSent
      ? "Settlement proof is ready."
      : "Send payment to generate settlement proof.");
  }
}

function expectedNetworkName() {
  const normalized = normalizeChainId(expectedChainId);
  if (normalized === "SN_SEPOLIA") return "Starknet Sepolia";
  if (normalized === "SN_MAIN") return "Starknet Mainnet";
  return networkLabel(expectedChainId);
}

function expectedNetworkStatus() {
  const normalized = normalizeChainId(expectedChainId);
  if (normalized === "SN_SEPOLIA") return "Testnet";
  if (normalized === "SN_MAIN") return "Mainnet";
  return "Configured network";
}

function walletFailureCategory() {
  const message = `${state.walletInitError || ""} ${state.walletInitMessage || ""}`.toLowerCase();
  if (!message.trim()) return "Unable to connect";
  if (message.includes("not connected to") || message.includes("different starknet network")) return "Wrong network";
  if (message.includes("does not expose execute") || message.includes("no privy starknet account") || message.includes("no starknet provider")) {
    return "Unsupported wallet";
  }
  if (message.includes("helper") || message.includes("rpc") || message.includes("network")) return "Network unavailable";
  return "Unable to connect";
}

function homeHelperContractLabel() {
  if (timelineMode !== "direct-helper") return "Local demo";
  if (!helperAddress) return "Network unavailable";
  if (state.walletInitState === "failed" && walletFailureCategory() === "Network unavailable") return "Network unavailable";
  return "Verified";
}

function homePrivacyPoolLabel() {
  if (privacyPoolAddress && privacyPoolAddress !== "mock-privacy-pool") return "Connected";
  return timelineMode === "mock" ? "Demo" : "Connected";
}

function renderHomeStatus() {
  const homeNetwork = document.querySelector("#home-network");
  const homePrivacyPool = document.querySelector("#home-privacy-pool");
  const homeHelperContract = document.querySelector("#home-helper-contract");
  const homeEnvironment = document.querySelector("#home-environment");

  if (homeNetwork) homeNetwork.textContent = expectedNetworkName();
  if (homePrivacyPool) homePrivacyPool.textContent = homePrivacyPoolLabel();
  if (homeHelperContract) homeHelperContract.textContent = homeHelperContractLabel();
  if (homeEnvironment) homeEnvironment.textContent = expectedNetworkStatus();
}

function applyHomeResourceLinks() {
  document.querySelectorAll("[data-home-link]").forEach((link) => {
    const href = homeResourceLinks[link.dataset.homeLink] || "#";
    link.setAttribute("href", href);
    if (href === "#") {
      link.setAttribute("aria-disabled", "true");
      link.removeAttribute("target");
      link.removeAttribute("rel");
      return;
    }
    link.removeAttribute("aria-disabled");
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noreferrer");
  });
}

function closeHomeMenu() {
  const panel = document.querySelector("[data-home-menu-panel]");
  const toggle = document.querySelector("[data-home-menu-toggle]");
  if (panel) panel.hidden = true;
  if (toggle) toggle.setAttribute("aria-expanded", "false");
}

function renderWallet() {
  const connected = state.walletConnected;
  const pending = isWalletInitializationPending();
  const failed = state.walletInitState === "failed";
  const title = pending
    ? walletInitLabel()
    : failed
      ? "Unable to connect wallet."
      : connected ? "Connected" : "Not connected";
  const subtitle = pending
    ? "Preparing secure Starknet access."
    : failed
      ? "Retry wallet connection."
      : state.privyAccount && !state.privyAccountDeployed
        ? `Fund ${shortAddress(state.walletAddress)} with Sepolia STRK, then connect again.`
        : connected
          ? "This wallet can access encrypted deal channels."
          : "Connect with Privy to unlock VEIL on this device.";
  const statusText = pending ? "Connecting" : failed ? "Failed" : connected ? "Connected" : "Disconnected";
  const helperText = pending
    ? state.walletInitMessage
    : failed
      ? "Retry"
      : timelineMode === "direct-helper"
        ? state.privyAccount && !state.privyAccountDeployed
          ? "Account funding needed"
          : state.helperVerified ? "Verified" : "Check required"
        : "Mock demo";
  const walletTitle = document.querySelector("#wallet-state-title");
  const walletSubtitle = document.querySelector("#wallet-state-subtitle");
  const walletStatus = document.querySelector("#wallet-status-pill");
  const walletAccount = document.querySelector("#wallet-account");
  const walletNetwork = document.querySelector("#wallet-network");
  const walletProvider = document.querySelector("#wallet-provider");
  const walletHelper = document.querySelector("#wallet-helper");
  const walletConnectionSummary = document.querySelector("#wallet-connection-summary");
  const walletConnectionStatus = document.querySelector("#wallet-connection-status");
  const walletConnectRow = document.querySelector("[data-wallet-connect-row]");
  const walletSettingsRow = document.querySelector("[data-wallet-settings-row]");
  const walletAddress = state.walletAddress || state.privyWallet?.address;
  const connectionSummary = pending
    ? state.walletInitMessage
    : failed
      ? "Wallet connection failed"
      : connected
        ? `${state.walletSource} on ${expectedNetworkName()}`
        : "Privy wallet not connected";
  const connectionStatus = pending ? "Connecting" : failed ? "Failed" : connected ? "Active" : "Disconnected";

  if (walletTitle) walletTitle.textContent = title;
  if (walletSubtitle) walletSubtitle.textContent = subtitle;
  if (walletStatus) {
    walletStatus.textContent = statusText;
    walletStatus.className = `status-pill ${connected || pending ? "private" : "public"}`;
  }
  if (walletAccount) {
    walletAccount.textContent = shortAddress(walletAddress);
    walletAccount.title = walletAddress || "";
  }
  if (walletNetwork) walletNetwork.textContent = expectedNetworkName();
  if (walletProvider) walletProvider.textContent = state.walletSource;
  if (walletHelper) walletHelper.textContent = helperText;
  if (walletConnectionSummary) walletConnectionSummary.textContent = connectionSummary;
  if (walletConnectionStatus) {
    walletConnectionStatus.textContent = connectionStatus;
    walletConnectionStatus.className = `status-pill ${connected || pending ? "private" : "public"}`;
  }
  if (walletConnectRow) walletConnectRow.hidden = connected;
  if (walletSettingsRow) walletSettingsRow.hidden = !connected;
  renderWalletAssets();
  void refreshWalletAssets();
  document.querySelectorAll("[data-default-privacy]").forEach((button) => {
    button.classList.toggle("active", button.dataset.defaultPrivacy === state.defaultPrivacyMode);
  });
  document.querySelectorAll("[data-auto-shield]").forEach((input) => {
    input.checked = state.autoShield;
  });
  renderSettings();

  refreshConnectLabels();
  renderHomeStatus();
}

function renderWalletAssets() {
  const connected = state.walletConnected && Boolean(walletAddressValue());
  walletAssetConfig.forEach((asset) => {
    const balance = document.querySelector(`#wallet-asset-${asset.id}-balance`);
    const detail = document.querySelector(`#wallet-asset-${asset.id}-detail`);
    const assetState = state.walletAssetBalances[asset.id] || { display: asset.defaultDisplay, status: "idle" };
    if (balance) {
      balance.textContent = connected ? assetState.display || asset.defaultDisplay : "--";
    }
    if (detail) {
      detail.textContent = connected
        ? assetState.status === "loading"
          ? asset.symbol
          : assetState.status === "error"
            ? "Sync failed"
            : asset.detail
        : "Connect wallet";
    }
  });
}

function renderSettings() {
  const walletAddress = walletAddressValue();
  const settingsWalletAddress = document.querySelector("#settings-wallet-address");
  const settingsWalletStatus = document.querySelector("#settings-wallet-status");
  if (settingsWalletAddress) {
    settingsWalletAddress.textContent = shortAddress(walletAddress);
    settingsWalletAddress.title = walletAddress || "";
  }
  if (settingsWalletStatus) {
    settingsWalletStatus.textContent = state.walletConnected ? "Connected" : "Disconnected";
    settingsWalletStatus.className = `status-pill ${state.walletConnected ? "private" : "public"}`;
  }
  document.querySelectorAll("[data-default-privacy]").forEach((button) => {
    button.classList.toggle("active", button.dataset.defaultPrivacy === state.defaultPrivacyMode);
  });
}

function walletAddressValue() {
  return state.walletAddress || state.privyWallet?.address || "";
}

async function copyWalletAddress() {
  const address = walletAddressValue();
  if (!address) {
    showToast("No wallet address.");
    return;
  }
  try {
    await navigator.clipboard.writeText(address);
    showToast("Address copied.");
  } catch {
    showToast("Copy unavailable.");
  }
}

function resetWalletConnection() {
  clearTimeout(walletInitTimer);
  directTransport = undefined;
  starkzapOnboardResult = undefined;
  veilClient = createClient();
  state.walletConnected = false;
  state.walletAddress = "";
  state.walletNetwork = expectedChainId;
  state.walletSource = privyAppId ? "Privy" : "Demo";
  state.helperVerified = false;
  state.privyWallet = null;
  state.privyAccount = null;
  state.privyProvider = null;
  state.privyAccountDeployed = false;
  state.walletAssetBalances = createDefaultWalletAssetBalances();
  state.walletAssetSyncKey = "";
  state.walletAssetSyncStatus = "idle";
  setWalletInitializationState("idle", { message: "Connect Wallet" });
}

function requireConnectedWallet() {
  if (state.walletConnected || walletAddressValue()) return true;
  showToast("Connect wallet first.");
  return false;
}

async function refreshWalletConnection() {
  if (!state.walletConnected) {
    await connectWallet({ goToInbox: false });
    return;
  }
  if (timelineMode === "direct-helper") await verifyHelperDeployment();
  await refreshWalletAssets({ force: true });
  renderWallet();
  showToast("Connection refreshed.");
}

async function logoutWallet(message = "Logged out.") {
  const bridge = getPrivyBridge();
  try {
    if (bridge?.logout) await bridge.logout();
  } finally {
    state.privyAuthenticated = false;
    resetWalletConnection();
    showToast(message);
  }
}

function clearLocalVeilCache() {
  const keys = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith("veil:")) keys.push(key);
  }
  keys.forEach((key) => window.localStorage.removeItem(key));
  showToast(keys.length ? "Local VEIL cache cleared." : "No local VEIL cache.");
}

function renderSettlement() {}

function renderProof() {}

function chatTransportMode() {
  return timelineMode === "direct-helper" ? DIRECT_HELPER_MESSAGE_MODE : CHAT_DISPLAY_MODE;
}

async function safeSubmit(action, localItem, success) {
  const pendingItem = {
    ...localItem,
    status: "encrypting",
    mode: localItem.mode || CHAT_DISPLAY_MODE,
  };
  addLocalItem(pendingItem);
  try {
    if (timelineMode === "direct-helper" && !directTransport) {
      const connected = await connectWallet();
      if (!connected) {
        updateLocalItem(pendingItem, {
          status: "failed",
          errorLabel: "Cancelled",
          errorMessage: "Wallet connection was not completed.",
        });
        return false;
      }
    }
    if (timelineMode === "direct-helper" && !(await verifyHelperDeployment())) {
      updateLocalItem(pendingItem, {
        status: "failed",
        errorLabel: "Failed",
        errorMessage: "Helper contract verification failed on the configured network.",
      });
      return false;
    }
    veilLog("info", "transaction.submit.start", {
      where: "safeSubmit",
      timelineMode,
      helperAddress,
      eventType: localItem?.type,
    });
    updateLocalItem(pendingItem, { status: "signing" });
    const result = await action();
    veilLog("info", "transaction.submit.success", {
      where: "safeSubmit",
      timelineMode,
      transactionHash: result?.transactionHash,
      eventId: result?.eventId,
    });
    updateLocalItem(pendingItem, {
      txHash: result?.transactionHash,
      blockNumber: result?.blockNumber,
      status: result?.status || "pending",
      mode: pendingItem.mode,
      time: result?.timestamp || pendingItem.time,
    });
    showToast(success);
    return true;
  } catch (error) {
    const errorDetails = classifyTransactionError(error);
    veilError("transaction.submit.failed", error, {
      where: "safeSubmit",
      timelineMode,
      helperAddress,
      transactionErrorCode: errorDetails.code,
      howToFix: errorDetails.howToFix,
    });
    if (errorDetails.code === "INSUFFICIENT_FEE_BALANCE") {
      veilLog("warn", "wallet.fee_balance.insufficient", {
        where: "safeSubmit",
        walletAddress: walletAddressValue(),
        network: expectedChainId,
        why: errorDetails.why,
        howToFix: errorDetails.howToFix,
      });
    }
    updateLocalItem(pendingItem, {
      status: "failed",
      errorLabel: errorDetails.label,
      errorMessage: errorDetails.why,
    });
    showToast(errorDetails.toast);
    return false;
  }
}

function classifyTransactionError(error) {
  const message = error?.message || String(error);
  if (message.includes("Privacy Pool-derived encryption")) {
    return {
      code: "ENCRYPTION_NOT_CONFIGURED",
      label: "Failed",
      toast: "Message encryption key is not configured.",
      why: message,
      howToFix: "Configure Privacy Pool-derived encryption or the direct-helper testnet encryption fallback before retrying.",
    };
  }

  if (/reject|rejected|denied|cancel|cancelled|user abort/i.test(message)) {
    return {
      code: "USER_CANCELLED",
      label: "Cancelled",
      toast: "Cancelled.",
      why: message,
      howToFix: "Retry the action and approve the wallet signature if the transaction is still needed.",
    };
  }

  if (/timeout|timed out|network|fetch failed|rpc/i.test(message)) {
    return {
      code: "RPC_TIMEOUT",
      label: "Retrying...",
      toast: "Network retry needed.",
      why: message,
      howToFix: "Check Starknet Sepolia RPC availability, then retry the action.",
    };
  }

  if (/exceeds? balance|insufficient.*balance|balance \(0\)|fee.*balance/i.test(message)) {
    const address = walletAddressValue();
    return {
      code: "INSUFFICIENT_FEE_BALANCE",
      label: "Failed",
      toast: `Fund ${expectedNetworkName()} STRK for gas.`,
      why: message,
      howToFix: `Fund ${address || "the connected account"} with ${expectedNetworkName()} STRK, then refresh Wallet and retry.`,
    };
  }

  return {
    code: "ONCHAIN_SUBMIT_FAILED",
    label: "Failed",
    toast: timelineMode === "direct-helper" ? "Onchain action failed. Check Sepolia." : "Action failed.",
    why: message,
    howToFix: "Confirm wallet account deployment, Sepolia funds, Starknet RPC health, and helper contract deployment before retrying.",
  };
}

function addLocalItem(item) {
  channelMessages().push(item);
  const channel = currentChannel();
  if (item.type === "message") {
    channel.last = `${item.self ? "You" : item.sender}: ${item.body}`;
  } else {
    channel.last = item.title;
  }
  channel.time = "now";
  saveLocalChannels();
  renderChannel();
  requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }));
}

function updateLocalItem(item, updates) {
  Object.assign(item, updates);
  saveLocalChannels();
  renderChannel();
}

async function sendChat(message) {
  const mode = chatTransportMode();
  await safeSubmit(
    () => veilClient.sendMessage({ channelId: state.channelId, sender: "you", message, mode }),
    {
      type: "message",
      sender: "You",
      body: message,
      self: true,
      time: Date.now(),
      mode: CHAT_DISPLAY_MODE,
    },
    "Message sent.",
  );
}

function formatFileSize(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

async function sendAttachment(file) {
  if (!file) return;
  const fileType = file.type || "file";
  await sendChat(`Attached file: ${file.name} (${fileType}; ${formatFileSize(file.size)})`);
}

function applyAiDraft() {
  if (!messageInput) return;
  if (!messageInput.value.trim()) {
    messageInput.value = "Thanks. I will review the offer and confirm the next step shortly.";
  }
  messageInput.style.height = "";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
  messageInput.focus();
  showToast("AI draft ready.");
}

async function counterOffer() {
  state.offerAccepted = false;
  currentChannel().status = "Negotiating";
  renderDeal();
  renderWorkflowProgress();
  await safeSubmit(
    () => veilClient.counterOffer({
      channelId: state.channelId,
      amount: "450",
      currency: "STRK",
      terms: "Private payment with proof.",
      sender: "you",
    }),
    {
      type: "inline",
      title: "Counter offer sent",
      subtitle: "450 STRK",
      time: Date.now(),
    },
    "Counter sent.",
  );
}

async function acceptOffer() {
  const submitted = await safeSubmit(
    () => veilClient.acceptOffer({
      channelId: state.channelId,
      offerId: DEAL_OFFER_AMOUNT,
      reason: "Accepted.",
      sender: "you",
    }),
    {
      type: "inline",
      title: "Offer accepted",
      subtitle: "Escrow is ready.",
      time: Date.now(),
    },
    "Offer accepted.",
  );
  if (!submitted) return;
  state.offerAccepted = true;
  currentChannel().status = "Escrow Active";
  renderDeal();
  renderWorkflowProgress();
}

async function sendPayment() {
  const amount = document.querySelector("#payment-amount").value.trim() || "450";
  const asset = document.querySelector("#payment-asset").value.trim() || "STRK";
  const memo = document.querySelector("#payment-memo").value.trim() || "Final settlement for rights transfer.";
  const submitted = await safeSubmit(
    () => veilClient.sendPaymentMemo({
      channelId: state.channelId,
      amount: `${amount} ${asset}`,
      memo,
      mode: state.paymentMode,
      sender: "you",
    }),
    {
      type: "inline",
      title: "Payment completed",
      subtitle: `${amount} ${asset} to Bob`,
      time: Date.now(),
      mode: state.paymentMode,
    },
    "Payment sent.",
  );
  if (!submitted) return;
  state.paymentSent = true;
  currentChannel().status = "Settlement";
  renderPayment();
  renderWorkflowProgress();
  showScreen("settlement");
}

async function releaseEscrow() {
  if (!escrowConfirmationsComplete() && !state.escrowReleased) {
    showToast("Complete confirmations before release.");
    renderEscrow();
    return;
  }
  const submitted = await safeSubmit(
    () => veilClient.recordEscrowStatus({
      channelId: state.channelId,
      status: "settled",
      details: "Escrow released.",
      sender: "system",
    }),
    {
      type: "inline",
      title: "Escrow released",
      subtitle: "Settlement can complete.",
      time: Date.now(),
    },
    "Escrow released.",
  );
  if (!submitted) return;
  state.escrowReleased = true;
  currentChannel().status = "Settlement";
  renderEscrow();
  renderWorkflowProgress();
  showScreen("settlement");
}

function bindEvents() {
  window.addEventListener("unhandledrejection", (event) => {
    const message = String(event.reason?.message || event.reason || "");
    if (/redirect_uri_mismatch/i.test(message)) {
      veilError("auth.google_oauth.redirect_uri_mismatch", event.reason, {
        where: "window.unhandledrejection",
        currentOrigin: currentOrigin(),
        howToFix: "Add the current app origin to Privy Allowed OAuth Redirect URLs and Google Authorized JavaScript Origins; add Privy's documented Google OAuth callback URL to Google Authorized Redirect URIs.",
      });
      event.preventDefault();
      showToast("Fix Google OAuth redirect URI.");
      return;
    }
    if (message.includes("Login with Google not allowed")) {
      veilError("auth.google_oauth.provider_disabled", event.reason, {
        where: "window.unhandledrejection",
        howToFix: "Enable Google as a login method in the Privy dashboard for this app.",
      });
      event.preventDefault();
      showToast("Enable Google in Privy dashboard.");
    }
  });

  window.addEventListener("veil:privy-state", (event) => {
    const detail = event.detail || {};
    state.privyReady = Boolean(detail.ready);
    state.privyAuthenticated = Boolean(detail.authenticated);
    if (timelineMode !== "direct-helper") {
      state.walletConnected ||= state.privyAuthenticated;
    }
    state.walletSource = privyAppId ? "Privy" : state.walletSource;
    veilLog("info", "auth.privy.state.changed", {
      where: "veil:privy-state",
      ready: state.privyReady,
      authenticated: state.privyAuthenticated,
      walletCount: Array.isArray(detail.wallets) ? detail.wallets.length : undefined,
      ...summarizePrivyUser(detail.user),
    });
    if (detail.user?.wallet?.address && !state.walletAddress) {
      state.walletAddress = detail.user.wallet.address;
    }
    renderWallet();
    renderHomeStatus();
    refreshConnectLabels();
  });

  document.addEventListener("click", (event) => {
    const homeMenuToggle = event.target.closest("[data-home-menu-toggle]");
    if (homeMenuToggle) {
      const panel = document.querySelector("[data-home-menu-panel]");
      const expanded = homeMenuToggle.getAttribute("aria-expanded") === "true";
      if (panel) panel.hidden = expanded;
      homeMenuToggle.setAttribute("aria-expanded", expanded ? "false" : "true");
      return;
    }

    const homeLink = event.target.closest("[data-home-link]");
    if (homeLink) {
      if (homeLink.getAttribute("href") === "#") {
        event.preventDefault();
        showToast("Official link not configured.");
      }
      closeHomeMenu();
      return;
    }

    const topNav = event.target.closest("[data-top-nav]");
    if (topNav) {
      showScreen(topNav.dataset.topNav);
      return;
    }

    const nav = event.target.closest("[data-nav]");
    if (nav) {
      showScreen(nav.dataset.nav);
      return;
    }

    if (event.target.closest("[data-transaction-pending]")) {
      showToast("Transaction hash belum tersedia. Tunggu status confirmed.");
      return;
    }

    if (event.target.closest("[data-offer-review-close]")) {
      hideOfferReview();
      return;
    }

    if (event.target.closest("[data-offer-review-sign]")) {
      hideOfferReview();
      acceptOffer();
      return;
    }

    if (event.target.closest("[data-payment-review-close]")) {
      hidePaymentReview();
      return;
    }

    if (event.target.closest("[data-payment-review-sign]")) {
      hidePaymentReview();
      sendPayment();
      return;
    }

    if (event.target.closest("[data-transaction-retry]")) {
      showToast("Retry action by sending/signing again.");
      return;
    }

    const transactionError = event.target.closest("[data-transaction-error]");
    if (transactionError) {
      showToast(transactionError.dataset.transactionError || "Transaction failed.");
      return;
    }

    const open = event.target.closest("[data-open-channel]");
    if (open) {
      openChannel(open.dataset.openChannel);
      return;
    }

    const route = event.target.closest("[data-open-route]");
    if (route) {
      showScreen(route.dataset.openRoute);
      return;
    }

    const dealAction = event.target.closest("[data-deal-action]");
    if (dealAction?.dataset.dealAction === "counter") {
      counterOffer();
      return;
    }
    if (dealAction?.dataset.dealAction === "accept") {
      showOfferReview();
      return;
    }
    if (dealAction?.dataset.dealAction === "reject") {
      showToast("Offer rejected.");
      return;
    }

    const paymentMode = event.target.closest("[data-payment-mode]");
    if (paymentMode) {
      state.paymentMode = paymentMode.dataset.paymentMode;
      renderPayment();
      return;
    }

    const defaultPrivacy = event.target.closest("[data-default-privacy]");
    if (defaultPrivacy) {
      state.defaultPrivacyMode = defaultPrivacy.dataset.defaultPrivacy;
      state.paymentMode = state.defaultPrivacyMode;
      renderWallet();
      renderPayment();
      renderDeal();
      showToast(`${state.defaultPrivacyMode === "shield" ? "Shield" : "Unshield"} set as default.`);
      return;
    }

    if (event.target.closest("[data-copy-wallet]")) {
      copyWalletAddress();
      return;
    }

    if (event.target.closest("[data-export-viewing-key]")) {
      if (requireConnectedWallet()) showToast("Viewing key export ready.");
      return;
    }

    if (event.target.closest("[data-backup-recovery]")) {
      if (requireConnectedWallet()) showToast("Recovery backup ready.");
      return;
    }

    if (event.target.closest("[data-session-management]")) {
      if (requireConnectedWallet()) showToast("Session management ready.");
      return;
    }

    if (event.target.closest("[data-refresh-wallet]")) {
      refreshWalletConnection();
      return;
    }

    if (event.target.closest("[data-wallet-deposit-copy]")) {
      copyWalletAddress();
      return;
    }

    if (event.target.closest("[data-disconnect-wallet]")) {
      resetWalletConnection();
      showToast("Wallet disconnected.");
      return;
    }

    if (event.target.closest("[data-wallet-logout]")) {
      logoutWallet();
      return;
    }

    if (event.target.closest("[data-disconnect-sessions]")) {
      logoutWallet("Sessions disconnected.");
      return;
    }

    if (event.target.closest("[data-clear-veil-cache]")) {
      clearLocalVeilCache();
      return;
    }

    const settingsInfo = event.target.closest("[data-settings-info]");
    if (settingsInfo) {
      showToast(settingsInfo.dataset.settingsInfo === "terms" ? "Terms ready." : "Privacy policy ready.");
      return;
    }

    if (event.target.closest("[data-connect-wallet]")) {
      connectWallet({ goToInbox: state.screen === "unlock" });
      return;
    }

    const escrowConfirmation = event.target.closest("[data-escrow-confirmation]");
    if (escrowConfirmation) {
      const key = escrowConfirmation.dataset.escrowConfirmation;
      if (key && key in state.escrowConfirmations && !state.escrowReleased) {
        state.escrowConfirmations[key] = !state.escrowConfirmations[key];
        renderEscrow();
      }
      return;
    }

    if (event.target.closest("[data-escrow-release]")) {
      releaseEscrow();
      return;
    }

    if (event.target.closest("[data-escrow-dispute]")) {
      if (state.escrowDisputeOpened) return;
      state.escrowDisputeOpened = true;
      renderEscrow();
      showToast("Dispute started.");
      return;
    }

    if (event.target.closest("[data-payment-review]")) {
      showPaymentReview();
      return;
    }

    if (event.target.closest("[data-export-proof]")) {
      state.proofExported = true;
      showToast("Proof exported.");
      return;
    }

    if (event.target.closest("[data-new-conversation]")) {
      createNewChannel();
      return;
    }

    const composerAction = event.target.closest("[data-composer-action]");
    if (composerAction?.dataset.composerAction === "upload") {
      attachmentInput?.click();
      return;
    }
    if (composerAction?.dataset.composerAction === "ai") {
      applyAiDraft();
      return;
    }
    if (composerAction) {
      showToast("Action ready.");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !offerReviewModal?.classList.contains("hidden")) {
      hideOfferReview();
    }
    if (event.key === "Escape" && !paymentReviewModal?.classList.contains("hidden")) {
      hidePaymentReview();
    }
  });

  document.addEventListener("change", (event) => {
    const autoShield = event.target.closest("[data-auto-shield]");
    if (autoShield) {
      state.autoShield = autoShield.checked;
      showToast(state.autoShield ? "Auto Shield enabled." : "Auto Shield disabled.");
      return;
    }

    const settingToggle = event.target.closest("[data-setting-toggle]");
    if (settingToggle) {
      showToast(settingToggle.checked ? "Setting enabled." : "Setting disabled.");
    }
  });

  attachmentInput?.addEventListener("change", async () => {
    const file = attachmentInput.files?.[0];
    attachmentInput.value = "";
    if (!file) return;
    await sendAttachment(file);
  });

  conversationSearch?.addEventListener("input", renderConversationList);

  composerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = messageInput.value.trim();
    if (!value) return;
    messageInput.value = "";
    messageInput.style.height = "";
    await sendChat(value);
  });

  messageInput?.addEventListener("input", () => {
    messageInput.style.height = "";
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
  });

  document.querySelector("#payment-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    showPaymentReview();
  });

}

function init() {
  bindEvents();
  applyHomeResourceLinks();
  loadLocalChannels();
  mountPrivy().catch((error) => {
    veilError("auth.privy.sdk.load.failed", error, {
      where: "init",
      howToFix: "Confirm @privy-io/react-auth can load, VITE_PRIVY_APP_ID is valid, and the browser can reach the module CDN or bundled dependency.",
    });
    showToast("Privy SDK failed to load.");
  });
  renderConversationList();
  renderHomeStatus();
  refreshConnectLabels();
  showScreen("unlock", { keepScroll: true });
  iconRefresh();
  setTimeout(iconRefresh, 250);
}

init();
