import {
  DirectHelperTransport,
  ResearchPrivacyPoolAdapter,
  VeilClient,
  VeilEventType,
} from "./packages/veil-sdk/src/index.ts";

const pageTitles = {
  home: { title: "Home", eyebrow: "Command center" },
  channels: { title: "Channels", eyebrow: "Negotiation rooms" },
  "channel-detail": { title: "Rights Transfer", eyebrow: "Channel workspace" },
  rewards: { title: "Rewards", eyebrow: "Activity points" },
  developer: { title: "Privacy Pool Research", eyebrow: "Developer tools" },
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
const demoChannelId = "rights-transfer";
const timelineMode = import.meta.env.VITE_VEIL_TIMELINE_MODE || "mock";
const privacyPoolAddress = import.meta.env.VITE_PRIVACY_POOL_ADDRESS || "";
const helperAddress = import.meta.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS || "";
const escrowAddress = import.meta.env.VITE_VEIL_ESCROW_ADDRESS || "";
const demoCounterpartyAddress = import.meta.env.VITE_DEMO_COUNTERPARTY_ADDRESS || "";
const directHelperWallet = globalThis.window?.veilDemoWallet;
const directHelperTransport =
  timelineMode === "direct-helper" && directHelperWallet?.account && directHelperWallet?.provider
    ? new DirectHelperTransport({
        helperAddress: helperAddress || "mock-veil-helper",
        account: directHelperWallet.account,
        provider: directHelperWallet.provider,
      })
    : undefined;
const veilClient = new VeilClient({
  privacyPoolAddress: privacyPoolAddress || "mock-privacy-pool",
  helperAddress: helperAddress || "mock-veil-helper",
  rpcUrl: import.meta.env.VITE_STARKNET_RPC_URL || "mock-rpc",
  ...(directHelperTransport ? { transport: directHelperTransport } : {}),
});
// VEIL IMPLEMENTATION NOTE:
// This adapter is read-only. It helps decode the real STRK20 Privacy Pool ABI
// while the official SDK is private, without pretending VEIL can submit real
// Privacy Pool transactions yet.
const researchAdapter = new ResearchPrivacyPoolAdapter({
  rpcUrl: import.meta.env.VITE_STARKNET_RPC_URL || "",
  privacyPoolAddress,
  helperAddress,
});

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

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

function normalizeSender(sender) {
  const normalized = String(sender || "system").toLowerCase();
  if (normalized === "you") return "You";
  if (normalized === "buyer") return "Buyer";
  if (normalized === "seller") return "Seller";
  if (normalized === "assistant") return "Assistant";
  return "System";
}

function messageClasses(sender) {
  if (sender === "Buyer") return "bg-indigo-300/20 text-indigo-100";
  if (sender === "Assistant") return "bg-emerald-300/15 text-emerald-100";
  return "bg-slate-800 text-slate-200";
}

function eventMeta(item) {
  const payload = item.payload || {};
  const currency = payload.currency || "STRK";
  const amount = payload.amount ? `${payload.amount} ${currency}`.replace(`${currency} ${currency}`, currency) : "";

  switch (item.eventType) {
    case VeilEventType.OFFER:
      return {
        label: "Offer created",
        value: amount || "Offer",
        body: payload.terms || "Offer terms attached.",
        dot: "bg-amber-300",
        labelText: "text-amber-100",
      };
    case VeilEventType.COUNTER_OFFER:
      return {
        label: "Counter offer",
        value: amount || "Counter",
        body: payload.terms || "Private settlement terms added.",
        dot: "bg-amber-300",
        labelText: "text-amber-100",
      };
    case VeilEventType.ACCEPT_OFFER:
      return {
        label: "Offer accepted",
        value: payload.offerId || "Accepted",
        body: payload.reason || "Settlement can move forward.",
        dot: "bg-emerald-300",
        labelText: "text-emerald-100",
      };
    case VeilEventType.REJECT_OFFER:
      return {
        label: "Offer rejected",
        value: payload.offerId || "Rejected",
        body: payload.reason || "Offer was rejected.",
        dot: "bg-rose-300",
        labelText: "text-rose-100",
      };
    case VeilEventType.ESCROW_CREATED:
      return {
        label: "Escrow created",
        value: "Escrow",
        body: payload.details || "Escrow status updated.",
        dot: "bg-indigo-300",
        labelText: "text-indigo-100",
      };
    case VeilEventType.ESCROW_DEPOSITED:
      return {
        label: "Escrow deposited",
        value: "Deposit",
        body: payload.details || "Escrow deposit recorded.",
        dot: "bg-indigo-300",
        labelText: "text-indigo-100",
      };
    case VeilEventType.ESCROW_SETTLED:
      return {
        label: "Escrow settled",
        value: "Settled",
        body: payload.details || "Escrow was settled.",
        dot: "bg-emerald-300",
        labelText: "text-emerald-100",
      };
    case VeilEventType.ESCROW_CANCELLED:
      return {
        label: "Escrow cancelled",
        value: "Cancelled",
        body: payload.details || "Escrow was cancelled.",
        dot: "bg-rose-300",
        labelText: "text-rose-100",
      };
    case VeilEventType.PAYMENT_MEMO:
      return {
        label: "Memo attached",
        value: payload.amount || "Payment memo",
        body: payload.memo || "Payment memo attached.",
        dot: "bg-sky-300",
        labelText: "text-sky-100",
      };
    case VeilEventType.PROOF_ATTACHED:
      return {
        label: "Proof attached",
        value: payload.label || "Proof",
        body: payload.proofRef || "Proof reference attached.",
        dot: "bg-emerald-300",
        labelText: "text-emerald-100",
      };
    default:
      return {
        label: "Channel event",
        value: "Update",
        body: "Channel updated.",
        dot: "bg-slate-400",
        labelText: "text-slate-300",
      };
  }
}

function createTimelineElement(item) {
  const element = document.createElement(item.eventType === VeilEventType.CHAT ? "article" : "div");
  const payload = item.payload || {};

  element.dataset.feedKind = item.eventType === VeilEventType.CHAT ? "message" : "event";
  element.dataset.feedGroup = item.eventType === VeilEventType.CHAT ? "messages" : "events";

  if (item.eventType === VeilEventType.CHAT && payload.kind === "chat") {
    const sender = normalizeSender(payload.sender);
    const isSelf = sender === "You";
    const avatar = escapeHtml(sender.charAt(0));
    const safeMessage = escapeHtml(payload.message);
    const safeTime = escapeHtml(formatTime(item.timestamp));

    element.className = isSelf ? "flex justify-end animate-new-entry" : "flex items-start gap-3 animate-new-entry";
    element.innerHTML = isSelf
      ? `
        <div class="min-w-0">
          <div class="mb-1 flex items-baseline justify-end gap-2">
            <time class="text-xs text-slate-500">${safeTime}</time>
            <strong class="text-sm">${sender}</strong>
          </div>
          <p class="max-w-[22rem] rounded-2xl rounded-tr-sm bg-emerald-200/15 px-3 py-2 text-sm leading-6 text-slate-100">${safeMessage}</p>
        </div>
      `
      : `
        <div class="grid size-8 shrink-0 place-items-center rounded-full ${messageClasses(sender)} text-xs font-black">${avatar}</div>
        <div class="min-w-0">
          <div class="mb-1 flex items-baseline gap-2">
            <strong class="text-sm">${sender}</strong>
            <time class="text-xs text-slate-500">${safeTime}</time>
          </div>
          <p class="max-w-[22rem] rounded-2xl rounded-tl-sm bg-slate-900/90 px-3 py-2 text-sm leading-6 text-slate-200">${safeMessage}</p>
        </div>
      `;
    return element;
  }

  const meta = eventMeta(item);

  element.className = "grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-md bg-white/[0.035] px-3 py-2 animate-new-entry";
  element.innerHTML = `
    <span class="mt-2 size-1.5 rounded-full ${meta.dot}"></span>
    <div class="min-w-0">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <strong class="text-[0.68rem] font-black uppercase tracking-wide ${meta.labelText}">${escapeHtml(meta.label)}</strong>
        <span class="text-sm font-bold text-white">${escapeHtml(meta.value)}</span>
        <time class="text-xs text-slate-500">${escapeHtml(formatTime(item.timestamp))}</time>
      </div>
      <p class="truncate text-xs leading-5 text-slate-400">${escapeHtml(meta.body)}</p>
    </div>
  `;

  return element;
}

async function renderTimeline(options = { scrollToBottom: false }) {
  const list = document.querySelector("#timeline-list");
  const items = await veilClient.getTimeline({ channelId: demoChannelId, decrypt: true });
  list.innerHTML = "";
  items.forEach((timelineItem) => list.appendChild(createTimelineElement(timelineItem)));
  applyFeedFilter();

  if (options.scrollToBottom) {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    });
  }
}

function shortFelt(value) {
  if (!value) return "n/a";
  const text = String(value);
  if (text.length <= 18) return text;
  return `${text.slice(0, 10)}...${text.slice(-6)}`;
}

function proofModeLabel() {
  if (directHelperTransport) return "Direct helper testnet";
  if (timelineMode === "direct-helper") return "Direct helper not connected";
  return "Mock proof";
}

function explorerTxUrl(txHash) {
  return txHash && String(txHash).startsWith("0x")
    ? `https://sepolia.voyager.online/tx/${txHash}`
    : "";
}

function explorerContractUrl(address) {
  return address && String(address).startsWith("0x")
    ? `https://sepolia.voyager.online/contract/${address}`
    : "";
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

function renderProofStatus() {
  setText("#proof-mode", proofModeLabel());
  setText("#proof-helper-address", helperAddress || "not configured");
  setText("#proof-escrow-address", escrowAddress || "optional for timeline proof");
  setText("#proof-counterparty-address", demoCounterpartyAddress || "seller signer required for escrow contract");

  const helperLink = document.querySelector("#proof-helper-link");
  if (helperLink) {
    const url = explorerContractUrl(helperAddress);
    helperLink.href = url || "#";
    helperLink.classList.toggle("pointer-events-none", !url);
    helperLink.classList.toggle("opacity-40", !url);
  }

  const escrowLink = document.querySelector("#proof-escrow-link");
  if (escrowLink) {
    const url = explorerContractUrl(escrowAddress);
    escrowLink.href = url || "#";
    escrowLink.classList.toggle("pointer-events-none", !url);
    escrowLink.classList.toggle("opacity-40", !url);
  }

  const note = document.querySelector("#proof-mode-note");
  if (note) {
    note.textContent = directHelperTransport
      ? "Events submitted from this UX will call VeilChannelHelper.privacy_invoke on Sepolia."
      : "This UX runs the same A/B proof locally. Set VITE_VEIL_TIMELINE_MODE=direct-helper and provide a wallet adapter to submit onchain.";
  }
}

function renderProofLog(entries) {
  const log = document.querySelector("#proof-log");
  if (!log) return;
  if (entries.length === 0) {
    log.innerHTML = `<p class="text-sm text-slate-500">Run the A/B proof to collect timeline transaction hashes here.</p>`;
    return;
  }

  log.innerHTML = entries.map((entry, index) => {
    const url = explorerTxUrl(entry.transactionHash);
    return `
      <article class="grid gap-1 rounded-md border border-slate-800 bg-slate-950/60 p-2">
        <div class="flex items-center justify-between gap-2">
          <strong class="text-xs text-white">${index + 1}. ${escapeHtml(entry.label)}</strong>
          <span class="rounded-full border border-emerald-200/25 bg-emerald-200/10 px-2 py-0.5 text-[0.68rem] font-black text-emerald-100">${escapeHtml(entry.mode)}</span>
        </div>
        ${
          url
            ? `<a class="break-all text-xs text-emerald-200" href="${url}" target="_blank" rel="noreferrer">${escapeHtml(entry.transactionHash)}</a>`
            : `<code class="break-all text-xs text-slate-500">${escapeHtml(entry.transactionHash || "pending")}</code>`
        }
      </article>
    `;
  }).join("");
}

function setProofRunning(isRunning) {
  const button = document.querySelector("#run-proof-flow");
  if (!button) return;
  button.disabled = isRunning;
  button.classList.toggle("opacity-60", isRunning);
  button.querySelector("span").textContent = isRunning ? "Running proof..." : "Run A/B Proof";
}

async function runProofStep(label, action, entries) {
  const item = await action();
  entries.push({
    label,
    transactionHash: item.transactionHash || "",
    mode: directHelperTransport ? "Sepolia" : "Mock",
  });
  renderProofLog(entries);
  await renderTimeline({ scrollToBottom: true });
  return item;
}

async function runAbProofFlow() {
  const entries = [];
  setProofRunning(true);
  renderProofLog(entries);
  setFeedFilter("all");
  setPage("channel-detail", { resetScroll: false });
  setChannelTab("timeline");

  try {
    await runProofStep(
      "Alice chat",
      () => veilClient.sendMessage({
        channelId: demoChannelId,
        sender: "you",
        message: "Hi Bob, can we settle the rights package around 450 STRK with proof attached?",
      }),
      entries,
    );
    await runProofStep(
      "Bob replies",
      () => veilClient.sendMessage({
        channelId: demoChannelId,
        sender: "seller",
        message: "I can start at 500 STRK if the metadata memo is included.",
      }),
      entries,
    );
    await runProofStep(
      "Bob creates offer",
      () => veilClient.createOffer({
        channelId: demoChannelId,
        amount: "500",
        currency: "STRK",
        terms: "Digital rights package with metadata memo.",
        sender: "seller",
      }),
      entries,
    );
    await runProofStep(
      "Alice counters",
      () => veilClient.counterOffer({
        channelId: demoChannelId,
        amount: "450",
        currency: "STRK",
        terms: "Private settlement at 450 STRK with proof reference.",
        sender: "you",
      }),
      entries,
    );
    await runProofStep(
      "Bob accepts",
      () => veilClient.acceptOffer({
        channelId: demoChannelId,
        offerId: "450 STRK",
        reason: "Accepted. Move to escrow.",
        sender: "seller",
      }),
      entries,
    );
    await runProofStep(
      "Escrow created",
      () => veilClient.recordEscrowStatus({
        channelId: demoChannelId,
        status: "created",
        details: escrowAddress
          ? `Escrow contract ${shortFelt(escrowAddress)} linked to this channel.`
          : "Escrow created marker appended to channel timeline.",
      }),
      entries,
    );
    await runProofStep(
      "Buyer deposit confirmed",
      () => veilClient.recordEscrowStatus({
        channelId: demoChannelId,
        status: "deposited",
        details: "Alice buyer deposit confirmed.",
        sender: "you",
      }),
      entries,
    );
    await runProofStep(
      "Seller deposit confirmed",
      () => veilClient.recordEscrowStatus({
        channelId: demoChannelId,
        status: "deposited",
        details: "Bob seller deposit confirmed.",
        sender: "seller",
      }),
      entries,
    );
    await runProofStep(
      "Payment memo attached",
      () => veilClient.sendPaymentMemo({
        channelId: demoChannelId,
        memo: "Settlement memo: rights transfer closed at 450 STRK.",
        amount: "450 STRK",
        mode: "Shield",
        sender: "you",
      }),
      entries,
    );
    await runProofStep(
      "Escrow settled",
      () => veilClient.recordEscrowStatus({
        channelId: demoChannelId,
        status: "settled",
        details: "Escrow settled after both confirmations.",
        sender: "system",
      }),
      entries,
    );
    await runProofStep(
      "Proof attached",
      () => veilClient.attachProof({
        channelId: demoChannelId,
        proofRef: `proof://rights-transfer/testnet-${Date.now()}`,
        label: "A/B channel proof",
        sender: "system",
      }),
      entries,
    );

    document.querySelector("#deal-status").textContent = "Settled";
    toggleClasses(
      document.querySelector("#deal-status"),
      ["border-emerald-200/40", "bg-emerald-200/10", "text-emerald-100"],
      ["border-amber-300/35", "bg-amber-300/10", "text-amber-200"],
    );
    document.querySelector("#current-offer").textContent = "450 STRK settled";
    showToast(directHelperTransport ? "A/B proof submitted to Sepolia helper." : "A/B proof replayed in local UX mode.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Unable to run A/B proof.");
  } finally {
    setProofRunning(false);
  }
}

function renderResearchField(field) {
  const value = field.values ? field.values.join(", ") : field.value;
  return `
    <div class="grid gap-1 rounded-md border border-slate-800 bg-slate-950/60 p-2">
      <span class="text-[0.68rem] font-black uppercase tracking-wide text-slate-500">${escapeHtml(field.name)}</span>
      <code class="break-all text-xs text-slate-300">${escapeHtml(value || "n/a")}</code>
      <span class="text-[0.68rem] text-slate-600">${escapeHtml(field.type || field.source || "felt")}</span>
    </div>
  `;
}

function renderResearchActions(calls) {
  const actionSets = calls.flatMap((call, callIndex) =>
    call.decodedActions.flatMap((set) =>
      set.actions.map((action) => ({ call, callIndex, set, action })),
    ),
  );

  if (actionSets.length === 0) {
    return `<p class="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-400">No Privacy Pool client/server action could be decoded from calldata shape yet.</p>`;
  }

  return actionSets.map(({ call, callIndex, set, action }) => `
    <article class="grid gap-3 rounded-lg border border-slate-800 bg-slate-950/55 p-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <strong class="text-sm text-white">${escapeHtml(action.name)}</strong>
          <span class="ml-2 rounded-full border border-emerald-200/25 bg-emerald-200/10 px-2 py-0.5 text-[0.68rem] font-black text-emerald-100">${escapeHtml(set.source)}</span>
        </div>
        <code class="text-xs text-slate-500">call ${callIndex + 1} / variant ${action.variant}</code>
      </div>
      <div class="grid gap-2 sm:grid-cols-2">${action.fields.map(renderResearchField).join("")}</div>
      ${action.helperInvoke ? `
        <div class="rounded-md border border-emerald-200/25 bg-emerald-200/10 p-3 text-sm text-emerald-100">
          <strong class="block">VEIL helper invoke detected</strong>
          <span class="mt-1 block text-emerald-100/80">Event ${escapeHtml(action.helperInvoke.eventTypeLabel)} on channel ${escapeHtml(shortFelt(action.helperInvoke.channelId))}</span>
        </div>
      ` : ""}
      ${call.to ? `<code class="break-all text-xs text-slate-500">to ${escapeHtml(call.to)}</code>` : ""}
    </article>
  `).join("");
}

function renderResearchEvents(events) {
  if (events.length === 0) {
    return `<p class="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-400">No events found in receipt.</p>`;
  }

  return events.map((event) => `
    <article class="grid gap-3 rounded-lg border border-slate-800 bg-slate-950/55 p-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <strong class="text-sm text-white">${escapeHtml(event.name)}</strong>
          <span class="ml-2 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[0.68rem] font-black uppercase text-slate-300">${escapeHtml(event.category)}</span>
        </div>
        <span class="text-xs text-slate-500">${escapeHtml(event.confidence)}</span>
      </div>
      <div class="grid gap-2 sm:grid-cols-2">${event.fields.map(renderResearchField).join("")}</div>
      ${event.contractAddress ? `<code class="break-all text-xs text-slate-500">from ${escapeHtml(event.contractAddress)}</code>` : ""}
    </article>
  `).join("");
}

function setResearchState(state, message) {
  const status = document.querySelector("#research-status");
  const button = document.querySelector("#research-submit");
  status.textContent = message;
  status.className = "rounded-lg border px-3 py-2 text-sm";
  if (state === "error") {
    status.classList.add("border-rose-300/30", "bg-rose-300/10", "text-rose-100");
  } else if (state === "success") {
    status.classList.add("border-emerald-200/30", "bg-emerald-200/10", "text-emerald-100");
  } else {
    status.classList.add("border-slate-800", "bg-slate-950/60", "text-slate-400");
  }
  button.disabled = state === "loading";
  button.classList.toggle("opacity-60", state === "loading");
}

function renderResearchAnalysis(analysis) {
  const result = document.querySelector("#research-result");
  result.innerHTML = `
    <div class="grid gap-3 md:grid-cols-3">
      <article class="rounded-lg border border-slate-800 bg-slate-950/55 p-3">
        <span class="text-xs font-bold uppercase tracking-wide text-slate-500">Called flow</span>
        <strong class="mt-2 block text-sm text-white">${escapeHtml(analysis.calledFunction)}</strong>
      </article>
      <article class="rounded-lg border border-slate-800 bg-slate-950/55 p-3">
        <span class="text-xs font-bold uppercase tracking-wide text-slate-500">Contract</span>
        <code class="mt-2 block break-all text-xs text-slate-300">${escapeHtml(analysis.contractAddress || "unknown")}</code>
      </article>
      <article class="rounded-lg border border-slate-800 bg-slate-950/55 p-3">
        <span class="text-xs font-bold uppercase tracking-wide text-slate-500">Decoded events</span>
        <strong class="mt-2 block text-sm text-white">${analysis.decodedEvents.length}</strong>
      </article>
    </div>
    <section class="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
      <h3 class="text-sm font-black text-white">Flow interpretation</h3>
      <div class="mt-3 grid gap-2">
        ${analysis.interpretation.map((item) => `<p class="rounded-md bg-slate-950/60 px-3 py-2 text-sm text-slate-300">${escapeHtml(item)}</p>`).join("")}
      </div>
    </section>
    <section class="grid gap-3">
      <h3 class="text-sm font-black text-white">Decoded calldata</h3>
      ${renderResearchActions(analysis.decodedCalldata)}
    </section>
    <section class="grid gap-3">
      <h3 class="text-sm font-black text-white">Decoded events</h3>
      ${renderResearchEvents(analysis.decodedEvents)}
    </section>
  `;
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
  const recipient = document.querySelector("#payment-recipient").value.trim() || "Counterparty";
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

document.querySelector("#payment-confirm").addEventListener("click", async () => {
  syncReview();
  setPaymentStep("success");
  const amount = document.querySelector("#success-amount").textContent;
  const mode = document.querySelector("#success-mode").textContent;
  const memo = document.querySelector("#payment-memo").value.trim() || "Payment memo attached.";
  setFeedFilter("all");
  await veilClient.sendPaymentMemo({ channelId: demoChannelId, amount, mode, memo, sender: "you" });
  await veilClient.attachProof({
    channelId: demoChannelId,
    proofRef: `proof://rights-transfer/${Date.now()}`,
    label: "Payment proof",
  });
  await renderTimeline({ scrollToBottom: true });
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
  button.addEventListener("click", async () => {
    const status = document.querySelector("#deal-status");
    status.textContent = "Buyer accepted. Settlement ready";
    toggleClasses(status, ["border-emerald-200/40", "bg-emerald-200/10", "text-emerald-100"], ["border-amber-300/35", "bg-amber-300/10", "text-amber-200"]);
    document.querySelector("#current-offer").textContent = "450 STRK accepted";
    setFeedFilter("all");
    await veilClient.acceptOffer({ channelId: demoChannelId, sender: "buyer" });
    await veilClient.recordEscrowStatus({
      channelId: demoChannelId,
      status: "deposited",
      details: "Settlement is ready for final confirmation.",
    });
    await renderTimeline({ scrollToBottom: true });
    showToast("Assistant suggestion accepted. Proof generated.");
  });
});

document.querySelectorAll("[data-create-counter]").forEach((button) => {
  button.addEventListener("click", async () => {
    setFeedFilter("all");
    await veilClient.counterOffer({
      channelId: demoChannelId,
      amount: "450",
      currency: "STRK",
      terms: "Private settlement terms added.",
      sender: "you",
    });
    await renderTimeline({ scrollToBottom: true });
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

document.querySelector("#run-proof-flow").addEventListener("click", runAbProofFlow);

document.querySelector("#message-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = event.currentTarget.elements.message;
  const message = input.value.trim();
  if (!message) return;
  setFeedFilter("all");
  const sent = await veilClient.sendMessage({ channelId: demoChannelId, message, sender: "you" });
  await renderTimeline({ scrollToBottom: true });
  input.value = "";
  showToast(sent.transactionHash ? `Onchain message submitted: ${shortFelt(sent.transactionHash)}` : "Message sent in channel chat.");
});

document.querySelector("#privacy-research-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const hash = event.currentTarget.elements.transactionHash.value.trim();
  if (!hash) {
    setResearchState("error", "Paste a Starknet transaction hash first.");
    return;
  }

  setResearchState("loading", "Fetching transaction and receipt from Starknet RPC...");
  try {
    const analysis = await researchAdapter.analyzeTransaction(hash);
    renderResearchAnalysis(analysis);
    setResearchState("success", "Decoded in read-only research mode. No transaction was submitted.");
  } catch (error) {
    setResearchState("error", error instanceof Error ? error.message : "Unable to analyze transaction.");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePaymentModal();
  }
});

window.addEventListener("load", async () => {
  setPage("home", { resetScroll: false });
  setChannelTab("timeline");
  setFeedFilter("all");
  renderProofStatus();
  if (directHelperTransport) {
    await renderTimeline();
    showToast("Direct helper mode: channel events submit onchain.");
  } else {
    await veilClient.seedDemoChannel(demoChannelId);
    await renderTimeline();
  }
  refreshIcons();
});
