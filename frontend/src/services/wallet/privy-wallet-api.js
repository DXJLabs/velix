import { splitPrivySignature } from "./wallet-format.js";
import { summarizePrivyBridge } from "./privy-bridge.js";

export function createPrivyWalletApi({ state, logger }) {
  async function fetchPrivyStarknetWallet(bridge, traceId = logger.createTraceId("privy-wallet")) {
    if (state.privyWallet) {
      logger.tracePrivyStarkZap(traceId, "wallet.cached_state.hit", {
        where: "fetchPrivyStarknetWallet",
        walletId: state.privyWallet.id,
        address: state.privyWallet.address,
      });
      return state.privyWallet;
    }

    logger.tracePrivyStarkZap(traceId, "get_access_token.start", {
      where: "fetchPrivyStarknetWallet",
      ...summarizePrivyBridge(bridge),
    });
    const accessToken = await bridge.getAccessToken?.();
    if (!accessToken) {
      const error = new Error("Privy access token is missing.");
      logger.veilError("trace.privy_starkzap.get_access_token.failed", error, {
        traceId,
        where: "fetchPrivyStarknetWallet",
        howToFix: "Confirm authenticated === true before requesting the Starknet wallet, then retry after refreshing the Privy session.",
      });
      throw error;
    }

    const userId = bridge.user?.id || bridge.user?.did || "veil-user";
    const cacheKey = `veil:privy:starknet:v2:${userId}`;
    const cachedWallet = JSON.parse(window.localStorage.getItem(cacheKey) || "null");
    if (cachedWallet?.id && cachedWallet?.publicKey) {
      logger.tracePrivyStarkZap(traceId, "wallet.local_storage.hit", {
        where: "fetchPrivyStarknetWallet",
        walletId: cachedWallet.id,
        address: cachedWallet.address,
        publicKeyPresent: Boolean(cachedWallet.publicKey),
      });
      state.privyWallet = cachedWallet;
      state.walletAddress = cachedWallet.address || state.walletAddress;
      state.walletSource = "Privy";
      return cachedWallet;
    }

    logger.tracePrivyStarkZap(traceId, "wallet_api.request", {
      where: "fetchPrivyStarknetWallet",
      endpoint: "/api/wallet/starknet",
      method: "POST",
    });
    const response = await fetch("/api/wallet/starknet", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({}),
    });
    const payload = await logger.readResponsePayload(response);

    logger.tracePrivyStarkZap(traceId, "wallet_api.response", {
      where: "fetchPrivyStarknetWallet",
      endpoint: "/api/wallet/starknet",
      status: response.status,
      ok: response.ok,
      requestId: payload.requestId,
      code: payload.code,
    });

    if (!response.ok) {
      const error = new Error(payload.error || payload.why || "Failed to create Starknet wallet with Privy.");
      logger.veilError("trace.privy_starkzap.wallet_api.failed", error, {
        traceId,
        where: "fetchPrivyStarknetWallet",
        endpoint: "/api/wallet/starknet",
        status: response.status,
        requestId: payload.requestId,
        code: payload.code,
        apiWhere: payload.where,
        apiWhy: payload.why,
        apiHowToFix: payload.howToFix,
        howToFix: payload.howToFix || "Open Vercel function logs for this requestId and verify PRIVY_APP_ID, PRIVY_APP_SECRET, and PRIVY_VERIFICATION_KEY.",
      });
      throw error;
    }

    const { wallet } = payload;
    if (!wallet?.id || !wallet?.publicKey) {
      const error = new Error("Privy Starknet wallet response is missing wallet.id or wallet.publicKey.");
      logger.veilError("trace.privy_starkzap.wallet_response.invalid", error, {
        traceId,
        where: "fetchPrivyStarknetWallet",
        endpoint: "/api/wallet/starknet",
        responseKeys: Object.keys(payload || {}),
        howToFix: "Return { wallet: { id, address, publicKey } } from /api/wallet/starknet.",
      });
      throw error;
    }

    logger.veilLog("info", "wallet.starknet.api.success", {
      traceId,
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

  async function signWithPrivy(walletId, messageHash, bridge, traceId = logger.createTraceId("privy-sign")) {
    logger.tracePrivyStarkZap(traceId, "sign.get_access_token.start", {
      where: "signWithPrivy",
      walletId,
    });
    const accessToken = await bridge.getAccessToken?.();
    if (!accessToken) {
      const error = new Error("Privy access token is missing before wallet signing.");
      logger.veilError("trace.privy_starkzap.sign.get_access_token.failed", error, {
        traceId,
        where: "signWithPrivy",
        walletId,
        howToFix: "Confirm the Privy session is still authenticated, then retry the signing action.",
      });
      throw error;
    }

    const response = await fetch("/api/wallet/sign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ walletId, hash: messageHash }),
    });
    const payload = await logger.readResponsePayload(response);

    logger.tracePrivyStarkZap(traceId, "sign_api.response", {
      where: "signWithPrivy",
      endpoint: "/api/wallet/sign",
      walletId,
      status: response.status,
      ok: response.ok,
      requestId: payload.requestId,
      code: payload.code,
    });

    if (!response.ok) {
      const error = new Error(payload.error || payload.why || "Privy raw sign failed.");
      logger.veilError("trace.privy_starkzap.sign_api.failed", error, {
        traceId,
        where: "signWithPrivy",
        endpoint: "/api/wallet/sign",
        walletId,
        status: response.status,
        requestId: payload.requestId,
        code: payload.code,
        apiWhere: payload.where,
        apiWhy: payload.why,
        apiHowToFix: payload.howToFix,
        howToFix: payload.howToFix || "Open Vercel function logs for this requestId and confirm the wallet id belongs to the authenticated Privy user.",
      });
      throw error;
    }

    logger.veilLog("info", "wallet.sign.api.success", {
      traceId,
      where: "signWithPrivy",
      walletId,
    });
    return splitPrivySignature(payload.signature);
  }

  return { fetchPrivyStarknetWallet, signWithPrivy };
}
