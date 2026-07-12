export function inferTransactionOverlayCopy(localItem = {}, success = "", fallbackAmount = "450 STRK") {
  const label = `${localItem.title || ""} ${localItem.subtitle || ""} ${localItem.body || ""}`.toLowerCase();
  const amount = localItem.amount || fallbackAmount;

  if (localItem.type === "message") {
    return {
      actionLabel: "Encrypting locally",
      successTitle: "Encrypted On-chain",
      successSubtitle: "Encrypted ciphertext confirmed on-chain.",
    };
  }

  if (label.includes("alice deposited")) {
    return {
      actionLabel: "Locking Funds",
      successTitle: "Public Escrow Deposit Confirmed",
      successSubtitle: `${amount} locked in escrow.`,
    };
  }

  if (label.includes("bob locked") || label.includes("asset secured")) {
    return {
      actionLabel: "Locking Asset",
      successTitle: "On-chain Asset Locked",
      successSubtitle: "Rights Package NFT locked in escrow.",
    };
  }

  if (label.includes("approved release")) {
    return {
      actionLabel: "Approving Release",
      successTitle: "Release Approved",
      successSubtitle: "Approval recorded with encrypted negotiation context.",
    };
  }

  if (label.includes("assets released")) {
    return {
      actionLabel: "Releasing Assets",
      successTitle: "Assets Released",
      successSubtitle: "450 STRK to Bob. NFT to Alice.",
    };
  }

  if (label.includes("accepted")) {
    return {
      actionLabel: "Accepting Proposal",
      successTitle: "Proposal Accepted",
      successSubtitle: "Escrow contract created.",
    };
  }

  if (label.includes("counter")) {
    return {
      actionLabel: "Creating Counter Offer",
      successTitle: "Counter Offer Sent",
      successSubtitle: `${amount} recorded in the private channel.`,
    };
  }

  if (label.includes("offer")) {
    return {
      actionLabel: "Creating Offer",
      successTitle: "Offer Created",
      successSubtitle: `${amount} recorded in the private channel.`,
    };
  }

  if (label.includes("payment")) {
    return {
      actionLabel: "Sending Payment",
      successTitle: "Public Settlement Sent",
      successSubtitle: "Encrypted memo stored in the channel.",
    };
  }

  return {
    actionLabel: "Sending Transaction",
    successTitle: success ? success.replace(/\.$/, "") : "Transaction Successful",
    successSubtitle: "Timeline updated.",
  };
}
