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
  if (!windowRef.indexedDB || !windowRef.crypto?.subtle) {
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
    setActionState("preparing", "Preparing encrypted private identity...");

    try {
      const user = createReadyPrivateTransfersUser(context.account);
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

      const currentBlock = await context.readProvider.getBlockNumber();
      const provingBlockId = computeProvingBlockId(currentBlock);
      const provingProvider = new ProvingServiceProofProvider(
        config.privacyRuntime.prover.url,
        constants.StarknetChainId.SN_SEPOLIA,
        {
          nodeUrl: config.rpcUrl,
          poolAddress: BigInt(config.privacyPoolAddress),
          blockIdentifier: provingBlockId,
          requestTimeoutMs: PROVING_TIMEOUT_MS,
          retry: { maxRetries: 0 },
        },
      );

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
      const reason = registrationFailureMessage(error);
      state.privacyRegistrationActionStatus = "failed";
      state.privacyRegistrationReason = reason;
      logger.veilError?.("wallet.privacy.registration.failed", error, {
        where: "registerPrivateIdentity",
        howToFix: reason,
      });
      onStateChanged();
      throw error;
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
