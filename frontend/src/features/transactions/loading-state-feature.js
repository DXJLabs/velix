const WALLET_BUSY_SELECTOR = "[data-connect-wallet], [data-refresh-wallet]";
const CHANNEL_BUSY_SELECTOR = "[data-new-deal-action]";
const TRANSACTION_BUSY_SELECTOR = [
  "[data-offer-review-sign]",
  "[data-payment-review-sign]",
  "[data-escrow-review-sign]",
  "[data-escrow-deposit]",
  "[data-escrow-confirmation]",
  "#create-offer-action",
  "#deal-accept-action",
  "[data-escrow-release]",
  "#composer-form .composer-input button[type='submit']",
].join(", ");

function setButtonBusy(button, busy) {
  if (!button) return;
  if (busy) {
    if (!button.dataset.loadingPrevDisabled) {
      button.dataset.loadingPrevDisabled = button.disabled ? "true" : "false";
    }
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.classList.add("is-loading");
    return;
  }
  if (button.dataset.loadingPrevDisabled) {
    button.disabled = button.dataset.loadingPrevDisabled === "true";
    delete button.dataset.loadingPrevDisabled;
  }
  button.removeAttribute("aria-busy");
  button.classList.remove("is-loading");
}

function setBusyButtons(document, selector, busy) {
  document.querySelectorAll(selector).forEach((button) => setButtonBusy(button, busy));
}

export function createLoadingController({
  state,
  document,
  isWalletInitializationPending,
  showToast,
  hideToastIfLoading,
}) {
  function renderLoadingState() {
    const walletBusy = state.loadingAction === "wallet" || isWalletInitializationPending();
    const transactionBusy = state.loadingAction === "transaction";
    const channelBusy = state.loadingAction === "channel";
    const busy = walletBusy || transactionBusy || channelBusy;

    document.body.classList.toggle("app-loading", busy);
    document.body.dataset.loadingMessage = state.loadingMessage || "";
    setBusyButtons(document, WALLET_BUSY_SELECTOR, walletBusy);
    setBusyButtons(document, CHANNEL_BUSY_SELECTOR, channelBusy);
    setBusyButtons(document, TRANSACTION_BUSY_SELECTOR, transactionBusy);
  }

  function setAppLoading(action, message) {
    state.loadingAction = action;
    state.loadingMessage = message || "Processing...";
    renderLoadingState();
    if (action === "transaction" || action === "wallet" || action === "channel") {
      hideToastIfLoading();
      return;
    }
    showToast(state.loadingMessage, { sticky: true });
  }

  function clearAppLoading(action, options = {}) {
    if (action && state.loadingAction && state.loadingAction !== action) return;
    state.loadingAction = "";
    state.loadingMessage = "";
    renderLoadingState();
    if (!options.keepToast) hideToastIfLoading();
  }

  return {
    clearAppLoading,
    renderLoadingState,
    setAppLoading,
    setButtonBusy,
    setBusyButtons: (selector, busy) => setBusyButtons(document, selector, busy),
  };
}
