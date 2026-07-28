export function getWalletSourceLabel(wallet, key = "") {
  const name = wallet?.name || wallet?.id || wallet?.metadata?.name || "";
  const label = `${key} ${name}`;
  if (/ready/i.test(label)) return "Ready";
  if (/argent/i.test(label)) return "Argent";
  if (/braavos/i.test(label)) return "Braavos";
  return name || "Starknet wallet";
}

export function getInjectedStarknetWallet(windowRef = window) {
  return getInjectedStarknetWalletEntry(windowRef)?.wallet || null;
}

export function isMobileBrowser(windowRef = window) {
  if (typeof windowRef.navigator?.userAgentData?.mobile === "boolean") {
    return windowRef.navigator.userAgentData.mobile;
  }
  return /Android|iPhone|iPad|iPod|Mobile/i.test(windowRef.navigator?.userAgent || "");
}

export function shouldWaitForInjectedStarknetWallet(windowRef = window) {
  return Boolean(getInjectedStarknetWalletEntry(windowRef)) || !isMobileBrowser(windowRef);
}

export async function waitForInjectedStarknetWallet(options = {}) {
  const normalizedOptions = typeof options === "number" ? { timeout: options } : options;
  const {
    timeout = 2_000,
    windowRef = window,
  } = normalizedOptions;
  const existing = getInjectedStarknetWalletEntry(windowRef);
  if (existing) return existing;
  if (!shouldWaitForInjectedStarknetWallet(windowRef)) return null;

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const entry = getInjectedStarknetWalletEntry(windowRef);
    if (entry) return entry;
  }

  return null;
}

export function getInjectedStarknetWalletEntry(windowRef = window) {
  const keys = [
    "starknet_argentX",
    "starknet_ready",
    "starknet_readyX",
    "starknet_argent",
    "starknet",
    "starknet_braavos",
  ];

  const discoveredKeys = Object.getOwnPropertyNames(windowRef)
    .filter((key) => /^starknet/i.test(key) && !keys.includes(key));

  return [...keys, ...discoveredKeys]
    .map((key) => ({ key, wallet: getWindowValue(windowRef, key) }))
    .filter((entry) => isInjectedStarknetWallet(entry.wallet))
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

function walletPriority(entry) {
  const label = `${entry.key} ${getWalletSourceLabel(entry.wallet, entry.key)}`;
  if (/argent|ready/i.test(label)) return 0;
  if (/braavos/i.test(label)) return 1;
  if (entry.key === "starknet") return 2;
  return 3;
}
