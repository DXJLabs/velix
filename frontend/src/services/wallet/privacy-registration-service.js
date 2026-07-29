import {
  BrowserEncryptedPrivacyProfileStore,
  BrowserIndexedDbDeviceStorageKeyRepository,
  PersistentDeviceStorageKeyProvider,
  PrivacyProfileViewingKeyVault,
  ProvingServiceProofProvider,
  computeProvingBlockId,
  constants,
  createPrivacyNamespace,
  createReadyPrivateTransfersUser,
  prepareOfficialRegistrationProof,
  submitOfficialRegistration,
} from "../veil-client-service.js";

const PROVING_TIMEOUT_MS = 300 * 60 * 1_000;
const STARKNET_HEX_FELT = /^0x[0-9a-f]+$/iu;

export async function fetchPrivacyPoolNonce({
  rpcUrl,
  poolAddress,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Browser fetch is unavailable for Privacy Pool nonce lookup.");
  }

  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "starknet_getNonce",
      params: {
        block_id: "latest",
        contract_address: poolAddress,
      },
    }),
  });

  if (!response?.ok) {
    throw new Error(
      `Privacy Pool nonce RPC failed with HTTP ${response?.status ?? "unknown"}.`,
    );
  }

  const payload = await response.json();
  if (
    typeof payload?.result !== "string"
    || !STARKNET_HEX_FELT.test(payload.result)
  ) {
    throw new Error("Privacy Pool nonce RPC returned no valid hexadecimal result.");
  }

  return BigInt(payload.result);
}

export function createNoncePinnedProvingProvider({
  proverUrl,
  chainId,
  blockIdentifier,
  requestTimeoutMs,
  retry,
  getNonce,
}) {
  const provider = new ProvingServiceProofProvider(
    proverUrl,
    chainId,
    {
      blockIdentifier,
      requestTimeoutMs,
      retry,
    },
  );

  let cachedNonce;
  return {
    prove: provider.prove.bind(provider),
    async getDefaultDetails() {
      const details = await provider.getDefaultDetails();
      if (cachedNonce === undefined) cachedNonce = await getNonce();
      return { ...details, nonce: cachedNonce };
    },
    invalidateNonceCache() {
      cachedNonce = undefined;
      provider.invalidateNonceCache?.();
    },
  };
}

export function evaluatePrivacyRegistrationReadiness({
  config,
  context,
  windowRef = window,
}) {
  if (!context?.account || !context?.readProvider) {
    return blocked("wallet", "Connect Ready Wallet first.");
  }
  if (typeof context.account?.signer?.signTransaction !== "function") {
    return blocked(
      "signer",
      "Ready Wallet did not expose the Official SDK transaction signer.",
    );
  }
  if (typeof context.account.execute !== "function") {
    return blocked("execute", "Ready Wallet does not expose account.execute().");
  }
  if (
    typeof context.readProvider.getBlockNumber !== "function"
    || typeof context.readProvider.waitForTransaction !== "function"
    || typeof context.readProvider.callContract !== "function"
  ) {
    return blocked(
      "provider",
      "The Starknet Sepolia provider is missing registration methods.",
    );
  }
  if (
    !config.privacyRuntime?.sdk?.installed
    || !config.privacyRuntime?.sdk?.compatible
  ) {
    return blocked(
      "sdk",
      "The pinned Official Privacy SDK is unavailable or incompatible.",
    );
  }
  if (
    !config.privacyRuntime?.prover?.configured
    || !config.privacyRuntime?.prover?.url
  ) {
    return blocked(
      "prover",
      "Configure the reviewed transaction prover before registration.",
    );
  }
  if (!config.privacyPoolAddress || !config.rpcUrl) {
    return blocked("runtime", "The locked Privacy Pool or Sepolia RPC is missing.");
  }
  if (
    !windowRef.indexedDB
    || !windowRef.crypto?.subtle
    || typeof windowRef.fetch !== "function"
  ) {
    return blocked(
      "storage",
      "Encrypted browser storage is unavailable on this device.",
    );
  }
  return Object.freeze({
    ready: true,
    code: "ready",
    reason: "Ready Wallet, encrypted storage, Pool, RPC, and prover are available.",
  });
}

export function createPrivacyRegistrationService({
  config,
  state,
  logger,
  getContext,
  onStateChanged = () => {},
  windowRef = window,
}) {
  function refreshReadiness() {
    const readiness = evaluatePrivacyRegistrationReadiness({
      config,
      context: getContext(),
      windowRef,
    });
    state.privacyRegistrationReadiness = readiness.ready ? "ready" : "blocked";
    state.privacyRegistrationReason = readiness.reason;
    state.privacyRegistrationReadinessCode = readiness.code;
    onStateChanged();
    return readiness;
  }

  async function registerPrivateIdentity() {
    if (state.privacyRegistrationStatus === "registered") {
      return {
        alreadyRegistered: true,
        transactionHash: state.privacyRegistrationTxHash || "",
      };
    }

    const readiness = refreshReadiness();
    if (!readiness.ready) {
      throw Object.assign(new Error(readiness.reason), {
        code: "PRIVACY_REGISTRATION_BLOCKED",
      });
    }

    const context = getContext();
    let stage = "initialization";
    setActionState("preparing", "Preparing encrypted private identity...");

    try {
      stage = "Ready account validation";
      const user = createReadyPrivateTransfersUser(context.account);
      stage = "privacy namespace creation";
      const namespace = createPrivacyNamespace({
        chainId: config.expectedChainId,
        poolAddress: config.privacyPoolAddress,
        accountAddress: context.account.address,
        provider: config.privacyRuntime.discovery.provider === "indexer"
          ? "indexer"
          : "contract",
        providerIdentity: config.privacyRuntime.discovery.provider === "indexer"
          ? config.privacyRuntime.discovery.url
          : config.rpcUrl,
      });

      stage = "encrypted viewing-key storage";
      const keyRepository = new BrowserIndexedDbDeviceStorageKeyRepository({
        indexedDb: windowRef.indexedDB,
      });
      const deviceKeyProvider = new PersistentDeviceStorageKeyProvider({
        repository: keyRepository,
        crypto: windowRef.crypto,
      });
      const encryptedStore = new BrowserEncryptedPrivacyProfileStore({
        getDeviceStorageKey: () => deviceKeyProvider.getDeviceStorageKey(),
        indexedDb: windowRef.indexedDB,
        crypto: windowRef.crypto,
      });
      const viewingKeyVault = new PrivacyProfileViewingKeyVault(encryptedStore);

      stage = "latest block lookup";
      const currentBlock = await context.readProvider.getBlockNumber();
      const provingBlockId = computeProvingBlockId(currentBlock);

      stage = "Privacy Pool nonce lookup";
      const fetchImpl = windowRef.fetch.bind(windowRef);
      const provingProvider = createNoncePinnedProvingProvider({
        proverUrl: config.privacyRuntime.prover.url,
        chainId: constants.StarknetChainId.SN_SEPOLIA,
        blockIdentifier: provingBlockId,
        requestTimeoutMs: PROVING_TIMEOUT_MS,
        retry: { maxRetries: 0 },
        getNonce: () => fetchPrivacyPoolNonce({
          rpcUrl: config.rpcUrl,
          poolAddress: config.privacyPoolAddress,
          fetchImpl,
        }),
      });

      stage = "official proof generation";
      setActionState("proving", "Generating the official registration proof...");
      const prepared = await prepareOfficialRegistrationProof({
        user,
        namespace,
        viewingKeyVault,
        provingProvider,
        poolAddress: BigInt(config.privacyPoolAddress),
        provingBlockId,
        crypto: windowRef.crypto,
      });

      stage = "Ready proof submission";
      setActionState("submitting", "Approve private identity registration in Ready.");
      const submitted = await submitOfficialRegistration({
        account: context.account,
        provider: context.readProvider,
        result: prepared.result,
        provingProvider,
        namespace,
        viewingKeyVault,
        poolAddress: config.privacyPoolAddress,
      });

      state.privacyRegistrationStatus = "registered";
      state.privacyRegistrationTxHash = submitted.transactionHash;
      state.privacyRegistrationReadiness = "registered";
      state.privacyRegistrationReadinessCode = "registered";
      setActionState(
        "registered",
        "Private identity verified in the VEIL Privacy Pool.",
      );

      logger.veilLog?.("info", "wallet.privacy.registration.success", {
        where: "registerPrivateIdentity",
        transactionHash: submitted.transactionHash,
        accountAddress: submitted.accountAddress,
        poolAddress: submitted.poolAddress,
      });
      return submitted;
    } catch (error) {
      const baseReason = registrationFailureMessage(error);
      const reason = `Registration failed during ${stage}: ${baseReason}`;
      const surfacedError = Object.assign(
        new Error(reason, { cause: error }),
        {
          code: error?.code || "PRIVACY_REGISTRATION_FAILED",
          registrationStage: stage,
        },
      );
      state.privacyRegistrationActionStatus = "failed";
      state.privacyRegistrationReason = reason;
      logger.veilError?.("wallet.privacy.registration.failed", surfacedError, {
        where: "registerPrivateIdentity",
        stage,
        howToFix: reason,
      });
      onStateChanged();
      throw surfacedError;
    }
  }

  function setActionState(status, reason) {
    state.privacyRegistrationActionStatus = status;
    state.privacyRegistrationReason = reason;
    onStateChanged();
  }

  return {
    refreshReadiness,
    registerPrivateIdentity,
  };
}

function blocked(code, reason) {
  return Object.freeze({ ready: false, code, reason });
}

function registrationFailureMessage(error) {
  const message = String(error?.message || error || "");
  if (/rejected|declined|cancel/iu.test(message)) {
    return "Registration was cancelled in Ready Wallet.";
  }
  if (/prover|proof/iu.test(message)) {
    return "The transaction prover could not generate a valid registration proof.";
  }
  if (/viewing key|storage|indexeddb|crypto/iu.test(message)) {
    return "Encrypted private identity storage is unavailable on this device.";
  }
  if (/signature|signtransaction|signer/iu.test(message)) {
    return "Ready Wallet did not provide the signer required by the Official SDK.";
  }
  return message || "Private identity registration failed.";
}
