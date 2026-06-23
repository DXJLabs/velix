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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function appendTimeline(type, title, body) {
  const list = document.querySelector("#timeline-list");
  const item = document.createElement(type === "message" ? "article" : "div");
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body);

  item.dataset.feedKind = type;

  if (type === "message") {
    const sender = String(title).toLowerCase();
    const isSelf = sender === "you";
    const isBuyer = sender === "buyer";
    const avatar = escapeHtml(String(title).charAt(0).toUpperCase() || "M");
    const avatarClasses = isBuyer
      ? "bg-indigo-300/20 text-indigo-100"
      : "bg-slate-800 text-slate-200";

    item.className = isSelf ? "flex justify-end animate-new-entry" : "flex items-start gap-3 animate-new-entry";
    item.innerHTML = isSelf
      ? `
        <div class="min-w-0">
          <div class="mb-1 flex items-center justify-end gap-2">
            <time class="text-xs text-slate-500">Now</time>
            <strong class="text-sm">${safeTitle}</strong>
          </div>
          <p class="max-w-[22rem] rounded-2xl rounded-tr-sm border border-emerald-200/30 bg-emerald-200/15 px-3 py-2 text-sm leading-6 text-slate-100">${safeBody}</p>
        </div>
      `
      : `
        <div class="grid size-8 shrink-0 place-items-center rounded-full ${avatarClasses} text-xs font-black">${avatar}</div>
        <div class="min-w-0">
          <div class="mb-1 flex items-center gap-2">
            <strong class="text-sm">${safeTitle}</strong>
            <time class="text-xs text-slate-500">Now</time>
          </div>
          <p class="max-w-[22rem] rounded-2xl rounded-tl-sm border border-slate-800 bg-slate-900 px-3 py-2 text-sm leading-6 text-slate-200">${safeBody}</p>
        </div>
      `;
    list.appendChild(item);
    return;
  }

  const meta = {
    offer: {
      label: "Offer",
      icon: "badge-dollar-sign",
      card: "border-amber-300/25 bg-amber-300/10",
      iconBox: "bg-amber-300/15 text-amber-100",
      pill: "border-amber-300/30 text-amber-100",
    },
    escrow: {
      label: "Escrow",
      icon: "lock-keyhole",
      card: "border-indigo-300/25 bg-indigo-300/10",
      iconBox: "bg-indigo-300/15 text-indigo-100",
      pill: "border-indigo-300/30 text-indigo-100",
    },
    payment: {
      label: "Memo",
      icon: "receipt-text",
      card: "border-sky-300/25 bg-sky-300/10",
      iconBox: "bg-sky-300/15 text-sky-100",
      pill: "border-sky-300/30 text-sky-100",
    },
    proof: {
      label: "Proof",
      icon: "file-check-2",
      card: "border-emerald-200/25 bg-emerald-200/10",
      iconBox: "bg-emerald-200/15 text-emerald-100",
      pill: "border-emerald-200/30 text-emerald-100",
    },
  }[type] || {
    label: "Event",
    icon: "activity",
    card: "border-slate-700 bg-slate-950/55",
    iconBox: "bg-slate-800 text-slate-200",
    pill: "border-slate-700 text-slate-300",
  };

  item.className = `rounded-lg border p-3 animate-new-entry ${meta.card}`;
  item.innerHTML = `
    <div class="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
      <div class="grid size-8 place-items-center rounded-lg ${meta.iconBox}">
        <i data-lucide="${meta.icon}" class="size-4"></i>
      </div>
      <div class="min-w-0">
        <div class="mb-1 flex flex-wrap items-center gap-2">
          <strong class="text-sm text-white">${safeTitle}</strong>
          <span class="rounded-full border px-2 py-0.5 text-[0.68rem] font-black uppercase tracking-wide ${meta.pill}">${meta.label}</span>
          <time class="text-xs text-slate-500">Now</time>
        </div>
        <p class="text-sm leading-6 text-slate-300">${safeBody}</p>
      </div>
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
  const amount = document.querySelector("#success-amount").textContent;
  const mode = document.querySelector("#success-mode").textContent;
  appendTimeline("payment", "Payment memo event", `${amount} ${mode} memo sent with settlement instructions.`);
  appendTimeline("proof", "Proof event", `${amount} payment proof verified and attached to this channel.`);
  showToast("Payment memo and proof attached to channel.");
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
    appendTimeline("offer", "Offer event", "Counter offer prepared at 450 STRK with private settlement terms.");
    showToast("Counter offer prepared inside this channel.");
    setPage("channel-detail");
    setChannelTab("timeline");
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
  showToast("Message sent in channel chat.");
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
