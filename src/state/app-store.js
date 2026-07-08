import {
  ACTIVE_DEAL_LABEL,
  CHAT_DISPLAY_MODE,
  DEAL_OFFER_AMOUNT,
} from "../app/runtime-config.js";
import { activeDealId } from "./demo-data.js";

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
  const state = {
    screen: "unlock",
    channelId: activeDealId,
    paymentMode: "shield",
    messageMode: CHAT_DISPLAY_MODE,
    defaultPrivacyMode: "shield",
    autoShield: true,
    walletConnected: false,
    walletAddress: "",
    walletNetwork: config.expectedChainId,
    walletSource: config.privyAppId ? "Privy" : "Demo",
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
    rewardPoints: 4_580,
    rewardHistory: [...initialRewardHistory],
    negotiationStep: "decision",
    initialOfferAmount: "500 STRK",
    latestOfferAmount: DEAL_OFFER_AMOUNT,
    latestOfferId: "",
    latestOfferCommitments: null,
    latestOfferSellerAddress: "",
    latestEscrowId: "",
    offerAccepted: true,
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
    inviteCode: "8Hsj3K",
    inviteFormOpen: false,
    dealSequence: 382,
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
