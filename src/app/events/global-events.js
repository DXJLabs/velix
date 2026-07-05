import { currentOrigin, summarizePrivyUser } from "../../services/wallet/privy-bridge.js";

export function bindGlobalEvents({
  windowRef = window,
  state,
  config,
  logger,
  api,
}) {
  windowRef.addEventListener("unhandledrejection", (event) => {
    const message = String(event.reason?.message || event.reason || "");
    if (/redirect_uri_mismatch/i.test(message)) {
      logger.veilError("auth.google_oauth.redirect_uri_mismatch", event.reason, {
        where: "window.unhandledrejection",
        currentOrigin: currentOrigin(),
        howToFix: "Add the current app origin to Privy Allowed OAuth Redirect URLs and Google Authorized JavaScript Origins; add Privy's documented Google OAuth callback URL to Google Authorized Redirect URIs.",
      });
      event.preventDefault();
      api.showToast("Fix Google OAuth redirect URI.");
      return;
    }
    if (message.includes("Login with Google not allowed")) {
      logger.veilError("auth.google_oauth.provider_disabled", event.reason, {
        where: "window.unhandledrejection",
        howToFix: "Enable Google as a login method in the Privy dashboard for this app.",
      });
      event.preventDefault();
      api.showToast("Enable Google in Privy dashboard.");
    }
  });

  windowRef.addEventListener("veil:privy-state", (event) => {
    const detail = event.detail || {};
    state.privyReady = Boolean(detail.ready);
    state.privyAuthenticated = Boolean(detail.authenticated);
    if (config.timelineMode !== "direct-helper") {
      state.walletConnected ||= state.privyAuthenticated;
    }
    state.walletSource = config.privyAppId ? "Privy" : state.walletSource;
    logger.veilLog("info", "auth.privy.state.changed", {
      where: "veil:privy-state",
      ready: state.privyReady,
      authenticated: state.privyAuthenticated,
      walletCount: Array.isArray(detail.wallets) ? detail.wallets.length : undefined,
      ...summarizePrivyUser(detail.user),
    });
    if (detail.user?.wallet?.address && !state.walletAddress) {
      state.walletAddress = detail.user.wallet.address;
    }
    api.renderWallet();
    api.renderHomeStatus();
    api.refreshConnectLabels();
  });
}
