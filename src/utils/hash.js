export function deterministicHex(seed, length = 64) {
  const text = String(seed || "veil");
  let hash = 2166136261;
  let output = "";
  let round = 0;
  while (output.length < length) {
    const value = `${text}:${round}`;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    output += hash.toString(16).padStart(8, "0");
    round += 1;
  }
  return `0x${output.slice(0, length)}`;
}

export function demoTxHash(seed) {
  return deterministicHex(`tx:${seed}`, 64);
}

export function displayTransactionHash(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.startsWith("mock-")) return deterministicHex(`legacy:${text}`, 64);
  return text;
}

export function shortHash(value) {
  const text = displayTransactionHash(value);
  if (!text) return "";
  return text.length > 18 ? `${text.slice(0, 10)}...${text.slice(-6)}` : text;
}
