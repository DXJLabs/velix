const pageTitles = {
  home: { title: "Home", eyebrow: "Command center" },
  channels: { title: "Channels", eyebrow: "Negotiation rooms" },
  "channel-detail": { title: "Atlas Studio Deal", eyebrow: "Channel workspace" },
  rewards: { title: "Rewards", eyebrow: "Activity points" },
  settings: { title: "Settings", eyebrow: "Workspace preferences" },
};

const pages = document.querySelectorAll("[data-page-panel]");
const navItems = document.querySelectorAll("[data-page]");
const pageTitle = document.querySelector("#page-title");
const pageEyebrow = document.querySelector("#page-eyebrow");
const toast = document.querySelector("#toast");
let activePaymentMode = "Shield";
let toastTimer;

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function setPage(page) {
  pages.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.pagePanel === page);
  });

  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.page === page);
    if (page === "channel-detail" && item.dataset.page === "channels") {
      item.classList.add("active");
    }
  });

  const pageData = pageTitles[page] || pageTitles.home;
  pageTitle.textContent = pageData.title;
  pageEyebrow.textContent = pageData.eyebrow;
  window.scrollTo({ top: 0, behavior: "auto" });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("active");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("active");
  }, 2600);
}

function setChannelTab(tab) {
  document.querySelectorAll("[data-channel-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.channelTab === tab);
  });
  document.querySelectorAll("[data-channel-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.channelPanel === tab);
  });
}

function appendTimeline(type, title, body) {
  const list = document.querySelector("#timeline-list");
  const item = document.createElement("div");
  item.className = `timeline-item ${type} new-entry`;
  item.innerHTML = `
    <span class="timeline-dot"></span>
    <div>
      <strong>${title}</strong>
      <p>${body}</p>
      <time>Now</time>
    </div>
  `;
  list.appendChild(item);
  refreshIcons();
}

function openPaymentModal() {
  const modal = document.querySelector("#payment-modal");
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
  setPaymentStep("form");
  document.querySelector("#payment-recipient").focus();
}

function closePaymentModal() {
  const modal = document.querySelector("#payment-modal");
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
}

function setPaymentStep(step) {
  document.querySelectorAll("[data-payment-step]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.paymentStep === step);
  });
  document.querySelectorAll("[data-payment-step-label]").forEach((label) => {
    const labelStep = label.dataset.paymentStepLabel;
    label.classList.toggle("active", labelStep === step);
  });
}

function syncReview() {
  const recipient = document.querySelector("#payment-recipient").value.trim() || "Atlas Studio";
  const amount = document.querySelector("#payment-amount").value.trim() || "100 STRK";
  const memo = document.querySelector("#payment-memo").value.trim() || "Payment memo attached.";

  document.querySelector("#review-recipient").textContent = recipient;
  document.querySelector("#review-amount").textContent = amount;
  document.querySelector("#review-mode").textContent = activePaymentMode;
  document.querySelector("#review-memo").textContent = memo;
  document.querySelector("#success-amount").textContent = amount;
  document.querySelector("#success-mode").textContent = activePaymentMode;
}

document.querySelectorAll("[data-page], [data-page-trigger]").forEach((trigger) => {
  trigger.addEventListener("click", () => {
    setPage(trigger.dataset.page || trigger.dataset.pageTrigger);
  });
});

document.querySelectorAll("[data-open-channel]").forEach((trigger) => {
  trigger.addEventListener("click", () => setPage("channel-detail"));
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setPage("channel-detail");
    }
  });
});

document.querySelectorAll("[data-channel-tab]").forEach((button) => {
  button.addEventListener("click", () => setChannelTab(button.dataset.channelTab));
});

document.querySelectorAll(".open-payment").forEach((button) => {
  button.addEventListener("click", openPaymentModal);
});

document.querySelector("#close-payment").addEventListener("click", closePaymentModal);
document.querySelector("#payment-modal").addEventListener("click", (event) => {
  if (event.target.id === "payment-modal") {
    closePaymentModal();
  }
});

document.querySelector("#payment-review").addEventListener("click", () => {
  syncReview();
  setPaymentStep("review");
});

document.querySelector("#payment-back").addEventListener("click", () => setPaymentStep("form"));

document.querySelector("#payment-confirm").addEventListener("click", () => {
  syncReview();
  setPaymentStep("success");
  appendTimeline("proof", "Payment", `${document.querySelector("#success-amount").textContent} payment sent. Proof verified and attached.`);
  showToast("Payment proof attached to channel.");
});

document.querySelector("#payment-done").addEventListener("click", closePaymentModal);

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    activePaymentMode = button.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach((modeButton) => {
      modeButton.classList.toggle("active", modeButton === button);
    });
  });
});

document.querySelectorAll("[data-accept-suggestion]").forEach((button) => {
  button.addEventListener("click", () => {
    const status = document.querySelector("#deal-status");
    status.textContent = "Buyer accepted. Settlement ready";
    status.classList.remove("warning");
    status.classList.add("success");
    document.querySelector("#current-offer").textContent = "450 STRK accepted";
    appendTimeline("offer", "Assistant", "Suggested deal accepted at 450 STRK. Proof generated.");
    appendTimeline("escrow", "Escrow", "Settlement is ready for final confirmation.");
    showToast("Assistant suggestion accepted. Proof generated.");
  });
});

document.querySelectorAll("[data-create-counter]").forEach((button) => {
  button.addEventListener("click", () => {
    appendTimeline("offer", "Seller", "Counter offer prepared at 450 STRK with private settlement terms.");
    showToast("Counter offer prepared inside this channel.");
    setPage("channel-detail");
    setChannelTab("deal");
  });
});

document.querySelector("[data-dismiss-assistant]").addEventListener("click", () => {
  showToast("Assistant suggestion dismissed for now.");
});

document.querySelector("#message-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = event.currentTarget.elements.message;
  const message = input.value.trim();
  if (!message) return;
  appendTimeline("message", "You", message);
  input.value = "";
  showToast("Message added to channel timeline.");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePaymentModal();
  }
});

window.addEventListener("load", refreshIcons);
