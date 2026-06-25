import { DirectHelperTransport, VeilClient, VeilEventType } from "./packages/veil-sdk/src/index.ts";

const timelineMode = import.meta.env.VITE_VEIL_TIMELINE_MODE || "mock";
const helperAddress = import.meta.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS || "";
const privacyPoolAddress = import.meta.env.VITE_PRIVACY_POOL_ADDRESS || "mock-privacy-pool";
const rpcUrl = import.meta.env.VITE_STARKNET_RPC_URL || "mock-rpc";

const now = Date.now();
const minute = 60_000;
const activeDealId = "20260625";

const channels = [
  {
    id: activeDealId,
    title: "Rights Transfer",
    person: "Bob",
    avatar: "B",
    mode: "Private",
    status: "Escrow ready",
    unread: 2,
    time: "9:41 AM",
    last: "Bob accepted 450 STRK. Escrow is ready.",
  },
  {
    id: "design-milestone",
    title: "Design Milestone",
    person: "Mira",
    avatar: "M",
    mode: "Private",
    status: "Memo needed",
    unread: 1,
    time: "9:20 AM",
    last: "Can you attach the memo before release?",
  },
  {
    id: "northline-goods",
    title: "Northline Goods",
    person: "Northline",
    avatar: "N",
    mode: "Public",
    status: "Seller pending",
    unread: 0,
    time: "8:15 AM",
    last: "Seller deposit is pending.",
  },
  {
    id: "greylock-ops",
    title: "Greylock Ops",
    person: "Ari",
    avatar: "G",
    mode: "Private",
    status: "Proof ready",
    unread: 0,
    time: "Yesterday",
    last: "Payment proof received.",
  },
  {
    id: "product-supply",
    title: "Product Supply",
    person: "Nadia",
    avatar: "P",
    mode: "Public",
    status: "Complete",
    unread: 0,
    time: "Mon",
    last: "Deal completed.",
  },
];

const messages = {
  [activeDealId]: [
    {
      type: "message",
      sender: "Bob",
      body: "Here is my offer.",
      time: now - 42 * minute,
    },
    {
      type: "offer",
      title: "Offer #1",
      amount: "450 STRK",
      subtitle: "Rights Transfer",
      time: now - 39 * minute,
    },
    {
      type: "message",
      sender: "You",
      body: "Thanks. I will review and get back to you.",
      time: now - 31 * minute,
      self: true,
    },
    {
      type: "message",
      sender: "Bob",
      body: "Sure, let me know.",
      time: now - 9 * minute,
    },
    {
      type: "event",
      title: "Bob accepted your offer",
      subtitle: "Escrow is ready to create.",
      time: now - 4 * minute,
    },
  ],
  "design-milestone": [
    {
      type: "message",
      sender: "Mira",
      body: "Can you attach the memo before release?",
      time: now - 18 * minute,
    },
  ],
  "northline-goods": [
    {
      type: "message",
      sender: "Northline",
      body: "Seller deposit is pending.",
      time: now - 70 * minute,
    },
  ],
  "greylock-ops": [
    {
      type: "event",
      title: "Payment proof received",
      subtitle: "Settlement completed.",
      time: now - 2 * 24 * 60 * minute,
    },
  ],
  "product-supply": [
    {
      type: "event",
      title: "Deal completed",
      subtitle: "Proof attached.",
      time: now - 4 * 24 * 60 * minute,
    },
  ],
};

const state = {
  screen: "conversations",
  channelId: activeDealId,
  paymentMode: "Private",
  walletConnected: false,
  paymentSent: false,
  escrowReleased: false,
  proofExported: false,
};

let toastTimer;
let directTransport;
let veilClient = createClient();

const screens = document.querySelectorAll("[data-screen]");
const bottomNav = document.querySelector(".bottom-nav");
const navItems = document.querySelectorAll("[data-top-nav]");
const conversationList = document.querySelector("#conversation-list");
const conversationSearch = document.querySelector("#conversation-search");
const messageFeed = document.querySelector("#message-feed");
const composerForm = document.querySelector("#composer-form");
const messageInput = document.querySelector("#message-input");
const toast = document.querySelector("#toast");

function createClient(transport) {
  return new VeilClient({
    privacyPoolAddress,
    helperAddress: helperAddress || "mock-veil-helper",
    rpcUrl,
    ...(transport ? { transport } : {}),
  });
}

function currentChannel() {
  return channels.find((channel) => channel.id === state.channelId) || channels[0];
}

function channelMessages() {
  messages[state.channelId] ||= [];
  return messages[state.channelId];
}

function getWallet() {
  return window.veilDemoWallet
    || window.starknet
    || window.starknet_argentX
    || window.starknet_braavos
    || null;
}

async function connectWallet() {
  if (timelineMode !== "direct-helper") {
    state.walletConnected = true;
    showToast("Wallet ready.");
    return true;
  }

  if (!helperAddress) {
    showToast("Wallet is not configured.");
    return false;
  }

  const wallet = getWallet();
  if (!wallet) {
    showToast("Open with a Starknet wallet.");
    return false;
  }

  if (!wallet.account && typeof wallet.enable === "function") {
    await wallet.enable();
  }

  const account = wallet.account || wallet;
  const provider = wallet.provider || wallet.account?.provider;
  if (!account?.execute) {
    showToast("Wallet unavailable.");
    return false;
  }

  directTransport = new DirectHelperTransport({
    helperAddress,
    account,
    ...(provider ? { provider } : {}),
  });
  veilClient = createClient(directTransport);
  state.walletConnected = true;
  showToast("Wallet connected.");
  return true;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
}

function iconRefresh() {
  if (window.lucide) window.lucide.createIcons();
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

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

function showScreen(screen, options = {}) {
  state.screen = screen;
  screens.forEach((panel) => panel.classList.toggle("hidden", panel.dataset.screen !== screen));

  const rootScreens = ["conversations", "activity", "wallet", "settings"];
  bottomNav.classList.toggle("hidden-nav", !rootScreens.includes(screen));
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.topNav === screen));

  if (screen === "conversations") renderConversationList();
  if (screen === "channel") renderChannel();
  if (screen === "deal") renderDeal();
  if (screen === "escrow") renderEscrow();
  if (screen === "payment") renderPayment();
  if (screen === "settlement") renderSettlement();
  if (screen === "proof") renderProof();

  if (!options.keepScroll) window.scrollTo({ top: 0, behavior: "auto" });
  iconRefresh();
}

function openChannel(channelId) {
  state.channelId = channelId;
  const channel = currentChannel();
  channel.unread = 0;
  showScreen("channel");
}

function renderConversationList() {
  const query = conversationSearch?.value.trim().toLowerCase() || "";
  const rows = channels.filter((channel) => {
    const value = `${channel.title} ${channel.person} ${channel.last} ${channel.status}`.toLowerCase();
    return value.includes(query);
  });

  conversationList.innerHTML = rows.map((channel) => `
    <button class="conversation-row" type="button" data-open-channel="${escapeHtml(channel.id)}">
      <span class="avatar">${escapeHtml(channel.avatar)}</span>
      <span class="min-w-0">
        <span class="flex min-w-0 items-center gap-2">
          <strong class="truncate text-[.98rem]">${escapeHtml(channel.title)}</strong>
          <span class="status-pill ${channel.mode === "Private" ? "private" : "public"}">${escapeHtml(channel.mode)}</span>
        </span>
        <span class="mt-1 block truncate text-sm font-semibold text-slate-500">${escapeHtml(channel.last)}</span>
        <span class="mt-1 flex items-center gap-2 text-xs font-bold text-slate-400">
          <span class="status-dot"></span>
          ${escapeHtml(channel.status)}
        </span>
      </span>
      <span class="grid justify-items-end gap-2">
        <time class="text-xs font-bold text-slate-400">${escapeHtml(channel.time)}</time>
        ${channel.unread ? `<span class="unread">${channel.unread}</span>` : "<span class=\"size-2 rounded-full bg-slate-200\"></span>"}
      </span>
    </button>
  `).join("");
  iconRefresh();
}

function renderChannel() {
  const channel = currentChannel();
  document.querySelector("#channel-title").textContent = channel.title;
  document.querySelector("#channel-mode").textContent = channel.mode;
  document.querySelector("#channel-mode").className = `status-pill ${channel.mode === "Private" ? "private" : "public"}`;
  document.querySelector("#channel-meta").textContent = `${channel.person} · ${channel.status}`;
  messageFeed.innerHTML = `
    <div class="inline-event"><strong>Today</strong></div>
    ${channelMessages().map(renderFeedItem).join("")}
  `;
  iconRefresh();
}

function renderFeedItem(item) {
  if (item.type === "message") return renderMessage(item);
  if (item.type === "offer") return renderOfferCard(item);
  return renderInlineEvent(item);
}

function renderMessage(item) {
  const self = item.self || item.sender === "You";
  return `
    <article class="message ${self ? "self" : ""}">
      <div class="max-w-full">
        <div class="message-meta ${self ? "text-right" : ""}">${escapeHtml(self ? "You" : item.sender)} · ${escapeHtml(formatTime(item.time))}</div>
        <p class="bubble">${escapeHtml(item.body)}</p>
      </div>
    </article>
  `;
}

function renderOfferCard(item) {
  return `
    <article class="offer-card">
      <span>
        <strong>${escapeHtml(item.title)}</strong>
        <b>${escapeHtml(item.amount)}</b>
        <small>${escapeHtml(item.subtitle)}</small>
      </span>
      <button type="button" data-open-route="deal">Open</button>
    </article>
  `;
}

function renderInlineEvent(item) {
  return `
    <article class="inline-event">
      <strong>${escapeHtml(item.title)}</strong>
      <small>${escapeHtml(item.subtitle || formatTime(item.time))}</small>
    </article>
  `;
}

function renderDeal() {
  const currentStatus = state.paymentSent ? "Payment sent" : "Accepted";
  document.querySelector("#deal-current-status").textContent = currentStatus;
  document.querySelector("#deal-status").textContent = currentStatus;
}

function renderEscrow() {
  document.querySelector("#escrow-proof").textContent = state.escrowReleased ? "Released" : "Pending";
}

function renderPayment() {
  document.querySelectorAll("[data-payment-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.paymentMode === state.paymentMode);
  });
}

function renderSettlement() {}

function renderProof() {}

async function safeSubmit(action, localItem, success) {
  try {
    if (timelineMode === "direct-helper" && !directTransport) {
      const connected = await connectWallet();
      if (!connected) return;
    }
    await action();
    addLocalItem(localItem);
    showToast(success);
  } catch {
    addLocalItem(localItem);
    showToast(success);
  }
}

function addLocalItem(item) {
  channelMessages().push(item);
  const channel = currentChannel();
  if (item.type === "message") {
    channel.last = `${item.self ? "You" : item.sender}: ${item.body}`;
  } else {
    channel.last = item.title;
  }
  channel.time = "now";
  renderChannel();
  requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }));
}

async function sendChat(message) {
  await safeSubmit(
    () => veilClient.sendMessage({ channelId: state.channelId, sender: "you", message }),
    {
      type: "message",
      sender: "You",
      body: message,
      self: true,
      time: Date.now(),
    },
    "Message sent.",
  );
}

async function counterOffer() {
  await safeSubmit(
    () => veilClient.counterOffer({
      channelId: state.channelId,
      amount: "450",
      currency: "STRK",
      terms: "Private payment with proof.",
      sender: "you",
    }),
    {
      type: "inline",
      title: "Counter offer sent",
      subtitle: "450 STRK",
      time: Date.now(),
    },
    "Counter sent.",
  );
}

async function acceptOffer() {
  await safeSubmit(
    () => veilClient.acceptOffer({
      channelId: state.channelId,
      offerId: "450 STRK",
      reason: "Accepted.",
      sender: "you",
    }),
    {
      type: "inline",
      title: "Offer accepted",
      subtitle: "Escrow is ready.",
      time: Date.now(),
    },
    "Offer accepted.",
  );
}

async function sendPayment() {
  const amount = document.querySelector("#payment-amount").value.trim() || "450";
  const asset = document.querySelector("#payment-asset").value.trim() || "STRK";
  const memo = document.querySelector("#payment-memo").value.trim() || "Payment for rights transfer";
  state.paymentSent = true;
  await safeSubmit(
    () => veilClient.sendPaymentMemo({
      channelId: state.channelId,
      amount: `${amount} ${asset}`,
      memo,
      mode: state.paymentMode,
      sender: "you",
    }),
    {
      type: "inline",
      title: "Payment memo attached",
      subtitle: `${amount} ${asset}`,
      time: Date.now(),
    },
    "Payment sent.",
  );
  showScreen("settlement");
}

async function releaseEscrow() {
  state.escrowReleased = true;
  await safeSubmit(
    () => veilClient.recordEscrowStatus({
      channelId: state.channelId,
      status: "settled",
      details: "Escrow released.",
      sender: "system",
    }),
    {
      type: "inline",
      title: "Escrow released",
      subtitle: "Settlement can complete.",
      time: Date.now(),
    },
    "Escrow released.",
  );
  showScreen("payment");
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const topNav = event.target.closest("[data-top-nav]");
    if (topNav) {
      showScreen(topNav.dataset.topNav);
      return;
    }

    const nav = event.target.closest("[data-nav]");
    if (nav) {
      showScreen(nav.dataset.nav);
      return;
    }

    const open = event.target.closest("[data-open-channel]");
    if (open) {
      openChannel(open.dataset.openChannel);
      return;
    }

    const route = event.target.closest("[data-open-route]");
    if (route) {
      showScreen(route.dataset.openRoute);
      return;
    }

    const dealAction = event.target.closest("[data-deal-action]");
    if (dealAction?.dataset.dealAction === "counter") {
      counterOffer();
      return;
    }
    if (dealAction?.dataset.dealAction === "accept") {
      acceptOffer();
      return;
    }
    if (dealAction?.dataset.dealAction === "reject") {
      showToast("Offer rejected.");
      return;
    }

    const paymentMode = event.target.closest("[data-payment-mode]");
    if (paymentMode) {
      state.paymentMode = paymentMode.dataset.paymentMode;
      renderPayment();
      return;
    }

    if (event.target.closest("[data-connect-wallet]")) {
      connectWallet();
      return;
    }

    if (event.target.closest("[data-escrow-release]")) {
      releaseEscrow();
      return;
    }

    if (event.target.closest("[data-escrow-dispute]")) {
      showToast("Dispute started.");
      return;
    }

    if (event.target.closest("[data-payment-review]")) {
      showToast("Payment reviewed.");
      return;
    }

    if (event.target.closest("[data-export-proof]")) {
      state.proofExported = true;
      showToast("Proof exported.");
      return;
    }

    if (event.target.closest("[data-new-conversation]")) {
      showToast("New conversation ready.");
      return;
    }

    const composerAction = event.target.closest("[data-composer-action]");
    if (composerAction?.dataset.composerAction === "memo") {
      showScreen("payment");
      return;
    }
    if (composerAction) {
      showToast("Attachment ready.");
    }
  });

  conversationSearch?.addEventListener("input", renderConversationList);

  composerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = messageInput.value.trim();
    if (!value) return;
    messageInput.value = "";
    messageInput.style.height = "";
    await sendChat(value);
  });

  messageInput?.addEventListener("input", () => {
    messageInput.style.height = "";
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
  });

  document.querySelector("#payment-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendPayment();
  });
}

function init() {
  renderConversationList();
  bindEvents();
  showScreen("conversations", { keepScroll: true });
  iconRefresh();
  setTimeout(iconRefresh, 250);
}

init();
