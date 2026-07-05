import { ChannelEncryptionAdapter, DirectHelperTransport, VeilClient } from "../../packages/veil-sdk/src/index.ts";

export { DirectHelperTransport };

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
      throw new Error("Production messaging requires Privacy Pool-derived encryption before submitting onchain messages.");
    },
    async decryptPayload() {
      return null;
    },
  };
}

function createFailClosedTransport() {
  const error = () => new Error("Connect a Starknet account before submitting or reading production onchain messages.");
  return {
    supportedModes: ["unshield"],
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
  if (channelKeyConfig.channelKeySource === "browser-testnet-fallback") {
    logger.veilLog("warn", "encryption.browser_testnet_fallback.enabled", {
      where: "createClient",
      timelineMode: config.timelineMode,
      helperAddress: config.helperAddress,
      why: "VITE_VEIL_CHANNEL_KEY is not configured, so this browser generated a local direct-helper testnet encryption key.",
      howToFix: "Configure Privacy Pool-derived encryption for Shield mode, or set VITE_VEIL_CHANNEL_KEY when a shared direct-helper testnet key is required.",
    });
    return;
  }

  if (!channelKeyConfig.channelKey) {
    logger.veilLog("warn", "encryption.config.missing", {
      where: "createClient",
      howToFix: "Configure Privacy Pool-derived message encryption in production. VITE_VEIL_CHANNEL_KEY remains a legacy testnet fallback only.",
    });
  }
}
