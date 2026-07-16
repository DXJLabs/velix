import { isDirectHelperTimelineMode, networkLabel, normalizeChainId } from "../../app/runtime-config.js";

export function createHomeUi({
  document,
  config,
  state,
  expectedNetworkName,
  expectedNetworkStatus,
}) {
  function walletFailureCategory() {
    const message = `${state.walletInitError || ""} ${state.walletInitMessage || ""}`.toLowerCase();
    if (!message.trim()) return "Unable to connect";
    if (message.includes("not connected to") || message.includes("different starknet network")) return "Wrong network";
    if (message.includes("does not expose execute") || message.includes("no privy starknet account") || message.includes("no starknet provider")) {
      return "Unsupported wallet";
    }
    if (message.includes("helper") || message.includes("rpc") || message.includes("network")) return "Network unavailable";
    return "Unable to connect";
  }

  function homeHelperContractLabel() {
    if (!isDirectHelperTimelineMode(config.timelineMode)) return "Privacy Pool";
    if (!config.helperAddress) return "Network unavailable";
    if (state.walletInitState === "failed" && walletFailureCategory() === "Network unavailable") return "Network unavailable";
    return state.helperVerified ? "Verified deployment" : "Unverified";
  }

  function homePrivacyPoolLabel() {
    if (config.timelineMode === "mock") return "Demo";
    if (!config.networkConfig?.privacyPool?.screeningCapable) return "Legacy — Shield blocked";
    return config.timelineMode === "strk20-shielded" ? "Unverified" : "Configured, not active";
  }

  function renderHomeStatus() {
    const homeNetwork = document.querySelector("#home-network");
    const homePrivacyPool = document.querySelector("#home-privacy-pool");
    const homeHelperContract = document.querySelector("#home-helper-contract");
    const homeEnvironment = document.querySelector("#home-environment");

    if (homeNetwork) homeNetwork.textContent = expectedNetworkName();
    if (homePrivacyPool) homePrivacyPool.textContent = homePrivacyPoolLabel();
    if (homeHelperContract) homeHelperContract.textContent = homeHelperContractLabel();
    if (homeEnvironment) homeEnvironment.textContent = expectedNetworkStatus();
  }

  function applyHomeResourceLinks() {
    document.querySelectorAll("[data-home-link]").forEach((link) => {
      const href = config.homeResourceLinks[link.dataset.homeLink] || "#";
      link.setAttribute("href", href);
      if (href === "#") {
        link.setAttribute("aria-disabled", "true");
        link.removeAttribute("target");
        link.removeAttribute("rel");
        return;
      }
      link.removeAttribute("aria-disabled");
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noreferrer");
    });
  }

  function closeHomeMenu() {
    const panel = document.querySelector("[data-home-menu-panel]");
    const toggle = document.querySelector("[data-home-menu-toggle]");
    if (panel) panel.hidden = true;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  return {
    renderHomeStatus,
    applyHomeResourceLinks,
    closeHomeMenu,
    expectedNetworkLabel: () => {
      const normalized = normalizeChainId(config.expectedChainId);
      return normalized ? expectedNetworkName() : networkLabel(config.expectedChainId);
    },
  };
}
