export function bindFormEvents({ documentRef = document, dom, state, api }) {
  documentRef.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dom.offerReviewModal?.classList.contains("hidden")) {
      api.hideOfferReview();
    }
    if (event.key === "Escape" && !dom.paymentReviewModal?.classList.contains("hidden")) {
      api.hidePaymentReview();
    }
    if (event.key === "Escape" && !dom.escrowReviewModal?.classList.contains("hidden")) {
      api.hideEscrowReview();
    }
  });

  documentRef.addEventListener("change", (event) => {
    const autoShield = event.target.closest("[data-auto-shield]");
    if (autoShield) {
      state.autoShield = autoShield.checked;
      api.showToast(state.autoShield ? "Auto Shield enabled." : "Auto Shield disabled.");
      return;
    }

    const settingToggle = event.target.closest("[data-setting-toggle]");
    if (settingToggle) {
      settingToggle.checked = false;
      api.showToast("This setting is unavailable in the current build. No preference was changed.");
    }
  });

  dom.attachmentInput?.addEventListener("change", async () => {
    const file = dom.attachmentInput.files?.[0];
    dom.attachmentInput.value = "";
    if (!file) return;
    await api.sendAttachment(file);
  });

  dom.conversationSearch?.addEventListener("input", api.renderConversationList);
  documentRef.querySelector("#new-deal-counterparty")?.addEventListener("input", api.renderNewDeal);

  dom.composerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = dom.messageInput.value.trim();
    if (!value) return;
    dom.messageInput.value = "";
    dom.messageInput.style.height = "";
    await api.sendChat(value);
  });

  dom.messageInput?.addEventListener("input", () => {
    api.resizeComposerInput(dom.messageInput);
  });

  documentRef.querySelector("#payment-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    api.showPaymentReview();
  });
}
