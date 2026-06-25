import { DirectHelperTransport, VeilClient, VeilEventType } from "./packages/veil-sdk/src/index.ts";

const timelineMode = import.meta.env.VITE_VEIL_TIMELINE_MODE || "mock";
const helperAddress = import.meta.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS || "";
const privacyPoolAddress = import.meta.env.VITE_PRIVACY_POOL_ADDRESS || "mock-privacy-pool";
const rpcUrl = import.meta.env.VITE_STARKNET_RPC_URL || "mock-rpc";

const now = Date.now();
const minute = 60_000;
const currentChannelId = "20260625";

const channels = [
  {
    id: currentChannelId,
    title: "Rights Transfer",
    counterparty: "Bob",
    status: "Private",
    unread: 2,
    time: "now",
    lastMessage: "Bob accepted 450 STRK. Escrow is ready.",
  },
  {
    id: "11209",
    title: "Design Milestone",
    counterparty: "Mira",
    status: "Private",
    unread: 0,
    time: "18m",
    lastMessage: "Can you attach the memo before release?",
  },
  {
    id: "78122",
    title: "Northline Goods",
    counterparty: "Northline",
    status: "Public",
    unread: 1,
    time: "1h",
    lastMessage: "Seller deposit is pending.",
  },
  {
    id: "90618",
    title: "Greylock Ops",
    counterparty: "Ari",
    status: "Private",
    unread: 0,
    time: "Tue",
    lastMessage: "Payment proof received.",
  },
];

const timelines = {
  [currentChannelId]: [
    {
      id: "m1",
      eventType: VeilEventType.CHAT,
      sender: "Bob",
      body: "I can transfer the rights package for 500 STRK if the metadata memo is included.",
      timestamp: now - 34 * minute,
    },
    {
      id: "m2",
      eventType: VeilEventType.CHAT,
      sender: "You",
      body: "450 STRK works if escrow completes today and proof is attached after payment.",
      timestamp: now - 21 * minute,
    },
    {
      id: "e1",
      eventType: VeilEventType.COUNTER_OFFER,
      label: "Offer updated",
      timestamp: now - 19 * minute,
    },
    {
      id: "m3",
      eventType: VeilEventType.CHAT,
      sender: "Bob",
      body: "Accepted. Send the memo and I will confirm seller deposit.",
      timestamp: now - 9 * minute,
    },
    {
      id: "e2",
      eventType: VeilEventType.ACCEPT_OFFER,
      label: "Offer accepted",
      timestamp: now - 8 * minute,
    },
  ],
  11209: [
    {
      id: "m1",
      eventType: VeilEventType.CHAT,
      sender: "Mira",
      body: "Can you attach the memo before release?",
      timestamp: now - 18 * minute,
    },
  ],
  78122: [
    {
      id: "m1",
      eventType: VeilEventType.CHAT,
      sender: "Northline",
      body: "Seller deposit is pending.",
      timestamp: now - 62 * minute,
    },
  ],
  90618: [
    {
      id: "m1",
      eventType: VeilEventType.CHAT,
      sender: "Ari",
      body: "Payment proof received.",
      timestamp: now - 2 * 24 * 60 * minute,
    },
  ],
};

const dealState = {
  offerStatus: "Accepted",
  sellerOffer: "500 STRK",
  buyerCounter: "450 STRK",
  escrowStatus: "Ready",
  settlementStatus: "Pending",
  paymentState: "Ready",
  proofStatus: "Not attached",
  paymentMode: "Private",
};

let activeScreen = "home";
let activeTab = "conversation";
let activeChannelId = currentChannelId;
let toastTimer;
let directHelperTransport;
let veilClient = createClient();

const screens = document.querySelectorAll("[data-screen]");
const bottomNavItems = document.querySelectorAll("[data-nav]");
const channelList = document.querySelector("#channel-list");
const channelSearch = document.querySelector("#channel-search");
const conversationFeed = document.querySelector("#conversation-feed");
const messageForm = document.querySelector("#message-form");
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

function getInjectedWallet() {
  return window.veilDemoWallet
    || window.starknet
    || window.starknet_argentX
    || window.starknet_braavos
    || null;
}

async function connectWallet() {
  if (timelineMode !== "direct-helper") {
    updateConnectedState(true);
    showToast("Ready.");
    return true;
  }

  if (!helperAddress) {
    showToast("Private sending is not configured yet.");
    return false;
  }

  const wallet = getInjectedWallet();
  if (!wallet) {
    showToast("Connect a Starknet wallet to send privately.");
    return false;
  }

  if (!wallet.account && typeof wallet.enable === "function") {
    await wallet.enable();
  }

  const account = wallet.account || wallet;
  const provider = wallet.provider || wallet.account?.provider;
  if (!account?.execute) {
    showToast("Wallet connection is unavailable.");
    return false;
  }

  directHelperTransport = new DirectHelperTransport({
    helperAddress,
    account,
    ...(provider ? { provider } : {}),
  });
  veilClient = createClient(directHelperTransport);
  updateConnectedState(true);
  showToast("Connected.");
  return true;
}

function updateConnectedState(isConnected) {
  document.querySelectorAll(".connect-button").forEach((button) => {
    button.classList.toggle("bg-emerald-50", isConnected);
    button.classList.toggle("text-emerald-700", isConnected);
    button.classList.toggle("border-emerald-200", isConnected);
    button.classList.toggle("bg-white", !isConnected);
    button.setAttribute("aria-label", isConnected ? "Connected" : "Connect");
  });
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("translate-y-3", "opacity-0");
  toast.classList.add("translate-y-0", "opacity-100");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add("translate-y-3", "opacity-0");
    toast.classList.remove("translate-y-0", "opacity-100");
  }, 2200);
}

function currentChannel() {
  return channels.find((channel) => channel.id === activeChannelId) || channels[0];
}

function channelTimeline() {
  timelines[activeChannelId] ||= [];
  return timelines[activeChannelId];
}

function setScreen(screen, options = {}) {
  activeScreen = screen;
  screens.forEach((panel) => {
    const isActive = panel.dataset.screen === screen;
    panel.classList.toggle("hidden", !isActive);
  });

  bottomNavItems.forEach((item) => {
    const isActive = item.dataset.nav === screen || (screen === "channel" && item.dataset.nav === "channels");
    item.classList.toggle("active", isActive);
  });

  if (screen === "channels") renderChannels();
  if (screen === "channel") renderChannel();
  if (!options.keepScroll) window.scrollTo({ top: 0, behavior: "auto" });
  refreshIcons();
}

function openChannel(channelId, tab = "conversation") {
  activeChannelId = channelId;
  activeTab = tab;
  const channel = currentChannel();
  channel.unread = 0;
  setScreen("channel");
}

function setChannelTab(tab) {
  activeTab = tab;
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.panel !== tab);
  });
  renderChannel();
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
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

function renderChannels() {
  const query = channelSearch?.value.trim().toLowerCase() || "";
  const visibleChannels = channels.filter((channel) => {
    const haystack = `${channel.title} ${channel.lastMessage} ${channel.counterparty}`.toLowerCase();
    return haystack.includes(query);
  });

  channelList.innerHTML = visibleChannels.map((channel) => `
    <button class="channel-row" type="button" data-open-channel="${escapeHtml(channel.id)}">
      <span class="min-w-0">
        <span class="flex items-center gap-2">
          <strong class="truncate text-[.98rem]">${escapeHtml(channel.title)}</strong>
          <span class="${channel.status === "Private" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"} rounded-full px-2 py-0.5 text-[.68rem] font-black">${escapeHtml(channel.status)}</span>
        </span>
        <span class="mt-1 block truncate text-sm text-slate-500">${escapeHtml(channel.lastMessage)}</span>
      </span>
      <span class="grid justify-items-end gap-1">
        <time class="text-xs font-bold text-slate-400">${escapeHtml(channel.time)}</time>
        ${channel.unread > 0 ? `<span class="grid min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 py-0.5 text-xs font-black text-white">${channel.unread}</span>` : `<span class="size-2 rounded-full bg-slate-200"></span>`}
      </span>
    </button>
  `).join("");
  refreshIcons();
}

function renderChannelHeader() {
  const channel = currentChannel();
  document.querySelector("#channel-title").textContent = channel.title;
  document.querySelector("#channel-mode").textContent = channel.status;
  document.querySelector("#channel-mode").className = channel.status === "Private"
    ? "shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[.68rem] font-black text-emerald-700"
    : "shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[.68rem] font-black text-slate-600";
  document.querySelector("#channel-counterparty").textContent = channel.counterparty;
}

function renderConversation() {
  const items = channelTimeline();
  const visibleItems = items.filter((item) => item.eventType === VeilEventType.CHAT || item.eventType === VeilEventType.ACCEPT_OFFER || item.eventType === VeilEventType.COUNTER_OFFER || item.eventType === VeilEventType.ESCROW_SETTLED);

  conversationFeed.innerHTML = `
    <div class="event-marker">Today</div>
    ${visibleItems.map((item) => item.eventType === VeilEventType.CHAT ? renderMessage(item) : renderEventMarker(item)).join("")}
  `;
}

function renderMessage(item) {
  const isSelf = item.sender === "You" || item.sender === "you";
  const align = isSelf ? "justify-end" : "justify-start";
  const bubble = isSelf
    ? "rounded-br-sm bg-slate-950 text-white"
    : "rounded-bl-sm bg-slate-100 text-slate-950";
  const metaAlign = isSelf ? "justify-end" : "justify-start";

  return `
    <article class="message flex ${align}">
      <div class="max-w-full">
        <div class="mb-1 flex ${metaAlign} items-baseline gap-2 px-1">
          <strong class="text-xs font-black text-slate-500">${escapeHtml(isSelf ? "You" : item.sender)}</strong>
          <time class="text-xs font-bold text-slate-400">${escapeHtml(formatTime(item.timestamp))}</time>
        </div>
        <p class="message-bubble ${bubble}">${escapeHtml(item.body)}</p>
      </div>
    </article>
  `;
}

function renderEventMarker(item) {
  const label = item.label || {
    [VeilEventType.COUNTER_OFFER]: "Offer updated",
    [VeilEventType.ACCEPT_OFFER]: "Offer accepted",
    [VeilEventType.ESCROW_SETTLED]: "Escrow completed",
  }[item.eventType] || "Deal updated";
  return `<div class="event-marker">${escapeHtml(label)}</div>`;
}

function renderDeal() {
  document.querySelector("#offer-status").textContent = dealState.offerStatus;
  document.querySelector("#seller-offer").textContent = dealState.sellerOffer;
  document.querySelector("#buyer-counter").textContent = dealState.buyerCounter;
  document.querySelector("#escrow-status").textContent = dealState.escrowStatus;
  document.querySelector("#settlement-status").textContent = dealState.settlementStatus;
  document.querySelector("#payment-state").textContent = dealState.paymentState;
  document.querySelector("#proof-status").textContent = dealState.proofStatus;
  document.querySelector("#settlement-chip").textContent = dealState.escrowStatus === "Completed" ? "Released" : "Waiting release";
  document.querySelector("#settlement-chip").classList.toggle("done", dealState.escrowStatus === "Completed");
  document.querySelectorAll("[data-payment-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.paymentMode === dealState.paymentMode);
  });
}

function renderChannel() {
  renderChannelHeader();
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === activeTab);
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.panel !== activeTab);
  });
  renderConversation();
  renderDeal();
  refreshIcons();
}

function appendTimeline(item) {
  const timeline = channelTimeline();
  timeline.push({
    id: item.id || `local-${Date.now()}-${timeline.length}`,
    timestamp: item.timestamp || Date.now(),
    ...item,
  });

  const channel = currentChannel();
  if (item.eventType === VeilEventType.CHAT) {
    channel.lastMessage = `${item.sender === "You" ? "You" : item.sender}: ${item.body}`;
  } else if (item.label) {
    channel.lastMessage = item.label;
  }
  channel.time = "now";

  renderChannel();
  if (activeTab === "conversation") {
    requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }));
  }
}

async function submitWithSdk(action, fallbackItem, successMessage = "Saved.") {
  try {
    if (timelineMode === "direct-helper" && !directHelperTransport) {
      const connected = await connectWallet();
      if (!connected) return;
    }
    const result = await action();
    appendTimeline({
      ...fallbackItem,
      transactionHash: result?.transactionHash,
    });
    showToast(successMessage);
  } catch (error) {
    appendTimeline(fallbackItem);
    showToast("Saved locally.");
  }
}

async function sendMessage(message) {
  const item = {
    eventType: VeilEventType.CHAT,
    sender: "You",
    body: message,
    timestamp: Date.now(),
  };
  await submitWithSdk(
    () => veilClient.sendMessage({ channelId: activeChannelId, sender: "you", message }),
    item,
    "Message sent.",
  );
}

async function createCounterOffer() {
  dealState.buyerCounter = "450 STRK";
  dealState.offerStatus = "Counter sent";
  await submitWithSdk(
    () => veilClient.counterOffer({
      channelId: activeChannelId,
      amount: "450",
      currency: "STRK",
      terms: "Private settlement with memo and proof.",
      sender: "you",
    }),
    {
      eventType: VeilEventType.COUNTER_OFFER,
      label: "Offer updated",
      timestamp: Date.now(),
    },
    "Counter sent.",
  );
}

async function acceptOffer() {
  dealState.offerStatus = "Accepted";
  dealState.escrowStatus = "Ready";
  await submitWithSdk(
    () => veilClient.acceptOffer({
      channelId: activeChannelId,
      offerId: dealState.buyerCounter,
      reason: "Accepted. Move to escrow.",
      sender: "you",
    }),
    {
      eventType: VeilEventType.ACCEPT_OFFER,
      label: "Offer accepted",
      timestamp: Date.now(),
    },
    "Offer accepted.",
  );
}

async function completeEscrow() {
  dealState.escrowStatus = "Completed";
  dealState.settlementStatus = "Complete";
  await submitWithSdk(
    () => veilClient.recordEscrowStatus({
      channelId: activeChannelId,
      status: "settled",
      details: "Escrow completed.",
      sender: "system",
    }),
    {
      eventType: VeilEventType.ESCROW_SETTLED,
      label: "Escrow completed",
      timestamp: Date.now(),
    },
    "Escrow completed.",
  );
}

async function sendPayment() {
  const amount = document.querySelector("#payment-amount").value.trim() || "450 STRK";
  const memo = document.querySelector("#payment-memo").value.trim() || "Settlement memo.";
  dealState.paymentState = "Sent";
  await submitWithSdk(
    () => veilClient.sendPaymentMemo({
      channelId: activeChannelId,
      memo,
      amount,
      mode: dealState.paymentMode,
      sender: "you",
    }),
    {
      eventType: VeilEventType.PAYMENT_MEMO,
      label: "Payment memo sent",
      timestamp: Date.now(),
    },
    "Payment sent.",
  );
  setChannelTab("deal");
}

async function attachProof() {
  dealState.proofStatus = "Attached";
  dealState.settlementStatus = dealState.escrowStatus === "Completed" ? "Complete" : dealState.settlementStatus;
  await submitWithSdk(
    () => veilClient.attachProof({
      channelId: activeChannelId,
      proofRef: `proof://veil/${activeChannelId}/${Date.now()}`,
      label: "Settlement proof",
      sender: "system",
    }),
    {
      eventType: VeilEventType.PROOF_ATTACHED,
      label: "Proof attached",
      timestamp: Date.now(),
    },
    "Proof attached.",
  );
  setChannelTab("deal");
}

function handleDealAction(action) {
  const actions = {
    counter: createCounterOffer,
    accept: acceptOffer,
    "complete-escrow": completeEscrow,
    "send-payment": sendPayment,
    "attach-proof": attachProof,
  };
  actions[action]?.();
}

function initEvents() {
  document.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-nav]");
    if (nav) {
      setScreen(nav.dataset.nav);
      return;
    }

    const open = event.target.closest("[data-open-channel]");
    if (open) {
      openChannel(open.dataset.openChannel, open.dataset.tabTarget || "conversation");
      return;
    }

    const tab = event.target.closest("[data-tab]");
    if (tab) {
      setChannelTab(tab.dataset.tab);
      return;
    }

    const dealAction = event.target.closest("[data-deal-action]");
    if (dealAction) {
      handleDealAction(dealAction.dataset.dealAction);
      return;
    }

    const paymentMode = event.target.closest("[data-payment-mode]");
    if (paymentMode) {
      dealState.paymentMode = paymentMode.dataset.paymentMode;
      renderDeal();
      return;
    }

    if (event.target.closest(".connect-button")) {
      connectWallet();
      return;
    }

    if (event.target.closest("[data-create-channel]")) {
      showToast("New private deal is ready from Channels.");
    }

    if (event.target.closest("[data-attach]")) {
      showToast("Attachment ready.");
    }
  });

  messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = messageInput.value.trim();
    if (!message) return;
    messageInput.value = "";
    messageInput.style.height = "";
    await sendMessage(message);
  });

  messageInput.addEventListener("input", () => {
    messageInput.style.height = "";
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 128)}px`;
  });

  channelSearch?.addEventListener("input", renderChannels);
}

function init() {
  renderChannels();
  renderChannel();
  initEvents();
  setScreen("home", { keepScroll: true });
  refreshIcons();
  setTimeout(refreshIcons, 250);
}

init();
