import assert from "node:assert/strict";
import test from "node:test";

import { createWalletController } from "../frontend/src/features/wallet/wallet-controller.js";

function createDomStub() {
  const texts = {};
  return {
    texts,
    document: {
      querySelector: () => null,
    },
    setElementText: (selector, value) => {
      texts[selector] = value;
    },
  };
}

function createController(state, dom) {
  return createWalletController({
    state,
    document: dom.document,
    walletAssetConfig: [],
    expectedChainId: "SN_SEPOLIA",
    timelineMode: "strk20-shielded",
    privacyRuntime: { screening: { capable: false } },
    privacyPoolCompatibility: "compatible",
    nextRewardTier: () => ({ threshold: 100 }),
    rewardRowsMarkup: () => "",
    formatPoints: (value) => String(value),
    setElementText: dom.setElementText,
    shortAddress: (value) => value,
    isWalletInitializationPending: () => false,
    walletInitLabel: () => "",
    expectedNetworkName: () => "Starknet Sepolia",
    verifyHelperDeployment: async () => {},
    refreshWalletAssets: async () => {},
    refreshConnectLabels: () => {},
    renderHomeStatus: () => {},
    showToast: () => {},
    connectWallet: async () => true,
    clearWalletInitTimer: () => {},
    resetClientConnection: () => {},
    setWalletInitializationState: () => {},
    createDefaultWalletAssetBalances: () => ({}),
    listStorageKeys: () => [],
    removeStorageKeys: () => {},
    copyToClipboard: () => {},
  });
}

function baseState(overrides) {
  return {
    walletConnected: true,
    walletSource: "Ready",
    walletAddress: "0x123",
    walletPrivacyCapabilities: { support: "full", capabilities: { strk20WalletApi: true } },
    privacyWalletApiVersion: "0.10.3",
    privateBalances: {},
    privateBalanceStatus: "unavailable",
    privacyRegistrationStatus: "unknown",
    ...overrides,
  };
}

test("private identity shows Registered once the pool read confirms it", () => {
  const dom = createDomStub();
  const state = baseState({ privacyRegistrationStatus: "registered" });
  createController(state, dom).renderWalletPrivacy();
  assert.equal(dom.texts["#wallet-private-identity"], "Registered with the pool");
});

test("private identity explains that registration happens on the first private action, not connect", () => {
  const dom = createDomStub();
  const state = baseState({ privacyRegistrationStatus: "not-registered" });
  createController(state, dom).renderWalletPrivacy();
  assert.match(dom.texts["#wallet-private-identity"], /registers on your first private action/);
});

test("private identity shows a checking state while the pool read is in flight", () => {
  const dom = createDomStub();
  const state = baseState({ privacyRegistrationStatus: "unknown" });
  createController(state, dom).renderWalletPrivacy();
  assert.match(dom.texts["#wallet-private-identity"], /Checking/);
});

test("private identity prompts to connect when no wallet is attached", () => {
  const dom = createDomStub();
  const state = baseState({ walletConnected: false, privacyRegistrationStatus: "unknown" });
  createController(state, dom).renderWalletPrivacy();
  assert.equal(dom.texts["#wallet-private-identity"], "Connect wallet");
});
