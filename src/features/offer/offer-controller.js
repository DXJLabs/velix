import { currentOfferProofItemFromMessages, dealActivityLabel as describeDealActivity, hasOfferActivity, normalizeOfferAmount as normalizeDealOfferAmount } from "../../domain/deal/deal-selectors.js";
import { hideOfferReviewModal, renderOfferDealView, showOfferReviewModal } from "../../ui/offer/offer-ui.js";

export function createOfferController({
  state,
  document,
  offerReviewModal,
  chatDisplayMode,
  defaultOfferAmount,
  currentDealId,
  channelMessages,
  estimateVeilFee,
  rewardPoints,
  setElementText,
  statusPillClass,
  renderChainMeta,
  escapeHtml,
  iconRefresh,
  showToast,
  fallbackOfferTime = () => Date.now(),
}) {
  const publicOfferRemovedMessage = "Public offer and escrow execution has been removed. Use the private workflow.";

  function currentOfferProofItem() {
    return currentOfferProofItemFromMessages(channelMessages(), {
      fallbackTime: fallbackOfferTime(),
      mode: chatDisplayMode,
    });
  }

  function offerPrivacyMode() {
    return "encrypted-direct";
  }

  function offerPrivacyLabel() {
    return "Encrypted negotiation";
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
    return state.latestOfferAmount || defaultOfferAmount;
  }

  function channelHasOfferActivity() {
    return hasOfferActivity(channelMessages());
  }

  function dealActivityLabel(item) {
    return describeDealActivity(item);
  }

  function renderDealTransactionSummary() {
    const fee = estimateVeilFee("escrow", currentDealOfferAmount(), {
      shielded: false,
    });
    setElementText("#deal-price", currentDealOfferAmount());
    setElementText("#offer-review-amount", currentDealOfferAmount());
    setElementText("#offer-review-privacy", offerPrivacyLabel());
    setElementText("#offer-review-fee", fee.feeLabel);
    setElementText("#offer-review-reward", `+${rewardPoints.acceptProposal} VEIL Points`);
    setElementText("#offer-review-total", fee.totalLabel);
  }

  function showOfferReview() {
    renderDealTransactionSummary();
    showOfferReviewModal({ modal: offerReviewModal, document, iconRefresh });
  }

  function hideOfferReview() {
    hideOfferReviewModal({ modal: offerReviewModal, document });
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
    const activityItem = currentOfferProofItem();

    renderOfferDealView({
      document,
      state,
      accepted,
      timelineHasOffer,
      currentStatus,
      currentAmount,
      initialAmount,
      waitingForCounterparty,
      editingOffer,
      hasActiveOffer,
      negotiationStep,
      activityItem,
      currentDealId,
      renderDealTransactionSummary,
      setElementText,
      statusPillClass,
      dealActivityLabel,
      renderChainMeta,
      escapeHtml,
      iconRefresh,
    });
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
    showToast(publicOfferRemovedMessage);
    return false;
  }

  async function counterOffer() {
    showToast(publicOfferRemovedMessage);
    return false;
  }

  async function acceptOffer() {
    showToast(publicOfferRemovedMessage);
    return false;
  }

  return {
    currentOfferProofItem,
    offerPrivacyMode,
    offerPrivacyLabel,
    normalizeOfferAmount,
    createOfferAmountValue,
    createOfferAssetValue,
    createOfferTermsValue,
    currentDealOfferAmount,
    channelHasOfferActivity,
    dealActivityLabel,
    renderDealTransactionSummary,
    showOfferReview,
    hideOfferReview,
    renderDeal,
    writeOfferForm,
    openCounterOfferForm,
    cancelOfferForm,
    createOffer,
    counterOffer,
    acceptOffer,
  };
}
