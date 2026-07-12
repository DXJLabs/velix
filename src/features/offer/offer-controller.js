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
  getOnchainContracts,
  demoCounterpartyAddress,
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

  function createOfferCounterpartyValue() {
    return document.querySelector("#create-offer-counterparty")?.value.trim() || "";
  }

  function isStarknetAddress(value) {
    return /^0x[0-9a-fA-F]{1,64}$/.test(String(value || "").trim());
  }

  function resolveCounterpartyAddress(value = createOfferCounterpartyValue()) {
    if (isStarknetAddress(value)) return value;
    if (demoCounterpartyAddress) return demoCounterpartyAddress;
    throw new Error("Set VITE_DEMO_COUNTERPARTY_ADDRESS or enter a Starknet address for the counterparty.");
  }

  function requireOnchainContracts() {
    const contracts = getOnchainContracts();
    if (!contracts) {
      throw new Error("Connect a Starknet wallet before submitting offer transactions.");
    }
    return contracts;
  }

  function requireLatestOffer() {
    if (!state.latestOfferId || !state.latestOfferCommitments) {
      throw new Error("Create or load an onchain offer before continuing.");
    }
    return {
      offerId: state.latestOfferId,
      commitments: state.latestOfferCommitments,
    };
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
    const amount = createOfferAmountValue();
    const amountLabel = `${amount} STRK`;
    const asset = createOfferAssetValue();
    const terms = createOfferTermsValue();
    let onchainResult;
    let taker;
    const submitted = await safeSubmit(
      async () => {
        taker = resolveCounterpartyAddress();
        onchainResult = await requireOnchainContracts().createOffer({
          channelId: state.channelId,
          taker,
          amount,
          currency: "STRK",
          asset,
          terms,
        });
        return onchainResult;
      },
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
    state.latestOfferId = onchainResult?.offerId;
    state.latestOfferCommitments = onchainResult?.commitments;
    state.latestOfferSellerAddress = state.walletAddress || taker;
    state.latestEscrowId = "";
    awardReward("createOffer");
    state.offerAccepted = false;
    state.escrowDeposits = { buyer: false, seller: false };
    state.escrowConfirmations = { buyer: false, seller: false };
    state.escrowReleased = false;
    state.escrowActivated = false;
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
    let onchainResult;
    const submitted = await safeSubmit(
      async () => {
        const latestOffer = requireLatestOffer();
        onchainResult = await requireOnchainContracts().counterOffer({
          channelId: state.channelId,
          offerId: latestOffer.offerId,
          baseCommitments: latestOffer.commitments,
          amount,
          currency: "STRK",
          asset,
          terms,
        });
        return onchainResult;
      },
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
    state.latestOfferId = onchainResult?.offerId;
    state.latestOfferCommitments = onchainResult?.commitments;
    state.latestOfferSellerAddress = state.walletAddress || resolveCounterpartyAddress();
    state.latestEscrowId = "";
    awardReward("counterOffer");
    state.offerAccepted = false;
    state.escrowDeposits = { buyer: false, seller: false };
    state.escrowConfirmations = { buyer: false, seller: false };
    state.escrowReleased = false;
    state.escrowActivated = false;
    state.negotiationStep = "decision";
    state.latestOfferAmount = amountLabel;
    currentChannel().status = "Negotiation Active";
    currentChannel().last = `Bob created a counter offer`;
    renderDeal();
    renderWorkflowProgress();
  }

  async function acceptOffer() {
    let onchainResult;
    const submitted = await safeSubmit(
      async () => {
        const latestOffer = requireLatestOffer();
        const seller = state.latestOfferSellerAddress || resolveCounterpartyAddress();
        onchainResult = await requireOnchainContracts().acceptOfferAndCreateEscrow({
          channelId: state.channelId,
          offerId: latestOffer.offerId,
          seller,
          commitments: latestOffer.commitments,
        });
        return onchainResult;
      },
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
    state.latestEscrowId = onchainResult?.escrowId;
    awardReward("acceptProposal");
    state.offerAccepted = true;
    state.negotiationStep = "accepted";
    state.escrowDeposits = { buyer: false, seller: false };
    state.escrowConfirmations = { buyer: false, seller: false };
    state.escrowReleased = false;
    state.escrowActivated = false;
    state.escrowDisputeOpened = false;
    currentChannel().status = "Escrow Active";
    currentChannel().last = "Waiting for escrow deposits";
    addLocalItem({
      type: "inline",
      title: "Waiting for escrow deposits",
      subtitle: `Waiting for: Alice deposits ${currentDealOfferAmount()}; Bob locks NFT.`,
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
