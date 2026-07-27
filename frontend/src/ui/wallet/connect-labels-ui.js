export function createConnectLabelsUi({
  document,
  state,
  config,
  isWalletInitializationPending,
  walletInitLabel,
}) {
  function refreshConnectLabels() {
    const label = isWalletInitializationPending() || state.walletInitState === "failed"
      ? walletInitLabel()
      : state.walletConnected
        ? "Connected"
        : config.demoRuntimeMode
          ? "Open Demo"
          : config.privyAppId && !state.privyReady
            ? "Loading Privy"
            : "Connect Wallet";

    document.querySelectorAll("[data-wallet-label]").forEach((node) => {
      node.textContent = label;
    });

    document.querySelectorAll("[data-connect-wallet]").forEach((button) => {
      button.toggleAttribute("aria-busy", isWalletInitializationPending());
    });
  }

  return { refreshConnectLabels };
}
