import { ChannelEncryptionAdapter, DirectHelperTransport, VeilClient, VeilEventType } from "./packages/veil-sdk/src/index.ts";
import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { StarkZap } from "starkzap-sdk";
import { accountPresets } from "starkzap-account-presets";
import { ChainId } from "starkzap-config";
import { OnboardStrategy } from "starkzap-onboard";
import { createDealInviteLink as buildDealInviteLink, starkIdentityName } from "./src-app/domain/invites.js";
import { statusPillClass } from "./src-app/domain/status.js";
import { chatTransportMode as resolveChatTransportMode, transactionTransportMode as resolveTransactionTransportMode } from "./src-app/features/chat/chat-feature.js";
import { currentOfferProofItemFromMessages, dealActivityLabel as describeDealActivity, hasOfferActivity, normalizeOfferAmount as normalizeDealOfferAmount } from "./src-app/features/deal/deal-feature.js";
import { escrowApprovalCompleteFromState, escrowConfirmationsCompleteFromState, escrowDepositCompleteFromState, escrowDepositProofItemFromMessages, escrowFundingCompleteFromState, escrowFundingProofItemFromMessages, escrowReleaseProofItemFromMessages, hasRealTransactionHash as isRealTransactionHash } from "./src-app/features/escrow/escrow-feature.js";
import { counterpartyAvatar, resolveCounterparty } from "./src-app/features/invite/invite-feature.js";
import { paymentAmountLabel as buildPaymentAmountLabel, paymentMemoValue as buildPaymentMemoValue, paymentPrivacyLabel as buildPaymentPrivacyLabel } from "./src-app/features/payment/payment-feature.js";
import { createSettlementProofMeta, directPaymentProofItemFromMessages, directPaymentProofMarkup as buildDirectPaymentProofMarkup, escrowSettlementProofMarkup as buildEscrowSettlementProofMarkup } from "./src-app/features/settlement/settlement-feature.js";
import { estimateVeilFee } from "./src-app/services/fee-service.js";
import { VEIL_REWARD_POINTS, createRewardEntry, nextRewardTier } from "./src-app/services/rewards-service.js";
import { listStorageKeys, readJsonStorage, removeStorageKeys, writeJsonStorage } from "./src-app/services/storage-service.js";
import { inferTransactionOverlayCopy } from "./src-app/services/transaction-modal-service.js";
import { formatPoints, formatTime } from "./src-app/utils/format.js";
import { demoTxHash, deterministicHex, displayTransactionHash, shortHash } from "./src-app/utils/hash.js";
import { transactionExplorerUrl as buildTransactionExplorerUrl } from "./src-app/utils/transactions.js";

const runtimeParams = new URLSearchParams(window.location.search);
const demoRuntimeMode = runtimeParams.has("demo") || runtimeParams.get("mode") === "demo";
const debugLogsEnabled = (import.meta.env.VITE_VEIL_DEBUG_LOGS || "false").toLowerCase() === "true";
const timelineMode = demoRuntimeMode ? "mock" : import.meta.env.VITE_VEIL_TIMELINE_MODE || "direct-helper";
const privyAppId = demoRuntimeMode ? "" : import.meta.env.VITE_PRIVY_APP_ID || "";
const expectedChainId = normalizeChainId(import.meta.env.VITE_STARKNET_CHAIN_ID || "SN_SEPOLIA");
const configuredPrivyLoginMethods = (import.meta.env.VITE_PRIVY_LOGIN_METHODS || "google,wallet")
  .split(",")
  .map((method) => method.trim())
  .filter(Boolean);
const privyLoginMethods = [...configuredPrivyLoginMethods];
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
const configuredRpcUrl = import.meta.env.VITE_STARKNET_RPC_URL || "";
const rpcUrl = reliableRpcUrl(configuredRpcUrl, defaultStarknetRpcUrl());
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
const configuredPrivyStarknetRpcUrl = import.meta.env.VITE_PRIVY_STARKNET_RPC_URL || "";
const privyStarknetRpcUrl = reliableRpcUrl(
  configuredPrivyStarknetRpcUrl || rpcUrl.replace("/v0_10", "/v0_8"),
  defaultStarknetRpcUrl(),
);
const CHAT_DISPLAY_MODE = "shield";
const DIRECT_HELPER_MESSAGE_MODE = "unshield";
const DEAL_OFFER_AMOUNT = "450 STRK";
const ACTIVE_DEAL_LABEL = "Deal #381";
const PAYMENT_RECIPIENT = "Bob";
const BOB_IDENTITY = "bob.stark";
const BOB_WALLET_ADDRESS = "0x04c8a3d2f10b7e4c93f6a58219d0de8fa2";
const BOB_WALLET_SHORT = "0x04...8fa2";
const VEIL_INVITE_BASE_URL = import.meta.env.VITE_VEIL_INVITE_URL || "https://veil.app/invite";
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

function defaultStarknetRpcUrl(chainId = expectedChainId) {
  return normalizeChainId(chainId) === "SN_MAIN"
    ? "https://api.zan.top/public/starknet-mainnet/rpc/v0_8"
    : "https://api.zan.top/public/starknet-sepolia/rpc/v0_8";
}

function reliableRpcUrl(url, fallback) {
  const value = String(url || "").trim();
  if (!value || value === "mock-rpc") return fallback;
  return value;
}

function settlementProofMeta(channel = currentChannel?.()) {
  return createSettlementProofMeta(currentDealId(channel), deterministicHex);
}

function confirmedTimelineMeta(seed, offset = 0) {
  return {
    status: "confirmed",
    blockNumber: demoBlockStart + offset,
    txHash: demoTxHash(`${seed}:${offset}`),
    mode: CHAT_DISPLAY_MODE,
  };
}

const now = Date.now();
const minute = 60_000;
const activeDealId = "20260625";
const LOCAL_CHANNELS_KEY = "veil:local:channels:v1";
const demoBlockStart = 11517060;
const knownVeilCounterparties = new Set([
  "alice.stark",
  "bob.stark",
  "mira.stark",
  "northline.stark",
]);

const channels = [
  {
    id: activeDealId,
    title: "Rights Transfer",
    person: "Bob",
    avatar: "B",
    mode: "Private",
    dealId: ACTIVE_DEAL_LABEL,
    status: "Escrow Active",
    unread: 2,
    time: "9:41 AM",
    last: "Waiting for escrow deposits",
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
    last: "Alice deposited funds",
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
    last: "Settlement complete",
  },
];

const messages = {
  [activeDealId]: [
    {
      type: "event",
      title: "bob.stark joined the deal",
      subtitle: "Invite accepted by bob.stark.",
      actor: "Bob",
      time: now - 52 * minute,
      ...confirmedTimelineMeta("bob-joined", 0),
    },
    {
      type: "event",
      title: "Secure channel established",
      subtitle: "ECDH key exchange completed. Shielded messaging enabled.",
      actor: "System",
      time: now - 51 * minute,
      ...confirmedTimelineMeta("ecdh-session-established", 1),
    },
    {
      type: "message",
      sender: "You",
      actor: "Alice",
      body: "Hello Bob, here is my offer.",
      time: now - 48 * minute,
      self: true,
      ...confirmedTimelineMeta("alice-message", 3),
    },
    {
      type: "offer",
      title: "Alice created an offer",
      actor: "Alice",
      amount: "500 STRK",
      subtitle: "Rights Package / NFT",
      time: now - 44 * minute,
      ...confirmedTimelineMeta("alice-offer", 4),
    },
    {
      type: "offer",
      title: "Bob created a counter offer",
      actor: "Bob",
      amount: "450 STRK",
      subtitle: "Rights Package / NFT",
      time: now - 34 * minute,
      ...confirmedTimelineMeta("bob-counter", 5),
    },
    {
      type: "event",
      title: "Alice accepted Bob's counter offer",
      subtitle: "Negotiation completed. Escrow contract created.",
      actor: "Alice",
      time: now - 24 * minute,
      ...confirmedTimelineMeta("alice-accepted-counter", 6),
    },
    {
      type: "event",
      title: "Waiting for escrow deposits",
      subtitle: "Waiting for: Alice deposits 450 STRK; Bob locks NFT.",
      actor: "System",
      time: now - 20 * minute,
      ...confirmedTimelineMeta("waiting-escrow-deposits", 7),
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

const initialRewardHistory = [
  { points: 50, label: "Escrow Completed", time: now - 2 * 60 * minute },
  { points: 20, label: "Direct Payment", time: now - 5 * 60 * minute },
  { points: 5, label: "Alice created an offer", time: now - 24 * 60 * minute },
  { points: 1, label: "Shielded Message", time: now - 26 * 60 * minute },
];

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
  loadingAction: "",
  loadingMessage: "",
  transactionModal: {
    visible: false,
    stage: "idle",
    actionLabel: "Connecting Wallet",
    title: "Connecting Wallet",
    subtitle: "Please approve the request in your wallet.",
    detail: "Waiting for signature...",
    successTitle: "Transaction Successful",
    successSubtitle: "Timeline updated.",
    txHash: "",
  },
  walletAssetBalances: createDefaultWalletAssetBalances(),
  walletAssetSyncKey: "",
  walletAssetSyncStatus: "idle",
  rewardPoints: 4_580,
  rewardHistory: [...initialRewardHistory],
  negotiationStep: "decision",
  initialOfferAmount: "500 STRK",
  latestOfferAmount: DEAL_OFFER_AMOUNT,
  offerAccepted: true,
  paymentSent: false,
  escrowDeposits: {
    buyer: false,
    seller: false,
  },
  escrowReleased: false,
  escrowConfirmations: {
    buyer: false,
    seller: false,
  },
  escrowDisputeOpened: false,
  proofExported: false,
  inviteCode: "8Hsj3K",
  inviteFormOpen: false,
  dealSequence: 382,
};

let toastTimer;
let walletInitTimer;
let transactionModalTimer;
let directTransport;
let transactionSubmitInFlight = false;
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
const transactionLoadingModal = document.querySelector("#transaction-loading-modal");
const offerReviewModal = document.querySelector("#offer-review-modal");
const paymentReviewModal = document.querySelector("#payment-review-modal");
const escrowReviewModal = document.querySelector("#escrow-review-modal");
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
  if (!shouldEmitVeilLog(level)) return;
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitizeLogDetails(details),
  };
  const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
  console[method](JSON.stringify(payload));
}

function shouldEmitVeilLog(level) {
  if (level === "error") return true;
  return debugLogsEnabled || import.meta.env.DEV;
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

function currentDealId(channel = currentChannel()) {
  return channel?.dealId || ACTIVE_DEAL_LABEL;
}

function channelMessages() {
  messages[state.channelId] ||= [];
  return messages[state.channelId];
}

function loadLocalChannels() {
  try {
    const payload = readJsonStorage(LOCAL_CHANNELS_KEY, []);
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
    writeJsonStorage(LOCAL_CHANNELS_KEY, localChannels);
  } catch (error) {
    veilError("channel.local.save.failed", error, {
      where: "saveLocalChannels",
      howToFix: "Check browser storage availability before relying on local draft channels.",
    });
  }
}

function createDealInviteLink() {
  return buildDealInviteLink(VEIL_INVITE_BASE_URL, state.inviteCode);
}

function newDealTitleValue() {
  return document.querySelector("#new-deal-title")?.value.trim() || "Rights Transfer";
}

function newDealCounterpartyValue() {
  return document.querySelector("#new-deal-counterparty")?.value.trim() || "bob.stark";
}

function inviteTargetValue() {
  return document.querySelector("#invite-target")?.value.trim() || "Counterparty";
}

function counterpartyLookup(value = newDealCounterpartyValue()) {
  return resolveCounterparty(value, knownVeilCounterparties, shortHash);
}

function nextDealId() {
  const id = `Deal #${state.dealSequence}`;
  state.dealSequence += 1;
  return id;
}

function resetDealStateForPendingChannel() {
  state.offerAccepted = false;
  state.paymentSent = false;
  state.escrowDeposits = { buyer: false, seller: false };
  state.escrowConfirmations = { buyer: false, seller: false };
  state.escrowReleased = false;
  state.escrowDisputeOpened = false;
  state.negotiationStep = "draft";
  state.initialOfferAmount = "500 STRK";
  state.latestOfferAmount = DEAL_OFFER_AMOUNT;
}

function createLocalChannelModel({
  title = "Rights Transfer",
  person = "Bob",
  status = "Negotiation Active",
  last = "Bob joined the deal",
  invited = false,
  pendingJoin = false,
  counterpartyOnVeil = true,
  dealId = "",
} = {}) {
  const channelNumber = channels.length + 1;
  const channelId = `channel-${Date.now().toString(36)}`;
  return {
    id: channelId,
    title,
    person,
    avatar: counterpartyAvatar(person),
    mode: "Private",
    status,
    unread: 0,
    time: "now",
    last,
    channelNumber,
    dealId,
    inviteLink: invited ? createDealInviteLink() : "",
    invited,
    pendingJoin,
    counterpartyOnVeil,
    local: true,
  };
}

function seedDealTimeline(channel) {
  if (channel.pendingJoin && channel.invited) {
    return [
      {
        type: "event",
        title: "Invite link generated",
        subtitle: `${channel.dealId} is waiting for ${channel.person}.`,
        inviteLink: channel.inviteLink || createDealInviteLink(),
        time: Date.now(),
        offchain: true,
        actor: "System",
        ...confirmedTimelineMeta(`${channel.id}-invite`, 10),
      },
    ];
  }

  if (channel.pendingJoin) {
    return [
      {
        type: "event",
        title: `${channel.dealId} created`,
        subtitle: `Private deal request sent to ${channel.person}.`,
        time: Date.now(),
        offchain: true,
        actor: "Alice",
        ...confirmedTimelineMeta(`${channel.id}-created`, 10),
      },
      {
        type: "event",
        title: "Notification sent",
        subtitle: `${channel.person} must accept before negotiation opens.`,
        time: Date.now() + 1,
        offchain: true,
        actor: "System",
        ...confirmedTimelineMeta(`${channel.id}-notification`, 11),
      },
    ];
  }

  return [
    {
      type: "event",
      title: `${channel.person} joined the deal`,
      subtitle: "Negotiation is ready.",
      time: Date.now(),
      offchain: true,
      actor: channel.person,
      ...confirmedTimelineMeta(`${channel.id}-joined`, 12),
    },
  ];
}

async function createDealChannel({ inviteOnly = false } = {}) {
  if (!state.walletConnected) {
    const connected = await connectWallet({ goToInbox: false });
    if (!connected) return;
  }

  const rawCounterparty = inviteOnly ? inviteTargetValue() : newDealCounterpartyValue();
  const lookup = inviteOnly ? {
    ...counterpartyLookup(rawCounterparty),
    status: "not_on_veil",
  } : counterpartyLookup(rawCounterparty);
  const requiresInvite = inviteOnly || lookup.status !== "available";
  const person = lookup.displayName;
  const dealId = nextDealId();
  beginChannelModal({ inviteOnly: requiresInvite, person, dealId });
  setAppLoading("channel", requiresInvite ? "Creating Invite Link" : "Creating Deal Channel");
  try {
    await transactionDelay(450);
    const channel = createLocalChannelModel({
      title: newDealTitleValue(),
      person,
      status: requiresInvite ? "Waiting for Counterparty" : "Waiting for Bob",
      last: requiresInvite ? "Invite link generated" : "Deal request sent",
      invited: requiresInvite,
      pendingJoin: true,
      counterpartyOnVeil: !requiresInvite,
      dealId,
    });
    channels.unshift(channel);
    messages[channel.id] = seedDealTimeline(channel);
    resetDealStateForPendingChannel();
    if (conversationSearch) conversationSearch.value = "";
    saveLocalChannels();
    renderConversationList();
    openChannel(channel.id);

    if (requiresInvite) {
      await transactionDelay(550);
      clearAppLoading("channel");
      finishChannelModal({
        title: "Invite Link Ready",
        subtitle: `${dealId} is waiting for ${person}.`,
      });
      return;
    }

    setTransactionModal({
      subtitle: "Sending private deal request.",
      detail: `Waiting for ${person} to accept...`,
    });
    try {
      await veilClient.createChannel({
        channelId: channel.id,
        title: channel.title,
      });
      clearAppLoading("channel");
      finishChannelModal({
        title: "Deal Channel Created",
        subtitle: `${dealId} is waiting for ${person}.`,
      });
    } catch (error) {
      veilError("channel.create.failed", error, {
        where: "createDealChannel",
        channelId: channel.id,
        howToFix: "Confirm wallet connection and helper transport before creating a production on-chain channel.",
      });
      clearAppLoading("channel");
      finishChannelModal({
        title: "Deal Saved",
        subtitle: `${dealId} is waiting for ${person}.`,
      });
    }
  } catch (error) {
    veilError("channel.create.failed", error, {
      where: "createDealChannel",
      channelId: "local",
      howToFix: "Confirm wallet connection and helper transport before creating a production on-chain channel.",
    });
    clearAppLoading("channel");
    failChannelModal({
      title: "Channel Setup Failed",
      subtitle: "Unable to create this deal channel.",
      detail: error?.message || "Retry channel creation.",
    });
  }
}

function channelRequiresJoin(channel = currentChannel()) {
  if (!channel) return false;
  const status = String(channel.status || "").toLowerCase();
  return Boolean(channel.pendingJoin || status.includes("waiting for counterparty") || status.includes("waiting for bob"));
}

async function acceptPendingCounterparty(channel = currentChannel()) {
  if (!channel || !channelRequiresJoin(channel)) return;
  beginCounterpartyDecisionModal({ accepting: true, person: channel.person });
  setAppLoading("channel", "Accepting Invitation");
  try {
    await transactionDelay(360);
    setTransactionModal({
      subtitle: "Creating secure channel.",
      detail: "Enabling shielded messaging...",
    });
    await transactionDelay(520);
    channel.pendingJoin = false;
    channel.status = "Negotiation Active";
    channel.last = `${channel.person} joined the deal`;
    channel.time = "now";
    resetDealStateForPendingChannel();
    state.channelId = channel.id;
    messages[channel.id] ||= [];
    const identity = starkIdentityName(channel.person);
    messages[channel.id].push({
      type: "event",
      title: `${identity} joined the deal`,
      subtitle: `Invite accepted by ${identity}.`,
      time: Date.now(),
      offchain: true,
      actor: channel.person,
      ...confirmedTimelineMeta(`${channel.id}-accepted`, 12),
    });
    messages[channel.id].push({
      type: "event",
      title: "Secure channel established",
      subtitle: "ECDH key exchange completed. Shielded messaging enabled.",
      time: Date.now() + 1,
      offchain: true,
      actor: "System",
      ...confirmedTimelineMeta(`${channel.id}-ecdh`, 13),
    });
    if (channel.invited) awardReward("inviteUserJoined");
    saveLocalChannels();
    renderConversationList();
    renderChannel();
    renderWorkflowProgress();
    clearAppLoading("channel");
    finishChannelModal({
      title: "Invitation Accepted",
      subtitle: `${channel.person} joined. Secure channel established.`,
    });
  } catch (error) {
    clearAppLoading("channel");
    failChannelModal({
      title: "Invitation Failed",
      subtitle: "Unable to accept this deal request.",
      detail: error?.message || "Retry accepting the invitation.",
    });
  }
}

async function declinePendingCounterparty(channel = currentChannel()) {
  if (!channel || !channelRequiresJoin(channel)) return;
  beginCounterpartyDecisionModal({ accepting: false, person: channel.person });
  setAppLoading("channel", "Declining Request");
  try {
    await transactionDelay(520);
    channel.pendingJoin = false;
    channel.status = "Declined";
    channel.last = `${channel.person} declined the deal`;
    channel.time = "now";
    messages[channel.id] ||= [];
    messages[channel.id].push({
      type: "event",
      title: `${channel.person} declined the deal`,
      subtitle: "Deal request closed.",
      time: Date.now(),
      offchain: true,
      actor: channel.person,
      ...confirmedTimelineMeta(`${channel.id}-declined`, 12),
    });
    saveLocalChannels();
    renderConversationList();
    renderChannel();
    clearAppLoading("channel");
    finishChannelModal({
      title: "Request Declined",
      subtitle: "Deal request closed.",
    });
  } catch (error) {
    clearAppLoading("channel");
    failChannelModal({
      title: "Decline Failed",
      subtitle: "Unable to close this request.",
      detail: error?.message || "Retry declining the request.",
    });
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
  const label = `${entry.key} ${walletSourceLabel(entry.wallet, entry.key)}`;
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

function walletSourceLabel(wallet, key = "") {
  const name = wallet?.name || wallet?.id || wallet?.metadata?.name || "";
  const label = `${key} ${name}`;
  if (/ready/i.test(label)) return "Ready";
  if (/argent/i.test(label)) return "Argent";
  if (/braavos/i.test(label)) return "Braavos";
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
      return "Connecting Wallet";
    case "creating_account":
      return "Creating Starknet Account";
    case "deploying":
      return "Creating Starknet Account";
    case "connecting_paymaster":
      return "Preparing Gas Sponsor";
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
  beginWalletModal();
  setWalletInitializationState("connecting", { traceId });
  setAppLoading("wallet", "Connecting Wallet");
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
    failWalletModal({
      title: "Wallet Connection Failed",
      subtitle: "Unable to connect wallet.",
      detail: `Wallet initialization exceeded ${WALLET_INIT_TIMEOUT_MS / 1000} seconds.`,
    });
  }, WALLET_INIT_TIMEOUT_MS);
}

function updateWalletInitialization(step, traceId, details = {}) {
  if (state.walletInitTraceId && state.walletInitTraceId !== traceId) return;
  if (!isWalletInitializationPending(step) && step !== "ready" && step !== "failed") return;
  setWalletInitializationState(step, { traceId, ...details });
  if (isWalletInitializationPending(step)) {
    updateWalletModalStage(step, details);
    setAppLoading("wallet", walletInitLabel(step));
  }
}

function completeWalletInitialization(traceId) {
  clearTimeout(walletInitTimer);
  setWalletInitializationState("ready", { traceId, message: "Wallet connected" });
  clearAppLoading("wallet");
  finishWalletModal();
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
  clearAppLoading("wallet");
  failWalletModal({
    title: "Wallet Connection Failed",
    subtitle: "Unable to connect wallet.",
    detail: errorMessage,
  });
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
    message: "Creating Starknet Account",
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
      message: "Preparing Gas Sponsor",
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
      message: "Creating Starknet Account",
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
            message: "Preparing Gas Sponsor",
          });
        } else if (progress.includes("deploy")) {
          updateWalletInitialization("deploying", traceId, {
            message: "Creating Starknet Account",
          });
        } else if (progress.includes("wallet") || progress.includes("account") || progress.includes("resolve")) {
          updateWalletInitialization("creating_account", traceId, {
            message: "Creating Starknet Account",
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
          message: "Creating Starknet Account",
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
        message: "Creating Starknet Account",
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
        source: injectedWallet ? walletSourceLabel(injectedWallet, injectedWalletEntry?.key) : undefined,
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
        source: walletSourceLabel(injectedWallet, injectedWalletEntry?.key),
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
      source: injectedWallet ? walletSourceLabel(injectedWallet, injectedWalletEntry?.key) : undefined,
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
    onTransactionSubmitted: handleTransactionSubmitted,
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
  if (injectedWallet) state.walletSource = walletSourceLabel(injectedWallet, injectedWalletEntry?.key);
  completeWalletInitialization(traceId);
  renderWallet();
  refreshConnectLabels();
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

function showToast(message, options = {}) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toast.dataset.sticky = options.sticky ? "true" : "false";
  if (!options.sticky) {
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
  }
}

function hideToastIfLoading() {
  clearTimeout(toastTimer);
  toast.classList.remove("visible");
  toast.dataset.sticky = "false";
}

function transactionDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setTransactionModal(updates = {}) {
  Object.assign(state.transactionModal, updates);
  renderTransactionModal();
}

function beginTransactionModal(localItem, success, options = {}) {
  clearTimeout(transactionModalTimer);
  const copy = {
    ...inferTransactionOverlayCopy(localItem, success, currentDealOfferAmount()),
    ...options,
  };
  setTransactionModal({
    visible: true,
    stage: "preparing",
    actionLabel: copy.actionLabel,
    title: copy.actionLabel,
    subtitle: "Please approve the request in your wallet.",
    detail: "Waiting for signature...",
    successTitle: copy.successTitle,
    successSubtitle: copy.successSubtitle,
    txHash: "",
  });
}

function beginWalletModal() {
  clearTimeout(transactionModalTimer);
  setTransactionModal({
    visible: true,
    stage: "wallet",
    actionLabel: "Connecting Wallet",
    title: "Connecting Wallet",
    subtitle: "Please approve the request in your wallet.",
    detail: "Waiting for signature...",
    successTitle: "Wallet Connected",
    successSubtitle: "Opening secure channel...",
    txHash: "",
  });
}

function beginChannelModal({ inviteOnly = false, person = "Bob", dealId = "" } = {}) {
  clearTimeout(transactionModalTimer);
  const title = inviteOnly ? "Creating Invite Link" : "Creating Deal Channel";
  setTransactionModal({
    visible: true,
    stage: "channel",
    actionLabel: title,
    title,
    subtitle: inviteOnly ? "Generating private invitation." : "Preparing private deal channel.",
    detail: inviteOnly ? "Creating invite..." : "Creating channel...",
    successTitle: inviteOnly ? "Invite Link Ready" : "Deal Channel Created",
    successSubtitle: inviteOnly
      ? `${dealId || "Deal"} is waiting for ${person}.`
      : `Waiting for ${person} to accept.`,
    txHash: "",
  });
}

function finishChannelModal({ title, subtitle, detail = "" } = {}) {
  updateTransactionModalStage("success", {
    title: title || state.transactionModal.successTitle,
    subtitle: subtitle || state.transactionModal.successSubtitle,
    detail,
    txHash: "",
  });
  clearTimeout(transactionModalTimer);
  transactionModalTimer = setTimeout(() => {
    setTransactionModal({ visible: false, stage: "idle", txHash: "" });
  }, 1200);
}

function failChannelModal({ title = "Channel Setup Failed", subtitle = "Unable to finish this channel setup.", detail = "Retry the action." } = {}) {
  clearTimeout(transactionModalTimer);
  updateTransactionModalStage("error", {
    title,
    subtitle,
    detail,
  });
}

function beginCounterpartyDecisionModal({ accepting = true, person = "Bob" } = {}) {
  clearTimeout(transactionModalTimer);
  const title = accepting ? "Accepting Invitation" : "Declining Request";
  setTransactionModal({
    visible: true,
    stage: "channel",
    actionLabel: title,
    title,
    subtitle: accepting ? `${person} is joining the private deal.` : `Closing the request from ${person}.`,
    detail: accepting ? "Verifying shielded identity..." : "Updating deal status...",
    successTitle: accepting ? "Invitation Accepted" : "Request Declined",
    successSubtitle: accepting ? "Secure channel established." : "Deal request closed.",
    txHash: "",
  });
}

function updateWalletModalStage(step, details = {}) {
  const stageCopy = {
    connecting: {
      title: "Connecting Wallet",
      subtitle: "Please approve the request in your wallet.",
      detail: "Waiting for signature...",
    },
    creating_account: {
      title: "Creating Starknet Account",
      subtitle: "This only happens once.",
      detail: "Waiting for confirmation...",
    },
    deploying: {
      title: "Creating Starknet Account",
      subtitle: "This only happens once.",
      detail: "Waiting for confirmation...",
    },
    connecting_paymaster: {
      title: "Preparing Gas Sponsor",
      subtitle: "Setting up network fees.",
      detail: "Waiting for confirmation...",
    },
  };
  const copy = stageCopy[step] || stageCopy.connecting;
  setTransactionModal({
    visible: true,
    stage: "wallet",
    actionLabel: "Connecting Wallet",
    ...copy,
  });
}

function finishWalletModal() {
  updateTransactionModalStage("success", {
    title: "Wallet Connected",
    subtitle: "Opening secure channel...",
    detail: "",
    txHash: "",
  });
  clearTimeout(transactionModalTimer);
  transactionModalTimer = setTimeout(() => {
    setTransactionModal({ visible: false, stage: "idle", txHash: "" });
  }, 1300);
}

function failWalletModal({ title = "Wallet Connection Failed", subtitle = "Unable to connect wallet.", detail = "Retry wallet connection." } = {}) {
  clearTimeout(transactionModalTimer);
  updateTransactionModalStage("error", {
    title,
    subtitle,
    detail,
  });
}

function updateTransactionModalStage(stage, updates = {}) {
  const actionTitle = state.transactionModal.actionLabel || state.transactionModal.title || "Sending Transaction";
  const stageDefaults = {
    preparing: {
      title: actionTitle,
      subtitle: "Please approve the request in your wallet.",
      detail: "Waiting for signature...",
    },
    network: {
      title: actionTitle,
      subtitle: "Preparing secure request.",
      detail: "Checking Starknet connection...",
    },
    signing: {
      title: actionTitle,
      subtitle: "Please approve the request in your wallet.",
      detail: "Waiting for signature...",
    },
    broadcasting: {
      title: actionTitle,
      subtitle: "Broadcasting transaction...",
      detail: "Waiting for confirmation...",
    },
    success: {
      title: state.transactionModal.successTitle,
      subtitle: state.transactionModal.successSubtitle,
      detail: "",
    },
    error: {
      title: "Transaction Failed",
      subtitle: "The transaction was not completed.",
      detail: "Review the wallet or network error, then retry.",
    },
  };

  setTransactionModal({
    stage,
    ...(stageDefaults[stage] || {}),
    ...updates,
  });
}

function finishTransactionModal(result, updates = {}) {
  updateTransactionModalStage("success", {
    title: updates.successTitle || state.transactionModal.successTitle,
    subtitle: updates.successSubtitle || state.transactionModal.successSubtitle,
    detail: "",
    txHash: result?.transactionHash || "",
  });
  clearTimeout(transactionModalTimer);
  transactionModalTimer = setTimeout(() => {
    setTransactionModal({ visible: false, stage: "idle", txHash: "" });
  }, 1800);
}

function failTransactionModal(errorDetails = {}) {
  clearTimeout(transactionModalTimer);
  updateTransactionModalStage("error", {
    title: errorDetails.label === "Cancelled" ? "Transaction Cancelled" : "Transaction Failed",
    subtitle: errorDetails.toast || "The transaction was not completed.",
    detail: errorDetails.why || "Review the wallet or network error, then retry.",
  });
}

function handleTransactionSubmitted(transactionHash) {
  if (!state.transactionModal.visible || state.transactionModal.stage === "success" || state.transactionModal.stage === "error") return;
  updateTransactionModalStage("broadcasting", {
    txHash: transactionHash || "",
  });
}

function renderTransactionModal() {
  if (!transactionLoadingModal) return;
  const modal = state.transactionModal;
  transactionLoadingModal.classList.toggle("hidden", !modal.visible);
  document.body.classList.toggle("transaction-modal-open", Boolean(modal.visible));
  if (!modal.visible) return;

  const icon = transactionLoadingModal.querySelector("#transaction-loading-icon");
  const title = transactionLoadingModal.querySelector("#transaction-loading-title");
  const subtitle = transactionLoadingModal.querySelector("#transaction-loading-subtitle");
  const detail = transactionLoadingModal.querySelector("#transaction-loading-detail");
  const detailWrap = transactionLoadingModal.querySelector(".transaction-loading-detail");
  const link = transactionLoadingModal.querySelector("#transaction-loading-link");
  const cancel = transactionLoadingModal.querySelector("#transaction-loading-cancel");
  const close = transactionLoadingModal.querySelector("#transaction-loading-close");
  const isSuccess = modal.stage === "success";
  const isError = modal.stage === "error";

  if (title) title.textContent = modal.title || modal.actionLabel || "Sending Transaction";
  if (subtitle) {
    subtitle.textContent = modal.subtitle || "";
    subtitle.hidden = !modal.subtitle;
  }
  if (detail) detail.textContent = modal.detail || "";
  if (detailWrap) detailWrap.hidden = !modal.detail;
  if (icon) {
    icon.className = `transaction-loading-icon ${isSuccess ? "success" : isError ? "error" : "loading"}`;
    setLucideIcon(icon, isSuccess ? "check" : isError ? "triangle-alert" : "loader-circle", "size-8");
  }
  if (link) {
    const href = buildTransactionExplorerUrl(modal.txHash, STARKNET_SEPOLIA_EXPLORER_URL);
    link.hidden = !isSuccess || !href;
    if (href) link.href = href;
  }
  if (cancel) {
    cancel.hidden = modal.stage !== "signing";
    cancel.textContent = "Cancel in Wallet";
  }
  if (close) close.hidden = !isError;
  if (window.lucide) window.lucide.createIcons();
}

function setAppLoading(action, message) {
  state.loadingAction = action;
  state.loadingMessage = message || "Processing...";
  renderLoadingState();
  if (action === "transaction" || action === "wallet" || action === "channel") {
    hideToastIfLoading();
    return;
  }
  showToast(state.loadingMessage, { sticky: true });
}

function clearAppLoading(action, options = {}) {
  if (action && state.loadingAction && state.loadingAction !== action) return;
  state.loadingAction = "";
  state.loadingMessage = "";
  renderLoadingState();
  if (!options.keepToast) hideToastIfLoading();
}

function setButtonBusy(button, busy) {
  if (!button) return;
  if (busy) {
    if (!button.dataset.loadingPrevDisabled) {
      button.dataset.loadingPrevDisabled = button.disabled ? "true" : "false";
    }
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.classList.add("is-loading");
    return;
  }
  if (button.dataset.loadingPrevDisabled) {
    button.disabled = button.dataset.loadingPrevDisabled === "true";
    delete button.dataset.loadingPrevDisabled;
  }
  button.removeAttribute("aria-busy");
  button.classList.remove("is-loading");
}

function setBusyButtons(selector, busy) {
  document.querySelectorAll(selector).forEach((button) => setButtonBusy(button, busy));
}

function renderLoadingState() {
  const walletBusy = state.loadingAction === "wallet" || isWalletInitializationPending();
  const transactionBusy = state.loadingAction === "transaction";
  const channelBusy = state.loadingAction === "channel";
  const busy = walletBusy || transactionBusy || channelBusy;

  document.body.classList.toggle("app-loading", busy);
  document.body.dataset.loadingMessage = state.loadingMessage || "";
  setBusyButtons("[data-connect-wallet], [data-refresh-wallet]", walletBusy);
  setBusyButtons("[data-new-deal-action]", channelBusy);
  setBusyButtons([
    "[data-offer-review-sign]",
    "[data-payment-review-sign]",
    "[data-escrow-review-sign]",
    "[data-escrow-deposit]",
    "[data-escrow-confirmation]",
    "#create-offer-action",
    "#deal-accept-action",
    "[data-escrow-release]",
    "#composer-form .composer-input button[type='submit']",
  ].join(", "), transactionBusy);
}

function iconRefresh() {
  if (window.lucide) window.lucide.createIcons();
  renderLoadingState();
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
  const txUrl = buildTransactionExplorerUrl(item.txHash, STARKNET_SEPOLIA_EXPLORER_URL);
  const displayHash = displayTransactionHash(item.txHash);
  if (!txUrl) {
    const title = displayHash ? `Transaction hash: ${displayHash}` : "Transaction hash is not available yet";
    return `<a class="tx-link" href="${STARKNET_SEPOLIA_EXPLORER_URL}" target="_blank" rel="noreferrer" data-transaction-pending title="${escapeHtml(title)}">View Transaction</a>`;
  }
  return `<a class="tx-link" href="${escapeHtml(txUrl)}" target="_blank" rel="noreferrer" title="${escapeHtml(displayHash)}">View Transaction</a>`;
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
  if (screen === "new-deal") renderNewDeal();
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
    actor: sender === "You" ? "Alice" : sender,
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
    const counterOffer = payload.kind === "counter_offer";
    return {
      ...base,
      type: "offer",
      title: counterOffer ? "Bob created a counter offer" : "Alice created an offer",
      actor: counterOffer ? "Bob" : "Alice",
      amount: `${payload.amount}${payload.currency ? ` ${payload.currency}` : ""}`,
      subtitle: payload.terms || "Private terms",
    };
  }

  const titles = {
    accept_offer: "Alice accepted Bob's counter offer",
    reject_offer: "Offer rejected",
    payment_memo: "AI note attached",
    escrow: payload.status === "settled" ? "Assets released" : "Escrow event recorded",
    proof: "Proof attached",
  };

  return {
    ...base,
    type: "inline",
    title: titles[payload.kind] || "Channel event",
    subtitle: payload.memo || payload.details || payload.label || payload.reason || "Encrypted event",
  };
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

function renderNewDeal() {
  const resultName = document.querySelector("#counterparty-result-name");
  const resultDetail = document.querySelector("#counterparty-result-detail");
  const resultStatus = document.querySelector("#counterparty-result-status");
  const actionHint = document.querySelector("#counterparty-action-hint");
  const primaryAction = document.querySelector("#new-deal-primary-action");
  const inviteTarget = document.querySelector("#invite-target");
  const inviteFormPanel = document.querySelector("#invite-form-panel");
  const showInviteForm = document.querySelector("#show-invite-form");
  const query = newDealCounterpartyValue();
  const lookup = counterpartyLookup(query);

  if (resultName) resultName.textContent = lookup.displayName;
  if (resultDetail) resultDetail.textContent = lookup.detail;
  if (resultStatus) {
    resultStatus.textContent = lookup.badge;
    resultStatus.className = lookup.badgeClass;
  }
  if (actionHint) actionHint.textContent = lookup.hint;
  if (primaryAction) {
    primaryAction.dataset.newDealAction = lookup.status === "available" ? "existing" : "invite";
    primaryAction.innerHTML = lookup.status === "available"
      ? `<i data-lucide="plus" class="size-5"></i><span>${escapeHtml(lookup.action)}</span>`
      : `<i data-lucide="link" class="size-5"></i><span>${escapeHtml(lookup.action)}</span>`;
  }
  if (inviteTarget && document.activeElement !== inviteTarget) inviteTarget.value = query;
  if (inviteFormPanel) inviteFormPanel.hidden = !state.inviteFormOpen;
  if (showInviteForm) showInviteForm.hidden = state.inviteFormOpen;
  iconRefresh();
}

function renderChannel() {
  const channel = currentChannel();
  const waitingForCounterparty = channelRequiresJoin(channel);
  document.querySelector("#channel-title").textContent = channel.title;
  document.querySelector("#channel-meta").textContent = `${currentDealId(channel)} · ${channel.person} - ${channel.status}`;
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
    ${waitingForCounterparty ? renderInviteWaitingCard(channel) : ""}
    ${channelMessages().map(renderFeedItem).join("")}
  `;
  if (composerForm) composerForm.hidden = waitingForCounterparty;
  iconRefresh();
}

function renderInviteWaitingCard(channel) {
  if (!channel.invited) {
    return `
      <section class="invite-wait-card">
        <span class="invite-wait-icon"><i data-lucide="bell" class="size-5"></i></span>
        <div>
          <strong>Waiting for ${escapeHtml(channel.person)}</strong>
          <p>${escapeHtml(channel.dealId || "Deal request")} created. ${escapeHtml(channel.person)} received an in-app notification and must accept before negotiation opens.</p>
          <small>New private deal request - Accept or Decline</small>
        </div>
        <div class="invite-wait-actions">
          <button class="primary-action" type="button" data-counterparty-accept>
            <i data-lucide="check" class="size-5"></i>
            <span>Preview Bob Accept</span>
          </button>
          <button class="secondary-action" type="button" data-counterparty-decline>
            <i data-lucide="x" class="size-5"></i>
            <span>Decline</span>
          </button>
        </div>
      </section>
    `;
  }
  const link = channel.inviteLink || createDealInviteLink();
  return `
    <section class="invite-wait-card">
      <span class="invite-wait-icon"><i data-lucide="send" class="size-5"></i></span>
      <div>
        <strong>Invite link ready</strong>
        <p>${escapeHtml(channel.person)} is not on VEIL yet. Share the invite link; after they connect wallet and accept, the deal opens.</p>
      </div>
      <div class="invite-link-card">
        <span>Invite Link</span>
        <strong>${escapeHtml(link)}</strong>
        <div>
          <button class="secondary-action" type="button" data-copy-invite>
            <i data-lucide="copy" class="size-4"></i>
            <small>Copy</small>
          </button>
          <button class="secondary-action" type="button" data-share-invite="share">
            <i data-lucide="send" class="size-4"></i>
            <small>Share</small>
          </button>
          <button class="secondary-action" type="button" data-qr-invite>
            <i data-lucide="qr-code" class="size-4"></i>
            <small>QR Code</small>
          </button>
        </div>
      </div>
      <div class="invite-share-grid" aria-label="Share invite">
        <button type="button" data-share-invite="telegram">Telegram</button>
        <button type="button" data-share-invite="discord">Discord</button>
        <button type="button" data-share-invite="x">X</button>
        <button type="button" data-share-invite="email">Email</button>
        <button type="button" data-share-invite="whatsapp">WhatsApp</button>
      </div>
      <div class="invite-wait-actions">
        <button class="primary-action" type="button" data-counterparty-accept>
          <i data-lucide="user-plus" class="size-5"></i>
          <span>Preview Accept Invitation</span>
        </button>
      </div>
    </section>
  `;
}

function renderFeedItem(item) {
  if (isInviteMetadataEvent(item)) return "";
  if (isInviteAcceptedEvent(item)) return renderInlineEvent(compactInviteAcceptedEvent(item));
  if (item.type === "message") return renderMessage(item);
  if (item.type === "offer") return renderOfferCard(item);
  return renderInlineEvent(item);
}

function isInviteMetadataEvent(item = {}) {
  const title = String(item.title || "").trim().toLowerCase();
  const subtitle = String(item.subtitle || "").trim().toLowerCase();
  const detailLabels = Array.isArray(item.details)
    ? item.details.map(([label]) => String(label || "").trim().toLowerCase())
    : [];
  return title === "invite status"
    || (subtitle.includes("invite can no longer be used") && detailLabels.includes("reuse"));
}

function isInviteAcceptedEvent(item = {}) {
  const title = String(item.title || "").trim().toLowerCase();
  const subtitle = String(item.subtitle || "").trim().toLowerCase();
  return title === "invitation accepted"
    || (title.includes("joined the deal") && subtitle.includes("invite accepted"));
}

function compactInviteAcceptedEvent(item = {}) {
  const identityFromSubtitle = String(item.subtitle || "").match(/[a-z0-9._-]+\.stark/i)?.[0];
  const identity = starkIdentityName(identityFromSubtitle || item.actor || item.sender || BOB_IDENTITY);
  const {
    details,
    inviteLink,
    channelActions,
    proofId,
    settlementHash,
    ...compactItem
  } = item;
  return {
    ...compactItem,
    title: `${identity} joined the deal`,
    subtitle: `Invite accepted by ${identity}.`,
  };
}

function renderMessage(item) {
  const self = item.self || item.sender === "You";
  const actor = item.actor || (self ? "Alice" : item.sender);
  return `
    <article class="message ${self ? "self" : ""} ${itemStateClass(item)}">
      <div class="message-stack ${self ? "right" : ""}">
        <div class="message-meta ${self ? "text-right" : ""}">
          <span>${escapeHtml(actor)}</span>
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
  if (label.includes("invite") || label.includes("joined")) return "user-plus";
  if (label.includes("payment") || label.includes("memo")) return "file-text";
  if (label.includes("escrow")) return "shield-check";
  if (label.includes("offer") || label.includes("counter")) return "badge-dollar-sign";
  return "shield";
}

function renderOfferCard(item) {
  const actorName = item.actor || (item.self || item.sender === "You" ? "Alice" : item.sender) || "System";
  const actor = `<span class="timeline-actor">${escapeHtml(actorName)}</span>`;
  return `
    <article class="timeline-event offer-timeline ${itemStateClass(item)}">
      <span class="timeline-marker"><i data-lucide="${timelineIcon(item)}" class="size-4"></i></span>
      <div class="timeline-card">
        ${actor}
        <strong>${escapeHtml(item.title)}</strong>
        <b>${escapeHtml(item.amount)}</b>
        <small>${escapeHtml(item.subtitle)}</small>
        ${renderChainMeta(item)}
      </div>
      <button type="button" data-open-route="deal">Open</button>
    </article>
  `;
}

function renderTimelineDetails(item) {
  const rows = [];
  if (Array.isArray(item.details)) rows.push(...item.details);
  if (item.inviteLink) rows.push(["Invite Link", item.inviteLink]);
  if (item.proofId) rows.push(["Proof ID", item.proofId]);
  if (item.settlementHash) rows.push(["Settlement Hash", item.settlementHash]);
  if (!rows.length) return "";
  return `
    <dl class="timeline-detail-list">
      ${rows.map(([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>
      `).join("")}
    </dl>
  `;
}

function renderTimelineActions(item) {
  if (item.inviteLink) {
    return `
      <div class="timeline-action-row">
        <button type="button" data-copy-invite>Copy</button>
        <button type="button" data-share-invite="share">Share</button>
        <button type="button" data-qr-invite>QR Code</button>
      </div>
    `;
  }
  if (item.proofId || item.settlementHash) {
    return `
      <div class="timeline-action-row">
        <button type="button" data-open-route="proof">View Proof</button>
      </div>
    `;
  }
  if (item.channelActions) {
    return `
      <div class="timeline-action-row three">
        <button type="button" data-channel-complete-action="continue">Continue chatting</button>
        <button type="button" data-channel-complete-action="new-escrow">Create new escrow</button>
        <button type="button" data-channel-complete-action="close">Close deal</button>
      </div>
    `;
  }
  return "";
}

function renderInlineEvent(item) {
  const actorName = item.actor || (item.self || item.sender === "You" ? "Alice" : item.sender) || "System";
  const actor = `<span class="timeline-actor">${escapeHtml(actorName)}</span>`;
  return `
    <article class="timeline-event ${itemStateClass(item)}">
      <span class="timeline-marker"><i data-lucide="${timelineIcon(item)}" class="size-4"></i></span>
      <div class="timeline-card">
        ${actor}
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.subtitle || formatTime(item.time))}</small>
        ${renderTimelineDetails(item)}
        ${renderChainMeta(item)}
        ${renderTimelineActions(item)}
      </div>
    </article>
  `;
}

function currentOfferProofItem() {
  return currentOfferProofItemFromMessages(channelMessages(), {
    fallbackTime: now - 2 * minute,
    mode: CHAT_DISPLAY_MODE,
  });
}

function setElementText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function awardReward(ruleKey) {
  const reward = createRewardEntry(ruleKey);
  if (!reward) return;
  state.rewardPoints += reward.points;
  state.rewardHistory.unshift(reward);
  if (state.screen === "wallet") renderWalletRewards();
}

function offerPrivacyMode() {
  return "shield";
}

function offerPrivacyLabel() {
  return "Shielded";
}

function normalizeOfferAmount(value) {
  return normalizeDealOfferAmount(value);
}

function createOfferAmountValue() {
  return normalizeOfferAmount(document.querySelector("#create-offer-amount")?.value || "500");
}

function createOfferAssetValue() {
  return document.querySelector("#create-offer-asset")?.value.trim() || "Rights Transfer";
}

function createOfferTermsValue() {
  return document.querySelector("#create-offer-terms")?.value.trim()
    || "Buyer deposits funds, seller deposits the asset. Both remain locked until release.";
}

function currentDealOfferAmount() {
  return state.latestOfferAmount || DEAL_OFFER_AMOUNT;
}

function channelHasOfferActivity() {
  return hasOfferActivity(channelMessages());
}

function dealActivityLabel(item) {
  return describeDealActivity(item);
}

function renderDealTransactionSummary() {
  const fee = estimateVeilFee("escrow", currentDealOfferAmount(), {
    shielded: offerPrivacyMode() === "shield",
  });
  setElementText("#deal-price", currentDealOfferAmount());
  setElementText("#offer-review-amount", currentDealOfferAmount());
  setElementText("#offer-review-privacy", offerPrivacyLabel());
  setElementText("#offer-review-fee", fee.feeLabel);
  setElementText("#offer-review-reward", `+${VEIL_REWARD_POINTS.acceptProposal} VEIL Points`);
  setElementText("#offer-review-total", fee.totalLabel);
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
  return buildPaymentAmountLabel(
    document.querySelector("#payment-amount")?.value,
    document.querySelector("#payment-asset")?.value,
  );
}

function paymentPrivacyLabel() {
  return buildPaymentPrivacyLabel(state.paymentMode);
}

function paymentMemoValue() {
  return buildPaymentMemoValue(document.querySelector("#payment-memo")?.value);
}

function renderPaymentTransactionSummary() {
  const amountLabel = paymentAmountLabel();
  const fee = estimateVeilFee("directPayment", amountLabel, {
    shielded: state.paymentMode === "shield",
  });

  setElementText("#payment-summary-amount", amountLabel);
  setElementText("#payment-total-fee", fee.feeLabel);
  setElementText("#payment-summary-total", fee.totalLabel);
  setElementText("#payment-review-recipient", PAYMENT_RECIPIENT);
  setElementText("#payment-review-amount", amountLabel);
  setElementText("#payment-review-privacy", paymentPrivacyLabel());
  setElementText("#payment-review-fee", fee.feeLabel);
  setElementText("#payment-review-reward", `+${VEIL_REWARD_POINTS.directPayment} VEIL Points`);
  setElementText("#payment-review-memo", paymentMemoValue());
  setElementText("#payment-review-total", fee.totalLabel);
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

function renderEscrowTransactionSummary() {
  const fee = estimateVeilFee("escrow", currentDealOfferAmount(), {
    shielded: true,
  });
  setElementText("#escrow-fee-amount", currentDealOfferAmount());
  setElementText("#escrow-total-fee", fee.feeLabel);
  setElementText("#escrow-fee-total", fee.totalLabel);
  setElementText("#escrow-review-amount", currentDealOfferAmount());
  setElementText("#escrow-review-fee", fee.feeLabel);
  setElementText("#escrow-review-reward", `+${VEIL_REWARD_POINTS.escrowCompleted} VEIL Points`);
  setElementText("#escrow-review-total", fee.totalLabel);
}

function showEscrowReview() {
  renderEscrowTransactionSummary();
  if (!escrowReviewModal) return;
  escrowReviewModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  iconRefresh();
  escrowReviewModal.querySelector("[data-escrow-review-sign]")?.focus();
}

function hideEscrowReview() {
  if (!escrowReviewModal) return;
  escrowReviewModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function workflowStageData() {
  const directPaymentFlow = !state.escrowReleased && (state.screen === "payment" || state.paymentSent);
  if (directPaymentFlow) {
    return [
      { id: "direct-payment", label: "Direct Pay", done: state.paymentSent, active: !state.paymentSent },
      { id: "settlement", label: "Settlement", done: state.paymentSent, active: state.paymentSent },
    ];
  }

  if (state.screen === "deal" && !state.offerAccepted && !state.escrowReleased && !state.paymentSent) {
    return [
      { id: "negotiation", label: "Negotiation", done: false, active: true },
      { id: "escrow", label: "Escrow", done: false, active: false },
      { id: "settlement", label: "Settlement", done: false, active: false },
    ];
  }

  const status = String(currentChannel().status || "").toLowerCase();
  const escrowSettlementComplete = state.escrowReleased && !state.paymentSent;
  const settlementReady = status.includes("settlement ready");
  const settlementStatusComplete = status.includes("deal completed") || (status.includes("settlement") && !status.includes("ready"));
  const channelInEscrow = status.includes("escrow") || status.includes("settlement") || status.includes("deal completed");
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

function escrowDepositProofItem(key) {
  return escrowDepositProofItemFromMessages(channelMessages(), key, {
    mode: CHAT_DISPLAY_MODE,
  });
}

function escrowFundingProofItem() {
  return escrowFundingProofItemFromMessages(channelMessages(), {
    fallbackTime: now - 3 * minute,
    mode: CHAT_DISPLAY_MODE,
  });
}

function escrowReleaseProofItem() {
  return escrowReleaseProofItemFromMessages(channelMessages(), {
    fallbackTime: state.escrowReleased ? Date.now() : undefined,
    mode: CHAT_DISPLAY_MODE,
  });
}

function hasRealTransactionHash(item) {
  return isRealTransactionHash(item);
}

function renderEscrowProofMeta(item) {
  return hasRealTransactionHash(item) ? renderChainMeta(item) : "";
}

function escrowDepositComplete(key) {
  return escrowDepositCompleteFromState({
    key,
    released: state.escrowReleased,
    paymentSent: state.paymentSent,
    deposits: state.escrowDeposits,
    messages: channelMessages(),
  });
}

function escrowFundingComplete() {
  return escrowFundingCompleteFromState({
    released: state.escrowReleased,
    paymentSent: state.paymentSent,
    deposits: state.escrowDeposits,
    messages: channelMessages(),
  });
}

function escrowApprovalComplete(key) {
  return escrowApprovalCompleteFromState({
    key,
    released: state.escrowReleased,
    paymentSent: state.paymentSent,
    confirmations: state.escrowConfirmations,
    messages: channelMessages(),
  });
}

function setLucideIcon(container, iconName, sizeClass = "size-5") {
  const icon = container?.querySelector("svg, i");
  if (icon) icon.outerHTML = `<i data-lucide="${iconName}" class="${sizeClass}"></i>`;
}

function escrowConfirmationsComplete() {
  return escrowConfirmationsCompleteFromState({
    released: state.escrowReleased,
    paymentSent: state.paymentSent,
    confirmations: state.escrowConfirmations,
    messages: channelMessages(),
  });
}

function renderDeal() {
  const accepted = state.offerAccepted || state.escrowReleased || state.paymentSent;
  const timelineHasOffer = channelHasOfferActivity();
  const negotiationStep = accepted ? "accepted" : timelineHasOffer ? state.negotiationStep || "decision" : "draft";
  const currentStatus = accepted ? "Escrow Active" : "Negotiation Active";
  const currentAmount = currentDealOfferAmount();
  const initialAmount = state.initialOfferAmount || currentAmount;
  const waitingForCounterparty = negotiationStep === "waiting";
  const editingOffer = negotiationStep === "draft" || negotiationStep === "counter";
  const hasActiveOffer = negotiationStep !== "draft";
  const currentOfferPanel = document.querySelector("#current-offer-panel");
  const createOfferPanel = document.querySelector("#create-offer-panel");
  const createOfferEyebrow = document.querySelector("#create-offer-eyebrow");
  const createOfferTitle = document.querySelector("#create-offer-title");
  const createOfferCopy = document.querySelector("#create-offer-copy");
  const createOfferStatus = document.querySelector("#create-offer-status");
  const createOfferAction = document.querySelector("#create-offer-action");
  const createOfferCancel = document.querySelector("#create-offer-cancel");
  const dealStatusEl = document.querySelector("#deal-status");
  const negotiationActions = document.querySelector("#deal-negotiation-actions");
  const counterAction = document.querySelector("#deal-counter-action");
  const dealTurnLabel = document.querySelector("#deal-turn-label");
  const offerHistoryPanel = document.querySelector("#offer-history-panel");
  const nextStepPanel = document.querySelector("#deal-next-step-panel");
  const nextStepCopy = document.querySelector("#deal-next-step-copy");
  const offerHistoryList = document.querySelector("#offer-history-list");
  const activityPanel = document.querySelector("#deal-activity-panel");
  const activityTitle = document.querySelector("#deal-activity-title");
  const offerProof = document.querySelector("#deal-offer-proof");
  const activityItem = currentOfferProofItem();
  renderDealTransactionSummary();
  setElementText("#deal-id", currentDealId());
  if (currentOfferPanel) currentOfferPanel.hidden = !hasActiveOffer;
  if (offerHistoryPanel) offerHistoryPanel.hidden = !hasActiveOffer;
  if (nextStepPanel) nextStepPanel.hidden = !hasActiveOffer || editingOffer;
  if (activityPanel) activityPanel.hidden = !hasActiveOffer;
  if (createOfferPanel) createOfferPanel.hidden = !editingOffer || accepted;
  if (createOfferEyebrow) createOfferEyebrow.textContent = negotiationStep === "counter" ? "Revise Offer" : "Create Offer";
  if (createOfferTitle) createOfferTitle.textContent = negotiationStep === "counter" ? "Revise terms" : "Start negotiation";
  if (createOfferCopy) {
    createOfferCopy.textContent = negotiationStep === "counter"
      ? `Submit a revised amount before ${currentAmount} is accepted.`
      : "Define the amount and asset before escrow funding starts.";
  }
  if (createOfferStatus) {
    createOfferStatus.textContent = negotiationStep === "counter" ? "Counter" : "Step 1";
    createOfferStatus.className = "status-pill negotiating";
  }
  if (createOfferAction) {
    createOfferAction.disabled = false;
    createOfferAction.classList.remove("disabled");
    const label = createOfferAction.querySelector("span");
    if (label) label.textContent = negotiationStep === "counter" ? "Submit Counter" : "Create Offer";
  }
  if (createOfferCancel) createOfferCancel.hidden = negotiationStep !== "counter";
  if (dealStatusEl) {
    dealStatusEl.textContent = currentStatus;
    dealStatusEl.className = statusPillClass(currentStatus);
  }
  if (negotiationActions) negotiationActions.classList.toggle("hidden", accepted || waitingForCounterparty);
  if (counterAction) {
    counterAction.disabled = false;
    counterAction.classList.remove("disabled");
    counterAction.textContent = "Counter Again";
  }
  if (dealTurnLabel) dealTurnLabel.textContent = accepted ? "Escrow Funding" : waitingForCounterparty ? "Waiting for Bob" : "Your Decision";
  if (nextStepCopy) nextStepCopy.textContent = accepted
    ? "Negotiation completed. Escrow funding is ready."
    : waitingForCounterparty
      ? "Offer created. Waiting for Bob to accept or counter."
      : `Bob offered ${currentAmount}. Accept to continue to escrow, or counter again before it expires.`;
  if (offerHistoryList) {
    offerHistoryList.innerHTML = accepted
      ? `
        <li class="complete"><span>Alice created an offer</span><strong>${escapeHtml(initialAmount)}</strong></li>
        <li class="complete"><span>Bob created a counter offer</span><strong>${escapeHtml(currentAmount)}</strong></li>
        <li class="complete active"><span>Alice accepted Bob's counter offer</span><strong>Ready</strong></li>
      `
      : waitingForCounterparty
        ? `
          <li class="complete active"><span>Alice created an offer</span><strong>${escapeHtml(currentAmount)}</strong></li>
          <li><span>Waiting for Bob</span><strong>Pending</strong></li>
        `
        : `
          <li class="complete"><span>Alice created an offer</span><strong>${escapeHtml(initialAmount)}</strong></li>
          <li class="complete active"><span>Bob created a counter offer</span><strong>${escapeHtml(currentAmount)}</strong></li>
          <li><span>Your Decision</span><strong>Pending</strong></li>
        `;
  }
  if (activityTitle) activityTitle.textContent = dealActivityLabel(activityItem);
  if (offerProof) offerProof.innerHTML = renderChainMeta(activityItem);
  iconRefresh();
}

function renderEscrow() {
  const releaseDone = state.escrowReleased || state.paymentSent;
  const buyerDeposited = escrowDepositComplete("buyer");
  const sellerDeposited = escrowDepositComplete("seller");
  const fundingComplete = escrowFundingComplete();
  const buyerApproved = escrowApprovalComplete("buyer");
  const sellerApproved = escrowApprovalComplete("seller");
  const releaseReady = releaseDone || (fundingComplete && escrowConfirmationsComplete());
  const escrowDisplayStatus = releaseDone ? "Deal Completed" : state.offerAccepted || fundingComplete || buyerDeposited ? "Escrow Active" : "Waiting Deposit";
  const fundingItem = escrowFundingProofItem();
  const releaseItem = escrowReleaseProofItem();
  const fundingProof = document.querySelector("#escrow-funding-proof");
  const fundingStep = document.querySelector("#escrow-funding-proof-step");
  const fundingProofTimeline = document.querySelector("#escrow-funding-proof-timeline");
  const releaseProof = document.querySelector("#escrow-release-proof");
  const releaseAction = document.querySelector("#escrow-release-action");
  const releaseStep = document.querySelector("#escrow-release-proof-step");
  const settlementAction = document.querySelector("#escrow-settlement-action");
  const disputeAction = document.querySelector("#escrow-dispute-action");
  const escrowChannelStatus = document.querySelector("#escrow-channel-status");
  const buyerDepositProof = escrowDepositProofItem("buyer");
  const sellerDepositProof = escrowDepositProofItem("seller");
  const title = releaseDone
    ? "Settlement ready"
    : fundingComplete
      ? "Confirmation"
      : buyerDeposited
        ? "Alice deposited 450 STRK"
        : "Waiting deposits";
  const fundingCopy = releaseDone || fundingComplete
    ? "Funding complete. Buyer and seller deposits are locked in escrow."
    : buyerDeposited
      ? "Buyer deposit is locked. Waiting for Bob to lock the seller asset."
      : "Step 1 of 2. Waiting for Alice and Bob deposits.";

  renderEscrowTransactionSummary();
  const escrowFee = estimateVeilFee("escrow", currentDealOfferAmount(), { shielded: true });

  setElementText("#escrow-page-eyebrow", fundingComplete ? "Escrow Confirmation" : "Escrow Funding");
  setElementText("#escrow-page-title", title);
  setElementText("#escrow-channel-meta", `${currentDealId()} · Alice / Bob`);
  setElementText("#escrow-funding-step", fundingComplete ? "Funding Complete" : buyerDeposited ? "Step 2 of 2" : "Step 1 of 2");
  setElementText("#escrow-funding-copy", fundingCopy);
  setElementText("#escrow-buyer-protocol-fee", escrowFee.protocolFeeLabel);
  setElementText("#escrow-buyer-privacy-fee", escrowFee.privacyFeeLabel);
  setElementText("#escrow-buyer-network-fee", escrowFee.networkFeeLabel);
  setElementText("#escrow-buyer-reward", `+${VEIL_REWARD_POINTS.escrowCreated} VEIL Points`);
  setElementText("#escrow-seller-reward", `+${VEIL_REWARD_POINTS.escrowCreated} VEIL Points`);
  const fundingStepBadge = document.querySelector("#escrow-funding-step");
  if (fundingStepBadge) fundingStepBadge.className = fundingComplete ? "status-pill escrow-active" : "status-pill waiting-deposit";

  if (escrowChannelStatus) {
    escrowChannelStatus.textContent = escrowDisplayStatus;
    escrowChannelStatus.className = statusPillClass(escrowDisplayStatus);
  }

  const renderDepositCard = (key, complete, options) => {
    const card = document.querySelector(`#escrow-${key}-deposit-card`);
    const status = document.querySelector(`#escrow-${key}-deposit-status`);
    const detail = document.querySelector(`#escrow-${key}-deposit-detail`);
    const action = document.querySelector(`#escrow-${key}-deposit-action`);
    if (!card) return;
    card.classList.toggle("complete", complete);
    card.classList.toggle("waiting", !complete);
    card.classList.toggle("locked", Boolean(options.locked));
    setLucideIcon(card.querySelector(".deposit-card-top"), complete ? "check" : options.locked ? "lock" : "circle");
    if (status) status.textContent = complete ? options.completeStatus : options.waitingStatus;
    if (detail) detail.textContent = complete ? options.completeDetail : options.waitingDetail;
    if (action) {
      action.disabled = complete || releaseDone || Boolean(options.locked);
      action.classList.toggle("disabled", action.disabled);
      action.classList.toggle("primary-action", !options.secondaryWhenReady);
      action.classList.toggle("secondary-action", Boolean(options.secondaryWhenReady));
      action.innerHTML = complete
        ? `<i data-lucide="check" class="size-5"></i><span>${escapeHtml(options.doneAction)}</span>`
        : `<i data-lucide="${options.actionIcon}" class="size-5"></i><span>${escapeHtml(options.actionLabel)}</span>`;
    }
  };

  renderDepositCard("buyer", buyerDeposited, {
    completeStatus: "Deposited",
    waitingStatus: "Deposit Required",
    completeDetail: `${currentDealOfferAmount()} locked in escrow`,
    waitingDetail: "Waiting for Alice",
    actionLabel: "Deposit to Escrow",
    doneAction: "Deposited",
    actionIcon: "wallet",
  });
  renderDepositCard("seller", sellerDeposited, {
    completeStatus: "Locked",
    waitingStatus: buyerDeposited ? "Asset Required" : "Waiting for Bob",
    completeDetail: "Rights Package NFT locked in escrow",
    waitingDetail: buyerDeposited ? "Waiting for Bob" : "Waiting for buyer deposit",
    actionLabel: "Lock Asset",
    doneAction: "Locked",
    actionIcon: "lock-keyhole",
    locked: !buyerDeposited,
    secondaryWhenReady: true,
  });
  const buyerDepositProofEl = document.querySelector("#escrow-buyer-deposit-proof");
  const sellerDepositProofEl = document.querySelector("#escrow-seller-deposit-proof");
  if (buyerDepositProofEl) buyerDepositProofEl.innerHTML = buyerDeposited && buyerDepositProof ? renderChainMeta(buyerDepositProof) : "";
  if (sellerDepositProofEl) sellerDepositProofEl.innerHTML = sellerDeposited && sellerDepositProof ? renderChainMeta(sellerDepositProof) : "";

  [
    ["#escrow-buyer-confirmed", "buyer", buyerApproved],
    ["#escrow-seller-confirmed", "seller", sellerApproved],
  ].forEach(([selector, key, approved]) => {
    const item = document.querySelector(selector);
    if (!item) return;
    const complete = releaseDone || Boolean(approved);
    const locked = !fundingComplete || releaseDone || complete;
    item.disabled = locked;
    item.classList.toggle("complete", complete);
    item.classList.toggle("disabled", locked && !complete);
    setLucideIcon(item, complete ? "check" : fundingComplete ? "circle" : "lock");
    const status = item.querySelector("small");
    if (status) status.textContent = complete ? "Approved" : fundingComplete ? "Ready" : "Locked";
  });

  setElementText("#escrow-confirmation-step", fundingComplete ? "Ready" : "Locked");
  const confirmationStep = document.querySelector("#escrow-confirmation-step");
  if (confirmationStep) confirmationStep.className = fundingComplete ? "status-pill escrow-active" : "status-pill public";
  setElementText("#escrow-confirmation-copy", releaseDone
    ? "Both approvals are complete. Assets have been released."
    : fundingComplete
      ? "Funding complete. Buyer and seller can approve release."
      : "Complete both deposits before buyer and seller approvals.");

  setElementText("#escrow-funding-status", fundingComplete ? "Funding complete" : buyerDeposited ? "Waiting seller deposit" : "Waiting deposits");
  setElementText("#escrow-release-status", releaseDone ? "Released" : releaseReady ? "Ready" : fundingComplete ? "Waiting approvals" : "Funding required");
  setElementText("#escrow-release-copy", releaseDone
    ? "Assets released. Settlement proof is ready."
    : releaseReady
      ? "Ready for wallet signature."
      : fundingComplete
        ? "Waiting for both approvals"
        : "Waiting for buyer and seller deposits");
  if (fundingProof) {
    fundingProof.innerHTML = "";
    fundingProof.hidden = true;
  }
  if (fundingProofTimeline) fundingProofTimeline.innerHTML = fundingComplete ? renderEscrowProofMeta(fundingItem) : "";
  if (fundingStep) {
    fundingStep.classList.toggle("complete", fundingComplete);
    fundingStep.classList.toggle("pending", !fundingComplete);
    setLucideIcon(fundingStep, fundingComplete ? "check" : "circle", "size-4");
  }
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
        ? `<i data-lucide="unlock" class="size-5"></i><span>Release Assets</span>`
        : fundingComplete
          ? `<i data-lucide="lock" class="size-5"></i><span>Release Assets</span><small>Needs approvals</small>`
          : `<i data-lucide="lock" class="size-5"></i><span>Release Assets</span><small>Funding required</small>`;
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
      : "Direct Transfer";
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
  const pendingSubtitle = state.walletInitState === "creating_account" || state.walletInitState === "deploying"
    ? "This only happens once."
    : "Please approve the request in your wallet.";
  const title = pending
    ? walletInitLabel()
    : failed
      ? "Unable to connect wallet."
      : connected ? "Connected" : "Not connected";
  const subtitle = pending
    ? pendingSubtitle
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
        : "Demo session";
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
  renderWalletRewards();
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

function renderWalletRewards() {
  const tier = nextRewardTier(state.rewardPoints);
  const remaining = Math.max(tier.threshold - state.rewardPoints, 0);
  setElementText("#wallet-reward-points", `${formatPoints(state.rewardPoints)} pts`);
  setElementText("#wallet-reward-tier", tier.name);
  setElementText("#wallet-reward-remaining", remaining > 0 ? `+${formatPoints(remaining)} pts remaining` : "Top tier reached");

  const recent = document.querySelector("#wallet-recent-rewards");
  const history = document.querySelector("#wallet-rewards-history");
  const renderRows = (items) => items.map((item) => `
    <li>
      <strong>+${formatPoints(item.points)}</strong>
      <span>${escapeHtml(item.label)}</span>
    </li>
  `).join("");

  if (recent) recent.innerHTML = renderRows(state.rewardHistory.slice(0, 3));
  if (history) history.innerHTML = renderRows(state.rewardHistory.slice(0, 8));
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

async function copyInviteLink() {
  const link = currentChannel()?.inviteLink || createDealInviteLink();
  try {
    await navigator.clipboard.writeText(link);
    showToast("Invite link copied.");
  } catch {
    showToast("Copy unavailable.");
  }
}

async function shareInvite(channelName) {
  const link = currentChannel()?.inviteLink || createDealInviteLink();
  try {
    await navigator.clipboard.writeText(link);
  } catch {}
  const label = channelName ? `${channelName[0].toUpperCase()}${channelName.slice(1)}` : "Share";
  showToast(`${label} invite ready.`);
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
  const keys = listStorageKeys("veil:");
  removeStorageKeys(keys);
  showToast(keys.length ? "Local VEIL cache cleared." : "No local VEIL cache.");
}

function renderSettlement() {
  const proof = settlementProofMeta();
  setElementText("#settlement-complete-deal-id", currentDealId());
  setElementText("#settlement-complete-proof-id", proof.proofId);
  setElementText("#settlement-complete-hash", proof.settlementHash);
}

function directPaymentProofItem() {
  return directPaymentProofItemFromMessages(channelMessages(), {
    paymentSent: state.paymentSent,
    paymentMode: state.paymentMode,
    fallbackTime: Date.now(),
  });
}

function escrowSettlementProofMarkup() {
  return buildEscrowSettlementProofMarkup(escapeHtml);
}

function directPaymentProofMarkup() {
  return buildDirectPaymentProofMarkup({
    recipient: PAYMENT_RECIPIENT,
    amountLabel: paymentAmountLabel(),
    privacyLabel: paymentPrivacyLabel(),
    escapeHtml,
  });
}

function renderProof() {
  const directPaymentProof = state.paymentSent && !state.escrowReleased;
  const item = directPaymentProof ? directPaymentProofItem() : escrowReleaseProofItem();
  const txHash = hasRealTransactionHash(item) ? String(item.txHash) : "";
  const proofFlow = document.querySelector("#settlement-proof-flow");
  const proofLink = document.querySelector("#settlement-proof-link");

  setElementText("#settlement-proof-title", directPaymentProof ? "Trusted Transfer" : currentChannel().title || "Rights Transfer");
  setElementText("#settlement-proof-parties", `${currentDealId()} · Alice <-> Bob`);
  const proof = settlementProofMeta();
  setElementText("#settlement-proof-id", proof.proofId);
  setElementText("#settlement-proof-settlement-hash", proof.settlementHash);
  if (proofFlow) proofFlow.innerHTML = directPaymentProof ? directPaymentProofMarkup() : escrowSettlementProofMarkup();
  setElementText("#settlement-proof-hash", txHash || "Available after wallet confirmation");
  if (proofLink) {
    proofLink.href = txHash ? buildTransactionExplorerUrl(txHash, STARKNET_SEPOLIA_EXPLORER_URL) : STARKNET_SEPOLIA_EXPLORER_URL;
    const label = proofLink.querySelector("span");
    if (label) label.textContent = txHash ? "View Transaction" : "View on Voyager";
  }
  iconRefresh();
}

function chatTransportMode() {
  return resolveChatTransportMode(timelineMode, DIRECT_HELPER_MESSAGE_MODE, CHAT_DISPLAY_MODE);
}

function transactionTransportMode(requestedMode) {
  return resolveTransactionTransportMode(timelineMode, requestedMode, DIRECT_HELPER_MESSAGE_MODE);
}

async function safeSubmit(action, localItem, success, overlayOptions = {}) {
  if (transactionSubmitInFlight) {
    showToast("Transaction is still processing.");
    return false;
  }
  transactionSubmitInFlight = true;
  beginTransactionModal(localItem, success, overlayOptions);
  setAppLoading("transaction", "Preparing transaction...");
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
        clearAppLoading("transaction", { keepToast: true });
        failTransactionModal({
          label: "Cancelled",
          toast: "Wallet connection cancelled.",
          why: "Wallet connection was not completed.",
        });
        return false;
      }
    }
    updateTransactionModalStage("network");
    setAppLoading("transaction", "Checking network...");
    if (timelineMode === "direct-helper" && !(await verifyHelperDeployment())) {
      updateLocalItem(pendingItem, {
        status: "failed",
        errorLabel: "Failed",
        errorMessage: "Helper contract verification failed on the configured network.",
      });
      clearAppLoading("transaction");
      failTransactionModal({
        label: "Failed",
        toast: "Network check failed.",
        why: "Helper contract verification failed on the configured network.",
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
    updateTransactionModalStage("signing");
    setAppLoading("transaction", "Waiting for signature...");
    const result = await action();
    if (state.transactionModal.stage !== "broadcasting") {
      updateTransactionModalStage("broadcasting", {
        txHash: result?.transactionHash || "",
      });
    }
    setAppLoading("transaction", "Submitting onchain...");
    await transactionDelay(700);
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
    clearAppLoading("transaction");
    finishTransactionModal(result, overlayOptions);
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
    clearAppLoading("transaction");
    failTransactionModal(errorDetails);
    return false;
  } finally {
    transactionSubmitInFlight = false;
    renderLoadingState();
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
  const submitted = await safeSubmit(
    () => veilClient.sendMessage({ channelId: state.channelId, sender: "you", message, mode }),
    {
      type: "message",
      sender: "You",
      actor: "Alice",
      body: message,
      self: true,
      time: Date.now(),
      mode: CHAT_DISPLAY_MODE,
    },
    "Message sent.",
    {
      actionLabel: "Sending Shielded Message",
      successTitle: "Shielded Message Sent",
      successSubtitle: "ECDH encrypted message stored.",
    },
  );
  if (submitted) awardReward("sendMessage");
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

function writeOfferForm({ amount, asset, terms } = {}) {
  const amountInput = document.querySelector("#create-offer-amount");
  const assetInput = document.querySelector("#create-offer-asset");
  const termsInput = document.querySelector("#create-offer-terms");
  if (amountInput) amountInput.value = normalizeOfferAmount(amount || currentDealOfferAmount());
  if (assetInput && asset) assetInput.value = asset;
  if (termsInput && terms) termsInput.value = terms;
}

function openCounterOfferForm() {
  state.negotiationStep = "counter";
  writeOfferForm({
    amount: currentDealOfferAmount(),
    asset: "Rights Package / NFT",
    terms: "Buyer deposits funds, seller deposits the asset. Both remain locked until release.",
  });
  renderDeal();
  document.querySelector("#create-offer-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelOfferForm() {
  state.negotiationStep = channelHasOfferActivity() ? "decision" : "draft";
  renderDeal();
}

async function createOffer() {
  const amount = createOfferAmountValue();
  const amountLabel = `${amount} STRK`;
  const asset = createOfferAssetValue();
  const terms = createOfferTermsValue();
  const submitted = await safeSubmit(
    () => veilClient.createOffer({
      channelId: state.channelId,
      amount,
      currency: "STRK",
      terms,
      mode: transactionTransportMode(offerPrivacyMode()),
      sender: "you",
    }),
    {
      type: "offer",
      title: "Alice created an offer",
      actor: "Alice",
      amount: amountLabel,
      subtitle: asset,
      time: Date.now(),
    },
    "Offer created.",
    {
      actionLabel: "Creating Offer",
      successTitle: "Offer Created",
      successSubtitle: `${amountLabel} offer recorded in the private channel.`,
    },
  );
  if (!submitted) return;
  awardReward("createOffer");
  state.offerAccepted = false;
  state.escrowDeposits = { buyer: false, seller: false };
  state.escrowConfirmations = { buyer: false, seller: false };
  state.escrowReleased = false;
  state.negotiationStep = "waiting";
  state.initialOfferAmount = amountLabel;
  state.latestOfferAmount = amountLabel;
  currentChannel().status = "Negotiation Active";
  renderDeal();
  renderWorkflowProgress();
}

async function counterOffer() {
  const amount = createOfferAmountValue();
  const amountLabel = `${amount} STRK`;
  const asset = createOfferAssetValue();
  const terms = createOfferTermsValue();
  const submitted = await safeSubmit(
    () => veilClient.counterOffer({
      channelId: state.channelId,
      amount,
      currency: "STRK",
      terms,
      mode: transactionTransportMode(offerPrivacyMode()),
      sender: "seller",
    }),
    {
      type: "offer",
      title: "Bob created a counter offer",
      actor: "Bob",
      amount: amountLabel,
      subtitle: asset,
      time: Date.now(),
    },
    "Counter sent.",
    {
      actionLabel: "Creating Counter Offer",
      successTitle: "Counter Offer Sent",
      successSubtitle: `${amountLabel} counter offer recorded in the private channel.`,
    },
  );
  if (!submitted) return;
  awardReward("counterOffer");
  state.offerAccepted = false;
  state.escrowDeposits = { buyer: false, seller: false };
  state.escrowConfirmations = { buyer: false, seller: false };
  state.escrowReleased = false;
  state.negotiationStep = "decision";
  state.latestOfferAmount = amountLabel;
  currentChannel().status = "Negotiation Active";
  currentChannel().last = `Bob created a counter offer`;
  renderDeal();
  renderWorkflowProgress();
}

async function acceptOffer() {
  const submitted = await safeSubmit(
    () => veilClient.acceptOffer({
      channelId: state.channelId,
      offerId: currentDealOfferAmount(),
      reason: "Accepted.",
      mode: transactionTransportMode(offerPrivacyMode()),
      sender: "you",
    }),
    {
      type: "inline",
      title: "Alice accepted Bob's counter offer",
      subtitle: "Negotiation completed. Escrow contract created.",
      actor: "Alice",
      time: Date.now(),
    },
    "Counter offer accepted.",
    {
      actionLabel: "Accepting Proposal",
      successTitle: "Proposal Accepted",
      successSubtitle: "Escrow contract created.",
    },
  );
  if (!submitted) return;
  awardReward("acceptProposal");
  state.offerAccepted = true;
  state.negotiationStep = "accepted";
  state.escrowDeposits = { buyer: false, seller: false };
  state.escrowConfirmations = { buyer: false, seller: false };
  state.escrowReleased = false;
  state.escrowDisputeOpened = false;
  currentChannel().status = "Escrow Active";
  currentChannel().last = "Waiting for escrow deposits";
  addLocalItem({
    type: "inline",
    title: "Waiting for escrow deposits",
    subtitle: "Waiting for: Alice deposits 450 STRK; Bob locks NFT.",
    actor: "System",
    time: Date.now(),
    ...confirmedTimelineMeta(`${state.channelId}-waiting-deposits`, 20),
  });
  renderDeal();
  renderWorkflowProgress();
  showScreen("escrow");
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
      mode: transactionTransportMode(state.paymentMode),
      sender: "you",
    }),
    {
      type: "inline",
      title: "Payment completed",
      subtitle: `${amount} ${asset} to Bob`,
      actor: "Alice",
      time: Date.now(),
      mode: state.paymentMode,
    },
    "Payment sent.",
    {
      actionLabel: "Sending Payment",
      successTitle: "Shielded Payment Sent",
      successSubtitle: `${amount} ${asset} payment recorded in the private channel.`,
    },
  );
  if (!submitted) return;
  awardReward("directPayment");
  state.paymentSent = true;
  currentChannel().status = "Deal Completed";
  renderPayment();
  renderWorkflowProgress();
  showScreen("settlement");
}

async function submitEscrowDeposit(key) {
  const isBuyer = key === "buyer";
  if (!isBuyer && !escrowDepositComplete("buyer")) {
    showToast("Buyer deposit is required first.");
    renderEscrow();
    return;
  }
  if (!(key in state.escrowDeposits) || escrowDepositComplete(key)) {
    renderEscrow();
    return;
  }
  const amount = currentDealOfferAmount();
  const title = isBuyer ? `Alice deposited ${amount}` : "Bob locked Rights Package NFT";
  const subtitle = isBuyer ? `${amount} locked in escrow.` : "Asset secured in escrow.";
  const submitted = await safeSubmit(
    () => veilClient.recordEscrowStatus({
      channelId: state.channelId,
      status: "deposited",
      details: subtitle,
      sender: isBuyer ? "buyer" : "seller",
    }),
    {
      type: "inline",
      title,
      subtitle,
      actor: isBuyer ? "Alice" : "Bob",
      time: Date.now(),
      mode: CHAT_DISPLAY_MODE,
    },
    isBuyer ? "Buyer deposit recorded." : "Seller asset locked.",
    {
      actionLabel: isBuyer ? "Locking Funds" : "Locking Asset",
      successTitle: isBuyer ? "Shielded Deposit Successful" : "Shielded Asset Locked",
      successSubtitle: isBuyer ? `${amount} locked in escrow.` : "Rights Package NFT locked in escrow.",
    },
  );
  if (!submitted) return;
  state.escrowDeposits[key] = true;
  if (isBuyer) awardReward("escrowCreated");
  currentChannel().status = "Escrow Active";
  currentChannel().last = title;
  if (!isBuyer && escrowFundingComplete()) {
    addLocalItem({
      type: "inline",
      title: "Escrow funded",
      subtitle: "Waiting for approvals.",
      actor: "System",
      time: Date.now(),
      ...confirmedTimelineMeta(`${state.channelId}-escrow-funded`, 30),
    });
  }
  renderEscrow();
  renderWorkflowProgress();
}

async function approveEscrowRelease(key) {
  if (!escrowFundingComplete()) {
    showToast("Complete escrow funding first.");
    renderEscrow();
    return;
  }
  if (!(key in state.escrowConfirmations) || escrowApprovalComplete(key)) {
    renderEscrow();
    return;
  }
  const isBuyer = key === "buyer";
  const title = isBuyer ? "Alice approved release" : "Bob approved release";
  const submitted = await safeSubmit(
    () => veilClient.recordEscrowStatus({
      channelId: state.channelId,
      status: "deposited",
      details: `${title}.`,
      sender: isBuyer ? "buyer" : "seller",
    }),
    {
      type: "inline",
      title,
      subtitle: "Release approval recorded",
      actor: isBuyer ? "Alice" : "Bob",
      time: Date.now(),
      mode: CHAT_DISPLAY_MODE,
    },
    "Approval recorded.",
    {
      actionLabel: "Approving Release",
      successTitle: "Release Approved",
      successSubtitle: `${title}.`,
    },
  );
  if (!submitted) return;
  state.escrowConfirmations[key] = true;
  currentChannel().status = "Escrow Active";
  currentChannel().last = title;
  renderEscrow();
  renderWorkflowProgress();
}

async function releaseEscrow() {
  if (!escrowFundingComplete() && !state.escrowReleased) {
    showToast("Complete escrow funding first.");
    renderEscrow();
    return;
  }
  if (!escrowConfirmationsComplete() && !state.escrowReleased) {
    showToast("Complete confirmations before release.");
    renderEscrow();
    return;
  }
  const submitted = await safeSubmit(
    () => veilClient.recordEscrowStatus({
      channelId: state.channelId,
      status: "settled",
      details: "Assets released. 450 STRK to Bob. NFT to Alice.",
      sender: "system",
    }),
    {
      type: "inline",
      title: "Assets released",
      subtitle: "450 STRK to Bob. NFT to Alice.",
      actor: "System",
      time: Date.now(),
    },
    "Assets released.",
    {
      actionLabel: "Releasing Assets",
      successTitle: "Assets Released",
      successSubtitle: "450 STRK to Bob. NFT to Alice.",
    },
  );
  if (!submitted) return;
  awardReward("escrowCompleted");
  state.escrowReleased = true;
  currentChannel().status = "Deal Completed";
  currentChannel().last = "Secure deal completed";
  const proof = settlementProofMeta();
  addLocalItem({
    type: "inline",
    title: "Settlement proof generated",
    subtitle: "Proof attached to this private channel.",
    proofId: proof.proofId,
    settlementHash: proof.settlementHash,
    actor: "System",
    time: Date.now() + 1,
    ...confirmedTimelineMeta(`${state.channelId}-settlement-proof`, 39),
  });
  addLocalItem({
    type: "inline",
    title: "Settlement complete",
    subtitle: "Deal settled and proof is ready.",
    actor: "System",
    time: Date.now() + 2,
    ...confirmedTimelineMeta(`${state.channelId}-settlement-complete`, 40),
  });
  addLocalItem({
    type: "inline",
    title: "Secure deal completed.",
    subtitle: "Encrypted channel remains available.",
    actor: "System",
    channelActions: true,
    time: Date.now() + 3,
    ...confirmedTimelineMeta(`${state.channelId}-secure-channel-open`, 41),
  });
  renderEscrow();
  renderWorkflowProgress();
  showScreen("settlement");
}

function continueCompletedChannel() {
  showScreen("channel");
  requestAnimationFrame(() => {
    messageInput?.focus();
  });
  showToast("Encrypted channel remains available.");
}

function startNewEscrowInCurrentChannel() {
  resetDealStateForPendingChannel();
  const channel = currentChannel();
  channel.status = "Negotiation Active";
  channel.last = "New escrow draft ready";
  channel.time = "now";
  state.channelId = channel.id;
  addLocalItem({
    type: "inline",
    title: "New escrow draft started",
    subtitle: "Use the same encrypted channel for the next deal.",
    actor: "System",
    time: Date.now(),
    ...confirmedTimelineMeta(`${state.channelId}-new-escrow`, 42),
  });
  saveLocalChannels();
  renderConversationList();
  showScreen("deal");
  showToast("New escrow draft ready.");
}

function closeCurrentDeal() {
  const channel = currentChannel();
  channel.status = "Closed";
  channel.last = "Deal closed";
  channel.time = "now";
  addLocalItem({
    type: "inline",
    title: "Deal closed",
    subtitle: "Encrypted channel archived.",
    actor: "System",
    time: Date.now(),
    ...confirmedTimelineMeta(`${state.channelId}-deal-closed`, 43),
  });
  saveLocalChannels();
  renderConversationList();
  renderChannel();
  renderWorkflowProgress();
  showToast("Deal closed.");
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
    if (event.target.closest("[data-transaction-loading-close]")) {
      clearTimeout(transactionModalTimer);
      setTransactionModal({ visible: false, stage: "idle", txHash: "" });
      return;
    }

    if (event.target.closest("[data-transaction-loading-cancel]")) {
      updateTransactionModalStage("signing", {
        detail: "Cancel the request from your Starknet wallet to stop this transaction.",
      });
      return;
    }

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

    if (event.target.closest("[data-escrow-review-close]")) {
      hideEscrowReview();
      return;
    }

    if (event.target.closest("[data-escrow-review-sign]")) {
      hideEscrowReview();
      releaseEscrow();
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

    const channelCompleteAction = event.target.closest("[data-channel-complete-action]");
    if (channelCompleteAction?.dataset.channelCompleteAction === "continue") {
      continueCompletedChannel();
      return;
    }
    if (channelCompleteAction?.dataset.channelCompleteAction === "new-escrow") {
      startNewEscrowInCurrentChannel();
      return;
    }
    if (channelCompleteAction?.dataset.channelCompleteAction === "close") {
      closeCurrentDeal();
      return;
    }

    const dealAction = event.target.closest("[data-deal-action]");
    if (dealAction?.dataset.dealAction === "create-offer") {
      if (state.negotiationStep === "counter") {
        counterOffer();
      } else {
        createOffer();
      }
      return;
    }
    if (dealAction?.dataset.dealAction === "cancel-offer-form") {
      cancelOfferForm();
      return;
    }
    if (dealAction?.dataset.dealAction === "counter") {
      openCounterOfferForm();
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

    const escrowDeposit = event.target.closest("[data-escrow-deposit]");
    if (escrowDeposit) {
      submitEscrowDeposit(escrowDeposit.dataset.escrowDeposit);
      return;
    }

    const escrowConfirmation = event.target.closest("[data-escrow-confirmation]");
    if (escrowConfirmation) {
      const key = escrowConfirmation.dataset.escrowConfirmation;
      approveEscrowRelease(key);
      return;
    }

    if (event.target.closest("[data-escrow-release]")) {
      showEscrowReview();
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
      state.inviteFormOpen = false;
      showScreen("new-deal");
      return;
    }

    const newDealAction = event.target.closest("[data-new-deal-action]");
    if (newDealAction?.dataset.newDealAction === "existing") {
      createDealChannel({ inviteOnly: false });
      return;
    }
    if (newDealAction?.dataset.newDealAction === "show-invite") {
      state.inviteFormOpen = true;
      renderNewDeal();
      return;
    }
    if (newDealAction?.dataset.newDealAction === "cancel-invite") {
      state.inviteFormOpen = false;
      renderNewDeal();
      return;
    }
    if (newDealAction?.dataset.newDealAction === "invite") {
      createDealChannel({ inviteOnly: true });
      return;
    }

    if (event.target.closest("[data-copy-invite]")) {
      copyInviteLink();
      return;
    }

    const shareInviteAction = event.target.closest("[data-share-invite]");
    if (shareInviteAction) {
      shareInvite(shareInviteAction.dataset.shareInvite);
      return;
    }

    if (event.target.closest("[data-counterparty-accept]")) {
      acceptPendingCounterparty();
      return;
    }

    if (event.target.closest("[data-counterparty-decline]")) {
      declinePendingCounterparty();
      return;
    }

    if (event.target.closest("[data-qr-invite]")) {
      showToast("QR code ready.");
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
    if (event.key === "Escape" && !escrowReviewModal?.classList.contains("hidden")) {
      hideEscrowReview();
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
  document.querySelector("#new-deal-counterparty")?.addEventListener("input", renderNewDeal);

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
