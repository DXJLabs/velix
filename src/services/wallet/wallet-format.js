export function shortAddress(address) {
  if (!address) return "Not connected";
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ensureHex(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.startsWith("0x") ? normalized : `0x${normalized}`;
}

export function splitPrivySignature(signature) {
  if (Array.isArray(signature) && signature.length >= 2) {
    return [ensureHex(signature[0]), ensureHex(signature[1])];
  }

  const raw = typeof signature === "string"
    ? signature
    : signature?.signature || signature?.rawSignature || signature?.raw_signature || "";
  const hex = ensureHex(raw).slice(2);
  if (hex.length < 128) {
    throw new Error("Privy signature is not a 64-byte Stark signature.");
  }
  return [`0x${hex.slice(0, 64)}`, `0x${hex.slice(64, 128)}`];
}

export function feltToBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  const text = String(value ?? "0");
  return BigInt(text || "0");
}

export function parseU256Balance(response) {
  const result = Array.isArray(response) ? response : response?.result;
  const low = feltToBigInt(result?.[0] ?? 0);
  const high = feltToBigInt(result?.[1] ?? 0);
  return low + (high << 128n);
}

export function formatAssetBalance(rawAmount, asset) {
  if (rawAmount === 0n) return asset.defaultDisplay;
  const decimals = Math.max(asset.decimals, 0);
  if (!decimals) return rawAmount.toString();
  const scale = 10n ** BigInt(decimals);
  const whole = rawAmount / scale;
  const fraction = rawAmount % scale;
  const displayDecimals = asset.id === "strkbtc" ? Math.min(decimals, 8) : asset.id === "strk" ? Math.min(decimals, 4) : Math.min(decimals, 2);
  const fractionText = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, displayDecimals)
    .replace(/0+$/, "");
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}
