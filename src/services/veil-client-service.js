import {
  ChannelEncryptionAdapter,
  DirectHelperTransport,
  VeilClient,
  createVeilOnchainContracts,
} from "../../packages/veil-sdk/src/index.ts";

export { DirectHelperTransport, createVeilOnchainContracts };

export function createVeilClientFactory({
  config,
  channelKeyConfig,
  logger,
}) {
  let encryptionConfigWarningShown = false;

  function createClient(transport) {
    const encryption = channelKeyConfig.channelKey
      ? new ChannelEncryptionAdapter({
          channelKey: channelKeyConfig.channelKey,
          keyId: channelKeyConfig.channelKeyId,
        })
      : config.timelineMode === "mock"
        ? undefined
        : createFailClosedEncryptionAdapter();
    const activeTransport = transport || (config.timelineMode === "mock" ? undefined : createFailClosedTransport());

    if (config.timelineMode !== "mock" && !encryptionConfigWarningShown) {
      encryptionConfigWarningShown = true;
      emitEncryptionWarning(config, channelKeyConfig, logger);
    }

    return new VeilClient({
      privacyPoolAddress: config.privacyPoolAddress,
      helperAddress: config.helperAddress || "mock-veil-helper",
      rpcUrl: config.rpcUrl,
      ...(encryption ? { encryption } : {}),
      ...(activeTransport ? { transport: activeTransport } : {}),
      allowMock: config.timelineMode === "mock",
    });
  }

  return { createClient };
}

function createFailClosedEncryptionAdapter() {
  return {
    async encryptPayload() {
      throw new Error(
        "Encrypted On-chain messaging requires channel key material shared by the intended participants.",
      );
    },
    async decryptPayload() {
      return null;
    },
  };
}

function createFailClosedTransport() {
  const error = () => Object.assign(
    new Error("Shielded messaging via STRK20 is coming soon."),
    { code: "STRK20_RUNTIME_UNAVAILABLE" },
  );
  return {
    supportedModes: [],
    async invokeExternal() {
      throw error();
    },
    async getEventCount() {
      throw error();
    },
    async getEvent() {
      throw error();
    },
    async getTimeline() {
      throw error();
    },
  };
}

function emitEncryptionWarning(config, channelKeyConfig, logger) {
  if (channelKeyConfig.channelKeySource === "legacy-env-ignored") {
    logger.veilLog("warn", "encryption.legacy_env_channel_key.ignored", {
      where: "createClient",
      timelineMode: config.timelineMode,
      helperAddress: config.helperAddress,
      why: "A configured VITE_VEIL_CHANNEL_KEY was ignored because static keys are not real Privacy Pool channel material.",
      howToFix: "Use Privacy Pool EncChannelInfo/channel_key recovery before enabling production shielded messaging.",
    });
    return;
  }

  if (!channelKeyConfig.channelKey) {
    logger.veilLog("warn", "encryption.config.missing", {
      where: "createClient",
      howToFix: "Complete encrypted channel bootstrap before submitting Encrypted On-chain messages.",
    });
  }
}
