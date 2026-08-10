export function initApp({ api, dealStorage, logger }) {
  dealStorage.loadLocalChannels();
  api.applyHomeResourceLinks();
  api.renderConversationList();
  api.renderHomeStatus();
  api.refreshConnectLabels();
  if (!api.openIncomingInvite?.()) {
    api.showScreen("unlock", { keepScroll: true });
  }
  api.iconRefresh();
  setTimeout(api.iconRefresh, 250);
}
