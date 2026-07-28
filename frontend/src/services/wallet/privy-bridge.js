import { PRIVY_READY_TIMEOUT_MS } from "../../app/runtime-config.js";

export function getPrivyBridge(windowRef = window) {
  return windowRef.__veilPrivy || null;
}

export function currentOrigin(windowRef = window) {
  return windowRef.location.origin;
}

export function isGoogleLinkedAccount(account) {
  const values = [
    account?.type,
    account?.provider,
    account?.providerId,
    account?.oauthProvider,
    account?.loginMethod,
  ].map((value) => String(value || "").toLowerCase());
  return values.some((value) => value.includes("google"));
}

export function summarizePrivyUser(user) {
  const linkedAccounts = Array.isArray(user?.linkedAccounts) ? user.linkedAccounts : [];
  const linkedAccountTypes = [...new Set(linkedAccounts
    .map((account) => account?.type || account?.provider || account?.loginMethod)
    .filter(Boolean))];

  return {
    userPresent: Boolean(user?.id || user?.did),
    googleLinked: linkedAccounts.some(isGoogleLinkedAccount),
    linkedAccountTypes,
    embeddedWalletLinked: linkedAccounts.some((account) => String(account?.type || "").includes("wallet"))
      || Boolean(user?.wallet?.address),
  };
}

export function summarizePrivyBridge(bridge) {
  return {
    ready: Boolean(bridge?.ready),
    authenticated: Boolean(bridge?.authenticated),
    loginError: bridge?.loginError || undefined,
    walletCount: Array.isArray(bridge?.wallets) ? bridge.wallets.length : 0,
    ...summarizePrivyUser(bridge?.user),
  };
}

export function waitForPrivyState(predicate, timeout, windowRef = window) {
  return new Promise((resolve) => {
    const current = getPrivyBridge(windowRef);
    if (current && predicate(current)) {
      resolve(current);
      return;
    }

    const timer = setTimeout(() => {
      windowRef.removeEventListener("veil:privy-state", onState);
      resolve(getPrivyBridge(windowRef));
    }, timeout);

    function onState() {
      const bridge = getPrivyBridge(windowRef);
      if (!bridge || !predicate(bridge)) return;
      clearTimeout(timer);
      windowRef.removeEventListener("veil:privy-state", onState);
      resolve(bridge);
    }

    windowRef.addEventListener("veil:privy-state", onState);
  });
}

export function createPrivyBridgeAdapter({
  config,
  logger,
  walletInitTimeoutMs,
  privyReadyTimeoutMs = Math.min(walletInitTimeoutMs, PRIVY_READY_TIMEOUT_MS),
  privyAuthTimeoutMs = walletInitTimeoutMs,
  updateWalletInitialization = () => {},
  windowRef = window,
}) {
  async function ensurePrivyAuthenticated(traceId = logger.createTraceId("privy-auth")) {
    if (!config.privyAppId) return null;

    updateWalletInitialization("connecting", traceId, {
      message: "Loading Privy",
      title: "Loading Privy",
      subtitle: "Preparing email and Google login.",
      detail: `Waiting up to ${Math.ceil(privyReadyTimeoutMs / 1000)} seconds for the login service.`,
    });
    logger.tracePrivyStarkZap(traceId, "privy_ready.wait", {
      where: "ensurePrivyAuthenticated",
      currentOrigin: currentOrigin(windowRef),
      loginMethods: config.privyLoginMethods,
    });
    logger.veilLog("info", "auth.privy.ready.wait", {
      traceId,
      where: "ensurePrivyAuthenticated",
      currentOrigin: currentOrigin(windowRef),
    });
    const readyBridge = await waitForPrivyState(
      (bridge) => bridge.ready,
      privyReadyTimeoutMs,
      windowRef,
    );
    if (!readyBridge?.ready) {
      logger.tracePrivyStarkZap(traceId, "privy_ready.timeout", {
        where: "ensurePrivyAuthenticated",
        ...summarizePrivyBridge(readyBridge),
        why: "Privy did not become ready before the login timeout.",
        howToFix: "Confirm VITE_PRIVY_APP_ID is set and the current origin is allowed in the Privy dashboard.",
      });
      logger.veilLog("warn", "auth.privy.ready.timeout", {
        traceId,
        where: "ensurePrivyAuthenticated",
        why: "Privy did not become ready before the login timeout.",
        howToFix: "Confirm VITE_PRIVY_APP_ID is set and the current origin is allowed in the Privy dashboard.",
      });
      throw Object.assign(
        new Error("Privy login could not start. Check the Privy App ID and allowed origin."),
        { code: "PRIVY_READY_TIMEOUT" },
      );
    }

    logger.tracePrivyStarkZap(traceId, "privy_ready.success", {
      where: "ensurePrivyAuthenticated",
      ...summarizePrivyBridge(readyBridge),
    });

    if (!readyBridge.authenticated) {
      if (typeof readyBridge.login !== "function") {
        throw Object.assign(
          new Error("Privy login is unavailable. Reload the page and try again."),
          { code: "PRIVY_LOGIN_UNAVAILABLE" },
        );
      }
      updateWalletInitialization("connecting", traceId, {
        message: "Complete Privy Login",
        title: "Sign in to VEIL",
        subtitle: "Choose email or Google in the Privy window.",
        detail: "Complete authentication to create or restore your Starknet account.",
      });
      logger.tracePrivyStarkZap(traceId, "google_login.start", {
        where: "ensurePrivyAuthenticated",
        authenticated: false,
        loginMethods: config.privyLoginMethods,
        currentOrigin: currentOrigin(windowRef),
        howToFix: "If Google opens but returns redirect_uri_mismatch, add the current Privy redirect URL/origin in Google OAuth and Privy dashboard settings.",
      });
      try {
        await readyBridge.login();
        logger.tracePrivyStarkZap(traceId, "google_login.modal_resolved", {
          where: "ensurePrivyAuthenticated",
        });
      } catch (error) {
        logger.veilError("trace.privy_starkzap.google_login.failed", error, {
          traceId,
          where: "ensurePrivyAuthenticated",
          howToFix: "Check Google OAuth Authorized JavaScript Origins, Google Authorized Redirect URIs, and Privy OAuth redirect settings for the current origin.",
        });
        throw error;
      }
    }

    const authenticatedBridge = await waitForPrivyState(
      (bridge) => bridge.ready && (bridge.authenticated || bridge.loginError),
      privyAuthTimeoutMs,
      windowRef,
    );
    if (authenticatedBridge?.loginError) {
      throw Object.assign(
        new Error(`Privy login failed: ${authenticatedBridge.loginError}`),
        { code: authenticatedBridge.loginError },
      );
    }
    if (!authenticatedBridge?.authenticated) {
      logger.tracePrivyStarkZap(traceId, "authenticated.timeout", {
        where: "ensurePrivyAuthenticated",
        ...summarizePrivyBridge(authenticatedBridge),
        why: "Privy login resolved but authenticated never became true.",
        howToFix: "Retry login, then check Privy dashboard auth logs and browser console for OAuth callback errors.",
      });
      logger.veilLog("warn", "auth.privy.login.incomplete", {
        traceId,
        where: "ensurePrivyAuthenticated",
        why: "Privy login did not complete.",
        howToFix: "Complete the Privy login modal, or fix OAuth provider settings if Google returned redirect_uri_mismatch.",
      });
      throw Object.assign(
        new Error("Privy login did not finish. Complete the login window or check the OAuth configuration."),
        { code: "PRIVY_AUTH_TIMEOUT" },
      );
    }

    logger.tracePrivyStarkZap(traceId, "authenticated.true", {
      where: "ensurePrivyAuthenticated",
      ...summarizePrivyBridge(authenticatedBridge),
    });
    logger.veilLog("info", "auth.privy.login.success", {
      traceId,
      where: "ensurePrivyAuthenticated",
      ...summarizePrivyBridge(authenticatedBridge),
    });
    return authenticatedBridge;
  }

  return { ensurePrivyAuthenticated };
}
