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
const activeFeedFilterClasses = ["bg-slate-800", "text-white"];
const inactiveFeedFilterClasses = ["text-slate-400"];
const activeStepLabelClasses = ["border-emerald-200/40", "bg-emerald-200/10", "text-emerald-100"];
const inactiveStepLabelClasses = ["border-slate-800", "text-slate-400"];
let activePaymentMode = "Shield";
let activeFeedFilter = "all";
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

function applyFeedFilter() {
  document.querySelectorAll("#timeline-list [data-feed-kind]").forEach((item) => {
    const isVisible = activeFeedFilter === "all" || item.dataset.feedGroup === activeFeedFilter;
    item.classList.toggle("hidden", !isVisible);
  });
}

function setFeedFilter(filter) {
  activeFeedFilter = filter;
  document.querySelectorAll("[data-feed-filter]").forEach((button) => {
    const isActive = button.dataset.feedFilter === filter;
    if (isActive) {
      toggleClasses(button, activeFeedFilterClasses, inactiveFeedFilterClasses);
    } else {
      toggleClasses(button, inactiveFeedFilterClasses, activeFeedFilterClasses);
    }
  });
  applyFeedFilter();
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

    item.dataset.feedGroup = "messages";
    item.className = isSelf ? "flex justify-end animate-new-entry" : "flex items-start gap-3 animate-new-entry";
    item.innerHTML = isSelf
      ? `
        <div class="min-w-0">
          <div class="mb-1 flex items-baseline justify-end gap-2">
            <time class="text-xs text-slate-500">Now</time>
            <strong class="text-sm">${safeTitle}</strong>
          </div>
          <p class="max-w-[22rem] rounded-2xl rounded-tr-sm bg-emerald-200/15 px-3 py-2 text-sm leading-6 text-slate-100">${safeBody}</p>
        </div>
      `
      : `
        <div class="grid size-8 shrink-0 place-items-center rounded-full ${avatarClasses} text-xs font-black">${avatar}</div>
        <div class="min-w-0">
          <div class="mb-1 flex items-baseline gap-2">
            <strong class="text-sm">${safeTitle}</strong>
            <time class="text-xs text-slate-500">Now</time>
          </div>
          <p class="max-w-[22rem] rounded-2xl rounded-tl-sm bg-slate-900/90 px-3 py-2 text-sm leading-6 text-slate-200">${safeBody}</p>
        </div>
      `;
    list.appendChild(item);
    applyFeedFilter();
    return;
  }

  const meta = {
    offer: {
      label: "Offer updated",
      dot: "bg-amber-300",
      labelText: "text-amber-100",
      value: "450 STRK",
    },
    escrow: {
      label: "Escrow",
      dot: "bg-indigo-300",
      labelText: "text-indigo-100",
      value: "Settlement ready",
    },
    payment: {
      label: "Memo attached",
      dot: "bg-sky-300",
      labelText: "text-sky-100",
      value: "Payment memo",
    },
    proof: {
      label: "Proof generated",
      dot: "bg-emerald-300",
      labelText: "text-emerald-100",
      value: "Proof attached",
    },
  }[type] || {
    label: "Event",
    dot: "bg-slate-400",
    labelText: "text-slate-300",
    value: "Channel update",
  };

  item.dataset.feedGroup = "events";
  item.className = "grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-md bg-white/[0.035] px-3 py-2 animate-new-entry";
  item.innerHTML = `
    <span class="mt-2 size-1.5 rounded-full ${meta.dot}"></span>
    <div class="min-w-0">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <strong class="text-[0.68rem] font-black uppercase tracking-wide ${meta.labelText}">${escapeHtml(meta.label)}</strong>
        <span class="text-sm font-bold text-white">${escapeHtml(meta.value)}</span>
        <time class="text-xs text-slate-500">Now</time>
      </div>
      <p class="truncate text-xs leading-5 text-slate-400">${safeBody}</p>
    </div>
  `;
  list.appendChild(item);
  applyFeedFilter();
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

document.querySelectorAll("[data-feed-filter]").forEach((button) => {
  button.addEventListener("click", () => setFeedFilter(button.dataset.feedFilter));
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
  setFeedFilter("all");
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
    setFeedFilter("all");
    appendTimeline("offer", "Assistant", "Suggested deal accepted at 450 STRK. Proof generated.");
    appendTimeline("escrow", "Escrow", "Settlement is ready for final confirmation.");
    showToast("Assistant suggestion accepted. Proof generated.");
  });
});

document.querySelectorAll("[data-create-counter]").forEach((button) => {
  button.addEventListener("click", () => {
    setFeedFilter("all");
    appendTimeline("offer", "Offer event", "Counter offer prepared at 450 STRK with private settlement terms.");
    showToast("Counter offer prepared inside this channel.");
    setPage("channel-detail");
    setChannelTab("timeline");
  });
});

document.querySelector("[data-dismiss-assistant]").addEventListener("click", () => {
  showToast("Assistant suggestion dismissed for now.");
});

document.querySelector("[data-attach-message]").addEventListener("click", () => {
  showToast("Attach memo or proof from the channel actions.");
});

document.querySelector("#message-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = event.currentTarget.elements.message;
  const message = input.value.trim();
  if (!message) return;
  setFeedFilter("all");
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
  setFeedFilter("all");
  refreshIcons();
});
