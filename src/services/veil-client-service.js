import {
  BrowserEncryptionIdentityStore,
  DirectEcdhEncryptionAdapter,
  DirectHelperTransport,
  EncryptionPublicKeyRegistryService,
  VeilEncryptionIdentityService,
  VeilClient,
  createVeilOnchainContracts,
  detectStrk20WalletCapabilities,
  Strk20WalletApiClient,
} from "../../packages/veil-sdk/src/index.ts";

export {
  BrowserEncryptionIdentityStore,
  DirectEcdhEncryptionAdapter,
  DirectHelperTransport,
  EncryptionPublicKeyRegistryService,
  VeilEncryptionIdentityService,
  detectStrk20WalletCapabilities,
  Strk20WalletApiClient,
  createVeilOnchainContracts,
};

export function createVeilClientFactory({
  config,
  channelKeyConfig,
  logger,
}) {
  let encryptionConfigWarningShown = false;

  function createClient(transport, encryptionOverride) {
    const encryption = encryptionOverride || (config.timelineMode === "mock"
        ? undefined
        : createFailClosedEncryptionAdapter());
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
        "Direct encrypted messaging requires channel key material shared by the intended participants.",
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
      howToFix: "Resolve participant public keys and derive channel material locally with Stark-curve ECDH.",
    });
    return;
  }

  if (channelKeyConfig.channelKeySource === "missing") {
    logger.veilLog("warn", "encryption.config.missing", {
      where: "createClient",
      howToFix: "Complete encrypted channel bootstrap before submitting Direct encrypted messages.",
    });
  }
}
