export function transactionExplorerUrl(txHash, explorerBaseUrl) {
  if (!txHash || String(txHash).startsWith("mock-")) return "";
  return `${explorerBaseUrl}/tx/${encodeURIComponent(txHash)}`;
}
