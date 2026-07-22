import { createChatController } from "../features/chat/chat-controller.js";
import { createDealRoomController } from "../features/deals/deal-room-controller.js";
import { buildEscrowController } from "../features/escrow/escrow-controller.js";
import { createInviteController } from "../features/invite/invite-controller.js";
import { counterpartyAvatar, resolveCounterparty } from "../features/invite/invite-feature.js";
import { createOfferController } from "../features/offer/offer-controller.js";
import { createPaymentController } from "../features/payment/payment-controller.js";
import { createRewardsController } from "../features/rewards/rewards-controller.js";
import { createSettlementController } from "../features/settlement/settlement-controller.js";
import {
  createSettlementProofMeta,
  directPaymentProofItemFromMessages,
  directPaymentProofMarkup as buildDirectPaymentProofMarkup,
  escrowSettlementProofMarkup as buildEscrowSettlementProofMarkup,
} from "../features/settlement/settlement-feature.js";
import { createLoadingController } from "../features/transactions/loading-state-feature.js";
import { createTransactionModalController, transactionDelay } from "../features/transactions/transaction-modal-feature.js";
import { createWalletController } from "../features/wallet/wallet-controller.js";
import {
  BOB_IDENTITY,
  CHAT_DISPLAY_MODE,
  DEAL_OFFER_AMOUNT,
  DIRECT_HELPER_MESSAGE_MODE,
  PAYMENT_RECIPIENT,
  STARKNET_SEPOLIA_EXPLORER_URL,
} from "./runtime-config.js";
import { createDealInviteLink as buildDealInviteLink, starkIdentityName } from "../domain/invites.js";
import { statusPillClass } from "../domain/status.js";
import { estimateVeilFee } from "../services/fee-service.js";
import { VEIL_REWARD_POINTS, createRewardEntry, nextRewardTier } from "../services/rewards-service.js";
import { listStorageKeys, removeStorageKeys } from "../services/storage-service.js";
import { inferTransactionOverlayCopy } from "../services/transaction-modal-service.js";
import { escapeHtml } from "../ui/html.js";
import { rewardRowsMarkup } from "../ui/wallet-ui.js";
import { formatPoints } from "../utils/format.js";
import { deterministicHex, shortHash } from "../utils/hash.js";

const call = (api, name) => (...args) => api[name](...args);

export function createFeatureRegistry({
  api,
  config,
  data,
  dom,
  store,
  logger,
  knownVeilCounterparties,
  chainMetaUi,
  networkService,
  walletInitialization,
}) {
  const transactionModalController = createTransactionModalController({
    state: store.state,
    modalElement: dom.transactionLoadingModal,
    document: dom.document,
    explorerUrl: STARKNET_SEPOLIA_EXPLORER_URL,
    transactionExplorerUrl: api.transactionExplorerUrl,
    inferOverlayCopy: inferTransactionOverlayCopy,
    currentAmount: call(api, "currentDealOfferAmount"),
    setLucideIcon: api.setLucideIcon,
  });

  const loadingController = createLoadingController({
    state: store.state,
    document: dom.document,
    isWalletInitializationPending: walletInitialization.isWalletInitializationPending,
    showToast: call(api, "showToast"),
    hideToastIfLoading: call(api, "hideToastIfLoading"),
  });

  const rewardsController = createRewardsController({
    state: store.state,
    createRewardEntry,
    renderWalletRewards: call(api, "renderWalletRewards"),
  });

  const inviteController = createInviteController({
    state: store.state,
    channels: store.channels,
    messages: store.messages,
    document: dom.document,
    conversationSearch: dom.conversationSearch,
    dealCreationEnabled: config.demoRuntimeMode,
    knownVeilCounterparties,
    resolveCounterparty,
    shortHash,
    counterpartyAvatar,
    starkIdentityName,
    createDealInviteLink: () => buildDealInviteLink(config.veilInviteBaseUrl, store.state.inviteCode),
    confirmedTimelineMeta: data.confirmedTimelineMeta,
    connectWallet: call(api, "connectWallet"),
    beginChannelModal: call(transactionModalController, "beginChannelModal"),
    setAppLoading: call(loadingController, "setAppLoading"),
    transactionDelay,
    clearAppLoading: call(loadingController, "clearAppLoading"),
    finishChannelModal: call(transactionModalController, "finishChannelModal"),
    setTransactionModal: call(transactionModalController, "setTransactionModal"),
    failChannelModal: call(transactionModalController, "failChannelModal"),
    beginCounterpartyDecisionModal: call(transactionModalController, "beginCounterpartyDecisionModal"),
    getVeilClient: call(api, "getVeilClient"),
    veilError: logger.veilError,
    saveLocalChannels: call(api, "saveLocalChannels"),
    renderConversationList: call(api, "renderConversationList"),
    openChannel: call(api, "openChannel"),
    renderChannel: call(api, "renderChannel"),
    renderWorkflowProgress: call(api, "renderWorkflowProgress"),
    awardReward: call(api, "awardReward"),
    showToast: call(api, "showToast"),
    currentChannel: store.currentChannel,
    statusPillClass,
    iconRefresh: call(api, "iconRefresh"),
    copyToClipboard: (value) => navigator.clipboard.writeText(value),
    defaultOfferAmount: DEAL_OFFER_AMOUNT,
  });

  const dealRoomController = createDealRoomController({
    state: store.state,
    channels: store.channels,
    messages: store.messages,
    document: dom.document,
    conversationList: dom.conversationList,
    conversationSearch: dom.conversationSearch,
    messageFeed: dom.messageFeed,
    composerForm: dom.composerForm,
    timelineMode: config.timelineMode,
    helperAddress: config.helperAddress,
    chatDisplayMode: CHAT_DISPLAY_MODE,
    bobIdentity: BOB_IDENTITY,
    currentChannel: store.currentChannel,
    currentDealId: store.currentDealId,
    channelMessages: store.channelMessages,
    channelRequiresJoin: call(inviteController, "channelRequiresJoin"),
    renderInviteWaitingCard: call(inviteController, "renderInviteWaitingCard"),
    getVeilClient: call(api, "getVeilClient"),
    veilError: logger.veilError,
    statusPillClass,
    starkIdentityName,
    itemStateClass: chainMetaUi.itemStateClass,
    renderChainMeta: chainMetaUi.renderChainMeta,
    showScreen: call(api, "showScreen"),
    iconRefresh: call(api, "iconRefresh"),
  });

  const chatController = createChatController({
    state: store.state,
    messageInput: dom.messageInput,
    timelineMode: config.timelineMode,
    chatDisplayMode: CHAT_DISPLAY_MODE,
    directHelperMessageMode: DIRECT_HELPER_MESSAGE_MODE,
    currentChannel: store.currentChannel,
    channelMessages: store.channelMessages,
    saveLocalChannels: call(api, "saveLocalChannels"),
    renderChannel: call(dealRoomController, "renderChannel"),
    safeSubmit: call(api, "safeSubmit"),
    awardReward: call(rewardsController, "awardReward"),
    showToast: call(api, "showToast"),
    getVeilClient: call(api, "getVeilClient"),
    scrollFeedToBottom: () => requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })),
  });

  const offerController = createOfferController({
    state: store.state,
    document: dom.document,
    offerReviewModal: dom.offerReviewModal,
    chatDisplayMode: CHAT_DISPLAY_MODE,
    defaultOfferAmount: DEAL_OFFER_AMOUNT,
    currentDealId: store.currentDealId,
    channelMessages: store.channelMessages,
    estimateVeilFee,
    rewardPoints: VEIL_REWARD_POINTS,
    setElementText: api.setElementText,
    statusPillClass,
    renderChainMeta: chainMetaUi.renderChainMeta,
    escapeHtml,
    iconRefresh: call(api, "iconRefresh"),
    showToast: call(api, "showToast"),
    fallbackOfferTime: () => Date.now() - 2 * data.minute,
  });

  const paymentController = createPaymentController({
    state: store.state,
    document: dom.document,
    paymentReviewModal: dom.paymentReviewModal,
    recipient: PAYMENT_RECIPIENT,
    estimateVeilFee,
    setElementText: api.setElementText,
    iconRefresh: call(api, "iconRefresh"),
    safeSubmit: call(api, "safeSubmit"),
    getVeilClient: call(api, "getVeilClient"),
    transactionTransportMode: call(chatController, "transactionTransportMode"),
    renderWorkflowProgress: call(dealRoomController, "renderWorkflowProgress"),
    showScreen: call(api, "showScreen"),
  });

  const escrowController = buildEscrowController({
    state: store.state,
    document: dom.document,
    escrowReviewModal: dom.escrowReviewModal,
    messageInput: dom.messageInput,
    chatDisplayMode: CHAT_DISPLAY_MODE,
    currentDealId: store.currentDealId,
    currentDealOfferAmount: call(offerController, "currentDealOfferAmount"),
    currentChannel: store.currentChannel,
    channelMessages: store.channelMessages,
    estimateVeilFee,
    rewardPoints: VEIL_REWARD_POINTS,
    setElementText: api.setElementText,
    statusPillClass,
    escapeHtml,
    renderChainMeta: chainMetaUi.renderChainMeta,
    setLucideIcon: api.setLucideIcon,
    iconRefresh: call(api, "iconRefresh"),
    addLocalItem: call(chatController, "addLocalItem"),
    confirmedTimelineMeta: data.confirmedTimelineMeta,
    renderWorkflowProgress: call(dealRoomController, "renderWorkflowProgress"),
    showScreen: call(api, "showScreen"),
    showToast: call(api, "showToast"),
    resetDealStateForPendingChannel: call(inviteController, "resetDealStateForPendingChannel"),
    saveLocalChannels: call(api, "saveLocalChannels"),
    renderConversationList: call(dealRoomController, "renderConversationList"),
    renderChannel: call(dealRoomController, "renderChannel"),
    requestAnimationFrame,
    fallbackFundingTime: () => Date.now() - 3 * data.minute,
  });

  const walletController = createWalletController({
    state: store.state,
    document: dom.document,
    walletAssetConfig: config.walletAssetConfig,
    expectedChainId: config.expectedChainId,
    privyAppId: config.privyAppId,
    timelineMode: config.timelineMode,
    privacyRuntime: config.privacyRuntime,
    privacyPoolCompatibility: config.networkConfig.privacyPool.compatibility,
    nextRewardTier,
    rewardRowsMarkup,
    formatPoints,
    setElementText: api.setElementText,
    shortAddress: api.shortAddress,
    isWalletInitializationPending: walletInitialization.isWalletInitializationPending,
    walletInitLabel: walletInitialization.walletInitLabel,
    expectedNetworkName: networkService.expectedNetworkName,
    verifyHelperDeployment: call(api, "verifyHelperDeployment"),
    refreshWalletAssets: call(api, "refreshWalletAssets"),
    refreshConnectLabels: call(api, "refreshConnectLabels"),
    renderHomeStatus: call(api, "renderHomeStatus"),
    showToast: call(api, "showToast"),
    getPrivyBridge: api.getPrivyBridge,
    connectWallet: call(api, "connectWallet"),
    clearWalletInitTimer: walletInitialization.clearWalletInitTimer,
    resetClientConnection: call(api, "resetClientConnection"),
    setWalletInitializationState: walletInitialization.setWalletInitializationState,
    createDefaultWalletAssetBalances: api.createDefaultWalletAssetBalances,
    listStorageKeys,
    removeStorageKeys,
    copyToClipboard: (value) => navigator.clipboard.writeText(value),
  });

  const settlementController = createSettlementController({
    state: store.state,
    document: dom.document,
    paymentRecipient: PAYMENT_RECIPIENT,
    explorerUrl: STARKNET_SEPOLIA_EXPLORER_URL,
    settlementProofMeta: call(api, "settlementProofMeta"),
    currentDealId: store.currentDealId,
    currentChannel: store.currentChannel,
    channelMessages: store.channelMessages,
    paymentAmountLabel: call(paymentController, "paymentAmountLabel"),
    paymentPrivacyLabel: call(paymentController, "paymentPrivacyLabel"),
    escrowReleaseProofItem: call(escrowController, "escrowReleaseProofItem"),
    hasRealTransactionHash: call(escrowController, "hasRealTransactionHash"),
    directPaymentProofItemFromMessages,
    buildDirectPaymentProofMarkup,
    buildEscrowSettlementProofMarkup,
    transactionExplorerUrl: api.transactionExplorerUrl,
    escapeHtml,
    setElementText: api.setElementText,
    iconRefresh: call(api, "iconRefresh"),
  });

  return {
    transactionDelay,
    transactionModalController,
    loadingController,
    rewardsController,
    inviteController,
    dealRoomController,
    chatController,
    offerController,
    paymentController,
    escrowController,
    walletController,
    settlementController,
    createSettlementProofMeta: (channel) => createSettlementProofMeta(store.currentDealId(channel), deterministicHex),
  };
}
