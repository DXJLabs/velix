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

  const entries = [...keys, ...discoveredKeys]
    .map((key) => ({ key, wallet: getWindowValue(windowRef, key) }))
    .filter((entry) => isInjectedStarknetWallet(entry.wallet));

  const preferredEntries = preferredWallet
    ? entries.filter((entry) => walletMatchesPreference(entry, preferredWallet))
    : entries;

  return preferredEntries
    .sort((first, second) => walletPriority(first) - walletPriority(second))[0] || null;
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
