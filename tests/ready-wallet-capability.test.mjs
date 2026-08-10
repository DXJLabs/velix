import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getInjectedStarknetWalletEntry,
  waitForInjectedStarknetWallet,
} from "../frontend/src/services/wallet/injected-wallet.js";
import { resolveWalletLogin } from "../frontend/src/services/wallet/wallet-login-strategy.js";

test("Ready preference accepts the current Ready key and the legacy Argent X injection key", async () => {
  const ready = { name: "Ready Wallet", account: { address: "0x123", execute() {} }, request() {} };
  const braavos = { name: "Braavos", account: { address: "0x456", execute() {} }, request() {} };
  const currentWindow = {
    navigator: { userAgent: "Desktop" },
    starknet_ready: ready,
    starknet_braavos: braavos,
  };
  assert.equal(
    getInjectedStarknetWalletEntry(currentWindow, { preferredWallet: "ready" })?.wallet,
    ready,
  );

  const legacyReady = { name: "Argent X", account: { address: "0x789", execute() {} }, request() {} };
  const legacyWindow = {
    navigator: { userAgent: "Desktop" },
    starknet_argentX: legacyReady,
    starknet_braavos: braavos,
  };
  assert.equal(
    getInjectedStarknetWalletEntry(legacyWindow, { preferredWallet: "ready" })?.wallet,
    legacyReady,
  );
  assert.equal(
    (await waitForInjectedStarknetWallet({
      windowRef: legacyWindow,
      preferredWallet: "ready",
      timeout: 1,
    }))?.wallet,
    legacyReady,
  );
});

test("Ready connection resolves the injected wallet directly, no bridge involved", async () => {
  const ready = {
    name: "Ready Wallet",
    account: { address: "0x123", execute() {} },
    request() {},
  };
  const updates = [];
  const result = await resolveWalletLogin({
    traceId: "trace-ready",
    logger: {
      veilLog() {},
      veilError() {},
    },
    waitForInjectedWallet: async ({ preferredWallet }) => {
      assert.equal(preferredWallet, "ready");
      return { key: "starknet_ready", wallet: ready };
    },
    updateWalletInitialization: (...args) => updates.push(args),
    windowRef: {},
    preferredInjectedWallet: "ready",
  });

  assert.equal(result.injectedWallet, ready);
  assert.match(updates[0][2].title, /Ready Wallet/);
});


test("Ready connect audit logging and privacy capability refresh are present in the wallet service", async () => {
  const service = await readFile(
    new URL("../frontend/src/services/wallet/wallet-service.js", import.meta.url),
    "utf8",
  );

  const connectRoute = service.indexOf("async function connectWallet(options = {}) {");
  assert.ok(connectRoute >= 0, "connectWallet must exist.");

  const connectBlock = service.slice(connectRoute);
  assert.match(connectBlock, /preferredInjectedWallet:\s*"ready"/);
  assert.match(connectBlock, /privacyWalletAudit:\s*true/);
  assert.match(connectBlock, /directHelper:\s*false/);
  assert.match(connectBlock, /refreshPrivacyCapabilities\(wallet,\s*account,\s*readProvider\)/);
});

test("wallet screen exposes a fail-closed Ready and STRK20 capability audit", async () => {
  const screen = await readFile(
    new URL("../frontend/src/ui/wallet/wallet-screen-template.js", import.meta.url),
    "utf8",
  );
  const clicks = await readFile(
    new URL("../frontend/src/app/events/click-events.js", import.meta.url),
    "utf8",
  );
  const service = await readFile(
    new URL("../frontend/src/services/wallet/wallet-service.js", import.meta.url),
    "utf8",
  );
  const controller = await readFile(
    new URL("../frontend/src/features/wallet/wallet-controller.js", import.meta.url),
    "utf8",
  );

  assert.match(screen, /data-connect-privacy-wallet/);
  assert.match(screen, /STRK20 Wallet API/);
  assert.match(screen, /Official SDK signer/);
  assert.match(clicks, /data-connect-privacy-wallet/);
  assert.match(service, /preferredInjectedWallet:\s*"ready"/);
  assert.match(service, /entrypoint:\s*"get_public_key"/);
  assert.match(controller, /wallet-strk20-api/);

  const privateActionRows = [...screen.matchAll(/class="wallet-action-row"[^>]*disabled[^>]*aria-disabled="true"/g)];
  assert.ok(privateActionRows.length >= 6, "Private actions must remain fail-closed.");
});
