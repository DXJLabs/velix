import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { build } from "vite";

import { createRuntimeConfig } from "../frontend/src/app/runtime-config.js";
import { bindClickEvents } from "../frontend/src/app/events/click-events.js";
import {
  createPrivyBridgeAdapter,
} from "../frontend/src/services/wallet/privy-bridge.js";
import {
  waitForInjectedStarknetWallet,
} from "../frontend/src/services/wallet/injected-wallet.js";
import { resolveWalletLogin } from "../frontend/src/services/wallet/wallet-login-strategy.js";
import { formatWalletInitializationError } from "../frontend/src/features/wallet/wallet-initialization.js";
import { appShellMarkup } from "../frontend/src/ui/shell/app-shell-template.js";
import {
  createVeilViteConfig,
  resolvePublicPrivyAppId,
} from "../vite.config.js";

function createLogger() {
  return {
    createTraceId: () => "wallet-test-trace",
    readResponsePayload: async () => ({}),
    tracePrivyStarkZap() {},
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
    config: { privyAppId: "" },
    traceId: "wallet-test-trace",
    logger: createLogger(),
    ensurePrivyMounted: async () => {},
    ensurePrivyAuthenticated: async () => null,
    createPrivyStarknetAccount: async () => null,
    waitForInjectedWallet: async () => null,
    updateWalletInitialization() {},
    windowRef: createWindow(),
    ...overrides,
  };
}

async function readDirectoryText(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? readDirectoryText(path) : readFile(path, "utf8");
  }));
  return contents.flat().join("\n");
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

test("runtime config reads the public Privy App ID and guarantees email/Google login", () => {
  const config = createRuntimeConfig({
    VITE_PRIVY_APP_ID: "cm-public-from-vite",
    VITE_PRIVY_LOGIN_METHODS: "wallet",
  }, "");

  assert.equal(config.privyAppId, "cm-public-from-vite");
  assert.deepEqual(config.privyLoginMethods, ["email", "google", "wallet"]);
});

test("runtime separates wallet deployment sponsorship from private transaction sponsorship", () => {
  const legacy = createRuntimeConfig({
    VITE_AVNU_PAYMASTER_ENABLED: "true",
  }, "");
  assert.equal(legacy.walletDeployPaymasterEnabled, true);
  assert.equal(legacy.privateTransactionPaymasterEnabled, false);
  assert.equal("avnuPaymasterEnabled" in legacy, false);

  const preferred = createRuntimeConfig({
    VITE_AVNU_PAYMASTER_ENABLED: "true",
    VITE_AVNU_WALLET_DEPLOY_ENABLED: "false",
  }, "");
  assert.equal(preferred.walletDeployPaymasterEnabled, false);

  assert.throws(
    () => createRuntimeConfig({ VITE_AVNU_PRIVATE_TX_PAYMASTER_ENABLED: "true" }, ""),
    /Private transaction paymaster sponsorship is disabled/,
  );
});

test("build config falls back to public PRIVY_APP_ID only when the VITE alias is absent", () => {
  assert.equal(resolvePublicPrivyAppId({
    VITE_PRIVY_APP_ID: "cm-vite",
    PRIVY_APP_ID: "cm-server-alias",
  }), "cm-vite");
  assert.equal(resolvePublicPrivyAppId({
    PRIVY_APP_ID: "cm-server-alias",
  }), "cm-server-alias");
});

test("production bundle includes the public fallback App ID and excludes Privy secrets", {
  timeout: 120_000,
}, async (context) => {
  const fixtureDirectory = await mkdtemp(join(tmpdir(), "veil-wallet-build-"));
  const outputDirectory = join(fixtureDirectory, "dist");
  context.after(() => rm(fixtureDirectory, { force: true, recursive: true }));
  await writeFile(
    join(fixtureDirectory, "index.html"),
    '<script type="module" src="/main.js"></script>',
  );
  await writeFile(
    join(fixtureDirectory, "main.js"),
    [
      "const env = {",
      "  ...import.meta.env,",
      "  VITE_PRIVY_APP_ID: import.meta.env.VITE_PRIVY_APP_ID,",
      "};",
      "globalThis.__veilPublicPrivyAppId = env.VITE_PRIVY_APP_ID;",
    ].join("\n"),
  );
  const publicAppId = "cm-public-build-fallback";
  const appSecret = "test-app-secret-must-not-appear";
  const verificationKey = "test-verification-key-must-not-appear";
  const config = createVeilViteConfig({
    mode: "production",
    processEnv: {
      PRIVY_APP_ID: publicAppId,
      PRIVY_APP_SECRET: appSecret,
      PRIVY_VERIFICATION_KEY: verificationKey,
    },
    loadEnvironment: () => ({}),
  });

  await build({
    ...config,
    logLevel: "silent",
    root: fixtureDirectory,
    publicDir: false,
    plugins: [],
    build: {
      ...config.build,
      outDir: outputDirectory,
      emptyOutDir: true,
    },
  });

  const bundle = await readDirectoryText(outputDirectory);
  assert.match(bundle, new RegExp(publicAppId));
  assert.doesNotMatch(bundle, new RegExp(appSecret));
  assert.doesNotMatch(bundle, new RegExp(verificationKey));
  assert.doesNotMatch(bundle, /PRIVY_APP_SECRET|PRIVY_VERIFICATION_KEY/);
});

test("Privy bridge becomes ready, opens login, and resolves authenticated state", async () => {
  const windowRef = createWindow();
  let loginCalls = 0;
  windowRef.__veilPrivy = {
    ready: true,
    authenticated: false,
    login() {
      loginCalls += 1;
      windowRef.__veilPrivy = {
        ...windowRef.__veilPrivy,
        authenticated: true,
        user: { id: "did:privy:test" },
      };
      windowRef.dispatchEvent(new Event("veil:privy-state"));
    },
  };
  const statusUpdates = [];
  const adapter = createPrivyBridgeAdapter({
    config: {
      privyAppId: "cm-public",
      privyLoginMethods: ["email", "google"],
    },
    logger: createLogger(),
    walletInitTimeoutMs: 100,
    privyReadyTimeoutMs: 25,
    privyAuthTimeoutMs: 100,
    updateWalletInitialization: (step, traceId, details) => {
      statusUpdates.push({ step, traceId, details });
    },
    windowRef,
  });

  const bridge = await adapter.ensurePrivyAuthenticated("privy-flow");
  assert.equal(loginCalls, 1);
  assert.equal(bridge.authenticated, true);
  assert.ok(statusUpdates.some(({ details }) => details.message === "Loading Privy"));
  assert.ok(statusUpdates.some(({ details }) => details.message === "Complete Privy Login"));
});

test("Privy ready timeout rejects quickly with a user-facing configuration error", async () => {
  const windowRef = createWindow();
  windowRef.__veilPrivy = { ready: false, authenticated: false };
  const adapter = createPrivyBridgeAdapter({
    config: {
      privyAppId: "cm-public",
      privyLoginMethods: ["email", "google"],
    },
    logger: createLogger(),
    walletInitTimeoutMs: 100,
    privyReadyTimeoutMs: 10,
    privyAuthTimeoutMs: 100,
    windowRef,
  });

  await assert.rejects(
    adapter.ensurePrivyAuthenticated("privy-timeout"),
    (error) => error.code === "PRIVY_READY_TIMEOUT"
      && /App ID and allowed origin/i.test(error.message),
  );
});

test("Privy origin/OAuth errors are converted to clear user-facing failures", async () => {
  const login = resolveWalletLogin(createLoginOptions({
    config: { privyAppId: "cm-public" },
    ensurePrivyAuthenticated: async () => {
      throw Object.assign(new Error("invalid_origin"), { code: "invalid_origin" });
    },
  }));

  await assert.rejects(login, {
    message: "Privy login is not allowed for this site. Add this origin in the Privy dashboard.",
  });
});

test("Privy is mounted before authentication and creates/restores the Starknet account", async () => {
  const account = {
    address: "0xabc",
    execute() {},
  };
  const order = [];
  const result = await resolveWalletLogin(createLoginOptions({
    config: { privyAppId: "cm-public" },
    ensurePrivyMounted: async () => { order.push("mount"); },
    ensurePrivyAuthenticated: async () => {
      order.push("authenticate");
      return { ready: true, authenticated: true };
    },
    createPrivyStarknetAccount: async () => {
      order.push("account");
      return { account, provider: { channel: "privy" } };
    },
    waitForInjectedWallet: async () => {
      throw new Error("injected fallback must not run after Privy succeeds");
    },
  }));

  assert.deepEqual(order, ["mount", "authenticate", "account"]);
  assert.equal(result.privyAccountContext.account.address, "0xabc");
  assert.equal(result.injectedWallet, null);
});

test("desktop falls back to injected Argent when Privy cannot initialize", async () => {
  const provider = { channel: "argent" };
  const account = {
    address: "0xdef",
    provider,
    execute() {},
  };
  let enableCalls = 0;
  const wallet = {
    name: "Argent X",
    provider,
    async enable() {
      enableCalls += 1;
      this.account = account;
    },
  };
  const result = await resolveWalletLogin(createLoginOptions({
    config: { privyAppId: "cm-public" },
    ensurePrivyMounted: async () => {},
    ensurePrivyAuthenticated: async () => {
      throw Object.assign(new Error("Privy login could not start."), {
        code: "PRIVY_READY_TIMEOUT",
      });
    },
    waitForInjectedWallet: async () => ({
      key: "starknet_argentX",
      wallet,
    }),
  }));

  assert.equal(enableCalls, 1);
  assert.equal(result.injectedWallet.account.address, "0xdef");
  assert.equal(result.injectedWalletEntry.key, "starknet_argentX");
  assert.equal(result.privyAccountContext, null);
});

test("mobile without Privy or an injected wallet fails closed immediately", async () => {
  const windowRef = createWindow({ mobile: true });
  const startedAt = Date.now();
  const login = resolveWalletLogin(createLoginOptions({
    windowRef,
    waitForInjectedWallet: waitForInjectedStarknetWallet,
  }));

  await assert.rejects(login, {
    message: "No supported wallet login is configured.",
  });
  assert.ok(Date.now() - startedAt < 250, "mobile wallet detection should not wait for extension injection");
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

test("app shell has exactly one visible Privy mount root", () => {
  const markup = appShellMarkup();
  assert.equal((markup.match(/id="privy-auth-root"/g) || []).length, 1);
  assert.doesNotMatch(markup, /id="privy-auth-root"[^>]*\bhidden\b/);
});
