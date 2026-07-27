export function createRouter({
  state,
  screens,
  bottomNav,
  navItems,
  renderers,
  iconRefresh,
}) {
  function showScreen(screen, options = {}) {
    state.screen = screen;
    screens.forEach((panel) => panel.classList.toggle("hidden", panel.dataset.screen !== screen));

    const rootScreens = ["conversations", "activity", "wallet", "settings"];
    bottomNav.classList.toggle("hidden-nav", !rootScreens.includes(screen));
    navItems.forEach((item) => item.classList.toggle("active", item.dataset.topNav === screen));

    if (screen === "conversations") renderers.renderConversationList();
    if (screen === "new-deal") renderers.renderNewDeal();
    if (screen === "unlock") renderers.renderHomeStatus();
    if (screen === "channel") renderers.renderChannel();
    if (screen === "deal") renderers.renderDeal();
    if (screen === "escrow") renderers.renderEscrow();
    if (screen === "payment") renderers.renderPayment();
    if (screen === "wallet") renderers.renderWallet();
    if (screen === "settings") renderers.renderSettings();
    if (screen === "settlement") renderers.renderSettlement();
    if (screen === "proof") renderers.renderProof();
    renderers.renderWorkflowProgress();

    if (!options.keepScroll) window.scrollTo({ top: 0, behavior: "auto" });
    iconRefresh();
  }

  return { showScreen };
}
