import { getWalletSourceLabel } from "./injected-wallet.js";

export function userFacingWalletError(error) {
  const message = String(error?.message || error || "Wallet connection failed.");
  const code = String(error?.code || "");
  if (code === "PRIVY_READY_TIMEOUT") return new Error(message);
  if (code === "PRIVY_AUTH_TIMEOUT") return new Error(message);
  if (code === "PRIVY_MOUNT_ROOT_MISSING" || code === "PRIVY_LOGIN_UNAVAILABLE") {
    return new Error("Privy login failed to load. Reload the page and try again.");
  }
  if (code === "invalid_origin" || /invalid[_ ]origin|origin.*(?:allow|authoriz)/i.test(message)) {
    return new Error("Privy login is not allowed for this site. Add this origin in the Privy dashboard.");
  }
  if (/redirect_uri|oauth|google.*(?:config|redirect)/i.test(message)) {
    return new Error("Google login is not configured for this site. Check the Privy OAuth and allowed-origin settings.");
  }
  if (/reject|declin|cancel|closed/i.test(message)) {
    return new Error("Wallet login was cancelled.");
  }
  return error instanceof Error ? error : new Error(message);
}

async function enableInjectedWallet(entry) {
  const wallet = entry?.wallet || null;
  if (wallet && !wallet.account && typeof wallet.enable === "function") {
    await wallet.enable();
  }
  return wallet;
}

function updateInjectedStatus(
  updateWalletInitialization,
  traceId,
  privyFailed,
  preferredWallet = "",
) {
  const readyOnly = preferredWallet === "ready";
  updateWalletInitialization("connecting", traceId, {
    message: readyOnly ? "Checking Ready Wallet" : "Checking Browser Wallet",
    title: readyOnly
      ? "Connect Ready Wallet"
      : privyFailed
        ? "Checking Browser Wallet"
        : "Connect Starknet Wallet",
    subtitle: readyOnly
      ? "VEIL is checking Ready Wallet for STRK20 Wallet API support."
      : privyFailed
        ? "Privy could not finish, so VEIL is checking a browser wallet."
        : "VEIL is checking for an injected Starknet wallet.",
    detail: "Approve the connection in your Starknet wallet if prompted.",
  });
}

async function connectInjected({
  traceId,
  logger,
  waitForInjectedWallet,
  updateWalletInitialization,
  windowRef,
  preferredWallet = "",
}) {
  updateInjectedStatus(updateWalletInitialization, traceId, false, preferredWallet);
  const injectedWalletEntry = await waitForInjectedWallet({
    windowRef,
    preferredWallet,
  });
  const injectedWallet = await enableInjectedWallet(injectedWalletEntry);
  if (!injectedWallet) {
    if (preferredWallet === "ready") {
      throw new Error("Ready Wallet extension was not detected. Install or unlock Ready Wallet, select Starknet Sepolia, and retry.");
    }
    throw new Error("No supported wallet login is configured.");
  }

  logger.veilLog("info", "wallet.init.injected.selected", {
    traceId,
    where: "resolveWalletLogin",
    source: getWalletSourceLabel(injectedWallet, injectedWalletEntry?.key),
    preferredWallet: preferredWallet || "any",
  });
  return {
    injectedWallet,
    injectedWalletEntry,
    privyAccountContext: null,
  };
}

export async function resolveWalletLogin({
  config,
  traceId,
  logger,
  ensurePrivyMounted,
  ensurePrivyAuthenticated,
  createPrivyStarknetAccount,
  waitForInjectedWallet,
  updateWalletInitialization,
  windowRef,
  preferredInjectedWallet = "",
}) {
  if (preferredInjectedWallet) {
    return connectInjected({
      traceId,
      logger,
      waitForInjectedWallet,
      updateWalletInitialization,
      windowRef,
      preferredWallet: preferredInjectedWallet,
    });
  }

  if (config.privyAppId) {
    try {
      await ensurePrivyMounted();
      const bridge = await ensurePrivyAuthenticated(traceId);
      if (!bridge) {
        throw Object.assign(
          new Error("Privy authentication did not complete."),
          { code: "PRIVY_AUTH_INCOMPLETE" },
        );
      }
      updateWalletInitialization("creating_account", traceId, {
        message: "Creating Starknet Account",
      });
      const privyAccountContext = await createPrivyStarknetAccount(bridge, traceId);
      if (!privyAccountContext?.account) {
        throw new Error("Privy did not return a Starknet account.");
      }
      return {
        injectedWallet: null,
        injectedWalletEntry: null,
        privyAccountContext,
      };
    } catch (error) {
      const privyConnectionError = userFacingWalletError(error);
      logger.veilError("starkzap.privy.onboard.failed", error, {
        traceId,
        where: "resolveWalletLogin",
        howToFix: "Check the Privy App ID, allowed origin, OAuth settings, wallet API, StarkZap onboarding, and Starknet RPC.",
      });
      updateInjectedStatus(updateWalletInitialization, traceId, true);
      const injectedWalletEntry = await waitForInjectedWallet({ windowRef });
      const injectedWallet = await enableInjectedWallet(injectedWalletEntry);
      if (!injectedWallet) throw privyConnectionError;
      logger.veilLog("warn", "wallet.init.injected_fallback.used", {
        traceId,
        where: "resolveWalletLogin",
        source: getWalletSourceLabel(injectedWallet, injectedWalletEntry?.key),
        why: "Privy setup failed, but an injected Starknet wallet was available.",
      });
      return {
        injectedWallet,
        injectedWalletEntry,
        privyAccountContext: null,
      };
    }
  }

  return connectInjected({
    traceId,
    logger,
    waitForInjectedWallet,
    updateWalletInitialization,
    windowRef,
  });
}
