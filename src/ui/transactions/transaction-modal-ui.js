export function renderTransactionModalElement(element, modal, {
  document,
  explorerUrl,
  transactionExplorerUrl,
  setLucideIcon,
} = {}) {
  if (!element) return;
  element.classList.toggle("hidden", !modal.visible);
  document.body.classList.toggle("transaction-modal-open", Boolean(modal.visible));
  if (!modal.visible) return;

  const icon = element.querySelector("#transaction-loading-icon");
  const title = element.querySelector("#transaction-loading-title");
  const subtitle = element.querySelector("#transaction-loading-subtitle");
  const detail = element.querySelector("#transaction-loading-detail");
  const detailWrap = element.querySelector(".transaction-loading-detail");
  const link = element.querySelector("#transaction-loading-link");
  const cancel = element.querySelector("#transaction-loading-cancel");
  const close = element.querySelector("#transaction-loading-close");
  const isSuccess = modal.stage === "success";
  const isError = modal.stage === "error";

  if (title) title.textContent = modal.title || modal.actionLabel || "Sending Transaction";
  if (subtitle) {
    subtitle.textContent = modal.subtitle || "";
    subtitle.hidden = !modal.subtitle;
  }
  if (detail) detail.textContent = modal.detail || "";
  if (detailWrap) detailWrap.hidden = !modal.detail;
  if (icon) {
    icon.className = `transaction-loading-icon ${isSuccess ? "success" : isError ? "error" : "loading"}`;
    setLucideIcon(icon, isSuccess ? "check" : isError ? "triangle-alert" : "loader-circle", "size-8");
  }
  if (link) {
    const href = transactionExplorerUrl(modal.txHash, explorerUrl);
    link.hidden = !isSuccess || !href;
    if (href) link.href = href;
    else link.removeAttribute("href");
  }
  if (cancel) {
    cancel.hidden = modal.stage !== "signing";
    cancel.textContent = "Cancel in Wallet";
  }
  if (close) close.hidden = !isError;
  if (window.lucide) window.lucide.createIcons();
}
