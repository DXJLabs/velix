import { ChainId } from "starkzap-config";
import { networkLabel, normalizeChainId } from "../../app/runtime-config.js";

export function createNetworkService({
  config,
  state,
  logger,
}) {
  let starknetReadProvider;

  async function loadStarknetSdk() {
    if (window.__veilStarknetSdk) return window.__veilStarknetSdk;
    window.__veilStarknetSdk = await import("https://esm.sh/starknet@7.6.4?target=es2022");
    return window.__veilStarknetSdk;
  }

  async function getStarknetReadProvider() {
    if (starknetReadProvider) return starknetReadProvider;
    const { RpcProvider } = await loadStarknetSdk();
    starknetReadProvider = new RpcProvider({ nodeUrl: config.privyStarknetRpcUrl });
    return starknetReadProvider;
  }

  function getStarkZapChainId() {
    if (config.expectedChainId === "SN_MAIN") return ChainId.MAINNET;
    if (config.expectedChainId === "SN_SEPOLIA") return ChainId.SEPOLIA;
    throw new Error(`Unsupported StarkZap chain id ${config.expectedChainId}.`);
  }

  function expectedNetworkName() {
    const normalized = normalizeChainId(config.expectedChainId);
    if (normalized === "SN_SEPOLIA") return "Starknet Sepolia";
    if (normalized === "SN_MAIN") return "Starknet Mainnet";
    return networkLabel(config.expectedChainId);
  }

  function expectedNetworkStatus() {
    const normalized = normalizeChainId(config.expectedChainId);
    if (normalized === "SN_SEPOLIA") return "Testnet";
    if (normalized === "SN_MAIN") return "Mainnet";
    return "Configured network";
  }

  async function resolveWalletChain(wallet, provider) {
    const candidates = [
      () => provider?.getChainId?.(),
      () => wallet?.getChainId?.(),
      () => wallet?.request?.({ type: "wallet_requestChainId" }),
      () => wallet?.request?.({ type: "wallet_getChainId" }),
      () => provider?.chainId,
      () => wallet?.chainId,
    ];

    for (const candidate of candidates) {
      try {
        const value = await candidate();
        const normalized = normalizeChainId(value);
        if (normalized) return normalized;
      } catch {
        // Try the next wallet/provider shape.
      }
    }

    return "";
  }

  async function ensureExpectedNetwork(wallet, provider) {
    if (config.timelineMode !== "direct-helper-dev") return true;

    const detected = await resolveWalletChain(wallet, provider);
    if (detected) state.walletNetwork = detected;

    if (detected && detected !== config.expectedChainId) return false;

    state.walletNetwork = config.expectedChainId;
    return true;
  }

  async function verifyHelperDeployment({ veilClient, channelId }) {
    if (config.timelineMode !== "direct-helper-dev") return true;
    if (!config.helperAddress) return false;

    try {
      await veilClient.getEventCount(channelId);
      state.helperVerified = true;
      return true;
    } catch (error) {
      logger.veilError("wallet.helper.verify.failed", error, {
        where: "verifyHelperDeployment",
        howToFix: "Confirm VITE_VEIL_CHANNEL_HELPER_ADDRESS is deployed on the configured Starknet RPC/network.",
      });
      state.helperVerified = false;
      return false;
    }
  }

  return {
    getStarknetReadProvider,
    getStarkZapChainId,
    expectedNetworkName,
    expectedNetworkStatus,
    resolveWalletChain,
    ensureExpectedNetwork,
    verifyHelperDeployment,
  };
}
