import { escapeHtml } from "../html.js";
import { formatTime } from "../../utils/format.js";
import { displayTransactionHash, shortHash } from "../../utils/hash.js";

export function createChainMetaUi({ explorerUrl, transactionExplorerUrl }) {
  function transactionStatusInfo(item) {
    const status = String(item.status || "").toLowerCase();
    if (status === "failed") {
      const label = item.errorLabel || "Failed";
      return { kind: "failed", label: "!", ariaLabel: label, detail: label };
    }
    if (status === "read") return { kind: "read", label: "OK", ariaLabel: "Read" };
    if (String(item.txHash || "").startsWith("demo-")) {
      return { kind: "demo", label: "DEMO", ariaLabel: "Demo data" };
    }
    if (["encrypting", "signing", "pending"].includes(status) || !transactionExplorerUrl(item.txHash, explorerUrl)) {
      return { kind: "pending", label: "...", ariaLabel: "Processing" };
    }
    return { kind: "confirmed", label: "OK", ariaLabel: "Confirmed" };
  }

  function renderTransactionLink(item) {
    const txUrl = transactionExplorerUrl(item.txHash, explorerUrl);
    const displayHash = displayTransactionHash(item.txHash);
    if (!txUrl) {
      const title = displayHash ? `Transaction hash: ${displayHash}` : "Transaction hash is not available yet";
      const label = String(item.txHash || "").startsWith("demo-")
        ? "Demo transaction - no explorer link"
        : "Transaction hash unavailable";
      return `<span class="tx-link" title="${escapeHtml(title)}">${escapeHtml(label)}</span>`;
    }
    return `<a class="tx-link" href="${escapeHtml(txUrl)}" target="_blank" rel="noreferrer" title="${escapeHtml(displayHash)}">View Transaction</a>`;
  }

  function renderShieldBadge(statusInfo) {
    const warning = statusInfo.kind === "failed"
      ? `<span class="shield-warning" aria-label="Failed">!</span>`
      : "";
    return `<span class="shield-badge">Direct encrypted${warning}</span>`;
  }

  function renderFailureActions(item, statusInfo) {
    if (statusInfo.kind !== "failed") return "";
    const errorText = item.errorMessage || statusInfo.detail || "Transaction failed.";
    return [
      `<button class="tx-action" type="button" data-transaction-retry aria-label="Retry" title="Retry">Retry</button>`,
      `<button class="tx-action" type="button" data-transaction-error="${escapeHtml(errorText)}" aria-label="View error" title="View error">!</button>`,
    ].join("");
  }

  function renderChainMeta(item, alignRight = false) {
    const statusInfo = transactionStatusInfo(item);
    const parts = [];
    parts.push(renderShieldBadge(statusInfo));
    parts.push(`<span class="tx-status ${statusInfo.kind}" aria-label="${escapeHtml(statusInfo.ariaLabel)}" title="${escapeHtml(statusInfo.ariaLabel)}">${escapeHtml(statusInfo.label)}</span>`);
    if (item.time) parts.push(`<time>${escapeHtml(formatTime(item.time))}</time>`);
    if (item.blockNumber !== undefined) parts.push(`<span>Block ${escapeHtml(item.blockNumber)}</span>`);
    if (item.txHash) parts.push(`<span class="tx-hash">${escapeHtml(shortHash(item.txHash))}</span>`);
    parts.push(renderFailureActions(item, statusInfo));
    parts.push(renderTransactionLink(item));
    return `<div class="chain-meta ${alignRight ? "right" : ""}">${parts.join("")}</div>`;
  }

  function itemStateClass(item) {
    const status = transactionStatusInfo(item).kind;
    if (status === "failed") return "failed";
    if (status === "pending") return "processing";
    return status;
  }

  return { renderChainMeta, itemStateClass, transactionStatusInfo };
}
