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
const activeNavClasses = ["bg-emerald-200/10", "text-white"];
const inactiveNavClasses = ["text-slate-400"];
const activeTabClasses = ["bg-emerald-200/10", "text-white"];
const inactiveTabClasses = ["text-slate-400"];
const activeStepLabelClasses = ["border-emerald-200/40", "bg-emerald-200/10", "text-emerald-100"];
const inactiveStepLabelClasses = ["border-slate-800", "text-slate-400"];
let activePaymentMode = "Shield";
let toastTimer;

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function toggleClasses(element, addList, removeList) {
  element.classList.add(...addList);
  element.classList.remove(...removeList);
}

function setPage(page, options = { resetScroll: true }) {
  pages.forEach((panel) => {
    const isActive = panel.dataset.pagePanel === page;
    panel.classList.toggle("active", isActive);
    panel.classList.toggle("hidden", !isActive);
  });

  navItems.forEach((item) => {
    const isActive = item.dataset.page === page || (page === "channel-detail" && item.dataset.page === "channels");
    item.classList.toggle("active", isActive);
    if (isActive) {
      toggleClasses(item, activeNavClasses, inactiveNavClasses);
    } else {
      toggleClasses(item, inactiveNavClasses, activeNavClasses);
    }
    if (isActive) {
      item.classList.add("active");
    }
  });

  const pageData = pageTitles[page] || pageTitles.home;
  pageTitle.textContent = pageData.title;
  pageEyebrow.textContent = pageData.eyebrow;
  if (options.resetScroll) {
    window.scrollTo({ top: 0, behavior: "auto" });
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("translate-y-4", "opacity-0");
  toast.classList.add("translate-y-0", "opacity-100");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add("translate-y-4", "opacity-0");
    toast.classList.remove("translate-y-0", "opacity-100");
  }, 2600);
}

function setChannelTab(tab) {
  const desktop = window.matchMedia("(min-width: 1024px)").matches;
  document.querySelectorAll("[data-channel-tab]").forEach((button) => {
    const isActive = button.dataset.channelTab === tab;
    button.classList.toggle("active", isActive);
    if (isActive) {
      toggleClasses(button, activeTabClasses, inactiveTabClasses);
    } else {
      toggleClasses(button, inactiveTabClasses, activeTabClasses);
    }
  });
  document.querySelectorAll("[data-channel-panel]").forEach((panel) => {
    const isActive = panel.dataset.channelPanel === tab;
    panel.classList.toggle("active", isActive);
    if (desktop) {
      panel.classList.remove("hidden");
      return;
    }
    panel.classList.toggle("hidden", !isActive);
  });
}

function appendTimeline(type, title, body) {
  const list = document.querySelector("#timeline-list");
  const item = document.createElement("div");
  const dotColor = {
    message: "bg-emerald-200",
    offer: "bg-amber-300",
    escrow: "bg-indigo-300",
    proof: "bg-emerald-200",
  }[type] || "bg-slate-400";
  item.className = "timeline-item relative grid grid-cols-[auto_minmax(0,1fr)] gap-3 pb-4 animate-new-entry";
  item.innerHTML = `
    <span class="mt-1 size-2.5 rounded-full ${dotColor}"></span>
    <div>
      <strong>${title}</strong>
      <p class="mt-1 text-sm leading-6 text-slate-400">${body}</p>
      <time class="text-xs text-slate-500">Now</time>
    </div>
  `;
  list.appendChild(item);
  refreshIcons();
}

function openPaymentModal() {
  const modal = document.querySelector("#payment-modal");
  modal.classList.remove("hidden");
  modal.classList.add("grid");
  modal.setAttribute("aria-hidden", "false");
  setPaymentStep("form");
  document.querySelector("#payment-recipient").focus();
}

function closePaymentModal() {
  const modal = document.querySelector("#payment-modal");
  modal.classList.add("hidden");
  modal.classList.remove("grid");
  modal.setAttribute("aria-hidden", "true");
}

function setPaymentStep(step) {
  document.querySelectorAll("[data-payment-step]").forEach((panel) => {
    const isActive = panel.dataset.paymentStep === step;
    panel.classList.toggle("hidden", !isActive);
    panel.classList.toggle("grid", isActive);
  });
  document.querySelectorAll("[data-payment-step-label]").forEach((label) => {
    const labelStep = label.dataset.paymentStepLabel;
    const isActive = labelStep === step;
    if (isActive) {
      toggleClasses(label, activeStepLabelClasses, inactiveStepLabelClasses);
    } else {
      toggleClasses(label, inactiveStepLabelClasses, activeStepLabelClasses);
    }
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
      const isActive = modeButton === button;
      if (isActive) {
        toggleClasses(modeButton, ["bg-emerald-200/10", "text-white"], ["text-slate-400"]);
      } else {
        toggleClasses(modeButton, ["text-slate-400"], ["bg-emerald-200/10", "text-white"]);
      }
    });
  });
});

document.querySelectorAll("[data-accept-suggestion]").forEach((button) => {
  button.addEventListener("click", () => {
    const status = document.querySelector("#deal-status");
    status.textContent = "Buyer accepted. Settlement ready";
    toggleClasses(status, ["border-emerald-200/40", "bg-emerald-200/10", "text-emerald-100"], ["border-amber-300/35", "bg-amber-300/10", "text-amber-200"]);
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

window.addEventListener("load", () => {
  setPage("home", { resetScroll: false });
  setChannelTab("timeline");
  refreshIcons();
});
