import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider, useLogin, usePrivy, useWallets } from "@privy-io/react-auth";

import { currentOrigin, summarizePrivyBridge } from "../../services/wallet/privy-bridge.js";

function dispatchPrivyState(windowRef, bridgeState) {
  const CustomEventConstructor = windowRef.CustomEvent || CustomEvent;
  windowRef.dispatchEvent(new CustomEventConstructor("veil:privy-state", {
    detail: bridgeState,
  }));
}

export async function mountPrivyBridge({
  config,
  privyAuthRoot,
  logger,
  onStateChange = () => {},
  windowRef = window,
}) {
  if (!config.privyAppId) return { configured: false };
  if (!privyAuthRoot) {
    throw Object.assign(
      new Error("Privy login UI could not mount because #privy-auth-root is missing."),
      { code: "PRIVY_MOUNT_ROOT_MISSING" },
    );
  }
  logger.veilLog("info", "auth.privy.mount.start", {
    where: "mountPrivy",
    appIdConfigured: Boolean(config.privyAppId),
    configuredLoginMethods: config.configuredPrivyLoginMethods,
    loginMethods: config.privyLoginMethods,
    removedLoginMethods: config.removedPrivyLoginMethods.length ? config.removedPrivyLoginMethods : undefined,
    currentOrigin: currentOrigin(windowRef),
    howToFix: config.privyLoginMethods.includes("google")
      ? "For Google OAuth, add this origin to Privy Allowed OAuth Redirect URLs and Google Authorized JavaScript Origins."
      : undefined,
  });

  function PrivyStateBridge() {
    const privy = usePrivy();
    const [loginError, setLoginError] = useState("");
    const handleLoginError = useCallback((error) => {
      setLoginError(String(error || "Privy login failed."));
    }, []);
    const { login } = useLogin({ onError: handleLoginError });
    const startLogin = useCallback((...args) => {
      setLoginError("");
      if (windowRef.__veilPrivy) {
        windowRef.__veilPrivy = {
          ...windowRef.__veilPrivy,
          loginError: "",
        };
      }
      return login(...args);
    }, [login]);
    const walletState = useWallets();
    const wallets = walletState?.wallets || [];

    useEffect(() => {
      const bridgeState = {
        ready: Boolean(privy.ready),
        authenticated: Boolean(privy.authenticated),
        loginError,
        user: privy.user || null,
        wallets,
      };
      windowRef.__veilPrivy = {
        ...bridgeState,
        login: startLogin,
        logout: privy.logout,
        getAccessToken: privy.getAccessToken,
      };
      onStateChange(bridgeState);

      logger.veilLog("info", "auth.privy.bridge.state", {
        where: "PrivyStateBridge",
        ...summarizePrivyBridge(windowRef.__veilPrivy),
      });

      dispatchPrivyState(windowRef, bridgeState);
    }, [privy.ready, privy.authenticated, privy.user, loginError, startLogin, privy.logout, privy.getAccessToken, wallets]);

    return null;
  }

  const mountingState = {
    ready: false,
    authenticated: false,
    loginError: "",
    user: null,
    wallets: [],
  };
  windowRef.__veilPrivy = {
    ...mountingState,
    mounting: true,
  };
  onStateChange(mountingState);
  dispatchPrivyState(windowRef, mountingState);

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
  return windowRef.__veilPrivy;
}
