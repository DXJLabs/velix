export function getPrivyBridge() {
  return window.__veilPrivy || null;
}

export function currentOrigin() {
  return window.location.origin;
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
    walletCount: Array.isArray(bridge?.wallets) ? bridge.wallets.length : 0,
    ...summarizePrivyUser(bridge?.user),
  };
}

export function waitForPrivyState(predicate, timeout) {
  return new Promise((resolve) => {
    const current = getPrivyBridge();
    if (current && predicate(current)) {
      resolve(current);
      return;
    }

    const timer = setTimeout(() => {
      window.removeEventListener("veil:privy-state", onState);
      resolve(getPrivyBridge());
    }, timeout);

    function onState() {
      const bridge = getPrivyBridge();
      if (!bridge || !predicate(bridge)) return;
      clearTimeout(timer);
      window.removeEventListener("veil:privy-state", onState);
      resolve(bridge);
    }

    window.addEventListener("veil:privy-state", onState);
  });
}

export function createPrivyBridgeAdapter({
  config,
  logger,
  walletInitTimeoutMs,
}) {
  async function ensurePrivyAuthenticated(traceId = logger.createTraceId("privy-auth")) {
    if (!config.privyAppId) return null;

    logger.tracePrivyStarkZap(traceId, "privy_ready.wait", {
      where: "ensurePrivyAuthenticated",
      currentOrigin: currentOrigin(),
      loginMethods: config.privyLoginMethods,
    });
    logger.veilLog("info", "auth.privy.ready.wait", {
      traceId,
      where: "ensurePrivyAuthenticated",
      currentOrigin: currentOrigin(),
    });
    const readyBridge = await waitForPrivyState((bridge) => bridge.ready, walletInitTimeoutMs);
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
      return null;
    }

    logger.tracePrivyStarkZap(traceId, "privy_ready.success", {
      where: "ensurePrivyAuthenticated",
      ...summarizePrivyBridge(readyBridge),
    });

    if (!readyBridge.authenticated) {
      logger.tracePrivyStarkZap(traceId, "google_login.start", {
        where: "ensurePrivyAuthenticated",
        authenticated: false,
        loginMethods: config.privyLoginMethods,
        currentOrigin: currentOrigin(),
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
      (bridge) => bridge.ready && bridge.authenticated,
      walletInitTimeoutMs,
    );
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
      return null;
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
