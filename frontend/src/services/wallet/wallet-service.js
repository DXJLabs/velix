import {
  DirectHelperTransport,
  Strk20WalletApiClient,
  Strk20WalletMessageTransport,
  detectStrk20WalletCapabilities,
  strk20DepositAction,
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
    return windowRef.veilDemoWallet
      || getInjectedWallet(windowRef)
      || null;
  }

  async function connectWallet(options = {}) {
    const goToInbox = options.goToInbox ?? state.screen === "unlock";
    const traceId = logger.createTraceId("ready-connect");
    logger.traceWalletConnect(traceId, "connect.start", {
      where: "connectWallet",
      privacyWalletAudit: true,
      goToInbox,
      screen: state.screen,
    });
    beginWalletInitialization(traceId);

    try {
    const {
      injectedWalletEntry,
      injectedWallet,
    } = await resolveWalletLogin({
      config,
      traceId,
      logger,
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
        howToFix: "Set VITE_STARKNET_READ_RPC_URL or VITE_STARKNET_RPC_URL to a reachable Starknet Sepolia RPC.",
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
    logger.traceWalletConnect(traceId, "connect.success", {
      where: "connectWallet",
      walletSource: state.walletSource,
      walletAddress: state.walletAddress,
      directHelper: false,
      shieldedMessaging: true,
      network: state.walletNetwork,
    });
    return true;
    } catch (error) {
      return failWalletInitialization(userFacingWalletError(error), traceId, {
        where: "connectWallet",
        howToFix: "Check the displayed wallet error and Starknet network/browser wallet approval.",
      });
    }
  }

  // Shield: move a public ERC-20 balance into the STRK20 privacy pool.
  //
  // This is deliberately its OWN wallet call, never bundled with a transfer.
  // A deposit is a public leg that names the depositor on-chain — bundling it
  // with a subsequent private transfer would let an observer correlate the
  // two ends of the transfer, defeating the point of shielding. Unlinkability
  // comes from shielding earlier, as a separate transaction; see
  // STRK20_INTEGRATION_PLAN.md and buildPrivateTipActions-style guidance.
  //
  // The wallet holds the keys, finds/creates the note, proves, and submits —
  // this app never touches a viewing key or proof. Freshly shielded funds are
  // not immediately spendable (~10 blocks); callers should reflect that in
  // the UI rather than immediately offering a private transfer.
  async function shieldTokens({ tokenAddress, amount }) {
    if (typeof tokenAddress !== "string" || !tokenAddress) {
      throw new Error("shieldTokens requires a tokenAddress.");
    }
    if (typeof amount !== "bigint" || amount <= 0n) {
      throw new Error("shieldTokens requires a positive bigint amount.");
    }
    const wallet = getWallet();
    if (!wallet) {
      throw Object.assign(new Error("Connect Ready Wallet before shielding funds."), {
        code: "WALLET_NOT_CONNECTED",
      });
    }
    const detected = await detectWalletCapabilities(wallet);
    if (!detected.supported) {
      throw Object.assign(new Error("This wallet does not support the STRK20 Wallet API."), {
        code: "PRIVACY_WALLET_UNSUPPORTED",
      });
    }
    const traceId = logger.createTraceId("shield-tokens");
    logger.traceWalletConnect(traceId, "shield.start", {
      where: "shieldTokens",
    });
    const client = new Strk20WalletApiClient({
      wallet,
      allowedInvokeContracts: [config.helperAddress, config.offerAddress].filter(Boolean),
      ...(detected.apiVersion ? { apiVersion: detected.apiVersion } : {}),
    });
    try {
      const transactionHash = await client.invoke([
        strk20DepositAction(tokenAddress, amount),
      ]);
      logger.traceWalletConnect(traceId, "shield.success", {
        where: "shieldTokens",
      });
      return { transactionHash };
    } catch (error) {
      logger.veilError("wallet.shield.failed", error, {
        where: "shieldTokens",
        howToFix: "Confirm the token allowance, Sepolia network, and Ready Wallet approval, then retry.",
      });
      throw error;
    }
  }

  return {
    connectWallet,
    getWallet,
    shieldTokens,
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
