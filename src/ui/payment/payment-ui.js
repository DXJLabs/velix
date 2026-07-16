export function showPaymentReviewModal({ modal, document, iconRefresh }) {
  if (!modal) return;
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  iconRefresh();
  modal.querySelector("[data-payment-review-sign]")?.focus();
}

export function hidePaymentReviewModal({ modal, document }) {
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

export function renderPaymentView({
  document,
  state,
  setElementText,
  renderPaymentTransactionSummary,
}) {
  const paymentDealStatus = document.querySelector("#payment-deal-status");
  const settlementAction = document.querySelector("#payment-settlement-action");
  if (paymentDealStatus) {
    paymentDealStatus.textContent = "Memo only - no asset transfer";
  }
  document.querySelectorAll("[data-payment-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.paymentMode === state.paymentMode);
  });
  renderPaymentTransactionSummary();
  if (settlementAction) {
    settlementAction.disabled = true;
    settlementAction.classList.add("disabled");
    settlementAction.innerHTML = `<i data-lucide="lock" class="size-5"></i><span>Settlement unavailable</span>`;
    setElementText(
      "#payment-settlement-copy",
      "This action sends a Direct encrypted memo only. It does not transfer assets or generate a settlement proof.",
    );
  }
}
