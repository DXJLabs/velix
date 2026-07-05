function offerActivityLabel(item = {}) {
  return `${item.title || ""} ${item.subtitle || ""}`.toLowerCase();
}

function isCurrentOfferItem(item = {}) {
  if (item.type === "offer") return true;
  const label = offerActivityLabel(item);
  return label.includes("counter offer") && !label.includes("accepted");
}

export function currentOfferProofItemFromMessages(messages = [], { fallbackTime, mode } = {}) {
  const offerItem = [...messages].reverse().find(isCurrentOfferItem);
  return {
    ...(offerItem || {}),
    type: "inline",
    title: offerItem?.title || "Current offer",
    actor: offerItem?.actor || "System",
    time: offerItem?.time || fallbackTime,
    mode,
  };
}

export function normalizeOfferAmount(value, fallback = "450") {
  const match = String(value || "").match(/\d+(?:[.,]\d+)?/);
  return match ? match[0].replace(",", ".") : fallback;
}

export function hasOfferActivity(messages = []) {
  return messages.some((item) => {
    if (item.type === "offer") return true;
    const label = offerActivityLabel(item);
    return label.includes("offer") || label.includes("counter");
  });
}

export function dealActivityLabel(item) {
  const label = offerActivityLabel(item);
  if (label.includes("counter")) return item?.title || "Bob created a counter offer";
  if (label.includes("accepted")) return "Alice accepted Bob's counter offer";
  if (label.includes("offer")) return item?.title || "Alice created an offer";
  return "Deal Activity";
}
