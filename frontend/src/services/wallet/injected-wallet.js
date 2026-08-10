import { createStore } from "@starknet-io/get-starknet-discovery";

let walletStore;

function getWalletStore() {
  if (!walletStore) {
    // This app only targets native Starknet wallets (Ready, Argent, Braavos).
    // Skip the default EIP-1193/MetaMask virtual-wallet bridge so discovery
    // doesn't pull in an unused Ethereum-wallet adapter chain.
    walletStore = createStore({ eip1193Adapters: [] });
  }
  return walletStore;
}

function unwrapInjectedWallet(walletStandardWallet) {
  // @starknet-io/get-starknet-discovery wraps every raw injected wallet in a
  // StarknetInjectedWallet (wallet-standard shape). The legacy `.request()` /
  // `.enable()` / `.account` transport the rest of this app (and the SDK's
  // Strk20WalletApiClient) expects lives on the public `.injected` property.
  return walletStandardWallet?.injected || walletStandardWallet;
}

export function getWalletSourceLabel(wallet, key = "") {
  const name = wallet?.name || wallet?.id || wallet?.metadata?.name || "";
  const label = `${key} ${name}`;
  if (/ready/i.test(label)) return "Ready";
  if (/argent/i.test(label)) return "Argent";
  if (/braavos/i.test(label)) return "Braavos";
  return name || "Starknet wallet";
}

export function getInjectedStarknetWallet(windowRef = window, options = {}) {
  return getInjectedStarknetWalletEntry(windowRef, options)?.wallet || null;
}

export function isMobileBrowser(windowRef = window) {
  if (typeof windowRef.navigator?.userAgentData?.mobile === "boolean") {
    return windowRef.navigator.userAgentData.mobile;
  }
  return /Android|iPhone|iPad|iPod|Mobile/i.test(windowRef.navigator?.userAgent || "");
}

export function shouldWaitForInjectedStarknetWallet(windowRef = window, options = {}) {
  return Boolean(getInjectedStarknetWalletEntry(windowRef, options)) || !isMobileBrowser(windowRef);
}

export async function waitForInjectedStarknetWallet(options = {}) {
  const normalizedOptions = typeof options === "number" ? { timeout: options } : options;
  const {
    timeout = 2_000,
    windowRef = window,
    preferredWallet = "",
  } = normalizedOptions;
  const lookupOptions = { preferredWallet };
  const existing = getInjectedStarknetWalletEntry(windowRef, lookupOptions);
  if (existing) return existing;
  if (!shouldWaitForInjectedStarknetWallet(windowRef, lookupOptions)) return null;

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const entry = getInjectedStarknetWalletEntry(windowRef, lookupOptions);
    if (entry) return entry;
  }

  return null;
}

export function getInjectedStarknetWalletEntry(windowRef = window, options = {}) {
  const normalizedOptions = typeof options === "string"
    ? { preferredWallet: options }
    : options;
  const preferredWallet = String(normalizedOptions.preferredWallet || "").trim().toLowerCase();

  const store = getWalletStore();
  if (typeof windowRef !== "undefined" && windowRef === globalThis.window) {
    // The store discovers wallets from the real global `window` via its own
    // listeners; force a rescan so newly-injected wallets show up immediately
    // (extensions can inject after this module first loads).
    store._refreshInjectedWallets?.();
  }
  const discoveredWallets = store.getWallets();

  // Test doubles and non-browser windowRefs don't go through the global
  // discovery store (it only listens on `globalThis.window`), so fall back to
  // scanning the provided windowRef directly for legacy injected objects.
  const scannedWallets = windowRef === globalThis.window ? [] : scanWindowForLegacyWallets(windowRef);

  const entries = [...discoveredWallets, ...scannedWallets]
    .map((wallet) => {
      const injected = unwrapInjectedWallet(wallet);
      const key = injected?.id ? `starknet_${injected.id}` : wallet?.name || "";
      return { key, wallet: injected };
    })
    .filter((entry) => isInjectedStarknetWallet(entry.wallet));

  const preferredEntries = preferredWallet
    ? entries.filter((entry) => walletMatchesPreference(entry, preferredWallet))
    : entries;

  return preferredEntries
    .sort((first, second) => walletPriority(first) - walletPriority(second))[0] || null;
}

function scanWindowForLegacyWallets(windowRef) {
  const keys = [
    "starknet_ready",
    "starknet_readyX",
    "starknet_argentX",
    "starknet_argent",
    "starknet",
    "starknet_braavos",
  ];

  const discoveredKeys = Object.getOwnPropertyNames(windowRef)
    .filter((key) => /^starknet/i.test(key) && !keys.includes(key));

  return [...keys, ...discoveredKeys]
    .map((key) => getWindowValue(windowRef, key))
    .filter(Boolean)
    .map((wallet) => ({ name: wallet.name || wallet.id, injected: wallet }));
}

function getWindowValue(windowRef, key) {
  try {
    return windowRef[key];
  } catch {
    return null;
  }
}

function isInjectedStarknetWallet(wallet) {
  return Boolean(wallet)
    && typeof wallet === "object"
    && (
      typeof wallet.enable === "function"
      || typeof wallet.request === "function"
      || Boolean(wallet.account)
      || Boolean(wallet.provider)
    );
}

function walletMatchesPreference(entry, preferredWallet) {
  const label = `${entry.key} ${entry.wallet?.name || ""} ${entry.wallet?.id || ""}`;
  if (preferredWallet === "ready") {
    // Ready Wallet was previously Argent X and may still expose the legacy key.
    return /ready|argent[\s_-]*x/i.test(label);
  }
  if (preferredWallet === "argent") return /argent/i.test(label);
  if (preferredWallet === "braavos") return /braavos/i.test(label);
  return true;
}

function walletPriority(entry) {
  const label = `${entry.key} ${getWalletSourceLabel(entry.wallet, entry.key)}`;
  if (/ready/i.test(label)) return 0;
  if (/argent/i.test(label)) return 1;
  if (/braavos/i.test(label)) return 2;
  if (entry.key === "starknet") return 3;
  return 4;
}
