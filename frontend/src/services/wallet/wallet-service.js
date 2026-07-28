import {
  DirectHelperTransport,
  Strk20WalletApiClient,
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
    state.officialPrivacySignerStatus = detected.supported
      ? "wallet-managed"
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

    await refreshPrivacyCapabilities(wallet, account, readProvider);

    const encryptionSetup = await createEncryptionAdapter({
      accountAddress: account.address,
      provider: readProvider,
    });
    const directTransport = createDirectHelperTransport({
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
      onTransactionSubmitted: handleTransactionSubmitted,
    });
    encryptionKeyRegistry = encryptionSetup.registry;
    encryptionRegistrationAccount = account;
    setDirectTransport(directTransport);
    setVeilClient(createClient(directTransport, encryptionSetup.adapter));
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
