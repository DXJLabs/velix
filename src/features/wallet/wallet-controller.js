export function createWalletController({
  state,
  document,
  walletAssetConfig,
  expectedChainId,
  privyAppId,
  timelineMode,
  nextRewardTier,
  rewardRowsMarkup,
  formatPoints,
  setElementText,
  shortAddress,
  isWalletInitializationPending,
  walletInitLabel,
  expectedNetworkName,
  verifyHelperDeployment,
  refreshWalletAssets,
  refreshConnectLabels,
  renderHomeStatus,
  showToast,
  getPrivyBridge,
  connectWallet,
  clearWalletInitTimer,
  resetClientConnection,
  setWalletInitializationState,
  createDefaultWalletAssetBalances,
  listStorageKeys,
  removeStorageKeys,
  copyToClipboard,
}) {
  function walletAddressValue() {
    return state.walletAddress || state.privyWallet?.address || "";
  }

  function renderWallet() {
    const connected = state.walletConnected;
    const pending = isWalletInitializationPending();
    const failed = state.walletInitState === "failed";
    const pendingSubtitle = state.walletInitState === "creating_account" || state.walletInitState === "deploying"
      ? "This only happens once."
      : "Please approve the request in your wallet.";
    const title = pending
      ? walletInitLabel()
      : failed
        ? "Unable to connect wallet."
        : connected ? "Connected" : "Not connected";
    const subtitle = pending
      ? pendingSubtitle
      : failed
        ? "Retry wallet connection."
        : state.privyAccount && !state.privyAccountDeployed
          ? `Fund ${shortAddress(state.walletAddress)} with Sepolia STRK, then connect again.`
          : connected
            ? "This wallet can access encrypted deal channels."
            : "Connect with Privy to unlock VEIL on this device.";
    const statusText = pending ? "Connecting" : failed ? "Failed" : connected ? "Connected" : "Disconnected";
    const helperText = pending
      ? state.walletInitMessage
      : failed
        ? "Retry"
        : timelineMode === "direct-helper-dev"
          ? state.privyAccount && !state.privyAccountDeployed
            ? "Account funding needed"
            : state.helperVerified ? "Verified" : "Check required"
          : "Demo session";
    const walletTitle = document.querySelector("#wallet-state-title");
    const walletSubtitle = document.querySelector("#wallet-state-subtitle");
    const walletStatus = document.querySelector("#wallet-status-pill");
    const walletAccount = document.querySelector("#wallet-account");
    const walletNetwork = document.querySelector("#wallet-network");
    const walletProvider = document.querySelector("#wallet-provider");
    const walletHelper = document.querySelector("#wallet-helper");
    const walletConnectionSummary = document.querySelector("#wallet-connection-summary");
    const walletConnectionStatus = document.querySelector("#wallet-connection-status");
    const walletConnectRow = document.querySelector("[data-wallet-connect-row]");
    const walletSettingsRow = document.querySelector("[data-wallet-settings-row]");
    const walletAddress = state.walletAddress || state.privyWallet?.address;
    const connectionSummary = pending
      ? state.walletInitMessage
      : failed
        ? "Wallet connection failed"
        : connected
          ? `${state.walletSource} on ${expectedNetworkName()}`
          : "Privy wallet not connected";
    const connectionStatus = pending ? "Connecting" : failed ? "Failed" : connected ? "Active" : "Disconnected";
    if (walletTitle) walletTitle.textContent = title;
    if (walletSubtitle) walletSubtitle.textContent = subtitle;
    if (walletStatus) {
      walletStatus.textContent = statusText;
      walletStatus.className = `status-pill ${connected || pending ? "private" : "public"}`;
    }
    if (walletAccount) {
      walletAccount.textContent = shortAddress(walletAddress);
      walletAccount.title = walletAddress || "";
    }
    if (walletNetwork) walletNetwork.textContent = expectedNetworkName();
    if (walletProvider) walletProvider.textContent = state.walletSource;
    if (walletHelper) walletHelper.textContent = helperText;
    if (walletConnectionSummary) walletConnectionSummary.textContent = connectionSummary;
    if (walletConnectionStatus) {
      walletConnectionStatus.textContent = connectionStatus;
      walletConnectionStatus.className = `status-pill ${connected || pending ? "private" : "public"}`;
    }
    if (walletConnectRow) walletConnectRow.hidden = connected;
    if (walletSettingsRow) walletSettingsRow.hidden = !connected;
    renderWalletAssets();
    renderWalletRewards();
    void refreshWalletAssets();
    document.querySelectorAll("[data-default-privacy]").forEach((button) => {
      button.classList.toggle("active", button.dataset.defaultPrivacy === state.defaultPrivacyMode);
    });
    document.querySelectorAll("[data-auto-shield]").forEach((input) => {
      input.checked = state.autoShield;
    });
    renderSettings();

    refreshConnectLabels();
    renderHomeStatus();
  }

  function renderWalletAssets() {
    const connected = state.walletConnected && Boolean(walletAddressValue());
    walletAssetConfig.forEach((asset) => {
      const balance = document.querySelector(`#wallet-asset-${asset.id}-balance`);
      const detail = document.querySelector(`#wallet-asset-${asset.id}-detail`);
      const assetState = state.walletAssetBalances[asset.id] || { display: asset.defaultDisplay, status: "idle" };
      if (balance) {
        balance.textContent = connected ? assetState.display || asset.defaultDisplay : "--";
      }
      if (detail) {
        detail.textContent = connected
          ? assetState.status === "loading"
            ? asset.symbol
            : assetState.status === "error"
              ? "Sync failed"
              : asset.detail
          : "Connect wallet";
      }
    });
  }

  function renderWalletRewards() {
    const tier = nextRewardTier(state.rewardPoints);
    const remaining = Math.max(tier.threshold - state.rewardPoints, 0);
    setElementText("#wallet-reward-points", `${formatPoints(state.rewardPoints)} pts`);
    setElementText("#wallet-reward-tier", tier.name);
    setElementText("#wallet-reward-remaining", remaining > 0 ? `+${formatPoints(remaining)} pts remaining` : "Top tier reached");

    const recent = document.querySelector("#wallet-recent-rewards");
    const history = document.querySelector("#wallet-rewards-history");

    if (recent) recent.innerHTML = rewardRowsMarkup(state.rewardHistory.slice(0, 3), formatPoints);
    if (history) history.innerHTML = rewardRowsMarkup(state.rewardHistory.slice(0, 8), formatPoints);
  }

  function renderSettings() {
    const walletAddress = walletAddressValue();
    const settingsWalletAddress = document.querySelector("#settings-wallet-address");
    const settingsWalletStatus = document.querySelector("#settings-wallet-status");
    if (settingsWalletAddress) {
      settingsWalletAddress.textContent = shortAddress(walletAddress);
      settingsWalletAddress.title = walletAddress || "";
    }
    if (settingsWalletStatus) {
      settingsWalletStatus.textContent = state.walletConnected ? "Connected" : "Disconnected";
      settingsWalletStatus.className = `status-pill ${state.walletConnected ? "private" : "public"}`;
    }
  }

  async function copyWalletAddress() {
    const address = walletAddressValue();
    if (!address) {
      showToast("No wallet address.");
      return;
    }
    await copyToClipboard(address);
    showToast("Wallet address copied.");
  }

  function resetWalletConnection() {
    clearWalletInitTimer();
    resetClientConnection();
    state.walletConnected = false;
    state.walletAddress = "";
    state.walletNetwork = expectedChainId;
    state.walletSource = privyAppId ? "Privy" : "Demo";
    state.helperVerified = false;
    state.privyWallet = null;
    state.privyAccount = null;
    state.privyProvider = null;
    state.privyAccountDeployed = false;
    state.walletAssetBalances = createDefaultWalletAssetBalances();
    state.walletAssetSyncKey = "";
    state.walletAssetSyncStatus = "idle";
    setWalletInitializationState("idle", { message: "Connect Wallet" });
  }

  function requireConnectedWallet() {
    if (state.walletConnected || walletAddressValue()) return true;
    showToast("Connect wallet first.");
    return false;
  }

  async function refreshWalletConnection() {
    if (!state.walletConnected) {
      await connectWallet({ goToInbox: false });
      return;
    }
    if (timelineMode === "direct-helper-dev") await verifyHelperDeployment();
    await refreshWalletAssets({ force: true });
    renderWallet();
    showToast("Connection refreshed.");
  }

  async function logoutWallet(message = "Logged out.") {
    const bridge = getPrivyBridge();
    try {
      if (bridge?.logout) await bridge.logout();
    } finally {
      state.privyAuthenticated = false;
      resetWalletConnection();
      showToast(message);
    }
  }

  function clearLocalVeilCache() {
    const keys = listStorageKeys("veil:");
    removeStorageKeys(keys);
    showToast(keys.length ? "Local VEIL cache cleared." : "No local VEIL cache.");
  }

  return {
    renderWallet,
    renderWalletAssets,
    renderWalletRewards,
    renderSettings,
    walletAddressValue,
    copyWalletAddress,
    resetWalletConnection,
    requireConnectedWallet,
    refreshWalletConnection,
    logoutWallet,
    clearLocalVeilCache,
  };
}
