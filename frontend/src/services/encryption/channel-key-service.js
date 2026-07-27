export function resolveChannelKeyConfig({ configuredChannelKey, timelineMode, helperAddress }, logger) {
  if (configuredChannelKey) {
    logger.veilLog("warn", "encryption.legacy_env_channel_key.ignored", {
      where: "resolveChannelKeyConfig",
      timelineMode,
      helperAddress,
      why: "VITE_VEIL_CHANNEL_KEY is a legacy static key and is not Privacy Pool-derived channel material.",
      howToFix: "Resolve participant public keys and derive channel material locally with Stark-curve ECDH.",
    });
  }

  return {
    channelKeySource: configuredChannelKey ? "legacy-env-ignored" : "missing",
  };
}
