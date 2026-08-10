import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createRuntimeConfig } from "../frontend/src/app/runtime-config.js";
import { bindClickEvents } from "../frontend/src/app/events/click-events.js";
import {
  waitForInjectedStarknetWallet,
} from "../frontend/src/services/wallet/injected-wallet.js";
import { resolveWalletLogin, userFacingWalletError } from "../frontend/src/services/wallet/wallet-login-strategy.js";
import { formatWalletInitializationError } from "../frontend/src/features/wallet/wallet-initialization.js";
import { appShellMarkup } from "../frontend/src/ui/shell/app-shell-template.js";

function createLogger() {
  return {
    createTraceId: () => "wallet-test-trace",
    readResponsePayload: async () => ({}),
    traceWalletConnect() {},
    veilError() {},
    veilLog() {},
  };
}

function createWindow({ mobile = false } = {}) {
  const windowRef = new EventTarget();
  windowRef.location = { origin: "https://velix-rho.vercel.app" };
  windowRef.localStorage = {
    getItem: () => null,
    setItem() {},
  };
  windowRef.navigator = {
    userAgent: mobile ? "Mozilla/5.0 (Linux; Android 15) Mobile" : "Mozilla/5.0 (X11; Linux x86_64)",
    userAgentData: { mobile },
  };
  return windowRef;
}

function createLoginOptions(overrides = {}) {
  return {
    traceId: "wallet-test-trace",
    logger: createLogger(),
    waitForInjectedWallet: async () => null,
    updateWalletInitialization() {},
    windowRef: createWindow(),
    ...overrides,
  };
}

test("wallet deployment errors hide raw RPC parameters and explain an invalid AVNU key", () => {
  const raw = new Error(
    'RPC: paymaster_buildTransaction with params {"transaction":{"deployment":{"address":"0xsecret"}}}: '
      + '163 UNKNOWN_ERROR: x-paymaster-api-key is invalid',
  );
  const message = formatWalletInitializationError(raw);

  assert.match(message, /AVNU API key/i);
  assert.match(message, /Vercel/i);
  assert.doesNotMatch(message, /paymaster_buildTransaction|0xsecret|params|UNKNOWN_ERROR/);
  assert.ok(message.length < 160);
});

test("wallet modal CSS contains bounded scrolling and long-text wrapping", async () => {
  const css = await readFile(
    new URL("../frontend/src/styles/components/modals-toast.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /max-height:\s*calc\(100dvh - 2rem\)/);
  assert.match(css, /overflow-y:\s*auto/);
  assert.match(css, /#transaction-loading-detail[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(css, /#transaction-loading-detail[\s\S]*word-break:\s*break-word/);
});

test("runtime config no longer exposes any Privy configuration", () => {
  const config = createRuntimeConfig({
    VITE_STARKNET_CHAIN_ID: "SN_SEPOLIA",
  }, "");

  assert.equal("privyEnabled" in config, false);
  assert.equal("privyAppId" in config, false);
  assert.equal("privyLoginMethods" in config, false);
});

test("private transaction paymaster sponsorship stays disabled until proof-aware path is ready", () => {
  assert.throws(
    () => createRuntimeConfig({ VITE_AVNU_PRIVATE_TX_PAYMASTER_ENABLED: "true" }, ""),
    /Private transaction paymaster sponsorship is disabled/,
  );

  const config = createRuntimeConfig({}, "");
  assert.equal(config.privateTransactionPaymasterEnabled, false);
  assert.equal("walletDeployPaymasterEnabled" in config, false);
});

test("Ready Wallet connects directly through the injected wallet, no bridge involved", async () => {
  const provider = { channel: "ready" };
  const account = {
    address: "0xdef",
    provider,
    execute() {},
  };
  let enableCalls = 0;
  const wallet = {
    name: "Ready Wallet",
    provider,
    async enable() {
      enableCalls += 1;
      this.account = account;
    },
  };
  const result = await resolveWalletLogin(createLoginOptions({
    waitForInjectedWallet: async ({ preferredWallet }) => {
      assert.equal(preferredWallet, "ready");
      return {
        key: "starknet_ready",
        wallet,
      };
    },
  }));

  assert.equal(enableCalls, 1);
  assert.equal(result.injectedWallet.account.address, "0xdef");
  assert.equal(result.injectedWalletEntry.key, "starknet_ready");
});

test("missing Ready Wallet extension fails closed with an install prompt", async () => {
  const login = resolveWalletLogin(createLoginOptions({
    waitForInjectedWallet: async () => null,
  }));

  await assert.rejects(login, /Ready Wallet extension was not detected/);
});

test("mobile without an injected wallet fails closed immediately", async () => {
  const windowRef = createWindow({ mobile: true });
  const startedAt = Date.now();
  const login = resolveWalletLogin(createLoginOptions({
    windowRef,
    waitForInjectedWallet: waitForInjectedStarknetWallet,
  }));

  await assert.rejects(login);
  assert.ok(Date.now() - startedAt < 250, "mobile wallet detection should not wait for extension injection");
});

test("cancelled wallet connections are surfaced as a plain cancellation message", () => {
  const error = userFacingWalletError(new Error("User rejected the request"));
  assert.equal(error.message, "Wallet login was cancelled.");
});

test("Connect Wallet click starts the connection flow", () => {
  let clickHandler;
  let receivedOptions;
  const documentRef = {
    addEventListener(type, handler) {
      assert.equal(type, "click");
      clickHandler = handler;
    },
    querySelector: () => null,
  };
  bindClickEvents({
    documentRef,
    state: { screen: "unlock" },
    dom: {},
    api: {
      connectWallet(options) {
        receivedOptions = options;
        return true;
      },
      showToast() {},
    },
  });

  clickHandler({
    target: {
      closest: (selector) => selector === "[data-connect-wallet]" ? {} : null,
    },
  });

  assert.deepEqual(receivedOptions, { goToInbox: true });
});

test("app shell no longer mounts a Privy auth root", () => {
  const markup = appShellMarkup();
  assert.doesNotMatch(markup, /id="privy-auth-root"/);
});
