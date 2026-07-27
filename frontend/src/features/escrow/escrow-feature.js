import { isTransactionHash } from "../../utils/transactions.js";

const BUYER_DEPOSIT_PATTERNS = [
  "alice deposited",
  "buyer deposited",
  "buyer deposit completed",
  "funds deposited",
  "deposited funds",
];

const SELLER_DEPOSIT_PATTERNS = [
  "bob locked",
  "seller locked",
  "seller deposited",
  "asset locked",
  "nft locked",
  "locked asset",
];

const BUYER_APPROVAL_PATTERNS = [
  "alice approved release",
  "buyer approved release",
  "buyer approved",
];

const SELLER_APPROVAL_PATTERNS = [
  "bob approved release",
  "seller approved release",
  "seller approved",
];

function escrowEventLabel(entry = {}) {
  return `${entry.title || ""} ${entry.subtitle || ""} ${entry.details || ""}`.toLowerCase();
}

export function latestMatchingItem(messages = [], predicate) {
  return [...messages].reverse().find(predicate);
}

export function escrowDepositProofItemFromMessages(messages = [], key, { mode } = {}) {
  const buyer = key === "buyer";
  const item = latestMatchingItem(messages, (entry) => {
    const label = escrowEventLabel(entry);
    return buyer
      ? label.includes("alice deposited") || label.includes("buyer deposited")
      : label.includes("bob locked") || label.includes("seller locked") || label.includes("asset secured");
  });

  return item
    ? {
      ...item,
      type: "inline",
      actor: item.actor || (buyer ? "Alice" : "Bob"),
      mode,
    }
    : null;
}

export function escrowFundingProofItemFromMessages(messages = [], { fallbackTime, mode } = {}) {
  const item = latestMatchingItem(messages, (entry) => {
    const label = `${entry.title || ""} ${entry.subtitle || ""}`.toLowerCase();
    return label.includes("deposit")
      || label.includes("locked asset")
      || label.includes("bob locked")
      || label.includes("seller locked")
      || label.includes("escrow funded")
      || label.includes("escrow contract created")
      || label.includes("accepted bob");
  });

  return {
    ...(item || {}),
    type: "inline",
    title: item?.title || "Escrow funding",
    actor: item?.actor || "System",
    time: item?.time || fallbackTime,
    mode,
  };
}

export function escrowReleaseProofItemFromMessages(messages = [], { fallbackTime, mode } = {}) {
  const item = latestMatchingItem(messages, (entry) => {
    const label = `${entry.title || ""} ${entry.subtitle || ""}`.toLowerCase();
    return label.includes("assets released")
      || label.includes("settlement complete")
      || label.includes("escrow released")
      || label.includes("settlement can complete");
  });

  return {
    ...(item || {}),
    type: "inline",
    title: item?.title || "Assets released",
    actor: item?.actor || "System",
    time: item?.time || fallbackTime,
    mode,
  };
}

export function hasRealTransactionHash(item) {
  return isTransactionHash(item?.txHash);
}

export function escrowEventMatchesMessages(messages = [], patterns = []) {
  return Boolean(latestMatchingItem(messages, (entry) => {
    const label = escrowEventLabel(entry);
    return patterns.some((pattern) => label.includes(pattern));
  }));
}

export function escrowDepositCompleteFromState({
  key,
  released = false,
  paymentSent = false,
  deposits = {},
  messages = [],
} = {}) {
  if (released || paymentSent) return true;
  if (deposits?.[key]) return true;
  return key === "buyer"
    ? escrowEventMatchesMessages(messages, BUYER_DEPOSIT_PATTERNS)
    : escrowEventMatchesMessages(messages, SELLER_DEPOSIT_PATTERNS);
}

export function escrowFundingCompleteFromState(context = {}) {
  return Boolean(
    escrowDepositCompleteFromState({ ...context, key: "buyer" })
    && escrowDepositCompleteFromState({ ...context, key: "seller" }),
  );
}

export function escrowApprovalCompleteFromState({
  key,
  released = false,
  paymentSent = false,
  confirmations = {},
  messages = [],
} = {}) {
  if (released || paymentSent) return true;
  if (confirmations?.[key]) return true;
  return key === "buyer"
    ? escrowEventMatchesMessages(messages, BUYER_APPROVAL_PATTERNS)
    : escrowEventMatchesMessages(messages, SELLER_APPROVAL_PATTERNS);
}

export function escrowConfirmationsCompleteFromState(context = {}) {
  return Boolean(
    escrowApprovalCompleteFromState({ ...context, key: "buyer" })
    && escrowApprovalCompleteFromState({ ...context, key: "seller" }),
  );
}
