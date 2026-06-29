import { ChannelEncryptionAdapter, DirectHelperTransport, VeilClient, VeilEventType } from "./packages/veil-sdk/src/index.ts";
import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { StarkZap } from "starkzap-sdk";
import { accountPresets } from "starkzap-account-presets";
import { ChainId } from "starkzap-config";
import { OnboardStrategy } from "starkzap-onboard";

const timelineMode = import.meta.env.VITE_VEIL_TIMELINE_MODE || "mock";
const privyAppId = import.meta.env.VITE_PRIVY_APP_ID || "";
const privyLoginMethods = (import.meta.env.VITE_PRIVY_LOGIN_METHODS || "email,wallet,google")
  .split(",")
  .map((method) => method.trim())
  .filter(Boolean);
const LEGACY_CHANNEL_HELPER_ADDRESS = "0x0333e805547d0e91cec741045bf7305e8ff58e8b7d1e9f70ecb3ca559712ef6c";
const DEPLOYED_CHANNEL_HELPER_ADDRESS = "0x018b25f0b870610e9d28a764c432dd17c18cad7d3c09aebb6e61b4efdef4efd7";
const configuredHelperAddress = import.meta.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS || "";
const helperAddress = configuredHelperAddress.toLowerCase() === LEGACY_CHANNEL_HELPER_ADDRESS
  ? DEPLOYED_CHANNEL_HELPER_ADDRESS
  : configuredHelperAddress || DEPLOYED_CHANNEL_HELPER_ADDRESS;
const privacyPoolAddress = import.meta.env.VITE_PRIVACY_POOL_ADDRESS || "mock-privacy-pool";
const rpcUrl = import.meta.env.VITE_STARKNET_RPC_URL || "mock-rpc";
const channelKey = import.meta.env.VITE_VEIL_CHANNEL_KEY || "";
const onchainPayloads = (import.meta.env.VITE_VEIL_ONCHAIN_PAYLOADS || "false").toLowerCase() === "true"
  || helperAddress.toLowerCase() === DEPLOYED_CHANNEL_HELPER_ADDRESS;
const privyStarknetRpcUrl = import.meta.env.VITE_PRIVY_STARKNET_RPC_URL
  || rpcUrl.replace("/v0_10", "/v0_8")
  || "https://starknet-sepolia.public.blastapi.io/rpc/v0_8";
const expectedChainId = normalizeChainId(import.meta.env.VITE_STARKNET_CHAIN_ID || "SN_SEPOLIA");

const now = Date.now();
const minute = 60_000;
const activeDealId = "20260625";

const channels = [
  {
    id: activeDealId,
    title: "Rights Transfer",
    person: "Bob",
    avatar: "B",
    mode: "Private",
    status: "Escrow ready",
    unread: 2,
    time: "9:41 AM",
    last: "Bob accepted 450 STRK. Escrow is ready.",
  },
  {
    id: "design-milestone",
    title: "Design Milestone",
    person: "Mira",
    avatar: "M",
    mode: "Private",
    status: "Memo needed",
    unread: 1,
    time: "9:20 AM",
    last: "Can you attach the memo before release?",
  },
  {
    id: "northline-goods",
    title: "Northline Goods",
    person: "Northline",
    avatar: "N",
    mode: "Public",
    status: "Seller pending",
    unread: 0,
    time: "8:15 AM",
    last: "Seller deposit is pending.",
  },
  {
    id: "greylock-ops",
    title: "Greylock Ops",
    person: "Ari",
    avatar: "G",
    mode: "Private",
    status: "Proof ready",
    unread: 0,
    time: "Yesterday",
    last: "Payment proof received.",
  },
  {
    id: "product-supply",
    title: "Product Supply",
    person: "Nadia",
    avatar: "P",
    mode: "Public",
    status: "Complete",
    unread: 0,
    time: "Mon",
    last: "Deal completed.",
  },
];

const messages = {
  [activeDealId]: [
    {
      type: "message",
      sender: "Bob",
      body: "Here is my offer.",
      time: now - 42 * minute,
    },
    {
      type: "offer",
      title: "Offer #1",
      amount: "450 STRK",
      subtitle: "Rights Transfer",
      time: now - 39 * minute,
    },
    {
      type: "message",
      sender: "You",
      body: "Thanks. I will review and get back to you.",
      time: now - 31 * minute,
      self: true,
    },
    {
      type: "message",
      sender: "Bob",
      body: "Sure, let me know.",
      time: now - 9 * minute,
    },
    {
      type: "event",
      title: "Bob accepted your offer",
      subtitle: "Escrow is ready to create.",
      time: now - 4 * minute,
    },
  ],
  "design-milestone": [
    {
      type: "message",
      sender: "Mira",
      body: "Can you attach the memo before release?",
      time: now - 18 * minute,
    },
  ],
  "northline-goods": [
    {
      type: "message",
      sender: "Northline",
      body: "Seller deposit is pending.",
      time: now - 70 * minute,
    },
  ],
  "greylock-ops": [
    {
      type: "event",
      title: "Payment proof received",
      subtitle: "Settlement completed.",
      time: now - 2 * 24 * 60 * minute,
    },
  ],
  "product-supply": [
    {
      type: "event",
      title: "Deal completed",
      subtitle: "Proof attached.",
      time: now - 4 * 24 * 60 * minute,
    },
  ],
};

const state = {
  screen: "unlock",
  channelId: activeDealId,
  paymentMode: "Private",
  walletConnected: false,
  walletAddress: "",
  walletNetwork: expectedChainId,
  walletSource: privyAppId ? "Privy" : "Demo",
  helperVerified: false,
  privyReady: false,
  privyAuthenticated: false,
  privyWallet: null,
  privyAccount: null,
  privyProvider: null,
  privyAccountDeployed: false,
  paymentSent: false,
  escrowReleased: false,
  proofExported: false,
};

let toastTimer;
let directTransport;
let veilClient = createClient();
let starknetReadProvider;
let starkzapSdk;
let starkzapOnboardResult;

const screens = document.querySelectorAll("[data-screen]");
const bottomNav = document.querySelector(".bottom-nav");
const navItems = document.querySelectorAll("[data-top-nav]");
const conversationList = document.querySelector("#conversation-list");
const conversationSearch = document.querySelector("#conversation-search");
const messageFeed = document.querySelector("#message-feed");
const composerForm = document.querySelector("#composer-form");
const messageInput = document.querySelector("#message-input");
const toast = document.querySelector("#toast");
const privyAuthRoot = document.querySelector("#privy-auth-root");

function createClient(transport) {
  return new VeilClient({
    privacyPoolAddress,
    helperAddress: helperAddress || "mock-veil-helper",
    rpcUrl,
    ...(channelKey
      ? { encryption: new ChannelEncryptionAdapter({ channelKey, keyId: "veil-env-channel" }) }
      : {}),
    ...(transport ? { transport } : {}),
  });
}

function veilLog(level, event, details = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitizeLogDetails(details),
  };
  const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
  console[method](JSON.stringify(payload));
}

function veilError(event, error, details = {}) {
  veilLog("error", event, {
    where: details.where || "frontend",
    why: error?.message || String(error),
    howToFix: details.howToFix || "Check the preceding VEIL structured logs and retry the failed action.",
    errorName: error?.name,
    ...details,
  });
}

function sanitizeLogDetails(details) {
  return Object.fromEntries(
    Object.entries(details)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        if (/token|secret|authorization/i.test(key)) return [key, "[redacted]"];
        return [key, value];
      }),
  );
}

function currentOrigin() {
  return window.location.origin;
}

async function mountPrivy() {
  if (!privyAppId || !privyAuthRoot) return;
  veilLog("info", "auth.privy.mount.start", {
    where: "mountPrivy",
    appIdConfigured: Boolean(privyAppId),
    loginMethods: privyLoginMethods,
    currentOrigin: currentOrigin(),
    howToFix: privyLoginMethods.includes("google")
      ? "For Google OAuth, add this origin to Privy Allowed OAuth Redirect URLs and Google Authorized JavaScript Origins."
      : undefined,
  });

  function PrivyStateBridge() {
    const privy = usePrivy();
    const walletState = useWallets();
    const wallets = walletState?.wallets || [];

    useEffect(() => {
      window.__veilPrivy = {
        ready: Boolean(privy.ready),
        authenticated: Boolean(privy.authenticated),
        user: privy.user || null,
        login: privy.login,
        logout: privy.logout,
        getAccessToken: privy.getAccessToken,
        wallets,
      };

      window.dispatchEvent(new CustomEvent("veil:privy-state", {
        detail: {
          ready: Boolean(privy.ready),
          authenticated: Boolean(privy.authenticated),
          user: privy.user || null,
          wallets,
        },
      }));
    }, [privy.ready, privy.authenticated, privy.user, privy.login, privy.logout, privy.getAccessToken, wallets]);

    return null;
  }

  createRoot(privyAuthRoot).render(
    React.createElement(
      PrivyProvider,
      {
        appId: privyAppId,
        config: {
          appearance: {
            accentColor: "#10b981",
            theme: "light",
          },
          loginMethods: privyLoginMethods,
        },
      },
      React.createElement(PrivyStateBridge),
    ),
  );
  veilLog("info", "auth.privy.mount.success", {
    where: "mountPrivy",
    appIdConfigured: Boolean(privyAppId),
  });
}

function currentChannel() {
  return channels.find((channel) => channel.id === state.channelId) || channels[0];
}

function channelMessages() {
  messages[state.channelId] ||= [];
  return messages[state.channelId];
}

function getWallet() {
  return state.privyAccount
    || window.veilDemoWallet
    || getInjectedStarknetWallet()
    || null;
}

function getInjectedStarknetWallet() {
  return getInjectedStarknetWalletEntry()?.wallet || null;
}

function getWindowValue(key) {
  try {
    return window[key];
  } catch {
    return null;
  }
}

function isInjectedStarknetWallet(wallet) {
  return Boolean(wallet)
    && typeof wallet === "object"
    && (
      typeof wallet.enable === "function"
      || typeof wallet.request === "function"
      || Boolean(wallet.account)
      || Boolean(wallet.provider)
    );
}

function getInjectedStarknetWalletEntry() {
  const keys = [
    "starknet_argentX",
    "starknet_ready",
    "starknet_readyX",
    "starknet_argent",
    "starknet",
    "starknet_braavos",
  ];

  const discoveredKeys = Object.getOwnPropertyNames(window)
    .filter((key) => /^starknet/i.test(key) && !keys.includes(key));

  return [...keys, ...discoveredKeys]
    .map((key) => ({ key, wallet: getWindowValue(key) }))
    .filter((entry) => isInjectedStarknetWallet(entry.wallet))
    .sort((first, second) => walletPriority(first) - walletPriority(second))[0] || null;
}

function walletPriority(entry) {
  const label = `${entry.key} ${walletSourceLabel(entry.wallet)}`;
  if (/argent|ready/i.test(label)) return 0;
  if (/braavos/i.test(label)) return 1;
  if (entry.key === "starknet") return 2;
  return 3;
}

async function waitForInjectedStarknetWallet(timeout = 2_000) {
  const existing = getInjectedStarknetWalletEntry();
  if (existing) return existing;

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const entry = getInjectedStarknetWalletEntry();
    if (entry) return entry;
  }

  return null;
}

function walletSourceLabel(wallet) {
  const name = wallet?.name || wallet?.id || wallet?.metadata?.name || "";
  if (/argent|ready/i.test(name)) return "Argent";
  if (/braavos/i.test(name)) return "Braavos";
  return name || "Starknet wallet";
}

function ensureHex(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.startsWith("0x") ? normalized : `0x${normalized}`;
}

function splitPrivySignature(signature) {
  if (Array.isArray(signature) && signature.length >= 2) {
    return [ensureHex(signature[0]), ensureHex(signature[1])];
  }

  const raw = typeof signature === "string"
    ? signature
    : signature?.signature || signature?.rawSignature || signature?.raw_signature || "";
  const hex = ensureHex(raw).slice(2);
  if (hex.length < 128) {
    throw new Error("Privy signature is not a 64-byte Stark signature.");
  }
  return [`0x${hex.slice(0, 64)}`, `0x${hex.slice(64, 128)}`];
}

function normalizeChainId(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "";
  if (normalized === "SN_SEPOLIA" || normalized === "0X534E5F5345504F4C4941") return "SN_SEPOLIA";
  if (normalized === "SN_MAIN" || normalized === "0X534E5F4D41494E") return "SN_MAIN";
  return normalized;
}

function networkLabel(chainId = state.walletNetwork) {
  const normalized = normalizeChainId(chainId);
  if (normalized === "SN_SEPOLIA") return "Sepolia";
  if (normalized === "SN_MAIN") return "Mainnet";
  return normalized || "Not detected";
}

function shortAddress(address) {
  if (!address) return "Not connected";
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getPrivyBridge() {
  return window.__veilPrivy || null;
}

function refreshConnectLabels() {
  const label = state.walletConnected
    ? "Wallet Ready"
    : privyAppId && !state.privyReady
      ? "Loading Privy"
      : "Connect Wallet";

  document.querySelectorAll("[data-wallet-label]").forEach((node) => {
    node.textContent = label;
  });
}

function waitForPrivyState(predicate, timeout = 18_000) {
  return new Promise((resolve) => {
    const current = getPrivyBridge();
    if (current && predicate(current)) {
      resolve(current);
      return;
    }

    const timer = setTimeout(() => {
      window.removeEventListener("veil:privy-state", onState);
      resolve(getPrivyBridge());
    }, timeout);

    function onState() {
      const bridge = getPrivyBridge();
      if (!bridge || !predicate(bridge)) return;
      clearTimeout(timer);
      window.removeEventListener("veil:privy-state", onState);
      resolve(bridge);
    }

    window.addEventListener("veil:privy-state", onState);
  });
}

async function ensurePrivyAuthenticated() {
  if (!privyAppId) return null;

  veilLog("info", "auth.privy.ready.wait", {
    where: "ensurePrivyAuthenticated",
    currentOrigin: currentOrigin(),
  });
  const readyBridge = await waitForPrivyState((bridge) => bridge.ready);
  if (!readyBridge?.ready) {
    veilLog("warn", "auth.privy.ready.timeout", {
      where: "ensurePrivyAuthenticated",
      why: "Privy did not become ready before the login timeout.",
      howToFix: "Confirm VITE_PRIVY_APP_ID is set and the current origin is allowed in the Privy dashboard.",
    });
    showToast("Privy is still loading.");
    return null;
  }

  if (!readyBridge.authenticated) {
    veilLog("info", "auth.privy.login.start", {
      where: "ensurePrivyAuthenticated",
      loginMethods: privyLoginMethods,
      currentOrigin: currentOrigin(),
    });
    await readyBridge.login();
  }

  const authenticatedBridge = await waitForPrivyState((bridge) => bridge.ready && bridge.authenticated);
  if (!authenticatedBridge?.authenticated) {
    veilLog("warn", "auth.privy.login.incomplete", {
      where: "ensurePrivyAuthenticated",
      why: "Privy login did not complete.",
      howToFix: "Complete the Privy login modal, or fix OAuth provider settings if Google returned redirect_uri_mismatch.",
    });
    showToast("Wallet login was not completed.");
    return null;
  }

  veilLog("info", "auth.privy.login.success", {
    where: "ensurePrivyAuthenticated",
    userPresent: Boolean(authenticatedBridge.user?.id || authenticatedBridge.user?.did),
  });
  return authenticatedBridge;
}

async function fetchPrivyStarknetWallet(bridge) {
  if (state.privyWallet) return state.privyWallet;

  const accessToken = await bridge.getAccessToken?.();
  if (!accessToken) {
    throw new Error("Privy access token is missing.");
  }
  const userId = bridge.user?.id || bridge.user?.did || "veil-user";
  const cacheKey = `veil:privy:starknet:v2:${userId}`;
  const cachedWallet = JSON.parse(window.localStorage.getItem(cacheKey) || "null");
  if (cachedWallet?.id && cachedWallet?.publicKey) {
    veilLog("info", "wallet.starknet.cache.hit", {
      where: "fetchPrivyStarknetWallet",
      walletId: cachedWallet.id,
      address: cachedWallet.address,
    });
    state.privyWallet = cachedWallet;
    state.walletAddress = cachedWallet.address || state.walletAddress;
    state.walletSource = "Privy";
    return cachedWallet;
  }

  veilLog("info", "wallet.starknet.api.request", {
    where: "fetchPrivyStarknetWallet",
    endpoint: "/api/wallet/starknet",
  });
  const response = await fetch("/api/wallet/starknet", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || payload.why || "Failed to create Starknet wallet with Privy.");
  }

  const { wallet } = await response.json();
  veilLog("info", "wallet.starknet.api.success", {
    where: "fetchPrivyStarknetWallet",
    walletId: wallet?.id,
    address: wallet?.address,
  });
  state.privyWallet = wallet;
  state.walletAddress = wallet?.address || state.walletAddress;
  state.walletSource = "Privy";
  window.localStorage.setItem(cacheKey, JSON.stringify(wallet));
  return wallet;
}

async function loadStarknetSdk() {
  if (window.__veilStarknetSdk) return window.__veilStarknetSdk;
  window.__veilStarknetSdk = await import("https://esm.sh/starknet@7.6.4?target=es2022");
  return window.__veilStarknetSdk;
}

async function getStarknetReadProvider() {
  if (starknetReadProvider) return starknetReadProvider;
  const { RpcProvider } = await loadStarknetSdk();
  starknetReadProvider = new RpcProvider({ nodeUrl: privyStarknetRpcUrl });
  return starknetReadProvider;
}

function getStarkZapChainId() {
  if (expectedChainId === "SN_MAIN") return ChainId.MAINNET;
  if (expectedChainId === "SN_SEPOLIA") return ChainId.SEPOLIA;
  throw new Error(`Unsupported StarkZap chain id ${expectedChainId}.`);
}

function getStarkZapSdk() {
  if (starkzapSdk) return starkzapSdk;
  starkzapSdk = new StarkZap({
    rpcUrl: privyStarknetRpcUrl,
    chainId: getStarkZapChainId(),
    logging: {
      logger: console,
      logLevel: "info",
    },
  });
  veilLog("info", "starkzap.sdk.created", {
    where: "getStarkZapSdk",
    chainId: expectedChainId,
    rpcConfigured: Boolean(privyStarknetRpcUrl),
  });
  return starkzapSdk;
}

async function signWithPrivy(walletId, messageHash, bridge) {
  const accessToken = await bridge.getAccessToken?.();
  veilLog("info", "wallet.sign.api.request", {
    where: "signWithPrivy",
    walletId,
    endpoint: "/api/wallet/sign",
  });
  const response = await fetch("/api/wallet/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ walletId, hash: messageHash }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || payload.why || "Privy raw sign failed.");
  }

  const payload = await response.json();
  veilLog("info", "wallet.sign.api.success", {
    where: "signWithPrivy",
    walletId,
  });
  return splitPrivySignature(payload.signature);
}

async function createPrivyStarknetAccount(bridge) {
  if (state.privyAccount && state.privyProvider) {
    return { account: state.privyAccount, provider: state.privyProvider };
  }

  const wallet = await fetchPrivyStarknetWallet(bridge);
  const publicKey = ensureHex(wallet.publicKey || wallet.public_key);
  if (!wallet.id || !publicKey) {
    throw new Error("Privy Starknet wallet is missing wallet id or public key.");
  }

  veilLog("info", "starkzap.privy.onboard.start", {
    where: "createPrivyStarknetAccount",
    walletId: wallet.id,
    chainId: expectedChainId,
  });
  const sdk = getStarkZapSdk();
  const signEndpoint = new URL("/api/wallet/sign", currentOrigin()).toString();

  starkzapOnboardResult = await sdk.onboard({
    strategy: OnboardStrategy.Privy,
    accountPreset: accountPresets.argentXV050,
    deploy: "if_needed",
    privy: {
      resolve: async () => ({
        walletId: wallet.id,
        publicKey,
        serverUrl: signEndpoint,
        headers: async () => {
          const accessToken = await bridge.getAccessToken?.();
          if (!accessToken) {
            throw new Error("Privy access token is missing.");
          }
          return { Authorization: `Bearer ${accessToken}` };
        },
        metadata: {
          privyWalletAddress: wallet.address,
        },
      }),
    },
    onProgress: (event) => {
      veilLog("info", "starkzap.privy.onboard.progress", {
        where: "createPrivyStarknetAccount",
        walletId: wallet.id,
        ...event,
      });
    },
  });

  const account = starkzapOnboardResult.wallet.getAccount();
  const provider = starkzapOnboardResult.wallet.getProvider();
  const accountAddress = account.address || starkzapOnboardResult.wallet.address;

  state.privyAccount = account;
  state.privyProvider = provider;
  state.walletAddress = accountAddress;
  state.walletSource = "Privy";
  state.privyWallet = { ...wallet, address: accountAddress, publicKey };
  state.privyAccountDeployed = Boolean(starkzapOnboardResult.deployed);

  veilLog("info", "starkzap.privy.onboard.success", {
    where: "createPrivyStarknetAccount",
    walletId: wallet.id,
    address: accountAddress,
    deployed: state.privyAccountDeployed,
  });

  return { account, provider };
}

async function resolveWalletChain(wallet, provider) {
  const candidates = [
    () => provider?.getChainId?.(),
    () => wallet?.getChainId?.(),
    () => wallet?.request?.({ type: "wallet_requestChainId" }),
    () => wallet?.request?.({ type: "wallet_getChainId" }),
    () => provider?.chainId,
    () => wallet?.chainId,
  ];

  for (const candidate of candidates) {
    try {
      const value = await candidate();
      const normalized = normalizeChainId(value);
      if (normalized) return normalized;
    } catch {
      // Try the next wallet/provider shape.
    }
  }

  return "";
}

async function ensureExpectedNetwork(wallet, provider) {
  if (timelineMode !== "direct-helper") return true;

  const detected = await resolveWalletChain(wallet, provider);
  if (detected) {
    state.walletNetwork = detected;
  }

  if (detected && detected !== expectedChainId) {
    renderWallet();
    showToast(`Switch wallet to ${networkLabel(expectedChainId)}.`);
    return false;
  }

  state.walletNetwork = expectedChainId;
  return true;
}

async function verifyHelperDeployment() {
  if (timelineMode !== "direct-helper") return true;
  if (!helperAddress) {
    showToast("Helper address is missing.");
    return false;
  }

  try {
    await veilClient.getEventCount(state.channelId);
    state.helperVerified = true;
    renderWallet();
    return true;
  } catch (error) {
    veilError("wallet.helper.verify.failed", error, {
      where: "verifyHelperDeployment",
      howToFix: "Confirm VITE_VEIL_CHANNEL_HELPER_ADDRESS is deployed on the configured Starknet RPC/network.",
    });
    state.helperVerified = false;
    renderWallet();
    showToast("Helper not deployed on this network.");
    return false;
  }
}

async function connectWallet(options = {}) {
  const goToInbox = options.goToInbox ?? state.screen === "unlock";
  refreshConnectLabels();

  if (timelineMode !== "direct-helper") {
    if (privyAppId) {
      try {
        const bridge = await ensurePrivyAuthenticated();
        if (!bridge) return false;
        await fetchPrivyStarknetWallet(bridge);
      } catch (error) {
        veilError("wallet.privy.setup.failed", error, {
          where: "connectWallet",
          howToFix: "Check Privy app credentials, token verification env vars, and /api/wallet/starknet logs.",
        });
        showToast("Privy wallet setup failed.");
        return false;
      }
    }
    state.walletConnected = true;
    state.walletNetwork = expectedChainId;
    renderWallet();
    refreshConnectLabels();
    showToast("Wallet ready.");
    if (goToInbox) showScreen("conversations");
    return true;
  }

  if (!helperAddress) {
    showToast("Wallet is not configured.");
    return false;
  }

  let injectedWalletEntry = null;
  let injectedWallet = null;
  let privyAccountContext = null;
  if (privyAppId) {
    try {
      const bridge = await ensurePrivyAuthenticated();
      if (!bridge) return false;
      privyAccountContext = await createPrivyStarknetAccount(bridge);
    } catch (error) {
      veilError("starkzap.privy.onboard.failed", error, {
        where: "connectWallet",
        howToFix: "Fund the counterfactual account if user-pays deployment is required, verify /api/wallet/sign, and confirm the RPC matches VITE_STARKNET_CHAIN_ID.",
      });
      injectedWalletEntry = await waitForInjectedStarknetWallet();
      injectedWallet = injectedWalletEntry?.wallet || null;
      if (!injectedWallet) {
        showToast(error.message || "Privy Starknet account is not ready.");
        return false;
      }
      showToast("Privy unavailable, using Starknet wallet.");
    }
  }

  if (!privyAccountContext && !injectedWallet) {
    injectedWalletEntry = await waitForInjectedStarknetWallet();
    injectedWallet = injectedWalletEntry?.wallet || null;
  }

  const wallet = privyAccountContext?.account || injectedWallet || getWallet();
  if (!wallet) {
    showToast("Connect with Privy or Starknet wallet.");
    return false;
  }

  if (!wallet.account && typeof wallet.enable === "function") {
    await wallet.enable();
  }

  const account = wallet.account || wallet;
  const walletProvider = privyAccountContext?.provider || state.privyProvider || wallet.provider || wallet.account?.provider;
  const readProvider = await getStarknetReadProvider().catch((error) => {
    veilError("wallet.rpc.provider.failed", error, {
      where: "connectWallet",
      howToFix: "Set VITE_PRIVY_STARKNET_RPC_URL or VITE_STARKNET_RPC_URL to a reachable Starknet RPC for the selected chain.",
    });
    return walletProvider;
  });
  if (!account?.execute) {
    showToast("Wallet unavailable.");
    return false;
  }
  if (!walletProvider) {
    showToast("Starknet provider unavailable.");
    return false;
  }

  const isExpectedNetwork = await ensureExpectedNetwork(wallet, walletProvider);
  if (!isExpectedNetwork) return false;

  directTransport = new DirectHelperTransport({
    helperAddress,
    account,
    ...(readProvider ? { provider: readProvider } : {}),
    storePayloadChunks: onchainPayloads,
  });
  veilClient = createClient(directTransport);

  if (!(await verifyHelperDeployment())) return false;

  state.walletConnected = true;
  state.walletAddress = account.address || state.privyWallet?.address || state.walletAddress;
  if (injectedWallet) state.walletSource = walletSourceLabel(injectedWallet);
  renderWallet();
  refreshConnectLabels();
  showToast("Wallet connected.");
  if (goToInbox) showScreen("conversations");
  return true;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
}

function iconRefresh() {
  if (window.lucide) window.lucide.createIcons();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

function showScreen(screen, options = {}) {
  state.screen = screen;
  screens.forEach((panel) => panel.classList.toggle("hidden", panel.dataset.screen !== screen));

  const rootScreens = ["conversations", "activity", "wallet", "settings"];
  bottomNav.classList.toggle("hidden-nav", !rootScreens.includes(screen));
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.topNav === screen));

  if (screen === "conversations") renderConversationList();
  if (screen === "channel") renderChannel();
  if (screen === "deal") renderDeal();
  if (screen === "escrow") renderEscrow();
  if (screen === "payment") renderPayment();
  if (screen === "wallet") renderWallet();
  if (screen === "settlement") renderSettlement();
  if (screen === "proof") renderProof();

  if (!options.keepScroll) window.scrollTo({ top: 0, behavior: "auto" });
  iconRefresh();
}

function openChannel(channelId) {
  state.channelId = channelId;
  const channel = currentChannel();
  channel.unread = 0;
  showScreen("channel");
  loadIndexedChannelTimeline(channelId);
}

async function loadIndexedChannelTimeline(channelId) {
  if (timelineMode !== "direct-helper" || !helperAddress) return;

  try {
    const response = await fetch(`/api/indexer/messages?channelId=${encodeURIComponent(channelId)}`);
    if (!response.ok) return;
    const payload = await response.json();
    const indexedItems = Array.isArray(payload.messages) ? payload.messages : [];
    if (!indexedItems.length) return;

    const feedItems = [];
    for (const indexedItem of indexedItems) {
      const timelineItem = {
        ...indexedItem,
        channelId,
        eventType: Number(indexedItem.eventType),
        timestamp: Number(indexedItem.timestamp || Date.now()),
      };
      const decrypted = await veilClient.encryption.decryptPayload(timelineItem).catch(() => null);
      const feedItem = decrypted ? timelinePayloadToFeedItem(timelineItem, decrypted) : null;
      if (feedItem) feedItems.push(feedItem);
    }

    if (!feedItems.length) return;
    messages[channelId] = feedItems;
    const channel = channels.find((item) => item.id === channelId);
    const lastItem = feedItems[feedItems.length - 1];
    if (channel && lastItem) {
      channel.last = lastItem.type === "message" ? `${lastItem.sender}: ${lastItem.body}` : lastItem.title;
      channel.time = "now";
    }
    if (state.channelId === channelId && state.screen === "channel") {
      renderChannel();
    }
  } catch (error) {
    veilError("indexer.timeline.load.failed", error, {
      where: "loadIndexedChannelTimeline",
      howToFix: "Check /api/indexer/messages, VEIL_INDEXER_FROM_BLOCK, and the helper deployment address for this channel.",
    });
  }
}

function timelinePayloadToFeedItem(item, payload) {
  const sender = payload.sender === "you" ? "You" : payload.sender || "Peer";
  const base = { time: item.timestamp };

  if (payload.kind === "chat") {
    return {
      ...base,
      type: "message",
      sender,
      body: payload.message,
      self: sender === "You",
    };
  }

  if (payload.kind === "offer" || payload.kind === "counter_offer") {
    return {
      ...base,
      type: "offer",
      title: payload.kind === "counter_offer" ? "Counter offer" : "Offer",
      amount: `${payload.amount}${payload.currency ? ` ${payload.currency}` : ""}`,
      subtitle: payload.terms || "Private terms",
    };
  }

  const titles = {
    accept_offer: "Offer accepted",
    reject_offer: "Offer rejected",
    payment_memo: "Payment memo attached",
    escrow: "Escrow updated",
    proof: "Proof attached",
  };

  return {
    ...base,
    type: "inline",
    title: titles[payload.kind] || "Channel event",
    subtitle: payload.memo || payload.details || payload.label || payload.reason || "Encrypted event",
  };
}

function renderConversationList() {
  const query = conversationSearch?.value.trim().toLowerCase() || "";
  const rows = channels.filter((channel) => {
    const value = `${channel.title} ${channel.person} ${channel.last} ${channel.status}`.toLowerCase();
    return value.includes(query);
  });

  conversationList.innerHTML = rows.map((channel) => `
    <button class="conversation-row" type="button" data-open-channel="${escapeHtml(channel.id)}">
      <span class="avatar">${escapeHtml(channel.avatar)}</span>
      <span class="min-w-0">
        <span class="flex min-w-0 items-center gap-2">
          <strong class="truncate text-[.98rem]">${escapeHtml(channel.title)}</strong>
          <span class="status-pill ${channel.mode === "Private" ? "private" : "public"}">${escapeHtml(channel.mode)}</span>
        </span>
        <span class="mt-1 block truncate text-sm font-semibold text-slate-500">${escapeHtml(channel.last)}</span>
        <span class="mt-1 flex items-center gap-2 text-xs font-bold text-slate-400">
          <span class="status-dot"></span>
          ${escapeHtml(channel.status)}
        </span>
      </span>
      <span class="grid justify-items-end gap-2">
        <time class="text-xs font-bold text-slate-400">${escapeHtml(channel.time)}</time>
        ${channel.unread ? `<span class="unread">${channel.unread}</span>` : "<span class=\"size-2 rounded-full bg-slate-200\"></span>"}
      </span>
    </button>
  `).join("");
  iconRefresh();
}

function renderChannel() {
  const channel = currentChannel();
  document.querySelector("#channel-title").textContent = channel.title;
  document.querySelector("#channel-mode").textContent = channel.mode;
  document.querySelector("#channel-mode").className = `status-pill ${channel.mode === "Private" ? "private" : "public"}`;
  document.querySelector("#channel-meta").textContent = `${channel.person} - ${channel.status}`;
  messageFeed.innerHTML = `
    <div class="inline-event"><strong>Today</strong></div>
    ${channelMessages().map(renderFeedItem).join("")}
  `;
  iconRefresh();
}

function renderFeedItem(item) {
  if (item.type === "message") return renderMessage(item);
  if (item.type === "offer") return renderOfferCard(item);
  return renderInlineEvent(item);
}

function renderMessage(item) {
  const self = item.self || item.sender === "You";
  return `
    <article class="message ${self ? "self" : ""}">
      <div class="max-w-full">
        <div class="message-meta ${self ? "text-right" : ""}">${escapeHtml(self ? "You" : item.sender)} - ${escapeHtml(formatTime(item.time))}</div>
        <p class="bubble">${escapeHtml(item.body)}</p>
      </div>
    </article>
  `;
}

function renderOfferCard(item) {
  return `
    <article class="offer-card">
      <span>
        <strong>${escapeHtml(item.title)}</strong>
        <b>${escapeHtml(item.amount)}</b>
        <small>${escapeHtml(item.subtitle)}</small>
      </span>
      <button type="button" data-open-route="deal">Open</button>
    </article>
  `;
}

function renderInlineEvent(item) {
  return `
    <article class="inline-event">
      <strong>${escapeHtml(item.title)}</strong>
      <small>${escapeHtml(item.subtitle || formatTime(item.time))}</small>
    </article>
  `;
}

function renderDeal() {
  const currentStatus = state.paymentSent ? "Payment sent" : "Accepted";
  document.querySelector("#deal-current-status").textContent = currentStatus;
  document.querySelector("#deal-status").textContent = currentStatus;
}

function renderEscrow() {
  document.querySelector("#escrow-proof").textContent = state.escrowReleased ? "Released" : "Pending";
}

function renderPayment() {
  document.querySelectorAll("[data-payment-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.paymentMode === state.paymentMode);
  });
}

function renderWallet() {
  const connected = state.walletConnected || state.privyAuthenticated;
  const walletTitle = document.querySelector("#wallet-state-title");
  const walletSubtitle = document.querySelector("#wallet-state-subtitle");
  const walletStatus = document.querySelector("#wallet-status-pill");
  const walletAccount = document.querySelector("#wallet-account");
  const walletNetwork = document.querySelector("#wallet-network");
  const walletProvider = document.querySelector("#wallet-provider");
  const walletHelper = document.querySelector("#wallet-helper");

  if (walletTitle) walletTitle.textContent = connected ? "Wallet ready" : "Connect wallet";
  if (walletSubtitle) {
    walletSubtitle.textContent = state.privyAccount && !state.privyAccountDeployed
      ? `Fund ${shortAddress(state.walletAddress)} with Sepolia STRK, then connect again.`
      : connected
        ? "Private channels are unlocked for messages and deals."
        : "Use Privy to unlock VEIL on this device.";
  }
  if (walletStatus) {
    walletStatus.textContent = connected ? "Ready" : "Required";
    walletStatus.className = `status-pill ${connected ? "private" : "public"}`;
  }
  if (walletAccount) walletAccount.textContent = shortAddress(state.walletAddress || state.privyWallet?.address);
  if (walletNetwork) walletNetwork.textContent = networkLabel();
  if (walletProvider) walletProvider.textContent = state.walletSource;
  if (walletHelper) {
    walletHelper.textContent = timelineMode === "direct-helper"
      ? state.privyAccount && !state.privyAccountDeployed
        ? "Account funding needed"
        : state.helperVerified ? "Verified" : "Check required"
      : "Mock demo";
  }

  refreshConnectLabels();
}

function renderSettlement() {}

function renderProof() {}

async function safeSubmit(action, localItem, success) {
  try {
    if (timelineMode === "direct-helper" && !directTransport) {
      const connected = await connectWallet();
      if (!connected) return;
    }
    if (timelineMode === "direct-helper" && !(await verifyHelperDeployment())) {
      return;
    }
    veilLog("info", "transaction.submit.start", {
      where: "safeSubmit",
      timelineMode,
      helperAddress,
      eventType: localItem?.type,
    });
    const result = await action();
    veilLog("info", "transaction.submit.success", {
      where: "safeSubmit",
      timelineMode,
      transactionHash: result?.transactionHash,
      eventId: result?.eventId,
    });
    addLocalItem(localItem);
    showToast(success);
  } catch (error) {
    veilError("transaction.submit.failed", error, {
      where: "safeSubmit",
      timelineMode,
      helperAddress,
      howToFix: "Confirm wallet account deployment, Sepolia funds, Starknet RPC health, and helper contract deployment before retrying.",
    });
    if (timelineMode === "direct-helper") {
      showToast("Onchain action failed. Check Sepolia.");
      return;
    }
    addLocalItem(localItem);
    showToast(success);
  }
}

function addLocalItem(item) {
  channelMessages().push(item);
  const channel = currentChannel();
  if (item.type === "message") {
    channel.last = `${item.self ? "You" : item.sender}: ${item.body}`;
  } else {
    channel.last = item.title;
  }
  channel.time = "now";
  renderChannel();
  requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }));
}

async function sendChat(message) {
  await safeSubmit(
    () => veilClient.sendMessage({ channelId: state.channelId, sender: "you", message }),
    {
      type: "message",
      sender: "You",
      body: message,
      self: true,
      time: Date.now(),
    },
    "Message sent.",
  );
}

async function counterOffer() {
  await safeSubmit(
    () => veilClient.counterOffer({
      channelId: state.channelId,
      amount: "450",
      currency: "STRK",
      terms: "Private payment with proof.",
      sender: "you",
    }),
    {
      type: "inline",
      title: "Counter offer sent",
      subtitle: "450 STRK",
      time: Date.now(),
    },
    "Counter sent.",
  );
}

async function acceptOffer() {
  await safeSubmit(
    () => veilClient.acceptOffer({
      channelId: state.channelId,
      offerId: "450 STRK",
      reason: "Accepted.",
      sender: "you",
    }),
    {
      type: "inline",
      title: "Offer accepted",
      subtitle: "Escrow is ready.",
      time: Date.now(),
    },
    "Offer accepted.",
  );
}

async function sendPayment() {
  const amount = document.querySelector("#payment-amount").value.trim() || "450";
  const asset = document.querySelector("#payment-asset").value.trim() || "STRK";
  const memo = document.querySelector("#payment-memo").value.trim() || "Payment for rights transfer";
  state.paymentSent = true;
  await safeSubmit(
    () => veilClient.sendPaymentMemo({
      channelId: state.channelId,
      amount: `${amount} ${asset}`,
      memo,
      mode: state.paymentMode,
      sender: "you",
    }),
    {
      type: "inline",
      title: "Payment memo attached",
      subtitle: `${amount} ${asset}`,
      time: Date.now(),
    },
    "Payment sent.",
  );
  showScreen("settlement");
}

async function releaseEscrow() {
  state.escrowReleased = true;
  await safeSubmit(
    () => veilClient.recordEscrowStatus({
      channelId: state.channelId,
      status: "settled",
      details: "Escrow released.",
      sender: "system",
    }),
    {
      type: "inline",
      title: "Escrow released",
      subtitle: "Settlement can complete.",
      time: Date.now(),
    },
    "Escrow released.",
  );
  showScreen("payment");
}

function bindEvents() {
  window.addEventListener("unhandledrejection", (event) => {
    const message = String(event.reason?.message || event.reason || "");
    if (/redirect_uri_mismatch/i.test(message)) {
      veilError("auth.google_oauth.redirect_uri_mismatch", event.reason, {
        where: "window.unhandledrejection",
        currentOrigin: currentOrigin(),
        howToFix: "Add the current app origin to Privy Allowed OAuth Redirect URLs and Google Authorized JavaScript Origins; add Privy's documented Google OAuth callback URL to Google Authorized Redirect URIs.",
      });
      event.preventDefault();
      showToast("Fix Google OAuth redirect URI.");
      return;
    }
    if (message.includes("Login with Google not allowed")) {
      veilError("auth.google_oauth.provider_disabled", event.reason, {
        where: "window.unhandledrejection",
        howToFix: "Enable Google as a login method in the Privy dashboard for this app.",
      });
      event.preventDefault();
      showToast("Enable Google in Privy dashboard.");
    }
  });

  window.addEventListener("veil:privy-state", (event) => {
    const detail = event.detail || {};
    state.privyReady = Boolean(detail.ready);
    state.privyAuthenticated = Boolean(detail.authenticated);
    state.walletConnected ||= state.privyAuthenticated;
    state.walletSource = privyAppId ? "Privy" : state.walletSource;
    veilLog("info", "auth.privy.state.changed", {
      where: "veil:privy-state",
      ready: state.privyReady,
      authenticated: state.privyAuthenticated,
      walletCount: Array.isArray(detail.wallets) ? detail.wallets.length : undefined,
    });
    if (detail.user?.wallet?.address && !state.walletAddress) {
      state.walletAddress = detail.user.wallet.address;
    }
    renderWallet();
    refreshConnectLabels();
  });

  document.addEventListener("click", (event) => {
    const topNav = event.target.closest("[data-top-nav]");
    if (topNav) {
      showScreen(topNav.dataset.topNav);
      return;
    }

    const nav = event.target.closest("[data-nav]");
    if (nav) {
      showScreen(nav.dataset.nav);
      return;
    }

    const open = event.target.closest("[data-open-channel]");
    if (open) {
      openChannel(open.dataset.openChannel);
      return;
    }

    const route = event.target.closest("[data-open-route]");
    if (route) {
      showScreen(route.dataset.openRoute);
      return;
    }

    const dealAction = event.target.closest("[data-deal-action]");
    if (dealAction?.dataset.dealAction === "counter") {
      counterOffer();
      return;
    }
    if (dealAction?.dataset.dealAction === "accept") {
      acceptOffer();
      return;
    }
    if (dealAction?.dataset.dealAction === "reject") {
      showToast("Offer rejected.");
      return;
    }

    const paymentMode = event.target.closest("[data-payment-mode]");
    if (paymentMode) {
      state.paymentMode = paymentMode.dataset.paymentMode;
      renderPayment();
      return;
    }

    if (event.target.closest("[data-connect-wallet]")) {
      connectWallet({ goToInbox: state.screen === "unlock" });
      return;
    }

    if (event.target.closest("[data-escrow-release]")) {
      releaseEscrow();
      return;
    }

    if (event.target.closest("[data-escrow-dispute]")) {
      showToast("Dispute started.");
      return;
    }

    if (event.target.closest("[data-payment-review]")) {
      showToast("Payment reviewed.");
      return;
    }

    if (event.target.closest("[data-export-proof]")) {
      state.proofExported = true;
      showToast("Proof exported.");
      return;
    }

    if (event.target.closest("[data-new-conversation]")) {
      showToast("New conversation ready.");
      return;
    }

    const composerAction = event.target.closest("[data-composer-action]");
    if (composerAction?.dataset.composerAction === "memo") {
      showScreen("payment");
      return;
    }
    if (composerAction) {
      showToast("Attachment ready.");
    }
  });

  conversationSearch?.addEventListener("input", renderConversationList);

  composerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = messageInput.value.trim();
    if (!value) return;
    messageInput.value = "";
    messageInput.style.height = "";
    await sendChat(value);
  });

  messageInput?.addEventListener("input", () => {
    messageInput.style.height = "";
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
  });

  document.querySelector("#payment-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendPayment();
  });
}

function init() {
  bindEvents();
  mountPrivy().catch((error) => {
    veilError("auth.privy.sdk.load.failed", error, {
      where: "init",
      howToFix: "Confirm @privy-io/react-auth can load, VITE_PRIVY_APP_ID is valid, and the browser can reach the module CDN or bundled dependency.",
    });
    showToast("Privy SDK failed to load.");
  });
  renderConversationList();
  refreshConnectLabels();
  showScreen("unlock", { keepScroll: true });
  iconRefresh();
  setTimeout(iconRefresh, 250);
}

init();
