export function resolveChannelKeyConfig({ configuredChannelKey, timelineMode, helperAddress }, logger) {
  const browserFallbackChannelKey = !configuredChannelKey && timelineMode === "direct-helper"
    ? readOrCreateBrowserFallbackChannelKey(helperAddress, logger)
    : "";
  const channelKey = configuredChannelKey || browserFallbackChannelKey;
  return {
    channelKey,
    channelKeySource: configuredChannelKey ? "env" : browserFallbackChannelKey ? "browser-testnet-fallback" : "missing",
    channelKeyId: configuredChannelKey ? "veil-env-channel" : browserFallbackChannelKey ? "veil-browser-testnet-channel" : undefined,
  };
}

function readOrCreateBrowserFallbackChannelKey(helperAddress, logger) {
  if (!globalThis.crypto?.getRandomValues) return "";

  const storageKey = `veil:direct-helper:channel-key:${helperAddress || "default"}:v1`;
  try {
    const storage = window.localStorage;
    const existing = storage.getItem(storageKey);
    if (/^0x[0-9a-fA-F]{64}$/.test(existing || "")) return existing;

    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    const generated = `0x${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    storage.setItem(storageKey, generated);
    return generated;
  } catch (error) {
    logger.veilLog("warn", "encryption.browser_testnet_fallback.failed", {
      where: "readOrCreateBrowserFallbackChannelKey",
      why: error?.message || String(error),
      howToFix: "Enable browser storage or configure VITE_VEIL_CHANNEL_KEY for direct-helper testnet messaging.",
    });
    return "";
  }
}
