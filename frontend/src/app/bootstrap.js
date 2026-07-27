import { createRuntimeConfig, WALLET_INIT_TIMEOUT_MS } from "./runtime-config.js";
import { getAppDom, setElementText, setLucideIcon } from "./dom.js";
import { createRouter } from "./router.js";
import { createFeatureRegistry } from "./feature-registry.js";
import { registerAppLifecycle } from "./lifecycle.js";
import { buildRuntimeApi } from "./runtime-api.js";
import { initApp } from "./init.js";
import { createAppStore, createDefaultWalletAssetBalances } from "../state/app-store.js";
import { knownVeilCounterparties } from "../state/demo-data.js";
import { createBootstrapData } from "../state/bootstrap-data.js";
import { createVeilLogger } from "../services/logging/log-service.js";
import { resolveChannelKeyConfig } from "../services/encryption/channel-key-service.js";
import {
  BrowserEncryptionIdentityStore,
  DirectEcdhEncryptionAdapter,
  EncryptionPublicKeyRegistryService,
  VeilEncryptionIdentityService,
  createVeilClientFactory,
} from "../services/veil-client-service.js";
import { createDealStorage } from "../services/storage/deal-storage.js";
import { readJsonStorage, writeJsonStorage } from "../services/storage-service.js";
import { createPrivyBridgeAdapter, getPrivyBridge } from "../services/wallet/privy-bridge.js";
import { createPrivyWalletApi } from "../services/wallet/privy-wallet-api.js";
import { createNetworkService } from "../services/wallet/network-service.js";
import { createStarkZapAdapter } from "../services/wallet/starkzap-adapter.js";
import { createWalletAssetsService } from "../services/wallet/wallet-assets.js";
import { createWalletInitialization } from "../features/wallet/wallet-initialization.js";
import { createWalletService } from "../services/wallet/wallet-service.js";
import { shortAddress } from "../services/wallet/wallet-format.js";
import { createTransactionSubmitService } from "../features/transactions/transaction-submit-flow.js";
import { createHomeUi } from "../ui/home/home-ui.js";
import { createChainMetaUi } from "../ui/timeline/chain-meta-ui.js";
import { createToastUi } from "../ui/toast-ui.js";
import { createConnectLabelsUi } from "../ui/wallet/connect-labels-ui.js";
import { mountPrivyBridge } from "../ui/wallet/privy-auth-root.js";
import { demoTxHash } from "../utils/hash.js";
import { transactionExplorerUrl } from "../utils/transactions.js";

export function bootstrapVeilApp({ env = import.meta.env, documentRef = document, windowRef = window } = {}) {
  const config = createRuntimeConfig(env, windowRef.location.search);
  const logger = createVeilLogger({ debugLogsEnabled: config.debugLogsEnabled, dev: env.DEV });
  const channelKeyConfig = resolveChannelKeyConfig(config, logger);
  const data = createBootstrapData({
    demoRuntimeMode: config.demoRuntimeMode,
    now: Date.now(),
    demoTxHash,
  });
  const runtimeCounterparties = config.demoRuntimeMode ? knownVeilCounterparties : new Set();
  const store = createAppStore({
    config,
    channels: data.channels,
    messages: data.messages,
    initialRewardHistory: data.initialRewardHistory,
  });
  const dom = getAppDom(documentRef);
  const toastUi = createToastUi(dom.toast);
  const veilClientFactory = createVeilClientFactory({ config, channelKeyConfig, logger });
  const encryptionIdentity = new VeilEncryptionIdentityService(new BrowserEncryptionIdentityStore());
  let directTransport;
  let veilClient = veilClientFactory.createClient();

  const api = {
    getVeilClient: () => veilClient,
    setElementText: (selector, value) => setElementText(dom.document, selector, value),
    setLucideIcon,
    transactionExplorerUrl,
    shortAddress,
    getPrivyBridge,
    createDefaultWalletAssetBalances: () => createDefaultWalletAssetBalances(config.walletAssetConfig),
    showToast: toastUi.showToast,
    hideToastIfLoading: toastUi.hideToastIfLoading,
    settlementProofMeta: (channel = store.currentChannel()) => registry.createSettlementProofMeta(channel),
    resetClientConnection: () => {
      directTransport = undefined;
      starkZapAdapter?.resetStarkZap();
      veilClient = veilClientFactory.createClient();
    },
  };

  const dealStorage = createDealStorage({
    channels: store.channels,
    messages: store.messages,
    readJsonStorage,
    writeJsonStorage,
    logger,
    persistenceEnabled: config.demoRuntimeMode,
  });
  Object.assign(api, dealStorage);

  const chainMetaUi = createChainMetaUi({
    explorerUrl: "https://sepolia.voyager.online",
    transactionExplorerUrl,
  });
  const networkService = createNetworkService({
    config,
    state: store.state,
    logger,
  });
  const homeUi = createHomeUi({
    document: dom.document,
    config,
    state: store.state,
    expectedNetworkName: networkService.expectedNetworkName,
    expectedNetworkStatus: networkService.expectedNetworkStatus,
  });

  const walletInitialization = createWalletInitialization({
    state: store.state,
    config,
    logger,
    renderWalletInitializationState: () => {
      api.refreshConnectLabels?.();
      api.renderHomeStatus?.();
      if (store.state.screen === "wallet") api.renderWallet?.();
      if (store.state.screen === "settings") api.renderSettings?.();
    },
    beginWalletModal: (...args) => api.beginWalletModal(...args),
    updateWalletModalStage: (...args) => api.updateWalletModalStage(...args),
    finishWalletModal: (...args) => api.finishWalletModal(...args),
    failWalletModal: (...args) => api.failWalletModal(...args),
    setAppLoading: (...args) => api.setAppLoading(...args),
    clearAppLoading: (...args) => api.clearAppLoading(...args),
  });

  const connectLabelsUi = createConnectLabelsUi({
    document: dom.document,
    state: store.state,
    config,
    isWalletInitializationPending: walletInitialization.isWalletInitializationPending,
    walletInitLabel: walletInitialization.walletInitLabel,
  });
  Object.assign(api, homeUi, connectLabelsUi);

  const privyBridgeAdapter = createPrivyBridgeAdapter({
    config,
    logger,
    walletInitTimeoutMs: WALLET_INIT_TIMEOUT_MS,
  });
  const mountPrivy = () => mountPrivyBridge({ config, privyAuthRoot: dom.privyAuthRoot, logger });
  const privyWalletApi = createPrivyWalletApi({ state: store.state, logger });
  const starkZapAdapter = createStarkZapAdapter({
    config,
    state: store.state,
    logger,
    fetchPrivyStarknetWallet: privyWalletApi.fetchPrivyStarknetWallet,
    updateWalletInitialization: walletInitialization.updateWalletInitialization,
    getStarkZapChainId: networkService.getStarkZapChainId,
  });

  const registry = createFeatureRegistry({
    api,
    config,
    data,
    dom,
    store,
    logger,
    knownVeilCounterparties: runtimeCounterparties,
    chainMetaUi,
    networkService,
    walletInitialization,
  });

  const walletAssets = createWalletAssetsService({
    state: store.state,
    config,
    logger,
    walletAddressValue: () => registry.walletController.walletAddressValue(),
    getStarknetReadProvider: networkService.getStarknetReadProvider,
    onStateChanged: () => registry.walletController.renderWalletAssets(),
  });
  const refreshWalletAssets = (...args) => walletAssets.refreshWalletAssets(...args);
  const verifyHelperDeployment = async (...args) => {
    const verified = await networkService.verifyHelperDeployment(...args);
    registry.walletController.renderWallet();
    return verified;
  };

  const walletService = createWalletService({
    config,
    state: store.state,
    logger,
    getVeilClient: () => veilClient,
    setVeilClient: (nextClient) => {
      veilClient = nextClient;
    },
    createClient: veilClientFactory.createClient,
    createEncryptionAdapter: async ({ accountAddress, provider }) => {
      await encryptionIdentity.getOrCreateIdentity();
      if (!accountAddress || !provider || !config.encryptionKeyRegistryAddress) {
        return {
          registry: null,
          adapter: {
            async encryptPayload() {
              throw Object.assign(new Error("Encryption key registry is not configured."), {
                code: "ENCRYPTION_KEY_REGISTRY_UNAVAILABLE",
              });
            },
            async decryptPayload() { return null; },
          },
        };
      }
      const keyRegistry = new EncryptionPublicKeyRegistryService({
        registryAddress: config.encryptionKeyRegistryAddress,
        provider,
        identity: encryptionIdentity,
      });
      return { registry: keyRegistry, adapter: new DirectEcdhEncryptionAdapter({
        identity: encryptionIdentity,
        registry: keyRegistry,
        resolveContext: (channelId) => {
          const channel = store.channels.find((candidate) => candidate.id === channelId);
          const recipientAccountAddress = channel?.counterpartyAddress || config.demoCounterpartyAddress;
          if (!recipientAccountAddress) {
            throw Object.assign(new Error("The recipient has not set up an encryption identity yet."), {
              code: "RECIPIENT_ENCRYPTION_KEY_NOT_FOUND",
            });
          }
          return {
            localAccountAddress: accountAddress,
            recipientAccountAddress,
            channelId,
            chainId: config.expectedChainId,
            helperAddress: config.helperAddress,
          };
        },
      }) };
    },
    getDirectTransport: () => directTransport,
    setDirectTransport: (nextTransport) => {
      directTransport = nextTransport;
    },
    currentChannelId: () => store.state.channelId,
    ensurePrivyAuthenticated: privyBridgeAdapter.ensurePrivyAuthenticated,
    fetchPrivyStarknetWallet: privyWalletApi.fetchPrivyStarknetWallet,
    createPrivyStarknetAccount: starkZapAdapter.createPrivyStarknetAccount,
    getStarknetReadProvider: networkService.getStarknetReadProvider,
    ensureExpectedNetwork: networkService.ensureExpectedNetwork,
    verifyHelperDeployment,
    beginWalletInitialization: walletInitialization.beginWalletInitialization,
    updateWalletInitialization: walletInitialization.updateWalletInitialization,
    completeWalletInitialization: walletInitialization.completeWalletInitialization,
    failWalletInitialization: walletInitialization.failWalletInitialization,
    handleTransactionSubmitted: (...args) => registry.transactionModalController.handleTransactionSubmitted(...args),
  });
  const connectWallet = async (options = {}) => {
    const goToInbox = options.goToInbox ?? store.state.screen === "unlock";
    const connected = await walletService.connectWallet(options);
    if (connected) {
      registry.walletController.renderWallet();
      api.refreshConnectLabels();
      if (goToInbox) api.showScreen("conversations");
    }
    return connected;
  };

  const submitService = createTransactionSubmitService({
    config,
    state: store.state,
    logger,
    connectWallet,
    hasDirectTransport: walletService.hasDirectTransport,
    verifyHelperDeployment,
    getVeilClient: () => veilClient,
    transactionDelay: registry.transactionDelay,
    beginTransactionModal: (...args) => registry.transactionModalController.beginTransactionModal(...args),
    updateTransactionModalStage: (...args) => registry.transactionModalController.updateTransactionModalStage(...args),
    finishTransactionModal: (...args) => registry.transactionModalController.finishTransactionModal(...args),
    failTransactionModal: (...args) => registry.transactionModalController.failTransactionModal(...args),
    setAppLoading: (...args) => registry.loadingController.setAppLoading(...args),
    clearAppLoading: (...args) => registry.loadingController.clearAppLoading(...args),
    showToast: toastUi.showToast,
    addLocalItem: (...args) => registry.chatController.addLocalItem(...args),
    updateLocalItem: (...args) => registry.chatController.updateLocalItem(...args),
    renderLoadingState: () => registry.loadingController.renderLoadingState(),
    walletAddressValue: () => registry.walletController.walletAddressValue(),
    expectedNetworkName: networkService.expectedNetworkName,
  });

  Object.assign(api, buildRuntimeApi({
    registry,
    connectWallet,
    refreshWalletAssets,
    verifyHelperDeployment,
    submitService,
    mountPrivy,
    networkService,
    dom,
    store,
    logger,
    registerEncryptionKey: () => walletService.registerEncryptionKey(),
  }));

  const router = createRouter({
    state: store.state,
    screens: dom.screens,
    bottomNav: dom.bottomNav,
    navItems: dom.navItems,
    renderers: api,
    iconRefresh: api.iconRefresh,
  });
  api.showScreen = router.showScreen;

  registerAppLifecycle({ windowRef, documentRef, state: store.state, config, logger, dom, api });
  initApp({ api, dealStorage, logger });
}
