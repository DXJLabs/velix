export function bindClickEvents({ documentRef = document, state, dom, api }) {
  documentRef.addEventListener("click", (event) => {
    if (event.target.closest("[data-transaction-loading-close]")) {
      api.closeTransactionModal();
      return;
    }

    if (event.target.closest("[data-transaction-loading-cancel]")) {
      api.updateTransactionModalStage("signing", {
        detail: "Cancel the request from your Starknet wallet to stop this transaction.",
      });
      return;
    }

    const homeMenuToggle = event.target.closest("[data-home-menu-toggle]");
    if (homeMenuToggle) {
      const panel = documentRef.querySelector("[data-home-menu-panel]");
      const expanded = homeMenuToggle.getAttribute("aria-expanded") === "true";
      if (panel) panel.hidden = expanded;
      homeMenuToggle.setAttribute("aria-expanded", expanded ? "false" : "true");
      return;
    }

    const homeLink = event.target.closest("[data-home-link]");
    if (homeLink) {
      if (homeLink.getAttribute("href") === "#") {
        event.preventDefault();
        api.showToast("Official link not configured.");
      }
      api.closeHomeMenu();
      return;
    }

    const topNav = event.target.closest("[data-top-nav]");
    if (topNav) {
      api.showScreen(topNav.dataset.topNav);
      return;
    }

    const nav = event.target.closest("[data-nav]");
    if (nav) {
      api.showScreen(nav.dataset.nav);
      return;
    }

    if (event.target.closest("[data-transaction-pending]")) {
      api.showToast("Transaction hash belum tersedia. Tunggu status confirmed.");
      return;
    }

    if (event.target.closest("[data-offer-review-close]")) {
      api.hideOfferReview();
      return;
    }

    if (event.target.closest("[data-offer-review-sign]")) {
      api.hideOfferReview();
      api.acceptOffer();
      return;
    }

    if (event.target.closest("[data-payment-review-close]")) {
      api.hidePaymentReview();
      return;
    }

    if (event.target.closest("[data-payment-review-sign]")) {
      api.hidePaymentReview();
      api.sendPayment();
      return;
    }

    if (event.target.closest("[data-escrow-review-close]")) {
      api.hideEscrowReview();
      return;
    }

    if (event.target.closest("[data-escrow-review-sign]")) {
      api.hideEscrowReview();
      api.releaseEscrow();
      return;
    }

    if (event.target.closest("[data-transaction-retry]")) {
      api.showToast("Retry action by sending/signing again.");
      return;
    }

    const transactionError = event.target.closest("[data-transaction-error]");
    if (transactionError) {
      api.showToast(transactionError.dataset.transactionError || "Transaction failed.");
      return;
    }

    const open = event.target.closest("[data-open-channel]");
    if (open) {
      api.openChannel(open.dataset.openChannel);
      return;
    }

    const route = event.target.closest("[data-open-route]");
    if (route) {
      api.showScreen(route.dataset.openRoute);
      return;
    }

    const channelCompleteAction = event.target.closest("[data-channel-complete-action]");
    if (channelCompleteAction?.dataset.channelCompleteAction === "continue") {
      api.continueCompletedChannel();
      return;
    }
    if (channelCompleteAction?.dataset.channelCompleteAction === "new-escrow") {
      api.startNewEscrowInCurrentChannel();
      return;
    }
    if (channelCompleteAction?.dataset.channelCompleteAction === "close") {
      api.closeCurrentDeal();
      return;
    }

    const dealAction = event.target.closest("[data-deal-action]");
    if (dealAction?.dataset.dealAction === "create-offer") {
      if (state.negotiationStep === "counter") api.counterOffer();
      else api.createOffer();
      return;
    }
    if (dealAction?.dataset.dealAction === "cancel-offer-form") {
      api.cancelOfferForm();
      return;
    }
    if (dealAction?.dataset.dealAction === "counter") {
      api.openCounterOfferForm();
      return;
    }
    if (dealAction?.dataset.dealAction === "accept") {
      api.showOfferReview();
      return;
    }
    if (dealAction?.dataset.dealAction === "reject") {
      api.showToast("Offer rejected.");
      return;
    }

    const paymentMode = event.target.closest("[data-payment-mode]");
    if (paymentMode) {
      if (paymentMode.disabled || paymentMode.dataset.paymentMode === "shield") {
        api.showToast("Shielded payment via STRK20 is coming soon.");
        return;
      }
      state.paymentMode = paymentMode.dataset.paymentMode;
      api.renderPayment();
      return;
    }

    const defaultPrivacy = event.target.closest("[data-default-privacy]");
    if (defaultPrivacy) {
      if (defaultPrivacy.disabled || defaultPrivacy.dataset.defaultPrivacy === "strk20-shielded") {
        api.showToast("Shielded messaging via STRK20 is coming soon.");
        return;
      }
      state.defaultPrivacyMode = defaultPrivacy.dataset.defaultPrivacy;
      state.paymentMode = state.defaultPrivacyMode;
      api.renderWallet();
      api.renderPayment();
      api.renderDeal();
      api.showToast("Encrypted On-chain set as default.");
      return;
    }

    if (event.target.closest("[data-copy-wallet]")) {
      api.copyWalletAddress();
      return;
    }

    if (event.target.closest("[data-export-viewing-key]")) {
      if (api.requireConnectedWallet()) api.showToast("Viewing key export ready.");
      return;
    }

    if (event.target.closest("[data-backup-recovery]")) {
      if (api.requireConnectedWallet()) api.showToast("Recovery backup ready.");
      return;
    }

    if (event.target.closest("[data-session-management]")) {
      if (api.requireConnectedWallet()) api.showToast("Session management ready.");
      return;
    }

    if (event.target.closest("[data-refresh-wallet]")) {
      api.refreshWalletConnection();
      return;
    }

    if (event.target.closest("[data-wallet-deposit-copy]")) {
      api.copyWalletAddress();
      return;
    }

    if (event.target.closest("[data-disconnect-wallet]")) {
      api.resetWalletConnection();
      api.showToast("Wallet disconnected.");
      return;
    }

    if (event.target.closest("[data-wallet-logout]")) {
      api.logoutWallet();
      return;
    }

    if (event.target.closest("[data-disconnect-sessions]")) {
      api.logoutWallet("Sessions disconnected.");
      return;
    }

    if (event.target.closest("[data-clear-veil-cache]")) {
      api.clearLocalVeilCache();
      return;
    }

    const settingsInfo = event.target.closest("[data-settings-info]");
    if (settingsInfo) {
      api.showToast(settingsInfo.dataset.settingsInfo === "terms" ? "Terms ready." : "Privacy policy ready.");
      return;
    }

    if (event.target.closest("[data-connect-wallet]")) {
      api.connectWallet({ goToInbox: state.screen === "unlock" });
      return;
    }

    const escrowDeposit = event.target.closest("[data-escrow-deposit]");
    if (escrowDeposit) {
      api.submitEscrowDeposit(escrowDeposit.dataset.escrowDeposit);
      return;
    }

    const escrowConfirmation = event.target.closest("[data-escrow-confirmation]");
    if (escrowConfirmation) {
      api.approveEscrowRelease(escrowConfirmation.dataset.escrowConfirmation);
      return;
    }

    if (event.target.closest("[data-escrow-release]")) {
      api.showEscrowReview();
      return;
    }

    if (event.target.closest("[data-escrow-dispute]")) {
      if (state.escrowDisputeOpened) return;
      api.cancelEscrow();
      return;
    }

    if (event.target.closest("[data-payment-review]")) {
      api.showPaymentReview();
      return;
    }

    if (event.target.closest("[data-export-proof]")) {
      state.proofExported = true;
      api.showToast("Proof exported.");
      return;
    }

    if (event.target.closest("[data-new-conversation]")) {
      state.inviteFormOpen = false;
      api.showScreen("new-deal");
      return;
    }

    const newDealAction = event.target.closest("[data-new-deal-action]");
    if (newDealAction?.dataset.newDealAction === "existing") {
      api.createDealChannel({ inviteOnly: false });
      return;
    }
    if (newDealAction?.dataset.newDealAction === "show-invite") {
      state.inviteFormOpen = true;
      api.renderNewDeal();
      return;
    }
    if (newDealAction?.dataset.newDealAction === "cancel-invite") {
      state.inviteFormOpen = false;
      api.renderNewDeal();
      return;
    }
    if (newDealAction?.dataset.newDealAction === "invite") {
      api.createDealChannel({ inviteOnly: true });
      return;
    }

    if (event.target.closest("[data-copy-invite]")) {
      api.copyInviteLink();
      return;
    }

    const shareInviteAction = event.target.closest("[data-share-invite]");
    if (shareInviteAction) {
      api.shareInvite(shareInviteAction.dataset.shareInvite);
      return;
    }

    if (event.target.closest("[data-counterparty-accept]")) {
      api.acceptPendingCounterparty();
      return;
    }

    if (event.target.closest("[data-counterparty-decline]")) {
      api.declinePendingCounterparty();
      return;
    }

    if (event.target.closest("[data-qr-invite]")) {
      api.showToast("QR code ready.");
      return;
    }

    const composerAction = event.target.closest("[data-composer-action]");
    if (composerAction?.dataset.composerAction === "upload") {
      dom.attachmentInput?.click();
      return;
    }
    if (composerAction?.dataset.composerAction === "ai") {
      api.applyAiDraft();
      return;
    }
    if (composerAction) api.showToast("Action ready.");
  });
}
