function defaultHash() {
  return "0x0000000000000000000000000000000000000000000000000000000000000000";
}

function latestMatchingItem(messages = [], predicate) {
  return [...messages].reverse().find(predicate);
}

function escapeValue(value, escapeHtml) {
  return escapeHtml ? escapeHtml(value) : String(value ?? "");
}

export function createSettlementProofMeta(source, hashFactory = defaultHash) {
  const dealSource = source || "Deal";
  const hash = hashFactory(`settlement:${dealSource}`, 64);
  return {
    proofId: `VP-${String(dealSource).replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase() || "DEAL"}-${hash.slice(2, 8).toUpperCase()}`,
    settlementHash: hash,
  };
}

export function directPaymentProofItemFromMessages(messages = [], {
  paymentSent = false,
  paymentMode,
  fallbackTime,
} = {}) {
  const item = latestMatchingItem(messages, (entry) => {
    const label = `${entry.title || ""} ${entry.subtitle || ""}`.toLowerCase();
    return label.includes("payment completed") || label.includes("payment proof");
  });

  return {
    ...(item || {}),
    type: "inline",
    title: item?.title || "Direct payment",
    actor: item?.actor || "Alice",
    time: item?.time || (paymentSent ? fallbackTime : undefined),
    mode: paymentMode,
  };
}

export function proofStepMarkup(label, value, escapeHtml) {
  return `<li><span><i data-lucide="check" class="size-4"></i></span><p>${escapeValue(label, escapeHtml)}</p><strong>${escapeValue(value, escapeHtml)}</strong></li>`;
}

export function escrowSettlementProofMarkup(escapeHtml) {
  return `
    <div class="proof-group">
      <h2>Negotiation</h2>
      <ol>
        ${proofStepMarkup("Alice created an offer", "500 STRK", escapeHtml)}
        ${proofStepMarkup("Bob created a counter offer", "450 STRK", escapeHtml)}
      </ol>
    </div>
    <div class="proof-group">
      <h2>Funding</h2>
      <ol>
        ${proofStepMarkup("Alice deposited", "450 STRK", escapeHtml)}
        ${proofStepMarkup("Bob locked NFT", "Rights Package NFT", escapeHtml)}
      </ol>
    </div>
    <div class="proof-group">
      <h2>Release</h2>
      <ol>
        ${proofStepMarkup("Assets released", "Complete", escapeHtml)}
      </ol>
    </div>
    <div class="proof-group">
      <h2>Settlement</h2>
      <ol>
        ${proofStepMarkup("NFT delivered to Alice", "Complete", escapeHtml)}
        ${proofStepMarkup("450 STRK delivered to Bob", "Complete", escapeHtml)}
      </ol>
    </div>
  `;
}

export function directPaymentProofMarkup({
  recipient,
  amountLabel,
  privacyLabel,
  escapeHtml,
} = {}) {
  return `
    <div class="proof-group">
      <h2>Direct Payment</h2>
      <ol>
        ${proofStepMarkup("Recipient", recipient, escapeHtml)}
        ${proofStepMarkup("Amount", amountLabel, escapeHtml)}
        ${proofStepMarkup("Privacy", privacyLabel, escapeHtml)}
      </ol>
    </div>
    <div class="proof-group">
      <h2>Settlement</h2>
      <ol>
        ${proofStepMarkup("Payment confirmed", "Complete", escapeHtml)}
        ${proofStepMarkup("Proof attached", "Ready", escapeHtml)}
      </ol>
    </div>
  `;
}
