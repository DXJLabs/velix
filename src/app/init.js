export function initApp({ api, dealStorage, logger }) {
  dealStorage.loadLocalChannels();
  api.mountPrivy().catch((error) => {
    logger.veilError("auth.privy.sdk.load.failed", error, {
      where: "init",
      howToFix: "Confirm @privy-io/react-auth can load, VITE_PRIVY_APP_ID is valid, and the browser can reach the module CDN or bundled dependency.",
    });
    api.showToast("Privy SDK failed to load.");
  });
  api.applyHomeResourceLinks();
  api.renderConversationList();
  api.renderHomeStatus();
  api.refreshConnectLabels();
  api.showScreen("unlock", { keepScroll: true });
  api.iconRefresh();
  setTimeout(api.iconRefresh, 250);
}
