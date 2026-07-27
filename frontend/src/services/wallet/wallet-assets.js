import { createDefaultWalletAssetBalances } from "../../state/app-store.js";
import { formatAssetBalance, parseU256Balance } from "./wallet-format.js";

export function createWalletAssetsService({
  state,
  config,
  logger,
  walletAddressValue,
  getStarknetReadProvider,
  onStateChanged = () => {},
}) {
  async function readWalletTokenBalance(provider, asset, walletAddress) {
    const response = await provider.callContract({
      contractAddress: asset.contractAddress,
      entrypoint: "balance_of",
      calldata: [walletAddress],
    });
    return parseU256Balance(response);
  }

  async function refreshWalletAssets(options = {}) {
    const walletAddress = walletAddressValue();
    const configuredAssets = config.walletAssetConfig.filter((asset) => asset.contractAddress);
    if (!state.walletConnected || !walletAddress) {
      state.walletAssetBalances = createDefaultWalletAssetBalances(config.walletAssetConfig);
      state.walletAssetSyncKey = "";
      state.walletAssetSyncStatus = "idle";
      onStateChanged();
      return;
    }

    if (!configuredAssets.length) {
      onStateChanged();
      return;
    }

    const syncKey = [
      walletAddress,
      config.expectedChainId,
      ...configuredAssets.map((asset) => `${asset.id}:${asset.contractAddress}`),
    ].join(":");
    if (!options.force && state.walletAssetSyncKey === syncKey && ["loading", "ready"].includes(state.walletAssetSyncStatus)) {
      return;
    }

    state.walletAssetSyncKey = syncKey;
    state.walletAssetSyncStatus = "loading";
    configuredAssets.forEach((asset) => {
      state.walletAssetBalances[asset.id] = { display: "Syncing", status: "loading" };
    });
    onStateChanged();

    let results;
    try {
      const provider = await getStarknetReadProvider();
      results = await Promise.allSettled(
        configuredAssets.map(async (asset) => {
          const balance = await readWalletTokenBalance(provider, asset, walletAddress);
          return { asset, display: formatAssetBalance(balance, asset) };
        }),
      );
    } catch (error) {
      configuredAssets.forEach((asset) => {
        state.walletAssetBalances[asset.id] = { display: asset.defaultDisplay, status: "error" };
      });
      state.walletAssetSyncStatus = "failed";
      logger.veilError("wallet.asset.sync.failed", error, {
        where: "refreshWalletAssets",
        howToFix: "Check Starknet RPC availability before relying on live wallet asset balances.",
      });
      onStateChanged();
      return;
    }

    results.forEach((result, index) => {
      const asset = configuredAssets[index];
      if (result.status === "fulfilled") {
        state.walletAssetBalances[asset.id] = { display: result.value.display, status: "ready" };
        return;
      }
      state.walletAssetBalances[asset.id] = { display: asset.defaultDisplay, status: "error" };
      logger.veilError("wallet.asset.balance.failed", result.reason, {
        where: "refreshWalletAssets",
        asset: asset.symbol,
        tokenAddress: asset.contractAddress,
        howToFix: "Check the token contract address and RPC before relying on live wallet asset balances.",
      });
    });
    state.walletAssetSyncStatus = results.some((result) => result.status === "fulfilled") ? "ready" : "failed";
    onStateChanged();
  }

  return { refreshWalletAssets };
}
