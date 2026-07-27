function latestMatchingItem(messages = [], predicate) {
  return [...messages].reverse().find(predicate);
}

function escapeValue(value, escapeHtml) {
  return escapeHtml ? escapeHtml(value) : String(value ?? "");
}

export function createSettlementProofMeta() {
  return {
    available: false,
    proofId: "Unavailable",
    settlementHash: "Unavailable",
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
      <h2>Settlement proof unavailable</h2>
      <p>${escapeValue("VEIL does not fabricate negotiation, funding, release, or delivery proof steps.", escapeHtml)}</p>
    </div>
  `;
}

export function directPaymentProofMarkup({
  escapeHtml,
} = {}) {
  return `
    <div class="proof-group">
      <h2>Payment proof unavailable</h2>
      <p>${escapeValue("A Direct encrypted memo is not evidence that assets were transferred.", escapeHtml)}</p>
    </div>
  `;
}
