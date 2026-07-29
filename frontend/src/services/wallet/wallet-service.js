import {
  DirectHelperTransport,
  Strk20WalletApiClient,
  Strk20WalletMessageTransport,
  detectStrk20WalletCapabilities,
} from "../veil-client-service.js";
import { networkLabel } from "../../app/runtime-config.js";
import { createWalletPrivacyCapabilityModel } from "../../domain/privacy-capabilities.js";
import { getInjectedStarknetWallet, getWalletSourceLabel, waitForInjectedStarknetWallet } from "./injected-wallet.js";
import { formatAssetBalance } from "./wallet-format.js";
import { resolveWalletLogin, userFacingWalletError } from "./wallet-login-strategy.js";

export function createWalletService({
  config,
  state,
  logger,
  getVeilClient,
  setVeilClient,
  createClient,
  createEncryptionAdapter,
  getDirectTransport,
  setDirectTransport,
  currentChannelId,
  ensurePrivyMounted = async () => {},
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
  getInjectedWallet = getInjectedStarknetWallet,
  waitForInjectedWallet = waitForInjectedStarknetWallet,
  detectWalletCapabilities = detectStrk20WalletCapabilities,
  createDirectHelperTransport = (options) => new DirectHelperTransport(options),
  createStrk20WalletMessageTransport = (options) => new Strk20WalletMessageTransport(options),
  windowRef = window,
}) {
  let encryptionKeyRegistry;
  let encryptionRegistrationAccount;

  async function readPrivacyPoolRegistration(readProvider, accountAddress) {
    if (!readProvider?.callContract || !config.privacyPoolAddress || !accountAddress) return "unknown";
    try {
      const response = await readProvider.callContract({
        contractAddress: config.privacyPoolAddress,
        entrypoint: "get_public_key",
        calldata: [accountAddress],
      }, "latest");
      const values = Array.isArray(response) ? response : response?.result;
      if (!Array.isArray(values) || values.length !== 1) return "unknown";
      return BigInt(values[0]) === 0n ? "not-registered" : "registered";
    } catch (error) {
      logger.veilError("wallet.privacy.registration.read.failed", error, {
        where: "readPrivacyPoolRegistration",
        howToFix: "Confirm the locked VEIL Privacy Pool and Sepolia RPC are reachable.",
      });
      return "unknown";
    }
  }

  async function refreshPrivacyCapabilities(wallet, account, readProvider) {
    const detected = await detectWalletCapabilities(wallet);
    state.privacyWalletApiVersion = detected.apiVersion || "";
    state.privacyWalletTransport = detected.supported ? "wallet-api" : "standard-wallet";
    state.officialPrivacySignerStatus =
      typeof account?.signer?.signTransaction === "function"
        ? "ready"
        : state.walletSource === "Privy"
          ? "not-integrated"
          : "unavailable";
    state.walletPrivacyCapabilities = createWalletPrivacyCapabilityModel({
      accountConnected: true,
      signing: Boolean(account?.execute || wallet?.request),
      strk20WalletApi: detected.supported,
      registration: detected.registration,
      shield: detected.shield && config.privacyRuntime.screening.capable,
      privateTransfer: detected.privateTransfer,
      customAnonymizerInvocation: detected.customInvoke,
      walletProofManagement: detected.walletProofManagement,
      screeningCapableDeposit: detected.screeningCapableDeposit && config.privacyRuntime.screening.capable,
    });
    state.privateBalances = {};
    state.privacyRegistrationStatus = await readPrivacyPoolRegistration(
      readProvider,
      account?.address || wallet?.account?.address || wallet?.selectedAddress || "",
    );

    if (!detected.supported || !detected.balances) {
      state.privateBalanceStatus = "unsupported";
      return;
    }

    const assets = config.walletAssetConfig.filter((asset) => asset.contractAddress);
    if (!assets.length) {
      state.privateBalanceStatus = "unavailable";
      return;
    }
    try {
      const client = new Strk20WalletApiClient({
        wallet,
        allowedInvokeContracts: [config.helperAddress, config.offerAddress].filter(Boolean),
        ...(detected.apiVersion ? { apiVersion: detected.apiVersion } : {}),
      });
      const balances = await client.balances(assets.map((asset) => asset.contractAddress));
      state.privateBalances = Object.fromEntries(balances.map((balance, index) => {
        const asset = assets[index];
        return [asset.id, { raw: balance.balance, display: formatAssetBalance(balance.balance, asset) }];
      }));
      state.privateBalanceStatus = "total-only";
      if (state.privacyRegistrationStatus === "unknown") {
        state.privacyRegistrationStatus = "registered";
      }
    } catch (error) {
      if (error?.code === "SENDER_NOT_REGISTERED") {
        state.privateBalanceStatus = "unavailable";
        state.privacyRegistrationStatus = "not-registered";
        return;
      }
      state.privateBalanceStatus = "failed";
      logger.veilError("wallet.privacy.discovery.failed", error, {
        where: "refreshPrivacyCapabilities",
        howToFix: "Retry from the wallet after confirming STRK20 Wallet API v0.10.3 support.",
      });
    }
  }

  async function activateMessagingTransport({ wallet, account, readProvider }) {
    const encryptionSetup = await createEncryptionAdapter({
      accountAddress: account?.address || wallet?.selectedAddress || "",
      provider: readProvider,
    });
    const readTransport = createDirectHelperTransport({
      helperAddress: config.helperAddress,
      account,
      ...(readProvider ? { provider: readProvider } : {}),
      storePayloadChunks: config.onchainPayloads,
      channelIdEncoder: async (channelId) => {
        if (typeof encryptionSetup.adapter?.deriveConversationTag !== "function") {
          throw Object.assign(
            new Error("An opaque conversation tag cannot be derived until channel encryption setup is complete."),
            { code: "CONVERSATION_TAG_UNAVAILABLE" },
          );
        }
        return encryptionSetup.adapter.deriveConversationTag(channelId);
      },
    });

    const walletApiAvailable = Boolean(
      state.walletPrivacyCapabilities?.capabilities?.strk20WalletApi
      && state.walletPrivacyCapabilities?.capabilities?.customAnonymizerInvocation,
    );
    const shielded = state.walletSource === "Ready" && walletApiAvailable;
    const activeTransport = shielded
      ? createStrk20WalletMessageTransport({
          walletApiClient: new Strk20WalletApiClient({
            wallet,
            allowedInvokeContracts: [config.helperAddress],
            ...(state.privacyWalletApiVersion
              ? { apiVersion: state.privacyWalletApiVersion }
              : {}),
          }),
          helperAddress: config.helperAddress,
          readTransport,
          ...(readProvider ? { provider: readProvider } : {}),
          onTransactionSubmitted: handleTransactionSubmitted,
        })
      : readTransport;

    encryptionKeyRegistry = encryptionSetup.registry;
    encryptionRegistrationAccount = account;
    setDirectTransport(activeTransport);
    setVeilClient(createClient(activeTransport, encryptionSetup.adapter));
    return { shielded };
  }

  function getWallet() {
    return state.privyAccount
      || windowRef.veilDemoWallet
      || getInjectedWallet(windowRef)
      || null;
  }

  async function connectWallet(options = {}) {
    const goToInbox = options.goToInbox ?? state.screen === "unlock";
    const preferPrivacyWallet = options.preferPrivacyWallet === true;
    const traceId = logger.createTraceId(preferPrivacyWallet ? "ready-connect" : "wallet-connect");
    logger.tracePrivyStarkZap(traceId, "connect.start", {
      where: "connectWallet",
      timelineMode: config.timelineMode,
      goToInbox,
      screen: state.screen,
      privyAppIdConfigured: Boolean(config.privyAppId),
    });
    beginWalletInitialization(traceId);

    try {
    if (preferPrivacyWallet) {
      const {
        injectedWalletEntry,
        injectedWallet,
      } = await resolveWalletLogin({
        config,
        traceId,
        logger,
        ensurePrivyMounted,
        ensurePrivyAuthenticated,
        createPrivyStarknetAccount,
        waitForInjectedWallet,
        updateWalletInitialization,
        windowRef,
        preferredInjectedWallet: "ready",
      });

      const wallet = injectedWallet;
      if (!wallet) {
        return failWalletInitialization(new Error("Ready Wallet extension was not detected."), traceId, {
          where: "connectWallet",
          howToFix: "Install or unlock Ready Wallet, select Starknet Sepolia, and retry.",
        });
      }

      if (!wallet.account && typeof wallet.enable === "function") await wallet.enable();
      const account = wallet.account || wallet;
      const walletProvider = wallet.provider || wallet.account?.provider;
      const readProvider = await getStarknetReadProvider().catch((error) => {
        logger.veilError("wallet.rpc.provider.failed", error, {
          where: "connectWallet",
          howToFix: "Set VITE_PRIVY_STARKNET_RPC_URL or VITE_STARKNET_RPC_URL to a reachable Starknet Sepolia RPC.",
        });
        return walletProvider;
      });

      if (typeof wallet.request !== "function") {
        return failWalletInitialization(new Error("Ready Wallet does not expose the Starknet Wallet API request transport."), traceId, {
          where: "connectWallet",
          howToFix: "Update Ready Wallet, unlock it, approve the connection, and retry.",
        });
      }
      if (!walletProvider) {
        return failWalletInitialization(new Error("Ready Wallet did not expose a Starknet provider."), traceId, {
          where: "connectWallet",
          howToFix: "Unlock Ready Wallet, switch to Starknet Sepolia, and reconnect.",
        });
      }

      const isExpectedNetwork = await ensureExpectedNetwork(wallet, walletProvider);
      if (!isExpectedNetwork) {
        return failWalletInitialization(new Error(`Ready Wallet is not connected to ${networkLabel(config.expectedChainId)}.`), traceId, {
          where: "connectWallet",
          howToFix: `Switch Ready Wallet to ${networkLabel(config.expectedChainId)} and retry.`,
        });
      }

      state.privyAccount = null;
      state.privyProvider = null;
      state.privyWallet = null;
      state.readyWallet = wallet;
      state.readyAccount = account;
      state.readyProvider = walletProvider;
      state.readyReadProvider = readProvider;
      state.walletSource = getWalletSourceLabel(injectedWallet, injectedWalletEntry?.key);
      await refreshPrivacyCapabilities(wallet, account, readProvider);
      const messaging = await activateMessagingTransport({ wallet, account, readProvider });
      if (!messaging.shielded) {
        return failWalletInitialization(new Error("Ready Wallet does not expose the STRK20 custom invoke capability required for private messages."), traceId, {
          where: "connectWallet",
          howToFix: "Use a Ready Wallet build that supports STRK20 Wallet API invoke actions.",
        });
      }
      if (!(await verifyHelperDeployment({ veilClient: getVeilClient(), channelId: currentChannelId() }))) {
        return failWalletInitialization(new Error("VeilChannelHelper verification failed on the configured Sepolia RPC."), traceId, {
          where: "connectWallet",
          howToFix: "Confirm the locked VEIL helper address and Starknet Sepolia RPC.",
        });
      }

      state.walletConnected = true;
      state.walletAddress = account.address || wallet.selectedAddress || "";
      state.walletNetwork = config.expectedChainId;
      completeWalletInitialization(traceId);
      logger.tracePrivyStarkZap(traceId, "connect.success", {
        where: "connectWallet",
        walletSource: state.walletSource,
        walletAddress: state.walletAddress,
        directHelper: false,
        shieldedMessaging: true,
        network: state.walletNetwork,
      });
      return true;
    }

    if (config.timelineMode !== "encrypted-direct") {
      if (config.privyAppId) {
        try {
          await ensurePrivyMounted();
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

    const {
      injectedWalletEntry,
      injectedWallet,
      privyAccountContext,
    } = await resolveWalletLogin({
      config,
      traceId,
      logger,
      ensurePrivyMounted,
      ensurePrivyAuthenticated,
      createPrivyStarknetAccount,
      waitForInjectedWallet,
      updateWalletInitialization,
      windowRef,
      preferredInjectedWallet: preferPrivacyWallet ? "ready" : "",
    });

    const wallet = privyAccountContext?.account || injectedWallet || getWallet();
    if (!wallet) {
      return failWalletInitialization(new Error("No supported wallet login is configured."), traceId, {
        where: "connectWallet",
        howToFix: config.privyAppId
          ? "Check the Privy App ID, allowed origin, OAuth settings, or connect Argent/Braavos on desktop."
          : "Set the public Privy App ID or install/connect Argent or Braavos on desktop.",
      });
    }

    if (!wallet.account && typeof wallet.enable === "function") await wallet.enable();

    const account = wallet.account || wallet;
    if (injectedWallet) {
      state.privyAccount = null;
      state.privyProvider = null;
      state.privyWallet = null;
      state.walletSource = getWalletSourceLabel(injectedWallet, injectedWalletEntry?.key);
    } else if (privyAccountContext) {
      state.walletSource = "Privy";
    }
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

    if (state.walletSource === "Ready") {
      state.readyWallet = injectedWallet || wallet;
      state.readyAccount = account;
      state.readyProvider = walletProvider;
      state.readyReadProvider = readProvider;
    }
    await refreshPrivacyCapabilities(wallet, account, readProvider);

    const messaging = await activateMessagingTransport({ wallet, account, readProvider });
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
      directHelper: !messaging.shielded,
      shieldedMessaging: messaging.shielded,
      network: state.walletNetwork,
    });
    return true;
    } catch (error) {
      return failWalletInitialization(userFacingWalletError(error), traceId, {
        where: "connectWallet",
        howToFix: "Check the displayed wallet error, Privy allowed origin/OAuth settings, Starknet network, and browser wallet approval.",
      });
    }
  }

  return {
    connectWallet,
    getWallet,
    async registerEncryptionKey() {
      if (!encryptionKeyRegistry || !encryptionRegistrationAccount) {
        throw Object.assign(new Error("Encryption key registry is not configured."), {
          code: "ENCRYPTION_KEY_REGISTRY_UNAVAILABLE",
        });
      }
      return encryptionKeyRegistry.registerCurrentUserKey(encryptionRegistrationAccount);
    },
    hasDirectTransport: () => Boolean(getDirectTransport()),
  };
}
