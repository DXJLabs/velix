import { currentOfferProofItemFromMessages, dealActivityLabel as describeDealActivity, hasOfferActivity, normalizeOfferAmount as normalizeDealOfferAmount } from "../../domain/deal/deal-selectors.js";
import { hideOfferReviewModal, renderOfferDealView, showOfferReviewModal } from "../../ui/offer/offer-ui.js";

export function createOfferController({
  state,
  document,
  offerReviewModal,
  chatDisplayMode,
  defaultOfferAmount,
  currentDealId,
  currentChannel,
  channelMessages,
  estimateVeilFee,
  rewardPoints,
  setElementText,
  statusPillClass,
  renderChainMeta,
  escapeHtml,
  iconRefresh,
  safeSubmit,
  getVeilClient,
  transactionTransportMode,
  awardReward,
  addLocalItem,
  confirmedTimelineMeta,
  renderWorkflowProgress,
  showScreen,
  fallbackOfferTime = () => Date.now(),
  now = () => Date.now(),
}) {
  function currentOfferProofItem() {
    return currentOfferProofItemFromMessages(channelMessages(), {
      fallbackTime: fallbackOfferTime(),
      mode: chatDisplayMode,
    });
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
      shielded: offerPrivacyMode() === "shield",
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
    const amount = createOfferAmountValue();
    const amountLabel = `${amount} STRK`;
    const asset = createOfferAssetValue();
    const terms = createOfferTermsValue();
    const submitted = await safeSubmit(
      () => getVeilClient().createOffer({
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
        time: now(),
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
      () => getVeilClient().counterOffer({
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
        time: now(),
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
      () => getVeilClient().acceptOffer({
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
        time: now(),
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
      time: now(),
      ...confirmedTimelineMeta(`${state.channelId}-waiting-deposits`, 20),
    });
    renderDeal();
    renderWorkflowProgress();
    showScreen("escrow");
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
