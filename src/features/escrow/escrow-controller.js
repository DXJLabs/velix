import {
  escrowApprovalCompleteFromState,
  escrowConfirmationsCompleteFromState,
  escrowDepositCompleteFromState,
  escrowDepositProofItemFromMessages,
  escrowFundingCompleteFromState,
  escrowFundingProofItemFromMessages,
  escrowReleaseProofItemFromMessages,
  hasRealTransactionHash as isRealTransactionHash,
} from "./escrow-feature.js";
import { hideEscrowReviewModal, renderEscrowView, showEscrowReviewModal } from "../../ui/escrow/escrow-ui.js";

export function buildEscrowController({
  state,
  document,
  escrowReviewModal,
  messageInput,
  chatDisplayMode,
  currentDealId,
  currentDealOfferAmount,
  currentChannel,
  channelMessages,
  estimateVeilFee,
  rewardPoints,
  setElementText,
  statusPillClass,
  escapeHtml,
  renderChainMeta,
  setLucideIcon,
  iconRefresh,
  addLocalItem,
  confirmedTimelineMeta,
  renderWorkflowProgress,
  showScreen,
  showToast,
  resetDealStateForPendingChannel,
  saveLocalChannels,
  renderConversationList,
  renderChannel,
  requestAnimationFrame,
  fallbackFundingTime = () => Date.now(),
  now = () => Date.now(),
}) {
  const publicEscrowRemovedMessage = "Public escrow execution has been removed. Use the private escrow workflow.";

  function renderEscrowTransactionSummary() {
    const fee = estimateVeilFee("escrow", currentDealOfferAmount(), {
      shielded: false,
    });
    setElementText("#escrow-fee-amount", currentDealOfferAmount());
    setElementText("#escrow-total-fee", fee.feeLabel);
    setElementText("#escrow-fee-total", fee.totalLabel);
    setElementText("#escrow-review-amount", currentDealOfferAmount());
    setElementText("#escrow-review-fee", fee.feeLabel);
    setElementText("#escrow-review-reward", `+${rewardPoints.escrowCompleted} VEIL Points`);
    setElementText("#escrow-review-total", fee.totalLabel);
  }

  function showEscrowReview() {
    renderEscrowTransactionSummary();
    showEscrowReviewModal({ modal: escrowReviewModal, document, iconRefresh });
  }

  function hideEscrowReview() {
    hideEscrowReviewModal({ modal: escrowReviewModal, document });
  }

  function escrowDepositProofItem(key) {
    return escrowDepositProofItemFromMessages(channelMessages(), key, {
      mode: chatDisplayMode,
    });
  }

  function escrowFundingProofItem() {
    return escrowFundingProofItemFromMessages(channelMessages(), {
      fallbackTime: fallbackFundingTime(),
      mode: chatDisplayMode,
    });
  }

  function escrowReleaseProofItem() {
    return escrowReleaseProofItemFromMessages(channelMessages(), {
      fallbackTime: state.escrowReleased ? now() : undefined,
      mode: chatDisplayMode,
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

  function escrowConfirmationsComplete() {
    return escrowConfirmationsCompleteFromState({
      released: state.escrowReleased,
      paymentSent: state.paymentSent,
      confirmations: state.escrowConfirmations,
      messages: channelMessages(),
    });
  }

  function renderEscrow() {
    renderEscrowView({
      state,
      document,
      currentDealId,
      currentDealOfferAmount,
      estimateVeilFee,
      rewardPoints,
      setElementText,
      statusPillClass,
      escapeHtml,
      renderChainMeta,
      renderEscrowProofMeta,
      renderEscrowTransactionSummary,
      escrowDepositProofItem,
      escrowFundingProofItem,
      escrowReleaseProofItem,
      escrowDepositComplete,
      escrowFundingComplete,
      escrowApprovalComplete,
      escrowConfirmationsComplete,
      setLucideIcon,
      iconRefresh,
    });
  }

  async function submitEscrowDeposit() {
    showToast(publicEscrowRemovedMessage);
    return false;
  }

  async function approveEscrowRelease() {
    showToast(publicEscrowRemovedMessage);
    return false;
  }

  async function releaseEscrow() {
    showToast(publicEscrowRemovedMessage);
    return false;
  }

  async function cancelEscrow() {
    showToast(publicEscrowRemovedMessage);
    return false;
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
      time: now(),
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
      time: now(),
      ...confirmedTimelineMeta(`${state.channelId}-deal-closed`, 43),
    });
    saveLocalChannels();
    renderConversationList();
    renderChannel();
    renderWorkflowProgress();
    showToast("Deal closed.");
  }

  return {
    renderEscrowTransactionSummary,
    showEscrowReview,
    hideEscrowReview,
    escrowDepositProofItem,
    escrowFundingProofItem,
    escrowReleaseProofItem,
    hasRealTransactionHash,
    renderEscrowProofMeta,
    escrowDepositComplete,
    escrowFundingComplete,
    escrowApprovalComplete,
    escrowConfirmationsComplete,
    renderEscrow,
    submitEscrowDeposit,
    approveEscrowRelease,
    releaseEscrow,
    cancelEscrow,
    continueCompletedChannel,
    startNewEscrowInCurrentChannel,
    closeCurrentDeal,
  };
}
