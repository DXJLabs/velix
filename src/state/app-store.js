import {
  ACTIVE_DEAL_LABEL,
  CHAT_DISPLAY_MODE,
  DEAL_OFFER_AMOUNT,
} from "../app/runtime-config.js";
import { activeDealId } from "./demo-data.js";
import { createWalletPrivacyCapabilityModel } from "../domain/privacy-capabilities.js";

export function createDefaultWalletAssetBalances(walletAssetConfig) {
  return Object.fromEntries(
    walletAssetConfig.map((asset) => [asset.id, { display: asset.defaultDisplay, status: "idle" }]),
  );
}

export function createAppStore({
  config,
  channels,
  messages,
  initialRewardHistory,
}) {
  const demoRuntimeMode = Boolean(config.demoRuntimeMode);
  const state = {
    demoRuntimeMode,
    screen: "unlock",
    channelId: demoRuntimeMode ? activeDealId : channels[0]?.id || "",
    paymentMode: "unshield",
    messageMode: CHAT_DISPLAY_MODE,
    defaultPrivacyMode: "encrypted-direct",
    autoShield: false,
    walletConnected: false,
    walletAddress: "",
    walletNetwork: config.expectedChainId,
    walletSource: config.privyAppId ? "Privy" : demoRuntimeMode ? "Demo" : "",
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
    walletAssetBalances: createDefaultWalletAssetBalances(config.walletAssetConfig),
    walletAssetSyncKey: "",
    walletAssetSyncStatus: "idle",
    walletPrivacyCapabilities: createWalletPrivacyCapabilityModel(),
    privacyWalletApiVersion: "",
    privacyRegistrationStatus: "unknown",
    privateBalanceStatus: "unavailable",
    privateBalances: {},
    rewardPoints: demoRuntimeMode ? 4_580 : 0,
    rewardHistory: [...initialRewardHistory],
    negotiationStep: "decision",
    initialOfferAmount: "500 STRK",
    latestOfferAmount: DEAL_OFFER_AMOUNT,
    latestOfferId: "",
    latestOfferCommitments: null,
    latestOfferSellerAddress: "",
    latestEscrowId: "",
    offerAccepted: demoRuntimeMode,
    paymentSent: false,
    escrowDeposits: {
      buyer: false,
      seller: false,
    },
    escrowReleased: false,
    escrowActivated: false,
    escrowConfirmations: {
      buyer: false,
      seller: false,
    },
    escrowDisputeOpened: false,
    proofExported: false,
    inviteCode: demoRuntimeMode ? "8Hsj3K" : "",
    inviteFormOpen: false,
    dealSequence: demoRuntimeMode ? 382 : 1,
  };

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

  return {
    state,
    channels,
    messages,
    currentChannel,
    currentDealId,
    channelMessages,
  };
}
