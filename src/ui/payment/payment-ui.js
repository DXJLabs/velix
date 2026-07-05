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
    paymentDealStatus.textContent = state.paymentSent
      ? "Settlement Complete"
      : "Direct Transfer";
  }
  document.querySelectorAll("[data-payment-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.paymentMode === state.paymentMode);
  });
  renderPaymentTransactionSummary();
  if (settlementAction) {
    settlementAction.disabled = !state.paymentSent;
    settlementAction.classList.toggle("disabled", !state.paymentSent);
    settlementAction.innerHTML = state.paymentSent
      ? `<i data-lucide="check" class="size-5"></i><span>View Settlement</span>`
      : `<i data-lucide="lock" class="size-5"></i><span>Settlement Locked</span>`;
    setElementText("#payment-settlement-copy", state.paymentSent
      ? "Settlement proof is ready."
      : "Send payment to generate settlement proof.");
  }
}
