export function showOfferReviewModal({ modal, document, iconRefresh }) {
  if (!modal) return;
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  iconRefresh();
  modal.querySelector("[data-offer-review-sign]")?.focus();
}

export function hideOfferReviewModal({ modal, document }) {
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

export function renderOfferDealView({
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
}) {
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
  const acceptAction = document.querySelector("#deal-accept-action");
  const dealTurnLabel = document.querySelector("#deal-turn-label");
  const offerHistoryPanel = document.querySelector("#offer-history-panel");
  const nextStepPanel = document.querySelector("#deal-next-step-panel");
  const nextStepCopy = document.querySelector("#deal-next-step-copy");
  const offerHistoryList = document.querySelector("#offer-history-list");
  const activityPanel = document.querySelector("#deal-activity-panel");
  const activityTitle = document.querySelector("#deal-activity-title");
  const offerProof = document.querySelector("#deal-offer-proof");
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
  if (negotiationActions) negotiationActions.classList.toggle("hidden", accepted);
  if (counterAction) {
    counterAction.disabled = false;
    counterAction.classList.remove("disabled");
    counterAction.textContent = waitingForCounterparty ? "Submit Counter" : "Counter Again";
  }
  if (acceptAction) acceptAction.hidden = waitingForCounterparty;
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
