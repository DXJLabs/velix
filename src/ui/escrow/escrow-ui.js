export function showEscrowReviewModal({ modal, document, iconRefresh }) {
  if (!modal) return;
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  iconRefresh();
  modal.querySelector("[data-escrow-review-sign]")?.focus();
}

export function hideEscrowReviewModal({ modal, document }) {
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

export function renderEscrowView({
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
}) {
  const releaseDone = state.escrowReleased || state.paymentSent;
  const buyerDeposited = escrowDepositComplete("buyer");
  const sellerDeposited = escrowDepositComplete("seller");
  const fundingComplete = escrowFundingComplete();
  const buyerApproved = escrowApprovalComplete("buyer");
  const sellerApproved = escrowApprovalComplete("seller");
  const releaseReady = releaseDone || (fundingComplete && escrowConfirmationsComplete());
  const escrowDisplayStatus = releaseDone ? "Deal Completed" : state.offerAccepted || fundingComplete || buyerDeposited ? "Escrow Active" : "Waiting Deposit";
  const fundingItem = escrowFundingProofItem();
  const releaseItem = escrowReleaseProofItem();
  const fundingProof = document.querySelector("#escrow-funding-proof");
  const fundingStep = document.querySelector("#escrow-funding-proof-step");
  const fundingProofTimeline = document.querySelector("#escrow-funding-proof-timeline");
  const releaseProof = document.querySelector("#escrow-release-proof");
  const releaseAction = document.querySelector("#escrow-release-action");
  const releaseStep = document.querySelector("#escrow-release-proof-step");
  const settlementAction = document.querySelector("#escrow-settlement-action");
  const disputeAction = document.querySelector("#escrow-dispute-action");
  const escrowChannelStatus = document.querySelector("#escrow-channel-status");
  const buyerDepositProof = escrowDepositProofItem("buyer");
  const sellerDepositProof = escrowDepositProofItem("seller");
  const title = releaseDone
    ? "Settlement ready"
    : fundingComplete
      ? "Confirmation"
      : buyerDeposited
        ? "Alice deposited 450 STRK"
        : "Waiting deposits";
  const fundingCopy = releaseDone || fundingComplete
    ? "Funding complete. Buyer and seller deposits are locked in escrow."
    : buyerDeposited
      ? "Buyer deposit is locked. Waiting for Bob to lock the seller asset."
      : "Step 1 of 2. Waiting for Alice and Bob deposits.";

  renderEscrowTransactionSummary();
  const escrowFee = estimateVeilFee("escrow", currentDealOfferAmount(), { shielded: false });

  setElementText("#escrow-page-eyebrow", fundingComplete ? "Escrow Confirmation" : "Escrow Funding");
  setElementText("#escrow-page-title", title);
  setElementText("#escrow-channel-meta", `${currentDealId()} Â· Alice / Bob`);
  setElementText("#escrow-funding-step", fundingComplete ? "Funding Complete" : buyerDeposited ? "Step 2 of 2" : "Step 1 of 2");
  setElementText("#escrow-funding-copy", fundingCopy);
  setElementText("#escrow-buyer-protocol-fee", escrowFee.protocolFeeLabel);
  setElementText("#escrow-buyer-privacy-fee", escrowFee.privacyFeeLabel);
  setElementText("#escrow-buyer-network-fee", escrowFee.networkFeeLabel);
  setElementText("#escrow-buyer-reward", `+${rewardPoints.escrowCreated} VEIL Points`);
  setElementText("#escrow-seller-reward", `+${rewardPoints.escrowCreated} VEIL Points`);
  const fundingStepBadge = document.querySelector("#escrow-funding-step");
  if (fundingStepBadge) fundingStepBadge.className = fundingComplete ? "status-pill escrow-active" : "status-pill waiting-deposit";

  if (escrowChannelStatus) {
    escrowChannelStatus.textContent = escrowDisplayStatus;
    escrowChannelStatus.className = statusPillClass(escrowDisplayStatus);
  }

  const renderDepositCard = (key, complete, options) => {
    const card = document.querySelector(`#escrow-${key}-deposit-card`);
    const status = document.querySelector(`#escrow-${key}-deposit-status`);
    const detail = document.querySelector(`#escrow-${key}-deposit-detail`);
    const action = document.querySelector(`#escrow-${key}-deposit-action`);
    if (!card) return;
    card.classList.toggle("complete", complete);
    card.classList.toggle("waiting", !complete);
    card.classList.toggle("locked", Boolean(options.locked));
    setLucideIcon(card.querySelector(".deposit-card-top"), complete ? "check" : options.locked ? "lock" : "circle");
    if (status) status.textContent = complete ? options.completeStatus : options.waitingStatus;
    if (detail) detail.textContent = complete ? options.completeDetail : options.waitingDetail;
    if (action) {
      action.disabled = complete || releaseDone || Boolean(options.locked);
      action.classList.toggle("disabled", action.disabled);
      action.classList.toggle("primary-action", !options.secondaryWhenReady);
      action.classList.toggle("secondary-action", Boolean(options.secondaryWhenReady));
      action.innerHTML = complete
        ? `<i data-lucide="check" class="size-5"></i><span>${escapeHtml(options.doneAction)}</span>`
        : `<i data-lucide="${options.actionIcon}" class="size-5"></i><span>${escapeHtml(options.actionLabel)}</span>`;
    }
  };

  renderDepositCard("buyer", buyerDeposited, {
    completeStatus: "Deposited",
    waitingStatus: "Deposit Required",
    completeDetail: `${currentDealOfferAmount()} locked in escrow`,
    waitingDetail: "Waiting for Alice",
    actionLabel: "Deposit to Escrow",
    doneAction: "Deposited",
    actionIcon: "wallet",
  });
  renderDepositCard("seller", sellerDeposited, {
    completeStatus: "Locked",
    waitingStatus: buyerDeposited ? "Asset Required" : "Waiting for Bob",
    completeDetail: "Rights Package NFT locked in escrow",
    waitingDetail: buyerDeposited ? "Waiting for Bob" : "Waiting for buyer deposit",
    actionLabel: "Lock Asset",
    doneAction: "Locked",
    actionIcon: "lock-keyhole",
    locked: !buyerDeposited,
    secondaryWhenReady: true,
  });
  const buyerDepositProofEl = document.querySelector("#escrow-buyer-deposit-proof");
  const sellerDepositProofEl = document.querySelector("#escrow-seller-deposit-proof");
  if (buyerDepositProofEl) buyerDepositProofEl.innerHTML = buyerDeposited && buyerDepositProof ? renderChainMeta(buyerDepositProof) : "";
  if (sellerDepositProofEl) sellerDepositProofEl.innerHTML = sellerDeposited && sellerDepositProof ? renderChainMeta(sellerDepositProof) : "";

  [
    ["#escrow-buyer-confirmed", "buyer", buyerApproved],
    ["#escrow-seller-confirmed", "seller", sellerApproved],
  ].forEach(([selector, key, approved]) => {
    const item = document.querySelector(selector);
    if (!item) return;
    const complete = releaseDone || Boolean(approved);
    const locked = !fundingComplete || releaseDone || complete;
    item.disabled = locked;
    item.classList.toggle("complete", complete);
    item.classList.toggle("disabled", locked && !complete);
    setLucideIcon(item, complete ? "check" : fundingComplete ? "circle" : "lock");
    const status = item.querySelector("small");
    if (status) status.textContent = complete ? "Approved" : fundingComplete ? "Ready" : "Locked";
  });

  setElementText("#escrow-confirmation-step", fundingComplete ? "Ready" : "Locked");
  const confirmationStep = document.querySelector("#escrow-confirmation-step");
  if (confirmationStep) confirmationStep.className = fundingComplete ? "status-pill escrow-active" : "status-pill public";
  setElementText("#escrow-confirmation-copy", releaseDone
    ? "Both approvals are complete. Assets have been released."
    : fundingComplete
      ? "Funding complete. Buyer and seller can approve release."
      : "Complete both deposits before buyer and seller approvals.");

  setElementText("#escrow-funding-status", fundingComplete ? "Funding complete" : buyerDeposited ? "Waiting seller deposit" : "Waiting deposits");
  setElementText("#escrow-release-status", releaseDone ? "Released" : releaseReady ? "Ready" : fundingComplete ? "Waiting approvals" : "Funding required");
  setElementText("#escrow-release-copy", releaseDone
    ? "Assets released. Settlement proof is ready."
    : releaseReady
      ? "Ready for wallet signature."
      : fundingComplete
        ? "Waiting for both approvals"
        : "Waiting for buyer and seller deposits");
  if (fundingProof) {
    fundingProof.innerHTML = "";
    fundingProof.hidden = true;
  }
  if (fundingProofTimeline) fundingProofTimeline.innerHTML = fundingComplete ? renderEscrowProofMeta(fundingItem) : "";
  if (fundingStep) {
    fundingStep.classList.toggle("complete", fundingComplete);
    fundingStep.classList.toggle("pending", !fundingComplete);
    setLucideIcon(fundingStep, fundingComplete ? "check" : "circle", "size-4");
  }
  if (releaseProof) releaseProof.innerHTML = releaseDone ? renderEscrowProofMeta(releaseItem) : "";
  if (releaseStep) {
    releaseStep.classList.toggle("complete", releaseDone);
    releaseStep.classList.toggle("pending", !releaseDone);
    setLucideIcon(releaseStep, releaseDone ? "check" : "circle", "size-4");
  }
  if (releaseAction) {
    releaseAction.disabled = !releaseReady || releaseDone;
    releaseAction.classList.toggle("disabled", !releaseReady || releaseDone);
    releaseAction.innerHTML = releaseDone
      ? `<i data-lucide="check" class="size-5"></i><span>Released</span>`
      : releaseReady
        ? `<i data-lucide="unlock" class="size-5"></i><span>Release Assets</span>`
        : fundingComplete
          ? `<i data-lucide="lock" class="size-5"></i><span>Release Assets</span><small>Needs approvals</small>`
          : `<i data-lucide="lock" class="size-5"></i><span>Release Assets</span><small>Funding required</small>`;
  }
  if (settlementAction) {
    if (releaseDone) {
      settlementAction.disabled = false;
      settlementAction.classList.remove("disabled");
      settlementAction.dataset.openRoute = "settlement";
      settlementAction.innerHTML = `<i data-lucide="check" class="size-5"></i><span>View Settlement Proof</span>`;
      setElementText("#escrow-settlement-copy", "Settlement proof is ready.");
    } else {
      settlementAction.disabled = true;
      settlementAction.classList.add("disabled");
      settlementAction.dataset.openRoute = "settlement";
      settlementAction.innerHTML = `<i data-lucide="lock" class="size-5"></i><span>Settlement Locked</span>`;
      setElementText("#escrow-settlement-copy", "Release escrow to generate settlement proof.");
    }
  }

  if (disputeAction) {
    disputeAction.textContent = state.escrowDisputeOpened ? "Dispute Opened" : "Dispute";
    disputeAction.disabled = state.escrowDisputeOpened;
    disputeAction.classList.toggle("disabled", state.escrowDisputeOpened);
  }
  iconRefresh();
}
