export function createSettlementController({
  state,
  document,
  paymentRecipient,
  explorerUrl,
  settlementProofMeta,
  currentDealId,
  currentChannel,
  channelMessages,
  paymentAmountLabel,
  paymentPrivacyLabel,
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
    const proof = settlementProofMeta();
    setElementText("#settlement-complete-deal-id", currentDealId());
    setElementText("#settlement-complete-proof-id", proof.proofId);
    setElementText("#settlement-complete-hash", proof.settlementHash);
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
    return buildDirectPaymentProofMarkup({
      recipient: paymentRecipient,
      amountLabel: paymentAmountLabel(),
      privacyLabel: paymentPrivacyLabel(),
      escapeHtml,
    });
  }

  function renderProof() {
    const directPaymentProof = state.paymentSent && !state.escrowReleased;
    const item = directPaymentProof ? directPaymentProofItem() : escrowReleaseProofItem();
    const txHash = hasRealTransactionHash(item) ? String(item.txHash) : "";
    const proofFlow = document.querySelector("#settlement-proof-flow");
    const proofLink = document.querySelector("#settlement-proof-link");

    setElementText("#settlement-proof-title", directPaymentProof ? "Trusted Transfer" : currentChannel().title || "Rights Transfer");
    setElementText("#settlement-proof-parties", `${currentDealId()} · Alice <-> Bob`);
    const proof = settlementProofMeta();
    setElementText("#settlement-proof-id", proof.proofId);
    setElementText("#settlement-proof-settlement-hash", proof.settlementHash);
    if (proofFlow) proofFlow.innerHTML = directPaymentProof ? directPaymentProofMarkup() : escrowSettlementProofMarkup();
    setElementText("#settlement-proof-hash", txHash || "Available after wallet confirmation");
    if (proofLink) {
      proofLink.href = txHash ? transactionExplorerUrl(txHash, explorerUrl) : explorerUrl;
      const label = proofLink.querySelector("span");
      if (label) label.textContent = txHash ? "View Transaction" : "View on Voyager";
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
