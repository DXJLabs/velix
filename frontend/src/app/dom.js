export function getAppDom(documentRef = document) {
  return {
    document: documentRef,
    screens: documentRef.querySelectorAll("[data-screen]"),
    bottomNav: documentRef.querySelector(".bottom-nav"),
    navItems: documentRef.querySelectorAll("[data-top-nav]"),
    conversationList: documentRef.querySelector("#conversation-list"),
    conversationSearch: documentRef.querySelector("#conversation-search"),
    messageFeed: documentRef.querySelector("#message-feed"),
    composerForm: documentRef.querySelector("#composer-form"),
    messageInput: documentRef.querySelector("#message-input"),
    attachmentInput: documentRef.querySelector("#attachment-input"),
    toast: documentRef.querySelector("#toast"),
    transactionLoadingModal: documentRef.querySelector("#transaction-loading-modal"),
    offerReviewModal: documentRef.querySelector("#offer-review-modal"),
    paymentReviewModal: documentRef.querySelector("#payment-review-modal"),
    escrowReviewModal: documentRef.querySelector("#escrow-review-modal"),
    privyAuthRoot: documentRef.querySelector("#privy-auth-root"),
  };
}

export function setElementText(documentRef, selector, value) {
  const element = documentRef.querySelector(selector);
  if (element) element.textContent = value;
}

export function setLucideIcon(container, iconName, sizeClass = "size-5") {
  const icon = container?.querySelector("svg, i");
  if (icon) icon.outerHTML = `<i data-lucide="${iconName}" class="${sizeClass}"></i>`;
}
