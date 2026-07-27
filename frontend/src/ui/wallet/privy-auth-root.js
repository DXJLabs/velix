import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";

import { currentOrigin, summarizePrivyBridge } from "../../services/wallet/privy-bridge.js";

export async function mountPrivyBridge({ config, privyAuthRoot, logger }) {
  if (!config.privyAppId || !privyAuthRoot) return;
  logger.veilLog("info", "auth.privy.mount.start", {
    where: "mountPrivy",
    appIdConfigured: Boolean(config.privyAppId),
    configuredLoginMethods: config.configuredPrivyLoginMethods,
    loginMethods: config.privyLoginMethods,
    removedLoginMethods: config.removedPrivyLoginMethods.length ? config.removedPrivyLoginMethods : undefined,
    currentOrigin: currentOrigin(),
    howToFix: config.privyLoginMethods.includes("google")
      ? "For Google OAuth, add this origin to Privy Allowed OAuth Redirect URLs and Google Authorized JavaScript Origins."
      : undefined,
  });

  function PrivyStateBridge() {
    const privy = usePrivy();
    const walletState = useWallets();
    const wallets = walletState?.wallets || [];

    useEffect(() => {
      const bridgeState = {
        ready: Boolean(privy.ready),
        authenticated: Boolean(privy.authenticated),
        user: privy.user || null,
        wallets,
      };
      window.__veilPrivy = {
        ...bridgeState,
        login: privy.login,
        logout: privy.logout,
        getAccessToken: privy.getAccessToken,
      };

      logger.veilLog("info", "auth.privy.bridge.state", {
        where: "PrivyStateBridge",
        ...summarizePrivyBridge(window.__veilPrivy),
      });

      window.dispatchEvent(new CustomEvent("veil:privy-state", {
        detail: bridgeState,
      }));
    }, [privy.ready, privy.authenticated, privy.user, privy.login, privy.logout, privy.getAccessToken, wallets]);

    return null;
  }

  createRoot(privyAuthRoot).render(
    React.createElement(
      PrivyProvider,
      {
        appId: config.privyAppId,
        config: {
          appearance: {
            accentColor: "#10b981",
            theme: "light",
          },
          loginMethods: config.privyLoginMethods,
        },
      },
      React.createElement(PrivyStateBridge),
    ),
  );
  logger.veilLog("info", "auth.privy.mount.success", {
    where: "mountPrivy",
    appIdConfigured: Boolean(config.privyAppId),
  });
}
