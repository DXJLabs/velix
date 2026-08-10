import { createWalletPrivacyCapabilityModel } from "../../domain/privacy-capabilities.js";

export function createWalletController({
  state,
  document,
  walletAssetConfig,
  expectedChainId,
  timelineMode,
  privacyRuntime,
  privacyPoolCompatibility,
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
  connectWallet,
  clearWalletInitTimer,
  resetClientConnection,
  setWalletInitializationState,
  createDefaultWalletAssetBalances,
  listStorageKeys,
  removeStorageKeys,
  copyToClipboard,
  shieldTokens,
}) {
  function walletAddressValue() {
    return state.walletAddress || "";
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
        : connected
          ? "This wallet can access encrypted deal channels."
          : "Connect Ready Wallet to unlock VEIL privacy.";
    const statusText = pending ? "Connecting" : failed ? "Failed" : connected ? "Connected" : "Disconnected";
    const helperText = pending
      ? state.walletInitMessage
      : failed
        ? "Retry"
        : timelineMode === "encrypted-direct"
          ? state.helperVerified ? "Verified" : "Check required"
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
    const walletAddress = state.walletAddress;
    const connectionSummary = pending
      ? state.walletInitMessage
      : failed
        ? "Wallet connection failed"
        : connected
          ? `${state.walletSource} on ${expectedNetworkName()}`
          : "Ready Wallet not connected";
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
    renderWalletPrivacy();
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

  function renderWalletPrivacy() {
    const model = state.walletPrivacyCapabilities;
    const support = state.walletConnected ? model?.support || "unsupported" : "disconnected";
    const capabilityLabel = support === "full"
      ? "Supported"
      : support === "partial"
        ? `Partial${state.privacyWalletApiVersion ? ` · API ${state.privacyWalletApiVersion}` : ""}`
        : support === "unsupported"
          ? "Unsupported privacy wallet"
          : "Connect wallet";
    const registrationLabel = !state.walletConnected
      ? "Connect wallet"
      : state.privacyRegistrationStatus === "registered"
        ? "Registered with the pool"
        : state.privacyRegistrationStatus === "not-registered"
          ? "Not yet \u2014 registers on your first private action"
          : state.privacyRegistrationStatus === "unknown"
            ? "Checking\u2026"
            : "Unavailable";
    const signingAvailable = Boolean(model?.capabilities?.signing);
    const walletApiAvailable = Boolean(model?.capabilities?.strk20WalletApi);
    const signingLabel = state.walletConnected
      ? signingAvailable ? "Available" : "Unavailable"
      : "Connect wallet";
    const walletApiLabel = state.walletConnected
      ? walletApiAvailable
        ? `Supported · API ${state.privacyWalletApiVersion || "detected"}`
        : "Not detected"
      : "Connect wallet";
    const proofManagementLabel = state.walletConnected
      ? model?.capabilities?.walletProofManagement ? "Wallet-managed" : "Unavailable"
      : "Connect wallet";
    const officialSignerLabel = state.walletConnected ? "Handled by Ready Wallet" : "Connect wallet";
    const total = state.privateBalances?.strk?.display;
    setElementText("#wallet-privacy-capability", capabilityLabel);
    setElementText("#wallet-private-identity", registrationLabel);
    setElementText("#wallet-standard-signing", signingLabel);
    setElementText("#wallet-strk20-api", walletApiLabel);
    setElementText("#wallet-proof-management", proofManagementLabel);
    setElementText("#wallet-official-sdk-signer", officialSignerLabel);
    const privacyWalletButton = document.querySelector("[data-connect-privacy-wallet]");
    if (privacyWalletButton) {
      const readyConnected = state.walletConnected && state.walletSource === "Ready";
      privacyWalletButton.disabled = readyConnected;
      privacyWalletButton.setAttribute("aria-disabled", readyConnected ? "true" : "false");
      const label = privacyWalletButton.querySelector("strong");
      if (label) label.textContent = readyConnected ? "Ready Wallet Connected" : "Connect Ready for Privacy";
    }
    setElementText(
      "#wallet-pool-status",
      privacyRuntime.screening.capable
        ? "Screening-capable"
        : `${privacyPoolCompatibility} · Shield disabled`,
    );
    setElementText(
      "#wallet-private-total",
      total ?? (state.privateBalanceStatus === "failed" ? "Discovery failed" : "Unavailable"),
    );
    setElementText("#wallet-private-spendable", total ? "Not exposed by wallet" : "Unavailable");
    setElementText("#wallet-private-maturing", total ? "Not exposed by wallet" : "Unavailable");

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
    state.walletSource = "";
    state.helperVerified = false;
    state.walletAssetBalances = createDefaultWalletAssetBalances();
    state.walletAssetSyncKey = "";
    state.walletAssetSyncStatus = "idle";
    state.walletPrivacyCapabilities = createWalletPrivacyCapabilityModel();
    state.privacyWalletApiVersion = "";
    state.privacyWalletTransport = "none";
    state.officialPrivacySignerStatus = "not-integrated";
    state.privacyRegistrationStatus = "unknown";
    state.privacyRegistrationReadiness = "blocked";
    state.privacyRegistrationReadinessCode = "wallet";
    state.privacyRegistrationReason = "Connect Ready Wallet first.";
    state.privacyRegistrationActionStatus = "idle";
    state.privacyRegistrationTxHash = "";
    state.readyWallet = null;
    state.readyAccount = null;
    state.readyProvider = null;
    state.readyReadProvider = null;
    state.privateBalanceStatus = "unavailable";
    state.privateBalances = {};
    setWalletInitializationState("idle", {
      message: "Connect Ready Wallet",
    });
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
    if (timelineMode === "encrypted-direct") await verifyHelperDeployment();
    await refreshWalletAssets({ force: true });
    renderWallet();
    showToast("Connection refreshed.");
  }

  async function logoutWallet(message = "Logged out.") {
    resetWalletConnection();
    showToast(message);
  }

  function clearLocalVeilCache() {
    const keys = listStorageKeys("veil:");
    removeStorageKeys(keys);
    showToast(keys.length ? "Local VEIL cache cleared." : "No local VEIL cache.");
  }

  // Deposits `amount` (raw base units, e.g. wei-equivalent) of the asset
  // identified by `assetId` into the STRK20 privacy pool. Intentionally does
  // NOT also send a private transfer — see the comment on
  // walletService.shieldTokens for why shield and transfer must stay separate
  // wallet calls. The caller is responsible for amount-entry UI; this is the
  // action layer only.
  async function shieldToken(assetId, amount) {
    const asset = walletAssetConfig.find((entry) => entry.id === assetId);
    if (!asset?.contractAddress) {
      showToast(`Unknown asset: ${assetId}.`);
      return undefined;
    }
    try {
      const { transactionHash } = await shieldTokens({
        tokenAddress: asset.contractAddress,
        amount,
      });
      showToast(`Shield submitted. Funds mature in ~10 blocks before they're spendable.`);
      return transactionHash;
    } catch (error) {
      showToast(error?.message || "Shield failed. Check your wallet and retry.");
      return undefined;
    }
  }

  return {
    renderWallet,
    renderWalletAssets,
    renderWalletPrivacy,
    renderWalletRewards,
    renderSettings,
    walletAddressValue,
    copyWalletAddress,
    resetWalletConnection,
    requireConnectedWallet,
    refreshWalletConnection,
    logoutWallet,
    clearLocalVeilCache,
    shieldToken,
  };
}
