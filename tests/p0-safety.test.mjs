import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { bindClickEvents } from "../src/app/events/click-events.js";
import { estimateVeilFee } from "../src/domain/fees.js";
import { hasRealTransactionHash } from "../src/features/escrow/escrow-feature.js";
import { createPaymentController } from "../src/features/payment/payment-controller.js";
import { createBootstrapData } from "../src/state/bootstrap-data.js";
import { createDealStorage } from "../src/services/storage/deal-storage.js";
import { createAppStore } from "../src/state/app-store.js";
import { settingsScreenMarkup } from "../src/ui/settings/settings-screen-template.js";
import { createChainMetaUi } from "../src/ui/timeline/chain-meta-ui.js";
import { demoTxHash } from "../src/utils/hash.js";
import { isTransactionHash, transactionExplorerUrl } from "../src/utils/transactions.js";

test("production bootstrap data never invokes the demo factory", () => {
  let demoFactoryCalls = 0;
  const data = createBootstrapData({
    demoRuntimeMode: false,
    demoDataFactory() {
      demoFactoryCalls += 1;
      throw new Error("demo factory must not run");
    },
  });

  assert.equal(demoFactoryCalls, 0);
  assert.deepEqual(data.channels, []);
  assert.deepEqual(data.messages, {});
  assert.deepEqual(data.initialRewardHistory, []);
  assert.deepEqual(data.confirmedTimelineMeta(), {
    status: "local",
    mode: "encrypted-direct",
  });
});

test("demo data is loaded only when demo mode is explicit", () => {
  let received;
  const marker = { channels: ["demo"] };
  const data = createBootstrapData({
    demoRuntimeMode: true,
    now: 123,
    demoTxHash: () => "demo-hash",
    demoDataFactory(input) {
      received = input;
      return marker;
    },
  });

  assert.equal(data, marker);
  assert.equal(received.now, 123);
  assert.equal(received.demoTxHash(), "demo-hash");
});

test("production store starts without demo channels, rewards, or accepted deal state", () => {
  const { state } = createAppStore({
    config: {
      demoRuntimeMode: false,
      expectedChainId: "SN_SEPOLIA",
      privyAppId: "",
      walletAssetConfig: [],
    },
    channels: [],
    messages: {},
    initialRewardHistory: [],
  });

  assert.equal(state.channelId, "");
  assert.equal(state.walletSource, "");
  assert.equal(state.rewardPoints, 0);
  assert.deepEqual(state.rewardHistory, []);
  assert.equal(state.offerAccepted, false);
  assert.equal(state.paymentSent, false);
  assert.equal(state.inviteCode, "");
  assert.equal(state.demoRuntimeMode, false);
});

test("production deal storage is fail-closed and writes no plaintext local cache", () => {
  let reads = 0;
  let writes = 0;
  const storage = createDealStorage({
    channels: [{ id: "private", local: true, title: "sensitive title" }],
    messages: { private: [{ body: "sensitive message" }] },
    readJsonStorage: () => { reads += 1; return []; },
    writeJsonStorage: () => { writes += 1; },
    logger: { veilError() {} },
    persistenceEnabled: false,
  });
  storage.loadLocalChannels();
  storage.saveLocalChannels();
  assert.equal(reads, 0);
  assert.equal(writes, 0);
});

test("memo-only payment never marks assets paid or opens settlement", async () => {
  const values = new Map([
    ["#payment-amount", { value: "450" }],
    ["#payment-asset", { value: "STRK" }],
    ["#payment-memo", { value: "Payment intent" }],
  ]);
  const document = {
    querySelector: (selector) => values.get(selector) || null,
    querySelectorAll: () => [],
  };
  const state = {
    channelId: "deal-1",
    paymentMode: "unshield",
    paymentSent: true,
  };
  let memoInput;
  let submittedCopy;
  let openedScreen;
  let workflowRenders = 0;

  const controller = createPaymentController({
    state,
    document,
    paymentReviewModal: null,
    recipient: "Bob",
    estimateVeilFee,
    setElementText() {},
    iconRefresh() {},
    async safeSubmit(action, localItem, success, overlay) {
      submittedCopy = { localItem, success, overlay };
      await action();
      return true;
    },
    getVeilClient: () => ({
      async sendPaymentMemo(input) {
        memoInput = input;
        return { transactionHash: "0x123" };
      },
    }),
    transactionTransportMode: () => "encrypted-direct",
    renderWorkflowProgress() {
      workflowRenders += 1;
    },
    showScreen(screen) {
      openedScreen = screen;
    },
    now: () => 123,
  });

  assert.equal(await controller.sendPayment(), true);
  assert.equal(state.paymentSent, false);
  assert.equal(openedScreen, "channel");
  assert.equal(workflowRenders, 1);
  assert.equal(memoInput.amount, "450 STRK");
  assert.equal(memoInput.mode, "encrypted-direct");
  assert.equal(submittedCopy.localItem.title, "Direct encrypted payment memo");
  assert.match(submittedCopy.localItem.subtitle, /no assets were transferred/i);
  assert.match(submittedCopy.success, /no assets were transferred/i);
  assert.equal(submittedCopy.overlay.successTitle, "Direct encrypted memo sent");
});

test("unfinished Settings actions report unavailable and never require a wallet", () => {
  let clickHandler;
  const messages = [];
  const documentRef = {
    addEventListener(type, handler) {
      assert.equal(type, "click");
      clickHandler = handler;
    },
    querySelector: () => null,
  };
  bindClickEvents({
    documentRef,
    state: {},
    dom: {},
    api: {
      showToast(message) {
        messages.push(message);
      },
      requireConnectedWallet() {
        throw new Error("unavailable actions must not request wallet access");
      },
    },
  });

  for (const selector of [
    "[data-export-viewing-key]",
    "[data-backup-recovery]",
    "[data-session-management]",
  ]) {
    clickHandler({
      target: {
        closest: (candidate) => candidate === selector ? {} : null,
      },
      preventDefault() {},
    });
  }

  assert.deepEqual(messages, [
    "Viewing key export is unavailable. No key was exported.",
    "Recovery Kit is unavailable. No backup was created.",
    "Active Sessions is unavailable in this build.",
  ]);

  const markup = settingsScreenMarkup();
  assert.ok((markup.match(/aria-disabled="true"/g) || []).length >= 11);
  assert.equal((markup.match(/>Unavailable</g) || []).length, 3);
});

test("synthetic hashes are visibly marked and never receive explorer links", () => {
  const explorer = "https://sepolia.voyager.online";
  const demoHash = demoTxHash("payment");
  assert.match(demoHash, /^demo-0x[0-9a-f]{64}$/);
  assert.equal(isTransactionHash(demoHash), false);
  assert.equal(isTransactionHash("mock-payment"), false);
  assert.equal(isTransactionHash(`0x${"0".repeat(64)}`), false);
  assert.equal(transactionExplorerUrl(demoHash, explorer), "");
  assert.equal(transactionExplorerUrl("mock-payment", explorer), "");
  assert.equal(hasRealTransactionHash({ txHash: demoHash }), false);

  const realHash = "0x123abc";
  assert.equal(isTransactionHash(realHash), true);
  assert.equal(
    transactionExplorerUrl(realHash, `${explorer}/`),
    `${explorer}/tx/0x123abc`,
  );

  const chainMeta = createChainMetaUi({ explorerUrl: explorer, transactionExplorerUrl });
  const markup = chainMeta.renderChainMeta({ txHash: demoHash, status: "confirmed" });
  assert.match(markup, />DEMO</);
  assert.match(markup, /Demo transaction - no explorer link/);
  assert.doesNotMatch(markup, /<a\b/);
});

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  }));
  return files.flat();
}

test("user-visible source uses the exact Direct encrypted label", async () => {
  const src = fileURLToPath(new URL("../src", import.meta.url)).replaceAll("\\", "/");
  const files = await sourceFiles(src);
  const violations = [];
  for (const file of files) {
    const contents = await readFile(file, "utf8");
    if (/Encrypted On-chain/i.test(contents)) violations.push(file);
  }
  assert.deepEqual(violations, []);
});
