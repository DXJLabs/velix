export function formatTime(timestamp) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

export function parseStrkAmount(value, fallback = 0) {
  const match = String(value || "").match(/\d+(?:[.,]\d+)?/);
  if (!match) return fallback;
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatStrk(value, symbol = "STRK") {
  const rounded = Math.round((Number(value) + Number.EPSILON) * 1_000) / 1_000;
  return `${rounded.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${symbol}`;
}

export function formatPoints(value) {
  return Number(value || 0).toLocaleString("en-US");
}
