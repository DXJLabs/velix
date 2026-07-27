export const DEFAULT_PAYMENT_MEMO = "Payment intent for rights transfer.";

export function paymentAmountLabel(amount, asset) {
  const safeAmount = String(amount || "").trim() || "450";
  const safeAsset = String(asset || "").trim() || "STRK";
  return `${safeAmount} ${safeAsset}`;
}

export function paymentPrivacyLabel(mode) {
  return mode === "shield"
    ? "Shielded payment - Coming Soon"
    : "Direct encrypted memo - no asset transfer";
}

export function paymentMemoValue(value, fallback = DEFAULT_PAYMENT_MEMO) {
  return String(value || "").trim() || fallback;
}
