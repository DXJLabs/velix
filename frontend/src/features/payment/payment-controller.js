import { DEFAULT_PAYMENT_MEMO, paymentAmountLabel as buildPaymentAmountLabel, paymentMemoValue as buildPaymentMemoValue, paymentPrivacyLabel as buildPaymentPrivacyLabel } from "./payment-feature.js";
import { hidePaymentReviewModal, renderPaymentView, showPaymentReviewModal } from "../../ui/payment/payment-ui.js";

export function createPaymentController({
  state,
  document,
  paymentReviewModal,
  recipient,
  estimateVeilFee,
  setElementText,
  iconRefresh,
  safeSubmit,
  getVeilClient,
  transactionTransportMode,
  renderWorkflowProgress,
  showScreen,
  now = () => Date.now(),
}) {
  function paymentAmountLabel() {
    return buildPaymentAmountLabel(
      document.querySelector("#payment-amount")?.value,
      document.querySelector("#payment-asset")?.value,
    );
  }

  function paymentPrivacyLabel() {
    return buildPaymentPrivacyLabel(state.paymentMode);
  }

  function paymentMemoValue() {
    return buildPaymentMemoValue(document.querySelector("#payment-memo")?.value);
  }

  function renderPaymentTransactionSummary() {
    const amountLabel = paymentAmountLabel();
    const fee = estimateVeilFee("encryptedMemo", "0 STRK", {
      shielded: false,
    });

    setElementText("#payment-summary-amount", `${amountLabel} (memo only)`);
    setElementText("#payment-total-fee", fee.feeLabel);
    setElementText("#payment-summary-total", fee.feeLabel);
    setElementText("#payment-review-recipient", recipient);
    setElementText("#payment-review-amount", `${amountLabel} (not transferred)`);
    setElementText("#payment-review-privacy", paymentPrivacyLabel());
    setElementText("#payment-review-fee", fee.feeLabel);
    setElementText("#payment-review-reward", "None - this is not a payment");
    setElementText("#payment-review-memo", paymentMemoValue());
    setElementText("#payment-review-total", fee.feeLabel);
  }

  function showPaymentReview() {
    renderPaymentTransactionSummary();
    showPaymentReviewModal({ modal: paymentReviewModal, document, iconRefresh });
  }

  function hidePaymentReview() {
    hidePaymentReviewModal({ modal: paymentReviewModal, document });
  }

  function renderPayment() {
    renderPaymentView({
      document,
      state,
      setElementText,
      renderPaymentTransactionSummary,
    });
  }

  async function sendPayment() {
    const amount = document.querySelector("#payment-amount").value.trim() || "450";
    const asset = document.querySelector("#payment-asset").value.trim() || "STRK";
    const memo = document.querySelector("#payment-memo").value.trim() || DEFAULT_PAYMENT_MEMO;
    state.paymentSent = false;
    const submitted = await safeSubmit(
      () => getVeilClient().sendPaymentMemo({
        channelId: state.channelId,
        amount: `${amount} ${asset}`,
        memo,
        mode: transactionTransportMode(state.paymentMode),
        sender: "you",
      }),
      {
        type: "inline",
        title: "Direct encrypted payment memo",
        subtitle: `${amount} ${asset} is memo content only; no assets were transferred.`,
        actor: "Alice",
        time: now(),
        mode: state.paymentMode,
      },
      "Encrypted memo sent. No assets were transferred.",
      {
        actionLabel: "Sending encrypted memo",
        successTitle: "Direct encrypted memo sent",
        successSubtitle: "Payment intent recorded as ciphertext. No assets were transferred.",
      },
    );
    state.paymentSent = false;
    if (!submitted) return false;
    renderPayment();
    renderWorkflowProgress();
    showScreen("channel");
    return true;
  }

  return {
    paymentAmountLabel,
    paymentPrivacyLabel,
    paymentMemoValue,
    renderPaymentTransactionSummary,
    showPaymentReview,
    hidePaymentReview,
    renderPayment,
    sendPayment,
  };
}
