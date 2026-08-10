import { getWalletSourceLabel } from "./injected-wallet.js";

export function userFacingWalletError(error) {
  const message = String(error?.message || error || "Wallet connection failed.");
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

function updateInjectedStatus(updateWalletInitialization, traceId) {
  updateWalletInitialization("connecting", traceId, {
    message: "Checking Ready Wallet",
    title: "Connect Ready Wallet",
    subtitle: "VEIL is checking Ready Wallet for STRK20 Wallet API support.",
    detail: "Approve the connection in your Starknet wallet if prompted.",
  });
}

async function connectInjected({
  traceId,
  logger,
  waitForInjectedWallet,
  updateWalletInitialization,
  windowRef,
  preferredWallet = "ready",
}) {
  updateInjectedStatus(updateWalletInitialization, traceId);
  const injectedWalletEntry = await waitForInjectedWallet({
    windowRef,
    preferredWallet,
  });
  const injectedWallet = await enableInjectedWallet(injectedWalletEntry);
  if (!injectedWallet) {
    throw new Error("Ready Wallet extension was not detected. Install or unlock Ready Wallet, select Starknet Sepolia, and retry.");
  }

  logger.veilLog("info", "wallet.init.injected.selected", {
    traceId,
    where: "resolveWalletLogin",
    source: getWalletSourceLabel(injectedWallet, injectedWalletEntry?.key),
    preferredWallet,
  });
  return {
    injectedWallet,
    injectedWalletEntry,
  };
}

export async function resolveWalletLogin({
  traceId,
  logger,
  waitForInjectedWallet,
  updateWalletInitialization,
  windowRef,
  preferredInjectedWallet = "ready",
}) {
  return connectInjected({
    traceId,
    logger,
    waitForInjectedWallet,
    updateWalletInitialization,
    windowRef,
    preferredWallet: preferredInjectedWallet,
  });
}
