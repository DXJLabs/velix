export function isTransactionHash(txHash) {
  const value = String(txHash || "").trim();
  return /^0x[0-9a-f]{1,64}$/i.test(value) && !/^0x0+$/i.test(value);
}

export function transactionExplorerUrl(txHash, explorerBaseUrl) {
  if (!isTransactionHash(txHash) || !explorerBaseUrl) return "";
  return `${String(explorerBaseUrl).replace(/\/$/, "")}/tx/${encodeURIComponent(String(txHash).trim())}`;
}
