export function counterpartyDisplayName(value, shortenHash = (text) => text) {
  const text = String(value || "").trim();
  const normalized = text.toLowerCase();
  if (!text) return "Counterparty";
  if (text.includes("@")) return text.split("@")[0] || text;
  if (normalized.endsWith(".stark")) return text;
  if (normalized.startsWith("0x")) return shortenHash(text);
  return text;
}

export function counterpartyAvatar(name) {
  const value = String(name || "C").trim();
  const normalized = value.toLowerCase().startsWith("0x") ? "W" : value.replace("@", "");
  return normalized ? normalized[0].toUpperCase() : "C";
}

export function resolveCounterparty(value, knownVeilCounterparties = new Set(), shortenHash) {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase();
  const displayName = counterpartyDisplayName(raw, shortenHash);
  const isStarkName = normalized.endsWith(".stark");
  const isWallet = normalized.startsWith("0x");
  const veilAvailable = knownVeilCounterparties.has(normalized);

  if (veilAvailable) {
    return {
      status: "available",
      displayName,
      detail: "Resolved to 0x0b...71e9",
      badge: "VEIL Available",
      badgeClass: "status-pill escrow-active",
      action: "Create Deal",
      hint: `Creates a private deal request and sends ${displayName} an in-app notification.`,
    };
  }

  if (isStarkName || isWallet) {
    return {
      status: "not_on_veil",
      displayName,
      detail: isStarkName ? "Resolved on Starknet, not a VEIL user yet" : "Wallet found, not a VEIL user yet",
      badge: "Not on VEIL",
      badgeClass: "status-pill waiting-deposit",
      action: "Create Invite",
      hint: "Generates an invite link for Telegram, Discord, X, Email, or WhatsApp.",
    };
  }

  return {
    status: "unknown",
    displayName,
    detail: "Enter a .stark name or wallet address",
    badge: "Search",
    badgeClass: "status-pill public",
    action: "Create Invite",
    hint: "Use an invite link when the counterparty is not available inside VEIL.",
  };
}
