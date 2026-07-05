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
import { createChatController } from "./src-app/features/chat/chat-controller.js";
import { createDealRoomController } from "./src-app/features/deals/deal-room-controller.js";
import { createEscrowController } from "./src-app/features/escrow/escrow-controller.js";
import { createInviteController } from "./src-app/features/invite/invite-controller.js";
import { counterpartyAvatar, resolveCounterparty } from "./src-app/features/invite/invite-feature.js";
import { createOfferController } from "./src-app/features/offer/offer-controller.js";
import { createPaymentController } from "./src-app/features/payment/payment-controller.js";
import { createSettlementProofMeta, directPaymentProofItemFromMessages, directPaymentProofMarkup as buildDirectPaymentProofMarkup, escrowSettlementProofMarkup as buildEscrowSettlementProofMarkup } from "./src-app/features/settlement/settlement-feature.js";
import { createLoadingController } from "./src-app/features/transactions/loading-state-feature.js";
import { createTransactionModalController, transactionDelay } from "./src-app/features/transactions/transaction-modal-feature.js";
import { estimateVeilFee } from "./src-app/services/fee-service.js";
import { VEIL_REWARD_POINTS, createRewardEntry, nextRewardTier } from "./src-app/services/rewards-service.js";
import { listStorageKeys, readJsonStorage, removeStorageKeys, writeJsonStorage } from "./src-app/services/storage-service.js";
import { inferTransactionOverlayCopy } from "./src-app/services/transaction-modal-service.js";
import { escapeHtml } from "./src-app/ui/html.js";
import { rewardRowsMarkup } from "./src-app/ui/wallet-ui.js";
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

const transactionModalController = createTransactionModalController({
  state,
  modalElement: transactionLoadingModal,
  document,
  explorerUrl: STARKNET_SEPOLIA_EXPLORER_URL,
  transactionExplorerUrl: buildTransactionExplorerUrl,
  inferOverlayCopy: inferTransactionOverlayCopy,
  currentAmount: () => currentDealOfferAmount(),
  setLucideIcon,
});

const loadingController = createLoadingController({
  state,
  document,
  isWalletInitializationPending,
  showToast,
  hideToastIfLoading,
});

const inviteController = createInviteController({
  state,
  channels,
  messages,
  document,
  conversationSearch,
  knownVeilCounterparties,
  resolveCounterparty,
  shortHash,
  counterpartyAvatar,
  starkIdentityName,
  createDealInviteLink,
  confirmedTimelineMeta,
  connectWallet,
  beginChannelModal,
  setAppLoading,
  transactionDelay,
  clearAppLoading,
  finishChannelModal,
  setTransactionModal,
  failChannelModal,
  beginCounterpartyDecisionModal,
  getVeilClient: () => veilClient,
  veilError,
  saveLocalChannels,
  renderConversationList,
  openChannel,
  renderChannel,
  renderWorkflowProgress,
  awardReward,
  showToast,
  currentChannel,
  statusPillClass,
  iconRefresh,
  copyToClipboard: (value) => navigator.clipboard.writeText(value),
  defaultOfferAmount: DEAL_OFFER_AMOUNT,
});

const dealRoomController = createDealRoomController({
  state,
  channels,
  messages,
  document,
  conversationList,
  conversationSearch,
  messageFeed,
  composerForm,
  timelineMode,
  helperAddress,
  chatDisplayMode: CHAT_DISPLAY_MODE,
  bobIdentity: BOB_IDENTITY,
  currentChannel,
  currentDealId,
  channelMessages,
  channelRequiresJoin,
  renderInviteWaitingCard,
  getVeilClient: () => veilClient,
  veilError,
  statusPillClass,
  starkIdentityName,
  itemStateClass,
  renderChainMeta,
  showScreen,
  iconRefresh,
});

const chatController = createChatController({
  state,
  messageInput,
  timelineMode,
  chatDisplayMode: CHAT_DISPLAY_MODE,
  directHelperMessageMode: DIRECT_HELPER_MESSAGE_MODE,
  currentChannel,
  channelMessages,
  saveLocalChannels,
  renderChannel,
  safeSubmit,
  awardReward,
  showToast,
  getVeilClient: () => veilClient,
  scrollFeedToBottom: () => requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })),
});

const offerController = createOfferController({
  state,
  document,
  offerReviewModal,
  chatDisplayMode: CHAT_DISPLAY_MODE,
  defaultOfferAmount: DEAL_OFFER_AMOUNT,
  currentDealId,
  currentChannel,
  channelMessages,
  estimateVeilFee,
  rewardPoints: VEIL_REWARD_POINTS,
  setElementText,
  statusPillClass,
  renderChainMeta,
  escapeHtml,
  iconRefresh,
  safeSubmit,
  getVeilClient: () => veilClient,
  transactionTransportMode,
  awardReward,
  addLocalItem,
  confirmedTimelineMeta,
  renderWorkflowProgress,
  showScreen,
  fallbackOfferTime: () => now - 2 * minute,
});

const paymentController = createPaymentController({
  state,
  document,
  paymentReviewModal,
  recipient: PAYMENT_RECIPIENT,
  estimateVeilFee,
  rewardPoints: VEIL_REWARD_POINTS,
  setElementText,
  iconRefresh,
  safeSubmit,
  getVeilClient: () => veilClient,
  transactionTransportMode,
  awardReward,
  currentChannel,
  renderWorkflowProgress,
  showScreen,
});

const escrowController = createEscrowController({
  state,
  document,
  escrowReviewModal,
  messageInput,
  chatDisplayMode: CHAT_DISPLAY_MODE,
  currentDealId,
  currentDealOfferAmount,
  currentChannel,
  channelMessages,
  estimateVeilFee,
  rewardPoints: VEIL_REWARD_POINTS,
  setElementText,
  statusPillClass,
  escapeHtml,
  renderChainMeta,
  setLucideIcon,
  iconRefresh,
  safeSubmit,
  getVeilClient: () => veilClient,
  awardReward,
  addLocalItem,
  confirmedTimelineMeta,
  renderWorkflowProgress,
  showScreen,
  showToast,
  settlementProofMeta,
  resetDealStateForPendingChannel,
  saveLocalChannels,
  renderConversationList,
  renderChannel,
  requestAnimationFrame,
  fallbackFundingTime: () => now - 3 * minute,
});

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
  return inviteController.newDealTitleValue();
}

function newDealCounterpartyValue() {
  return inviteController.newDealCounterpartyValue();
}

function inviteTargetValue() {
  return inviteController.inviteTargetValue();
}

function counterpartyLookup(value = newDealCounterpartyValue()) {
  return inviteController.counterpartyLookup(value);
}

function nextDealId() {
  return inviteController.nextDealId();
}

function resetDealStateForPendingChannel() {
  inviteController.resetDealStateForPendingChannel();
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
  return inviteController.createLocalChannelModel({
    title,
    person,
    status,
    last,
    invited,
    pendingJoin,
    counterpartyOnVeil,
    dealId,
  });
}

function seedDealTimeline(channel) {
  return inviteController.seedDealTimeline(channel);
}

async function createDealChannel({ inviteOnly = false } = {}) {
  return inviteController.createDealChannel({ inviteOnly });
}

function channelRequiresJoin(channel = currentChannel()) {
  return inviteController.channelRequiresJoin(channel);
}

async function acceptPendingCounterparty(channel = currentChannel()) {
  return inviteController.acceptPendingCounterparty(channel);
}

async function declinePendingCounterparty(channel = currentChannel()) {
  return inviteController.declinePendingCounterparty(channel);
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

function setTransactionModal(updates = {}) {
  transactionModalController.setTransactionModal(updates);
}

function beginTransactionModal(localItem, success, options = {}) {
  transactionModalController.beginTransactionModal(localItem, success, options);
}

function beginWalletModal() {
  transactionModalController.beginWalletModal();
}

function beginChannelModal({ inviteOnly = false, person = "Bob", dealId = "" } = {}) {
  transactionModalController.beginChannelModal({ inviteOnly, person, dealId });
}

function finishChannelModal({ title, subtitle, detail = "" } = {}) {
  transactionModalController.finishChannelModal({ title, subtitle, detail });
}

function failChannelModal({ title = "Channel Setup Failed", subtitle = "Unable to finish this channel setup.", detail = "Retry the action." } = {}) {
  transactionModalController.failChannelModal({ title, subtitle, detail });
}

function beginCounterpartyDecisionModal({ accepting = true, person = "Bob" } = {}) {
  transactionModalController.beginCounterpartyDecisionModal({ accepting, person });
}

function updateWalletModalStage(step, details = {}) {
  transactionModalController.updateWalletModalStage(step, details);
}

function finishWalletModal() {
  transactionModalController.finishWalletModal();
}

function failWalletModal({ title = "Wallet Connection Failed", subtitle = "Unable to connect wallet.", detail = "Retry wallet connection." } = {}) {
  transactionModalController.failWalletModal({ title, subtitle, detail });
}

function updateTransactionModalStage(stage, updates = {}) {
  transactionModalController.updateTransactionModalStage(stage, updates);
}

function finishTransactionModal(result, updates = {}) {
  transactionModalController.finishTransactionModal(result, updates);
}

function failTransactionModal(errorDetails = {}) {
  transactionModalController.failTransactionModal(errorDetails);
}

function handleTransactionSubmitted(transactionHash) {
  transactionModalController.handleTransactionSubmitted(transactionHash);
}

function renderTransactionModal() {
  transactionModalController.renderTransactionModal();
}

function setAppLoading(action, message) {
  loadingController.setAppLoading(action, message);
}

function clearAppLoading(action, options = {}) {
  loadingController.clearAppLoading(action, options);
}

function setButtonBusy(button, busy) {
  loadingController.setButtonBusy(button, busy);
}

function setBusyButtons(selector, busy) {
  loadingController.setBusyButtons(selector, busy);
}

function renderLoadingState() {
  loadingController.renderLoadingState();
}

function iconRefresh() {
  if (window.lucide) window.lucide.createIcons();
  renderLoadingState();
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
  dealRoomController.openChannel(channelId);
}

async function loadIndexedChannelTimeline(channelId) {
  return dealRoomController.loadIndexedChannelTimeline(channelId);
}

function timelinePayloadToFeedItem(item, payload) {
  return dealRoomController.timelinePayloadToFeedItem(item, payload);
}

function renderConversationList() {
  dealRoomController.renderConversationList();
}

function renderNewDeal() {
  inviteController.renderNewDeal();
}

function renderChannel() {
  dealRoomController.renderChannel();
}

function renderInviteWaitingCard(channel) {
  return inviteController.renderInviteWaitingCard(channel);
}

function renderFeedItem(item) {
  return dealRoomController.renderFeedItem(item);
}

function isInviteMetadataEvent(item = {}) {
  return dealRoomController.isInviteMetadataEvent(item);
}

function isInviteAcceptedEvent(item = {}) {
  return dealRoomController.isInviteAcceptedEvent(item);
}

function compactInviteAcceptedEvent(item = {}) {
  return dealRoomController.compactInviteAcceptedEvent(item);
}

function renderMessage(item) {
  return dealRoomController.renderMessage(item);
}

function renderOfferCard(item) {
  return dealRoomController.renderOfferCard(item);
}

function renderInlineEvent(item) {
  return dealRoomController.renderInlineEvent(item);
}

function currentOfferProofItem() {
  return offerController.currentOfferProofItem();
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
  return offerController.offerPrivacyMode();
}

function offerPrivacyLabel() {
  return offerController.offerPrivacyLabel();
}

function normalizeOfferAmount(value) {
  return offerController.normalizeOfferAmount(value);
}

function createOfferAmountValue() {
  return offerController.createOfferAmountValue();
}

function createOfferAssetValue() {
  return offerController.createOfferAssetValue();
}

function createOfferTermsValue() {
  return offerController.createOfferTermsValue();
}

function currentDealOfferAmount() {
  return offerController.currentDealOfferAmount();
}

function channelHasOfferActivity() {
  return offerController.channelHasOfferActivity();
}

function dealActivityLabel(item) {
  return offerController.dealActivityLabel(item);
}

function renderDealTransactionSummary() {
  offerController.renderDealTransactionSummary();
}

function showOfferReview() {
  offerController.showOfferReview();
}

function hideOfferReview() {
  offerController.hideOfferReview();
}

function paymentAmountLabel() {
  return paymentController.paymentAmountLabel();
}

function paymentPrivacyLabel() {
  return paymentController.paymentPrivacyLabel();
}

function paymentMemoValue() {
  return paymentController.paymentMemoValue();
}

function renderPaymentTransactionSummary() {
  paymentController.renderPaymentTransactionSummary();
}

function showPaymentReview() {
  paymentController.showPaymentReview();
}

function hidePaymentReview() {
  paymentController.hidePaymentReview();
}

function renderEscrowTransactionSummary() {
  escrowController.renderEscrowTransactionSummary();
}

function showEscrowReview() {
  escrowController.showEscrowReview();
}

function hideEscrowReview() {
  escrowController.hideEscrowReview();
}

function workflowStageData() {
  return dealRoomController.workflowStageData();
}

function renderWorkflowProgress() {
  dealRoomController.renderWorkflowProgress();
}

function escrowDepositProofItem(key) {
  return escrowController.escrowDepositProofItem(key);
}

function escrowFundingProofItem() {
  return escrowController.escrowFundingProofItem();
}

function escrowReleaseProofItem() {
  return escrowController.escrowReleaseProofItem();
}

function hasRealTransactionHash(item) {
  return escrowController.hasRealTransactionHash(item);
}

function renderEscrowProofMeta(item) {
  return escrowController.renderEscrowProofMeta(item);
}

function escrowDepositComplete(key) {
  return escrowController.escrowDepositComplete(key);
}

function escrowFundingComplete() {
  return escrowController.escrowFundingComplete();
}

function escrowApprovalComplete(key) {
  return escrowController.escrowApprovalComplete(key);
}

function setLucideIcon(container, iconName, sizeClass = "size-5") {
  const icon = container?.querySelector("svg, i");
  if (icon) icon.outerHTML = `<i data-lucide="${iconName}" class="${sizeClass}"></i>`;
}

function escrowConfirmationsComplete() {
  return escrowController.escrowConfirmationsComplete();
}

function renderDeal() {
  offerController.renderDeal();
}

function renderEscrow() {
  escrowController.renderEscrow();
}

function renderPayment() {
  paymentController.renderPayment();
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

  if (recent) recent.innerHTML = rewardRowsMarkup(state.rewardHistory.slice(0, 3), formatPoints);
  if (history) history.innerHTML = rewardRowsMarkup(state.rewardHistory.slice(0, 8), formatPoints);
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
  return inviteController.copyInviteLink();
}

async function shareInvite(channelName) {
  return inviteController.shareInvite(channelName);
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
  return chatController.chatTransportMode();
}

function transactionTransportMode(requestedMode) {
  return chatController.transactionTransportMode(requestedMode);
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
  chatController.addLocalItem(item);
}

function updateLocalItem(item, updates) {
  chatController.updateLocalItem(item, updates);
}

async function sendChat(message) {
  return chatController.sendChat(message);
}

function formatFileSize(bytes) {
  return chatController.formatFileSize(bytes);
}

async function sendAttachment(file) {
  return chatController.sendAttachment(file);
}

function applyAiDraft() {
  chatController.applyAiDraft();
}

function writeOfferForm({ amount, asset, terms } = {}) {
  offerController.writeOfferForm({ amount, asset, terms });
}

function openCounterOfferForm() {
  offerController.openCounterOfferForm();
}

function cancelOfferForm() {
  offerController.cancelOfferForm();
}

async function createOffer() {
  return offerController.createOffer();
}

async function counterOffer() {
  return offerController.counterOffer();
}

async function acceptOffer() {
  return offerController.acceptOffer();
}

async function sendPayment() {
  return paymentController.sendPayment();
}

async function submitEscrowDeposit(key) {
  return escrowController.submitEscrowDeposit(key);
}

async function approveEscrowRelease(key) {
  return escrowController.approveEscrowRelease(key);
}

async function releaseEscrow() {
  return escrowController.releaseEscrow();
}

function continueCompletedChannel() {
  escrowController.continueCompletedChannel();
}

function startNewEscrowInCurrentChannel() {
  escrowController.startNewEscrowInCurrentChannel();
}

function closeCurrentDeal() {
  escrowController.closeCurrentDeal();
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
      transactionModalController.closeTransactionModal();
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
    chatController.resizeComposerInput(messageInput);
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
