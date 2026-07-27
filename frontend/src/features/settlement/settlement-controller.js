export function createSettlementController({
  state,
  document,
  explorerUrl,
  currentDealId,
  channelMessages,
  escrowReleaseProofItem,
  hasRealTransactionHash,
  directPaymentProofItemFromMessages,
  buildDirectPaymentProofMarkup,
  buildEscrowSettlementProofMarkup,
  transactionExplorerUrl,
  escapeHtml,
  setElementText,
  iconRefresh,
  now = () => Date.now(),
}) {
  function renderSettlement() {
    setElementText("#settlement-complete-deal-id", currentDealId() || "Unavailable");
    setElementText("#settlement-complete-proof-id", "Unavailable");
    setElementText("#settlement-complete-hash", "Unavailable");
  }

  function directPaymentProofItem() {
    return directPaymentProofItemFromMessages(channelMessages(), {
      paymentSent: state.paymentSent,
      paymentMode: state.paymentMode,
      fallbackTime: now(),
    });
  }

  function escrowSettlementProofMarkup() {
    return buildEscrowSettlementProofMarkup(escapeHtml);
  }

  function directPaymentProofMarkup() {
    return buildDirectPaymentProofMarkup({ escapeHtml });
  }

  function renderProof() {
    const directPaymentRecord = state.paymentSent && !state.escrowReleased;
    const item = directPaymentRecord ? directPaymentProofItem() : escrowReleaseProofItem();
    const txHash = hasRealTransactionHash(item) ? String(item.txHash) : "";
    const proofFlow = document.querySelector("#settlement-proof-flow");
    const proofLink = document.querySelector("#settlement-proof-link");
    const exportButton = document.querySelector("[data-export-proof]");

    setElementText("#settlement-proof-title", "No verified settlement proof");
    setElementText("#settlement-proof-parties", `${currentDealId() || "Deal"} · chain evidence only`);
    setElementText("#settlement-proof-id", "Unavailable");
    setElementText("#settlement-proof-settlement-hash", "Unavailable");
    if (proofFlow) {
      proofFlow.innerHTML = directPaymentRecord
        ? directPaymentProofMarkup()
        : escrowSettlementProofMarkup();
    }
    setElementText("#settlement-proof-hash", txHash || "Unavailable");

    if (proofLink) {
      const txUrl = txHash ? transactionExplorerUrl(txHash, explorerUrl) : "";
      proofLink.hidden = !txUrl;
      if (txUrl) proofLink.href = txUrl;
      else proofLink.removeAttribute("href");
      const label = proofLink.querySelector("span");
      if (label) label.textContent = txUrl ? "View settlement transaction" : "Transaction unavailable";
    }
    if (exportButton) {
      exportButton.disabled = true;
      exportButton.setAttribute("aria-disabled", "true");
    }
    iconRefresh();
  }

  return {
    renderSettlement,
    directPaymentProofItem,
    escrowSettlementProofMarkup,
    directPaymentProofMarkup,
    renderProof,
  };
}
