import {
  WALLET_INIT_PENDING_STATES,
  WALLET_INIT_TIMEOUT_MS,
} from "../../app/runtime-config.js";

export function createWalletInitialization({
  state,
  config,
  logger,
  renderWalletInitializationState,
  beginWalletModal,
  updateWalletModalStage,
  finishWalletModal,
  failWalletModal,
  setAppLoading,
  clearAppLoading,
}) {
  let walletInitTimer;

  function walletInitLabel(status = state.walletInitState) {
    switch (status) {
      case "connecting":
        return "Connecting Wallet";
      case "creating_account":
        return "Creating Starknet Account";
      case "deploying":
        return "Creating Starknet Account";
      case "connecting_paymaster":
        return "Preparing Gas Sponsor";
      case "ready":
        return "Connected";
      case "failed":
        return "Retry";
      default:
        return config.privyAppId && !state.privyReady ? "Loading Privy" : "Connect Wallet";
    }
  }

  function isWalletInitializationPending(status = state.walletInitState) {
    return WALLET_INIT_PENDING_STATES.has(status);
  }

  function setWalletInitializationState(nextState, details = {}) {
    const previousState = state.walletInitState;
    state.walletInitState = nextState;
    state.walletInitMessage = details.message || walletInitLabel(nextState);
    state.walletInitError = details.errorMessage || "";
    if (details.traceId) state.walletInitTraceId = details.traceId;
    if (nextState === "connecting") state.walletInitStartedAt = Date.now();
    if (nextState === "idle") {
      state.walletInitStartedAt = 0;
      state.walletInitTraceId = "";
    }

    logger.veilLog("info", "wallet.init.state.changed", {
      traceId: state.walletInitTraceId || details.traceId,
      where: "setWalletInitializationState",
      previousState,
      nextState,
      message: state.walletInitMessage,
      error: state.walletInitError || undefined,
    });
    renderWalletInitializationState();
  }

  function beginWalletInitialization(traceId) {
    clearTimeout(walletInitTimer);
    beginWalletModal();
    setWalletInitializationState("connecting", { traceId });
    setAppLoading("wallet", "Connecting Wallet");
    walletInitTimer = setTimeout(() => {
      if (state.walletInitTraceId !== traceId || !isWalletInitializationPending()) return;
      logger.veilLog("warn", "wallet.init.timeout", {
        traceId,
        where: "beginWalletInitialization",
        timeoutMs: WALLET_INIT_TIMEOUT_MS,
        why: "Wallet initialization did not reach ready before the production timeout.",
        howToFix: "Check the preceding Privy, StarkZap, AVNU Paymaster, and RPC logs for the first failed step.",
      });
      setWalletInitializationState("failed", {
        traceId,
        message: "Unable to connect wallet.",
        errorMessage: `Wallet initialization exceeded ${WALLET_INIT_TIMEOUT_MS / 1000} seconds.`,
      });
      failWalletModal({
        title: "Wallet Connection Failed",
        subtitle: "Unable to connect wallet.",
        detail: `Wallet initialization exceeded ${WALLET_INIT_TIMEOUT_MS / 1000} seconds.`,
      });
    }, WALLET_INIT_TIMEOUT_MS);
  }

  function updateWalletInitialization(step, traceId, details = {}) {
    if (state.walletInitTraceId && state.walletInitTraceId !== traceId) return;
    if (!isWalletInitializationPending(step) && step !== "ready" && step !== "failed") return;
    setWalletInitializationState(step, { traceId, ...details });
    if (isWalletInitializationPending(step)) {
      updateWalletModalStage(step, details);
      setAppLoading("wallet", walletInitLabel(step));
    }
  }

  function completeWalletInitialization(traceId) {
    clearTimeout(walletInitTimer);
    setWalletInitializationState("ready", { traceId, message: "Wallet connected" });
    clearAppLoading("wallet");
    finishWalletModal();
  }

  function failWalletInitialization(error, traceId, details = {}) {
    clearTimeout(walletInitTimer);
    const errorMessage = error?.message || details.errorMessage || "Wallet initialization failed.";
    setWalletInitializationState("failed", {
      traceId,
      message: "Unable to connect wallet.",
      errorMessage,
    });
    logger.veilError("wallet.init.failed", error instanceof Error ? error : new Error(errorMessage), {
      traceId,
      where: details.where || "failWalletInitialization",
      howToFix: details.howToFix || "Open the browser console and Vercel function logs for the matching traceId, then retry wallet connection.",
    });
    clearAppLoading("wallet");
    failWalletModal({
      title: "Wallet Connection Failed",
      subtitle: "Unable to connect wallet.",
      detail: errorMessage,
    });
    return false;
  }

  return {
    walletInitLabel,
    isWalletInitializationPending,
    setWalletInitializationState,
    beginWalletInitialization,
    updateWalletInitialization,
    completeWalletInitialization,
    failWalletInitialization,
    clearWalletInitTimer: () => clearTimeout(walletInitTimer),
  };
}
