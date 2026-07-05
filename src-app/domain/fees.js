import { formatStrk, parseStrkAmount } from "../utils/format.js";

export const VEIL_FEE_MODEL = Object.freeze({
  networkFeeStrk: 0.003,
  strk20PrivacyFeeStrk: 0.01,
  protocolRates: {
    directPayment: 0.0015,
    escrow: 0.005,
    digitalAsset: 0.0075,
    highValueEscrow: 0.01,
  },
});

export function estimateVeilFee(kind, amountLabel, options = {}) {
  const amount = parseStrkAmount(amountLabel);
  const rate = VEIL_FEE_MODEL.protocolRates[kind] || 0;
  const shielded = options.shielded !== false;
  const privacyFee = shielded ? VEIL_FEE_MODEL.strk20PrivacyFeeStrk : 0;
  const protocolFee = amount * rate;
  const totalFee = VEIL_FEE_MODEL.networkFeeStrk + privacyFee + protocolFee;
  const total = amount + totalFee;
  return {
    amount,
    networkFee: VEIL_FEE_MODEL.networkFeeStrk,
    privacyFee,
    protocolFee,
    totalFee,
    total,
    networkFeeLabel: formatStrk(VEIL_FEE_MODEL.networkFeeStrk),
    privacyFeeLabel: formatStrk(privacyFee),
    protocolFeeLabel: formatStrk(protocolFee),
    feeLabel: formatStrk(totalFee),
    totalLabel: formatStrk(total),
  };
}
