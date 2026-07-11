export function resolveChannelKeyConfig({ configuredChannelKey, timelineMode, helperAddress }, logger) {
  if (configuredChannelKey) {
    logger.veilLog("warn", "encryption.legacy_env_channel_key.ignored", {
      where: "resolveChannelKeyConfig",
      timelineMode,
      helperAddress,
      why: "VITE_VEIL_CHANNEL_KEY is a legacy static key and is not Privacy Pool-derived channel material.",
      howToFix: "Bootstrap channel material through Privacy Pool Stark ECDH before enabling production shielded messaging.",
    });
  }

  return {
    channelKey: "",
    channelKeySource: configuredChannelKey ? "legacy-env-ignored" : "missing",
    channelKeyId: undefined,
  };
}
