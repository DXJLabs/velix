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

export function createEscrowController({
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
  safeSubmit,
  getVeilClient,
  getOnchainContracts,
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
  fallbackFundingTime = () => Date.now(),
  now = () => Date.now(),
}) {
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

  function requireOnchainContracts() {
    const contracts = getOnchainContracts();
    if (!contracts) {
      throw new Error("Connect a Starknet wallet before submitting escrow transactions.");
    }
    return contracts;
  }

  function requireEscrowId() {
    if (!state.latestEscrowId) {
      throw new Error("Create an onchain escrow before funding or settling.");
    }
    return state.latestEscrowId;
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
      () => {
        const contracts = requireOnchainContracts();
        const escrowId = requireEscrowId();
        return isBuyer
          ? contracts.confirmBuyerDeposit({ escrowId })
          : contracts.confirmSellerDeposit({ escrowId });
      },
      {
        type: "inline",
        title,
        subtitle,
        actor: isBuyer ? "Alice" : "Bob",
        time: now(),
        mode: chatDisplayMode,
      },
      isBuyer ? "Buyer deposit recorded." : "Seller asset locked.",
      {
        actionLabel: isBuyer ? "Locking Funds" : "Locking Asset",
        successTitle: isBuyer ? "Public Escrow Deposit Confirmed" : "On-chain Asset Locked",
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
        time: now(),
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
    const title = state.escrowActivated ? (isBuyer ? "Alice approved release" : "Bob approved release") : "Escrow activated";
    const submitted = await safeSubmit(
      () => state.escrowActivated
        ? Promise.resolve({
          transactionHash: "",
          status: "confirmed",
          timestamp: now(),
        })
        : requireOnchainContracts().activateEscrow({ escrowId: requireEscrowId() }),
      {
        type: "inline",
        title,
        subtitle: state.escrowActivated ? "Release approval recorded" : "Both deposits are active on VeilEscrow.",
        actor: isBuyer ? "Alice" : "Bob",
        time: now(),
        mode: chatDisplayMode,
      },
      state.escrowActivated ? "Approval recorded." : "Escrow activated.",
      {
        actionLabel: state.escrowActivated ? "Approving Release" : "Activating Escrow",
        successTitle: state.escrowActivated ? "Release Approved" : "Escrow Activated",
        successSubtitle: state.escrowActivated ? `${title}.` : "Escrow is active on Starknet Sepolia.",
      },
    );
    if (!submitted) return;
    state.escrowActivated = true;
    state.escrowConfirmations = { buyer: true, seller: true };
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
    const amount = currentDealOfferAmount();
    const submitted = await safeSubmit(
      () => requireOnchainContracts().settleEscrow({ escrowId: requireEscrowId() }),
      {
        type: "inline",
        title: "Assets released",
        subtitle: `${amount} to Bob. NFT to Alice.`,
        actor: "System",
        time: now(),
      },
      "Assets released.",
      {
        actionLabel: "Releasing Assets",
        successTitle: "Assets Released",
        successSubtitle: `${amount} to Bob. NFT to Alice.`,
      },
    );
    if (!submitted) return;
    awardReward("escrowCompleted");
    state.escrowReleased = true;
    currentChannel().status = "Deal Completed";
    currentChannel().last = "Secure deal completed";
    addLocalItem({
      type: "inline",
      title: "Settlement transaction confirmed",
      subtitle: "No separate cryptographic settlement proof was generated.",
      actor: "System",
      time: now() + 1,
      ...confirmedTimelineMeta(`${state.channelId}-settlement-proof`, 39),
    });
    addLocalItem({
      type: "inline",
      title: "Secure deal completed.",
      subtitle: "Encrypted channel remains available.",
      actor: "System",
      channelActions: true,
      time: now() + 3,
      ...confirmedTimelineMeta(`${state.channelId}-secure-channel-open`, 41),
    });
    renderEscrow();
    renderWorkflowProgress();
    showScreen("settlement");
  }

  async function cancelEscrow() {
    if (state.escrowReleased) {
      showToast("Escrow is already settled.");
      return;
    }
    const submitted = await safeSubmit(
      () => requireOnchainContracts().cancelEscrow({ escrowId: requireEscrowId() }),
      {
        type: "inline",
        title: "Escrow cancelled",
        subtitle: "Escrow cancellation recorded on VeilEscrow.",
        actor: "System",
        time: now(),
      },
      "Escrow cancelled.",
      {
        actionLabel: "Cancelling Escrow",
        successTitle: "Escrow Cancelled",
        successSubtitle: "Cancellation recorded on Starknet Sepolia.",
      },
    );
    if (!submitted) return;
    state.escrowDisputeOpened = true;
    state.escrowReleased = false;
    currentChannel().status = "Cancelled";
    currentChannel().last = "Escrow cancelled";
    renderEscrow();
    renderWorkflowProgress();
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
