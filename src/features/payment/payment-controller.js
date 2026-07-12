import { DEFAULT_PAYMENT_MEMO, paymentAmountLabel as buildPaymentAmountLabel, paymentMemoValue as buildPaymentMemoValue, paymentPrivacyLabel as buildPaymentPrivacyLabel } from "./payment-feature.js";
import { hidePaymentReviewModal, renderPaymentView, showPaymentReviewModal } from "../../ui/payment/payment-ui.js";

export function createPaymentController({
  state,
  document,
  paymentReviewModal,
  recipient,
  estimateVeilFee,
  rewardPoints,
  setElementText,
  iconRefresh,
  safeSubmit,
  getVeilClient,
  transactionTransportMode,
  awardReward,
  currentChannel,
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
    const fee = estimateVeilFee("directPayment", amountLabel, {
      shielded: state.paymentMode === "shield",
    });

    setElementText("#payment-summary-amount", amountLabel);
    setElementText("#payment-total-fee", fee.feeLabel);
    setElementText("#payment-summary-total", fee.totalLabel);
    setElementText("#payment-review-recipient", recipient);
    setElementText("#payment-review-amount", amountLabel);
    setElementText("#payment-review-privacy", paymentPrivacyLabel());
    setElementText("#payment-review-fee", fee.feeLabel);
    setElementText("#payment-review-reward", `+${rewardPoints.directPayment} VEIL Points`);
    setElementText("#payment-review-memo", paymentMemoValue());
    setElementText("#payment-review-total", fee.totalLabel);
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
        title: "Payment completed",
        subtitle: `${amount} ${asset} to Bob`,
        actor: "Alice",
        time: now(),
        mode: state.paymentMode,
      },
      "Payment sent.",
      {
        actionLabel: "Sending Payment",
        successTitle: "Public Settlement Sent",
        successSubtitle: `${amount} ${asset} payment recorded in the private channel.`,
      },
    );
    if (!submitted) return;
    awardReward("directPayment");
    state.paymentSent = true;
    currentChannel().status = "Deal Completed";
    renderPayment();
    renderWorkflowProgress();
    showScreen("settlement");
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
