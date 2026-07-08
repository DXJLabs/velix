import { DirectHelperTransport } from "../veil-client-service.js";
import { networkLabel } from "../../app/runtime-config.js";
import { getInjectedStarknetWallet, getWalletSourceLabel, waitForInjectedStarknetWallet } from "./injected-wallet.js";

export function createWalletService({
  config,
  state,
  logger,
  getVeilClient,
  setVeilClient,
  createClient,
  createOnchainContracts,
  getDirectTransport,
  setDirectTransport,
  setOnchainContracts,
  currentChannelId,
  ensurePrivyAuthenticated,
  fetchPrivyStarknetWallet,
  createPrivyStarknetAccount,
  getStarknetReadProvider,
  ensureExpectedNetwork,
  verifyHelperDeployment,
  beginWalletInitialization,
  updateWalletInitialization,
  completeWalletInitialization,
  failWalletInitialization,
  handleTransactionSubmitted,
}) {
  function getWallet() {
    return state.privyAccount
      || window.veilDemoWallet
      || getInjectedStarknetWallet()
      || null;
  }

  async function connectWallet(options = {}) {
    const goToInbox = options.goToInbox ?? state.screen === "unlock";
    const traceId = logger.createTraceId("wallet-connect");
    logger.tracePrivyStarkZap(traceId, "connect.start", {
      where: "connectWallet",
      timelineMode: config.timelineMode,
      goToInbox,
      screen: state.screen,
      privyAppIdConfigured: Boolean(config.privyAppId),
    });
    beginWalletInitialization(traceId);

    if (config.timelineMode !== "direct-helper") {
      if (config.privyAppId) {
        try {
          const bridge = await ensurePrivyAuthenticated(traceId);
          if (!bridge) {
            return failWalletInitialization(new Error("Privy authentication did not complete."), traceId, {
              where: "connectWallet",
              howToFix: "Check earlier trace steps for privy_ready.timeout or authenticated.timeout.",
            });
          }
          updateWalletInitialization("creating_account", traceId, {
            message: "Creating Starknet Account",
          });
          await fetchPrivyStarknetWallet(bridge, traceId);
        } catch (error) {
          logger.veilError("wallet.privy.setup.failed", error, {
            traceId,
            where: "connectWallet",
            howToFix: "Check Privy app credentials, token verification env vars, and /api/wallet/starknet logs.",
          });
          return failWalletInitialization(error, traceId, {
            where: "connectWallet",
            howToFix: "Check Privy app credentials, token verification env vars, and /api/wallet/starknet logs.",
          });
        }
      }
      state.walletConnected = true;
      state.walletNetwork = config.expectedChainId;
      completeWalletInitialization(traceId);
      return true;
    }

    if (!config.helperAddress) {
      return failWalletInitialization(new Error("Wallet helper address is not configured."), traceId, {
        where: "connectWallet",
        howToFix: "Set VITE_VEIL_CHANNEL_HELPER_ADDRESS to the deployed helper contract for the selected Starknet network.",
      });
    }

    let injectedWalletEntry = null;
    let injectedWallet = null;
    let privyAccountContext = null;
    if (config.privyAppId) {
      try {
        const bridge = await ensurePrivyAuthenticated(traceId);
        if (!bridge) {
          return failWalletInitialization(new Error("Privy authentication did not complete."), traceId, {
            where: "connectWallet",
            howToFix: "Check earlier trace steps for privy_ready.timeout or authenticated.timeout.",
          });
        }
        updateWalletInitialization("creating_account", traceId, {
          message: "Creating Starknet Account",
        });
        privyAccountContext = await createPrivyStarknetAccount(bridge, traceId);
      } catch (error) {
        logger.veilError("starkzap.privy.onboard.failed", error, {
          traceId,
          where: "connectWallet",
          howToFix: "Fund the counterfactual account if user-pays deployment is required, verify /api/wallet/sign, and confirm the RPC matches VITE_STARKNET_CHAIN_ID.",
        });
        injectedWalletEntry = await waitForInjectedStarknetWallet();
        injectedWallet = injectedWalletEntry?.wallet || null;
        if (!injectedWallet) {
          return failWalletInitialization(error, traceId, {
            where: "connectWallet",
            howToFix: "Check StarkZap/Privy logs for sdk.onboard(), AVNU Paymaster sponsorship, /api/wallet/sign, and RPC errors.",
          });
        }
        logger.veilLog("warn", "wallet.init.injected_fallback.used", {
          traceId,
          where: "connectWallet",
          source: getWalletSourceLabel(injectedWallet, injectedWalletEntry?.key),
          why: "Privy StarkZap onboarding failed, but an injected Starknet wallet was available.",
        });
      }
    }

    if (!privyAccountContext && !injectedWallet) {
      injectedWalletEntry = await waitForInjectedStarknetWallet();
      injectedWallet = injectedWalletEntry?.wallet || null;
    }

    const wallet = privyAccountContext?.account || injectedWallet || getWallet();
    if (!wallet) {
      return failWalletInitialization(new Error("No Privy Starknet account or injected Starknet wallet was available."), traceId, {
        where: "connectWallet",
        howToFix: "Check prior Privy trace steps, or install/connect an injected Starknet wallet as fallback.",
      });
    }

    if (!wallet.account && typeof wallet.enable === "function") await wallet.enable();

    const account = wallet.account || wallet;
    const walletProvider = privyAccountContext?.provider || state.privyProvider || wallet.provider || wallet.account?.provider;
    const readProvider = await getStarknetReadProvider().catch((error) => {
      logger.veilError("wallet.rpc.provider.failed", error, {
        where: "connectWallet",
        howToFix: "Set VITE_PRIVY_STARKNET_RPC_URL or VITE_STARKNET_RPC_URL to a reachable Starknet RPC for the selected chain.",
      });
      return walletProvider;
    });
    if (!account?.execute) {
      return failWalletInitialization(new Error("Selected wallet account does not expose execute()."), traceId, {
        where: "connectWallet",
        howToFix: "Check StarkZap onboard result account shape or connect a Starknet wallet that supports account.execute().",
      });
    }
    if (!walletProvider) {
      return failWalletInitialization(new Error("No Starknet provider was available from Privy/StarkZap or injected wallet."), traceId, {
        where: "connectWallet",
        howToFix: "Check sdk.onboard() result and VITE_PRIVY_STARKNET_RPC_URL.",
      });
    }

    const isExpectedNetwork = await ensureExpectedNetwork(wallet, walletProvider);
    if (!isExpectedNetwork) {
      return failWalletInitialization(new Error(`Wallet/provider is not connected to ${networkLabel(config.expectedChainId)}.`), traceId, {
        where: "connectWallet",
        howToFix: `Switch wallet/provider to ${networkLabel(config.expectedChainId)} or update VITE_STARKNET_CHAIN_ID.`,
      });
    }

    const directTransport = new DirectHelperTransport({
      helperAddress: config.helperAddress,
      account,
      ...(readProvider ? { provider: readProvider } : {}),
      storePayloadChunks: config.onchainPayloads,
      onTransactionSubmitted: handleTransactionSubmitted,
    });
    setDirectTransport(directTransport);
    setVeilClient(createClient(directTransport));
    setOnchainContracts(createOnchainContracts({
      account,
      provider: readProvider,
    }));

    if (!(await verifyHelperDeployment({ veilClient: getVeilClient(), channelId: currentChannelId() }))) {
      return failWalletInitialization(new Error("Helper contract verification failed on the configured RPC/network."), traceId, {
        where: "connectWallet",
        howToFix: "Confirm VITE_VEIL_CHANNEL_HELPER_ADDRESS is deployed on VITE_PRIVY_STARKNET_RPC_URL / VITE_STARKNET_RPC_URL.",
      });
    }

    state.walletConnected = true;
    state.walletAddress = account.address || state.privyWallet?.address || state.walletAddress;
    if (injectedWallet) state.walletSource = getWalletSourceLabel(injectedWallet, injectedWalletEntry?.key);
    completeWalletInitialization(traceId);
    logger.tracePrivyStarkZap(traceId, "connect.success", {
      where: "connectWallet",
      walletSource: state.walletSource,
      walletAddress: state.walletAddress,
      directHelper: true,
      network: state.walletNetwork,
    });
    return true;
  }

  return {
    connectWallet,
    getWallet,
    hasDirectTransport: () => Boolean(getDirectTransport()),
  };
}
