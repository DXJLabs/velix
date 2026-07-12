import { CHAT_DISPLAY_MODE } from "../../app/runtime-config.js";

export function createTransactionSubmitService({
  config,
  state,
  logger,
  connectWallet,
  hasDirectTransport,
  verifyHelperDeployment,
  getVeilClient,
  transactionDelay,
  beginTransactionModal,
  updateTransactionModalStage,
  finishTransactionModal,
  failTransactionModal,
  setAppLoading,
  clearAppLoading,
  showToast,
  addLocalItem,
  updateLocalItem,
  renderLoadingState,
  walletAddressValue,
  expectedNetworkName,
}) {
  let transactionSubmitInFlight = false;

  async function safeSubmit(action, localItem, success, overlayOptions = {}) {
    if (transactionSubmitInFlight) {
      showToast("Transaction is still processing.");
      return false;
    }
    transactionSubmitInFlight = true;
    beginTransactionModal(localItem, success, overlayOptions);
    setAppLoading("transaction", "Preparing transaction...");
    const pendingItem = {
      ...localItem,
      status: "encrypting",
      mode: localItem.mode || CHAT_DISPLAY_MODE,
    };
    addLocalItem(pendingItem);
    try {
      if (config.timelineMode === "encrypted-direct" && !hasDirectTransport()) {
        const connected = await connectWallet();
        if (!connected) {
          updateLocalItem(pendingItem, {
            status: "failed",
            errorLabel: "Cancelled",
            errorMessage: "Wallet connection was not completed.",
          });
          clearAppLoading("transaction", { keepToast: true });
          failTransactionModal({
            label: "Cancelled",
            toast: "Wallet connection cancelled.",
            why: "Wallet connection was not completed.",
          });
          return false;
        }
      }
      updateTransactionModalStage("network");
      setAppLoading("transaction", "Checking network...");
      if (config.timelineMode === "encrypted-direct" && !(await verifyHelperDeployment({
        veilClient: getVeilClient(),
        channelId: state.channelId,
      }))) {
        updateLocalItem(pendingItem, {
          status: "failed",
          errorLabel: "Failed",
          errorMessage: "Helper contract verification failed on the configured network.",
        });
        clearAppLoading("transaction");
        failTransactionModal({
          label: "Failed",
          toast: "Network check failed.",
          why: "Helper contract verification failed on the configured network.",
        });
        return false;
      }
      logger.veilLog("info", "transaction.submit.start", {
        where: "safeSubmit",
        timelineMode: config.timelineMode,
        helperAddress: config.helperAddress,
        eventType: localItem?.type,
      });
      updateLocalItem(pendingItem, { status: "signing" });
      updateTransactionModalStage("signing");
      setAppLoading("transaction", "Waiting for signature...");
      const result = await action();
      if (state.transactionModal.stage !== "broadcasting") {
        updateTransactionModalStage("broadcasting", {
          txHash: result?.transactionHash || "",
        });
      }
      setAppLoading("transaction", "Submitting onchain...");
      await transactionDelay(700);
      logger.veilLog("info", "transaction.submit.success", {
        where: "safeSubmit",
        timelineMode: config.timelineMode,
        transactionHash: result?.transactionHash,
        eventId: result?.eventId,
      });
      updateLocalItem(pendingItem, {
        txHash: result?.transactionHash,
        blockNumber: result?.blockNumber,
        status: result?.status || "pending",
        mode: pendingItem.mode,
        time: result?.timestamp || pendingItem.time,
      });
      clearAppLoading("transaction");
      finishTransactionModal(result, overlayOptions);
      return true;
    } catch (error) {
      const errorDetails = classifyTransactionError(error);
      logger.veilError("transaction.submit.failed", error, {
        where: "safeSubmit",
        timelineMode: config.timelineMode,
        helperAddress: config.helperAddress,
        transactionErrorCode: errorDetails.code,
        howToFix: errorDetails.howToFix,
      });
      if (errorDetails.code === "INSUFFICIENT_FEE_BALANCE") {
        logger.veilLog("warn", "wallet.fee_balance.insufficient", {
          where: "safeSubmit",
          walletAddress: walletAddressValue(),
          network: config.expectedChainId,
          why: errorDetails.why,
          howToFix: errorDetails.howToFix,
        });
      }
      updateLocalItem(pendingItem, {
        status: "failed",
        errorLabel: errorDetails.label,
        errorMessage: errorDetails.why,
      });
      clearAppLoading("transaction");
      failTransactionModal(errorDetails);
      return false;
    } finally {
      transactionSubmitInFlight = false;
      renderLoadingState();
    }
  }

  function classifyTransactionError(error) {
    const message = error?.message || String(error);
    const encryptionErrorCopy = {
      LOCAL_ENCRYPTION_IDENTITY_MISSING: "Create a local encryption identity before sending messages.",
      ENCRYPTION_KEY_REGISTRY_UNAVAILABLE: "Configure and verify the encryption key registry.",
      RECIPIENT_ENCRYPTION_KEY_NOT_FOUND: "The recipient must register an encryption public key first.",
      RECIPIENT_ENCRYPTION_KEY_INVALID: "The registry returned an invalid recipient encryption key.",
      CHANNEL_KEY_DERIVATION_FAILED: "Retry after reloading verified participant encryption keys.",
      ENCRYPTION_IDENTITY_REGISTRATION_REQUIRED: "Register the current device encryption public key first.",
    };
    if (error?.code in encryptionErrorCopy) {
      return {
        code: error.code,
        label: "Encryption unavailable",
        toast: error.code === "RECIPIENT_ENCRYPTION_KEY_NOT_FOUND"
          ? "Recipient encryption unavailable."
          : "Encryption identity setup required.",
        why: message,
        howToFix: encryptionErrorCopy[error.code],
      };
    }
    if (error?.code === "STRK20_RUNTIME_UNAVAILABLE") {
      return {
        code: "STRK20_RUNTIME_UNAVAILABLE",
        label: "Coming Soon",
        toast: "Shielded via STRK20 is coming soon.",
        why: message,
        howToFix: "Choose Encrypted On-chain for the currently available messaging path.",
      };
    }
    if (
      message.includes("Privacy Pool-derived encryption") ||
      message.includes("Privacy Pool-derived channel bootstrap") ||
      message.includes("Privacy Pool transport")
    ) {
      return {
        code: "ENCRYPTION_NOT_CONFIGURED",
        label: "Failed",
        toast: "Message encryption key is not configured.",
        why: message,
        howToFix: "Configure Privacy Pool-derived channel bootstrap material and a Starknet Privacy SDK action builder before retrying.",
      };
    }

    if (/reject|rejected|denied|cancel|cancelled|user abort/i.test(message)) {
      return {
        code: "USER_CANCELLED",
        label: "Cancelled",
        toast: "Cancelled.",
        why: message,
        howToFix: "Retry the action and approve the wallet signature if the transaction is still needed.",
      };
    }

    if (/timeout|timed out|network|fetch failed|rpc/i.test(message)) {
      return {
        code: "RPC_TIMEOUT",
        label: "Retrying...",
        toast: "Network retry needed.",
        why: message,
        howToFix: "Check Starknet Sepolia RPC availability, then retry the action.",
      };
    }

    if (/exceeds? balance|insufficient.*balance|balance \(0\)|fee.*balance/i.test(message)) {
      const address = walletAddressValue();
      return {
        code: "INSUFFICIENT_FEE_BALANCE",
        label: "Failed",
        toast: `Fund ${expectedNetworkName()} STRK for gas.`,
        why: message,
        howToFix: `Fund ${address || "the connected account"} with ${expectedNetworkName()} STRK, then refresh Wallet and retry.`,
      };
    }

    return {
      code: "ONCHAIN_SUBMIT_FAILED",
      label: "Failed",
      toast: config.timelineMode === "encrypted-direct" ? "Onchain action failed. Check Sepolia." : "Action failed.",
      why: message,
      howToFix: "Confirm wallet account deployment, Sepolia funds, Starknet RPC health, and helper contract deployment before retrying.",
    };
  }

  return { safeSubmit, classifyTransactionError };
}
