// Signs the user in against the backend's SIWE-style wallet auth
// (see backend/services/security/wallet-siwe-auth.ts + api/auth/*.js).
// This is best-effort: the durable-prover backend it authenticates for
// isn't wired into any UI flow yet (see STRK20_INTEGRATION_PLAN.md, Phase
// 5), so a failure here must never block wallet connection itself.
export function createWalletAuthService({
  fetchImpl = fetch,
  apiBaseUrl = "",
  logger,
} = {}) {
  let session = null; // { sessionToken, address, expiresAtMs }

  async function signIn(wallet, address) {
    const challenge = await requestJson("/api/auth/challenge", { address });

    const signature = await requestWalletSignature(wallet, challenge.typedData);

    const verified = await requestJson("/api/auth/verify", {
      address,
      challengeToken: challenge.challengeToken,
      signature,
    });

    session = {
      sessionToken: verified.sessionToken,
      address,
      expiresAtMs: verified.expiresAtMs,
    };
    logger?.veilLog?.("info", "wallet.auth.session.established", {
      where: "walletAuthService.signIn",
    });
    return session;
  }

  function getSession() {
    if (!session) return null;
    if (Date.now() >= session.expiresAtMs) {
      session = null;
      return null;
    }
    return session;
  }

  function clearSession() {
    session = null;
  }

  async function authenticatedFetch(path, init = {}) {
    const current = getSession();
    if (!current) {
      throw new Error("No wallet session. Call signIn(wallet, address) first.");
    }
    return fetchImpl(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${current.sessionToken}`,
      },
    });
  }

  async function requestJson(path, body) {
    const response = await fetchImpl(`${apiBaseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.why || payload?.error || `${path} failed with status ${response.status}.`);
    }
    return payload;
  }

  async function requestWalletSignature(wallet, typedData) {
    if (typeof wallet?.request !== "function") {
      throw new Error("The connected wallet does not support signing requests.");
    }
    const result = await wallet.request({
      type: "wallet_signTypedData",
      params: typedData,
    });
    const signature = Array.isArray(result) ? result : result?.signature;
    if (!Array.isArray(signature) || signature.length < 1) {
      throw new Error("The wallet returned no signature for the sign-in request.");
    }
    return signature.map((element) => normalizeFeltHex(element));
  }

  function normalizeFeltHex(value) {
    if (typeof value === "string" && value.startsWith("0x")) return value;
    return `0x${BigInt(value).toString(16)}`;
  }

  return {
    signIn,
    getSession,
    clearSession,
    authenticatedFetch,
  };
}
