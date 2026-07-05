export function statusPillClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("negotiating") || normalized.includes("negotiation")) return "status-pill negotiating";
  if (normalized.includes("deal completed") || normalized.includes("closed")) return "status-pill settlement";
  if (normalized.includes("escrow")) return "status-pill escrow-active";
  if (normalized.includes("funding complete")) return "status-pill escrow-active";
  if (normalized.includes("approvals complete")) return "status-pill escrow-active";
  if (normalized.includes("waiting")) return "status-pill waiting-deposit";
  if (normalized.includes("settlement")) return "status-pill settlement";
  return "status-pill deal-status";
}
