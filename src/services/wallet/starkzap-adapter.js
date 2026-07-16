import { StarkZap } from "starkzap-sdk";
import { accountPresets } from "starkzap-account-presets";
import { OnboardStrategy } from "starkzap-onboard";
import { currentOrigin } from "./privy-bridge.js";
import { ensureHex } from "./wallet-format.js";

const SILENT_SDK_LOGGER = Object.freeze({
  debug() {},
  error() {},
  info() {},
  log() {},
  warn() {},
});

export function createStarkZapAdapter({
  config,
  state,
  logger,
  fetchPrivyStarknetWallet,
  updateWalletInitialization,
  getStarkZapChainId,
}) {
  let starkzapSdk;
  let starkzapOnboardResult;

  function getStarkZapSdk(options = {}) {
    if (!options.paymasterAccessToken && starkzapSdk) return starkzapSdk;
    const paymasterNodeUrl = new URL("/api/paymaster", currentOrigin()).toString();
    const paymasterConfig = options.paymasterAccessToken
      ? {
          paymaster: {
            nodeUrl: paymasterNodeUrl,
            headers: {
              Authorization: `Bearer ${options.paymasterAccessToken}`,
            },
          },
        }
      : {};
    starkzapSdk = new StarkZap({
      rpcUrl: config.privyStarknetRpcUrl,
      chainId: getStarkZapChainId(),
      ...paymasterConfig,
      logging: {
        logger: SILENT_SDK_LOGGER,
        logLevel: "error",
      },
    });
    logger.veilLog("info", "starkzap.sdk.created", {
      where: "getStarkZapSdk",
      chainId: config.expectedChainId,
      rpcConfigured: Boolean(config.privyStarknetRpcUrl),
      paymasterConfigured: Boolean(options.paymasterAccessToken),
      paymasterNodeUrl: options.paymasterAccessToken ? paymasterNodeUrl : undefined,
    });
    return starkzapSdk;
  }

  async function createPrivyStarknetAccount(bridge, traceId = logger.createTraceId("starkzap-onboard")) {
    if (state.privyAccount && state.privyProvider) {
      logger.tracePrivyStarkZap(traceId, "sdk_onboard.cached_account.hit", {
        where: "createPrivyStarknetAccount",
        address: state.walletAddress,
        deployed: state.privyAccountDeployed,
      });
      return { account: state.privyAccount, provider: state.privyProvider };
    }

    updateWalletInitialization("creating_account", traceId, {
      message: "Creating Starknet Account",
    });
    const wallet = await fetchPrivyStarknetWallet(bridge, traceId);
    const publicKey = ensureHex(wallet.publicKey || wallet.public_key);
    if (!wallet.id || !publicKey) {
      const error = new Error("Privy Starknet wallet is missing wallet id or public key.");
      logger.veilError("trace.privy_starkzap.wallet.invalid_for_onboard", error, {
        traceId,
        where: "createPrivyStarknetAccount",
        walletIdPresent: Boolean(wallet.id),
        publicKeyPresent: Boolean(publicKey),
        howToFix: "Ensure /api/wallet/starknet returns wallet.id and wallet.publicKey exactly as StarkZap Privy onboarding expects.",
      });
      throw error;
    }

    let paymasterAccessToken = "";
    if (config.avnuPaymasterEnabled) {
      updateWalletInitialization("connecting_paymaster", traceId, {
        message: "Preparing Gas Sponsor",
      });
      paymasterAccessToken = await bridge.getAccessToken?.();
      if (!paymasterAccessToken) {
        const error = new Error("Privy access token is missing for AVNU Paymaster proxy.");
        logger.veilError("trace.privy_starkzap.paymaster.get_access_token.failed", error, {
          traceId,
          where: "createPrivyStarknetAccount",
          walletId: wallet.id,
          howToFix: "Refresh the Privy session before onboarding so /api/paymaster can authenticate the sponsorship request.",
        });
        throw error;
      }
    }

    const sdk = getStarkZapSdk({ paymasterAccessToken });
    const signEndpoint = new URL("/api/wallet/sign", currentOrigin()).toString();

    try {
      updateWalletInitialization("deploying", traceId, {
        message: "Creating Starknet Account",
      });
      starkzapOnboardResult = await sdk.onboard({
        strategy: OnboardStrategy.Privy,
        accountPreset: accountPresets.argentXV050,
        deploy: "if_needed",
        ...(config.avnuPaymasterEnabled ? { feeMode: { type: "paymaster" } } : {}),
        privy: {
          resolve: async () => ({
            walletId: wallet.id,
            publicKey,
            serverUrl: signEndpoint,
            headers: async () => {
              const accessToken = await bridge.getAccessToken?.();
              if (!accessToken) throw new Error("Privy access token is missing.");
              return { Authorization: `Bearer ${accessToken}` };
            },
            metadata: {
              privyWalletAddress: wallet.address,
            },
          }),
        },
        onProgress: (event) => {
          const progress = String(event?.step || event?.status || event?.type || "").toLowerCase();
          if (progress.includes("paymaster")) {
            updateWalletInitialization("connecting_paymaster", traceId, {
              message: "Preparing Gas Sponsor",
            });
          } else if (progress.includes("deploy")) {
            updateWalletInitialization("deploying", traceId, {
              message: "Creating Starknet Account",
            });
          } else if (progress.includes("wallet") || progress.includes("account") || progress.includes("resolve")) {
            updateWalletInitialization("creating_account", traceId, {
              message: "Creating Starknet Account",
            });
          }
          logger.tracePrivyStarkZap(traceId, "sdk_onboard.progress", {
            where: "createPrivyStarknetAccount",
            walletId: wallet.id,
            ...event,
          });
        },
      });
    } catch (error) {
      logger.veilError("trace.privy_starkzap.sdk_onboard.failed", error, {
        traceId,
        where: "createPrivyStarknetAccount",
        walletId: wallet.id,
        chainId: config.expectedChainId,
        signEndpoint,
        howToFix: "Check the preceding trace for wallet response validity, /api/wallet/sign status, Starknet RPC/network, and StarkZap deploy/sign errors.",
      });
      throw error;
    }

    const connectedWallet = starkzapOnboardResult.wallet;
    const account = connectedWallet.getAccount();
    const provider = connectedWallet.getProvider();
    const accountAddress = connectedWallet.address || account.address;

    state.privyAccount = connectedWallet;
    state.privyProvider = provider;
    state.walletAddress = accountAddress;
    state.walletSource = "Privy";
    state.privyWallet = { ...wallet, address: accountAddress, publicKey };
    state.privyAccountDeployed = Boolean(starkzapOnboardResult.deployed);

    logger.tracePrivyStarkZap(traceId, "sdk_onboard.success", {
      where: "createPrivyStarknetAccount",
      walletId: wallet.id,
      address: accountAddress,
      deployed: state.privyAccountDeployed,
      feeMode: config.avnuPaymasterEnabled ? "paymaster" : "user_pays",
    });

    return { account: connectedWallet, provider, starknetAccount: account, wallet: connectedWallet };
  }

  function resetStarkZap() {
    starkzapOnboardResult = undefined;
  }

  return { createPrivyStarknetAccount, getStarkZapSdk, resetStarkZap };
}
