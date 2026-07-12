import { renderTransactionModalElement } from "../../ui/transactions/transaction-modal-ui.js";

export function transactionDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createTransactionModalController({
  state,
  modalElement,
  document,
  explorerUrl,
  transactionExplorerUrl,
  inferOverlayCopy,
  currentAmount,
  setLucideIcon,
} = {}) {
  let timer;

  function setTransactionModal(updates = {}) {
    Object.assign(state.transactionModal, updates);
    renderTransactionModal();
  }

  function beginTransactionModal(localItem, success, options = {}) {
    clearTimeout(timer);
    const copy = {
      ...inferOverlayCopy(localItem, success, currentAmount()),
      ...options,
    };
    setTransactionModal({
      visible: true,
      stage: "preparing",
      actionLabel: copy.actionLabel,
      title: copy.actionLabel,
      subtitle: "Please approve the request in your wallet.",
      detail: "Waiting for signature...",
      successTitle: copy.successTitle,
      successSubtitle: copy.successSubtitle,
      txHash: "",
    });
  }

  function beginWalletModal() {
    clearTimeout(timer);
    setTransactionModal({
      visible: true,
      stage: "wallet",
      actionLabel: "Connecting Wallet",
      title: "Connecting Wallet",
      subtitle: "Please approve the request in your wallet.",
      detail: "Waiting for signature...",
      successTitle: "Wallet Connected",
      successSubtitle: "Opening encrypted channel...",
      txHash: "",
    });
  }

  function beginChannelModal({ inviteOnly = false, person = "Bob", dealId = "" } = {}) {
    clearTimeout(timer);
    const title = inviteOnly ? "Creating Invite Link" : "Creating Deal Channel";
    setTransactionModal({
      visible: true,
      stage: "channel",
      actionLabel: title,
      title,
      subtitle: inviteOnly ? "Generating private invitation." : "Preparing private deal channel.",
      detail: inviteOnly ? "Creating invite..." : "Creating channel...",
      successTitle: inviteOnly ? "Invite Link Ready" : "Deal Channel Created",
      successSubtitle: inviteOnly
        ? `${dealId || "Deal"} is waiting for ${person}.`
        : `Waiting for ${person} to accept.`,
      txHash: "",
    });
  }

  function finishChannelModal({ title, subtitle, detail = "" } = {}) {
    updateTransactionModalStage("success", {
      title: title || state.transactionModal.successTitle,
      subtitle: subtitle || state.transactionModal.successSubtitle,
      detail,
      txHash: "",
    });
    clearTimeout(timer);
    timer = setTimeout(() => {
      setTransactionModal({ visible: false, stage: "idle", txHash: "" });
    }, 1200);
  }

  function failChannelModal({ title = "Channel Setup Failed", subtitle = "Unable to finish this channel setup.", detail = "Retry the action." } = {}) {
    clearTimeout(timer);
    updateTransactionModalStage("error", {
      title,
      subtitle,
      detail,
    });
  }

  function beginCounterpartyDecisionModal({ accepting = true, person = "Bob" } = {}) {
    clearTimeout(timer);
    const title = accepting ? "Accepting Invitation" : "Declining Request";
    setTransactionModal({
      visible: true,
      stage: "channel",
      actionLabel: title,
      title,
      subtitle: accepting ? `${person} is joining the private deal.` : `Closing the request from ${person}.`,
      detail: accepting ? "Verifying counterparty..." : "Updating deal status...",
      successTitle: accepting ? "Invitation Accepted" : "Request Declined",
      successSubtitle: accepting ? "Encrypted channel established." : "Deal request closed.",
      txHash: "",
    });
  }

  function updateWalletModalStage(step) {
    const stageCopy = {
      connecting: {
        title: "Connecting Wallet",
        subtitle: "Please approve the request in your wallet.",
        detail: "Waiting for signature...",
      },
      creating_account: {
        title: "Creating Starknet Account",
        subtitle: "This only happens once.",
        detail: "Waiting for confirmation...",
      },
      deploying: {
        title: "Creating Starknet Account",
        subtitle: "This only happens once.",
        detail: "Waiting for confirmation...",
      },
      connecting_paymaster: {
        title: "Preparing Gas Sponsor",
        subtitle: "Setting up network fees.",
        detail: "Waiting for confirmation...",
      },
    };
    const copy = stageCopy[step] || stageCopy.connecting;
    setTransactionModal({
      visible: true,
      stage: "wallet",
      actionLabel: "Connecting Wallet",
      ...copy,
    });
  }

  function finishWalletModal() {
    updateTransactionModalStage("success", {
      title: "Wallet Connected",
      subtitle: "Opening encrypted channel...",
      detail: "",
      txHash: "",
    });
    clearTimeout(timer);
    timer = setTimeout(() => {
      setTransactionModal({ visible: false, stage: "idle", txHash: "" });
    }, 1300);
  }

  function failWalletModal({ title = "Wallet Connection Failed", subtitle = "Unable to connect wallet.", detail = "Retry wallet connection." } = {}) {
    clearTimeout(timer);
    updateTransactionModalStage("error", {
      title,
      subtitle,
      detail,
    });
  }

  function updateTransactionModalStage(stage, updates = {}) {
    const actionTitle = state.transactionModal.actionLabel || state.transactionModal.title || "Sending Transaction";
    const stageDefaults = {
      preparing: {
        title: actionTitle,
        subtitle: "Please approve the request in your wallet.",
        detail: "Waiting for signature...",
      },
      network: {
        title: actionTitle,
        subtitle: "Preparing secure request.",
        detail: "Checking Starknet connection...",
      },
      signing: {
        title: actionTitle,
        subtitle: "Please approve the request in your wallet.",
        detail: "Waiting for signature...",
      },
      broadcasting: {
        title: actionTitle,
        subtitle: "Broadcasting transaction...",
        detail: "Waiting for confirmation...",
      },
      success: {
        title: state.transactionModal.successTitle,
        subtitle: state.transactionModal.successSubtitle,
        detail: "",
      },
      error: {
        title: "Transaction Failed",
        subtitle: "The transaction was not completed.",
        detail: "Review the wallet or network error, then retry.",
      },
    };

    setTransactionModal({
      stage,
      ...(stageDefaults[stage] || {}),
      ...updates,
    });
  }

  function finishTransactionModal(result, updates = {}) {
    updateTransactionModalStage("success", {
      title: updates.successTitle || state.transactionModal.successTitle,
      subtitle: updates.successSubtitle || state.transactionModal.successSubtitle,
      detail: "",
      txHash: result?.transactionHash || "",
    });
    clearTimeout(timer);
    timer = setTimeout(() => {
      setTransactionModal({ visible: false, stage: "idle", txHash: "" });
    }, 1800);
  }

  function failTransactionModal(errorDetails = {}) {
    clearTimeout(timer);
    updateTransactionModalStage("error", {
      title: errorDetails.label === "Cancelled" ? "Transaction Cancelled" : "Transaction Failed",
      subtitle: errorDetails.toast || "The transaction was not completed.",
      detail: errorDetails.why || "Review the wallet or network error, then retry.",
    });
  }

  function handleTransactionSubmitted(transactionHash) {
    if (!state.transactionModal.visible || state.transactionModal.stage === "success" || state.transactionModal.stage === "error") return;
    updateTransactionModalStage("broadcasting", {
      txHash: transactionHash || "",
    });
  }

  function closeTransactionModal() {
    clearTimeout(timer);
    setTransactionModal({ visible: false, stage: "idle", txHash: "" });
  }

  function renderTransactionModal() {
    renderTransactionModalElement(modalElement, state.transactionModal, {
      document,
      explorerUrl,
      transactionExplorerUrl,
      setLucideIcon,
    });
  }

  return {
    beginChannelModal,
    beginCounterpartyDecisionModal,
    beginTransactionModal,
    beginWalletModal,
    closeTransactionModal,
    failChannelModal,
    failTransactionModal,
    failWalletModal,
    finishChannelModal,
    finishTransactionModal,
    finishWalletModal,
    handleTransactionSubmitted,
    renderTransactionModal,
    setTransactionModal,
    updateTransactionModalStage,
    updateWalletModalStage,
  };
}
