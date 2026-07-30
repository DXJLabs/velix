import { conversationRowsMarkup } from "../../ui/conversation-ui.js";
import { renderChannelHeader, channelFeedMarkup } from "../../ui/deals/channel-ui.js";
import { inlineEventMarkup, messageMarkup, offerCardMarkup } from "../../ui/timeline-ui.js";
import { workflowProgressMarkup } from "../../ui/workflow-ui.js";
import { createMessageTimelineSyncService } from "../../services/messaging/message-sync-service.js";

const INDEXER_CURSOR_PREFIX = "veil:indexer:cursor:v1";

function isInviteMetadataEvent(item = {}) {
  const title = String(item.title || "").trim().toLowerCase();
  const subtitle = String(item.subtitle || "").trim().toLowerCase();
  const detailLabels = Array.isArray(item.details)
    ? item.details.map(([label]) => String(label || "").trim().toLowerCase())
    : [];
  return title === "invite status"
    || title === "invite link generated"
    || title === "veil invitation opened"
    || (subtitle.includes("invite can no longer be used") && detailLabels.includes("reuse"));
}

function isInviteAcceptedEvent(item = {}) {
  const title = String(item.title || "").trim().toLowerCase();
  const subtitle = String(item.subtitle || "").trim().toLowerCase();
  return title === "invitation accepted"
    || (title.includes("joined the deal") && subtitle.includes("invite accepted"));
}

export function createDealRoomController({
  state,
  channels,
  messages,
  document,
  conversationList,
  conversationSearch,
  messageFeed,
  composerForm,
  timelineMode,
  helperAddress,
  chatDisplayMode,
  bobIdentity,
  currentChannel,
  currentDealId,
  channelMessages,
  channelRequiresJoin,
  renderInviteWaitingCard,
  getVeilClient,
  veilError,
  statusPillClass,
  starkIdentityName,
  itemStateClass,
  renderChainMeta,
  showScreen,
  iconRefresh,
}) {
  const messageTimelineSync = createMessageTimelineSyncService({
    state,
    loadTimeline: loadIndexedChannelTimeline,
    onError: (error, { channelId }) => {
      veilError("indexer.timeline.sync.failed", error, {
        where: "messageTimelineSync",
        channelId,
        howToFix: "Retry the room after confirming the indexer and Starknet RPC are reachable.",
      });
    },
  });

  function openChannel(channelId) {
    state.channelId = channelId;
    const channel = currentChannel();
    channel.unread = 0;
    showScreen("channel");

    // Do not poll a room until both wallet-managed encryption identities are ready.
    if (!channelRequiresJoin(channel) && channel.privateMessagingReady !== false) {
      void messageTimelineSync.start(channelId);
    }
  }

  async function loadIndexedChannelTimeline(channelId) {
    if (timelineMode !== "encrypted-direct" || !helperAddress) return;

    try {
      const client = getVeilClient();
      if (typeof client.encryption?.deriveConversationTag !== "function") return;
      const conversationTag = await client.encryption.deriveConversationTag(channelId);
      if (!/^0x[0-9a-fA-F]{1,64}$/.test(conversationTag) || BigInt(conversationTag) === 0n) return;

      const cursorKey = `${INDEXER_CURSOR_PREFIX}:${helperAddress.toLowerCase()}:${conversationTag.toLowerCase()}`;
      const cursor = readIndexerCursor(cursorKey);
      const params = new URLSearchParams({
        conversationTag,
        limit: "10",
        pageBlocks: "5000",
      });
      if (cursor) params.set("cursor", cursor);

      const response = await fetch(`/api/indexer/messages?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (String(payload.conversationTag || "").toLowerCase() !== conversationTag.toLowerCase()) return;
      if (typeof payload.nextCursor === "string" && payload.nextCursor) {
        writeIndexerCursor(cursorKey, payload.nextCursor);
      }

      const rollbackFromBlock = Number(payload.reorg?.rollbackFromBlock);
      if (payload.reorg?.detected && Number.isSafeInteger(rollbackFromBlock)) {
        messages[channelId] = (messages[channelId] || []).filter((item) => (
          !item.indexed || !Number.isSafeInteger(item.blockNumber) || item.blockNumber < rollbackFromBlock
        ));
      }

      const indexedItems = Array.isArray(payload.messages) ? payload.messages : [];

      const feedItems = [];
      for (const indexedItem of indexedItems) {
        const timelineItem = {
          ...indexedItem,
          channelId,
          indexed: true,
          eventType: Number(indexedItem.eventType),
          timestamp: Number(indexedItem.timestamp || Date.now()),
        };
        const decrypted = await getVeilClient().encryption.decryptPayload(timelineItem).catch(() => null);
        const feedItem = decrypted ? timelinePayloadToFeedItem(timelineItem, decrypted) : null;
        if (feedItem) feedItems.push(feedItem);
      }

      if (feedItems.length) {
        messages[channelId] = mergeIndexedFeed(messages[channelId] || [], feedItems);
      }
      const channel = channels.find((item) => item.id === channelId);
      const lastItem = messages[channelId]?.[messages[channelId].length - 1];
      if (channel && lastItem) {
        channel.last = lastItem.type === "message" ? `${lastItem.sender}: ${lastItem.body}` : lastItem.title;
        channel.time = "now";
      }
      if (state.channelId === channelId && state.screen === "channel") {
        renderChannel();
      }
    } catch (error) {
      const terminalCodes = new Set([
        "RECIPIENT_ENCRYPTION_KEY_NOT_FOUND",
        "ENCRYPTION_KEY_REGISTRY_UNAVAILABLE",
        "ENCRYPTION_IDENTITY_REGISTRATION_REQUIRED",
      ]);
      if (terminalCodes.has(error?.code)) {
        messageTimelineSync.stop();
        const channel = channels.find((item) => item.id === channelId);
        if (channel) {
          channel.privateMessagingReady = false;
          channel.status = "Setting Up Private Room";
          channel.last = "Finishing private setup";
        }
        veilError("indexer.timeline.blocked", error, {
          where: "loadIndexedChannelTimeline",
          channelId,
          howToFix: "Do not retry. Complete the wallet-managed encryption integration before opening private messaging.",
        });
        if (state.channelId === channelId && state.screen === "channel") {
          renderChannel();
        }
        return;
      }

      veilError("indexer.timeline.load.failed", error, {
        where: "loadIndexedChannelTimeline",
        howToFix: "Check the bounded indexer RPC, cursor secret, and verified helper deployment, then retry.",
      });
    }
  }

  function timelinePayloadToFeedItem(item, payload) {
    const sender = payload.sender === "you" ? "You" : payload.sender || "Peer";
    const base = {
      time: item.timestamp,
      txHash: item.transactionHash,
      blockNumber: item.blockNumber,
      eventId: item.eventId,
      indexed: Boolean(item.indexed),
      status: item.status || "confirmed",
      mode: item.mode || chatDisplayMode,
      actor: sender === "You" ? "Alice" : sender,
    };

    if (payload.kind === "chat") {
      return {
        ...base,
        mode: chatDisplayMode,
        type: "message",
        sender,
        body: payload.message,
        self: sender === "You",
      };
    }

    if (payload.kind === "offer" || payload.kind === "counter_offer") {
      const counterOffer = payload.kind === "counter_offer";
      return {
        ...base,
        type: "offer",
        title: counterOffer ? "Bob created a counter offer" : "Alice created an offer",
        actor: counterOffer ? "Bob" : "Alice",
        amount: `${payload.amount}${payload.currency ? ` ${payload.currency}` : ""}`,
        subtitle: payload.terms || "Private terms",
      };
    }

    const titles = {
      accept_offer: "Alice accepted Bob's counter offer",
      reject_offer: "Offer rejected",
      payment_memo: "AI note attached",
      escrow: payload.status === "settled" ? "Assets released" : "Escrow event recorded",
      proof: "Proof attached",
    };

    return {
      ...base,
      type: "inline",
      title: titles[payload.kind] || "Channel event",
      subtitle: payload.memo || payload.details || payload.label || payload.reason || "Encrypted event",
    };
  }

  function readIndexerCursor(key) {
    try {
      return globalThis.sessionStorage?.getItem(key) || "";
    } catch {
      return "";
    }
  }

  function writeIndexerCursor(key, cursor) {
    try {
      globalThis.sessionStorage?.setItem(key, cursor);
    } catch {
      // A disabled session store only reduces incremental-scan efficiency.
    }
  }

  function mergeIndexedFeed(existingItems, indexedItems) {
    const merged = new Map();
    for (const item of [...existingItems, ...indexedItems]) {
      const key = item.txHash && item.eventId !== undefined
        ? `${item.txHash}:${item.eventId}`
        : `${item.type}:${item.time}:${item.title || item.body || "event"}`;
      merged.set(key, item);
    }
    return [...merged.values()].sort((first, second) => Number(first.time || 0) - Number(second.time || 0));
  }

  function renderConversationList() {
    const query = conversationSearch?.value.trim().toLowerCase() || "";
    const rows = channels.filter((channel) => {
      const value = `${channel.title} ${channel.person} ${channel.last} ${channel.status}`.toLowerCase();
      return value.includes(query);
    });

    conversationList.innerHTML = conversationRowsMarkup(rows, statusPillClass);
    iconRefresh();
  }

  function renderChannel() {
    const channel = currentChannel();
    const waitingForCounterparty = channelRequiresJoin(channel);
    const privateSetupRequired = channel.privateMessagingReady === false;
    renderChannelHeader(document, {
      channel,
      dealId: currentDealId(channel),
      statusPillClass,
    });

    const setupMarkup = privateSetupRequired
      ? `
        <section class="veil-room-preparing" role="status" aria-live="polite">
          <span class="veil-preparing-orb">
            <span></span>
            <i data-lucide="shield-check" class="size-5"></i>
          </span>
          <div>
            <strong>Setting up your private room</strong>
            <p>VEIL is waiting for both sides to be ready before messages are enabled.</p>
            <small>No payment is requested and no funds move during this step.</small>
          </div>
        </section>
      `
      : "";

    messageFeed.innerHTML = channelFeedMarkup({
      waitingMarkup: waitingForCounterparty
        ? renderInviteWaitingCard(channel)
        : setupMarkup,
      feedMarkup: channelMessages().map(renderFeedItem).join(""),
    });
    if (composerForm) composerForm.hidden = waitingForCounterparty || privateSetupRequired;
    document.querySelectorAll("[data-workflow-progress]").forEach((container) => {
      container.hidden = waitingForCounterparty || privateSetupRequired;
    });

    const securityBanner = document.querySelector("[data-channel-security-banner]");
    if (securityBanner) {
      securityBanner.hidden = waitingForCounterparty || privateSetupRequired;
    }

    const securityTitle = document.querySelector("#channel-security-title");
    const securityState = document.querySelector("#channel-security-state");
    const securityNote = document.querySelector("#channel-security-note");
    if (securityTitle) {
      securityTitle.textContent = "Private room";
    }
    if (securityState) {
      securityState.textContent = privateSetupRequired ? "Setting up" : "Ready";
    }
    if (securityNote) {
      securityNote.textContent = privateSetupRequired
        ? "Messages will unlock when both sides are ready."
        : timelineMode === "strk20-shielded"
          ? "Ready Wallet confirms each private action."
          : "Messages are encrypted before they are submitted.";
    }
    iconRefresh();
  }

  function renderFeedItem(item) {
    if (isInviteMetadataEvent(item)) return "";
    if (isInviteAcceptedEvent(item)) return renderInlineEvent(compactInviteAcceptedEvent(item));
    if (item.type === "message") return renderMessage(item);
    if (item.type === "offer") return renderOfferCard(item);
    return renderInlineEvent(item);
  }

  function compactInviteAcceptedEvent(item = {}) {
    const identityFromSubtitle = String(item.subtitle || "").match(/[a-z0-9._-]+\.stark/i)?.[0];
    const identity = starkIdentityName(identityFromSubtitle || item.actor || item.sender || bobIdentity);
    const {
      details,
      inviteLink,
      channelActions,
      proofId,
      settlementHash,
      ...compactItem
    } = item;
    return {
      ...compactItem,
      title: `${identity} joined the deal`,
      subtitle: `Invite accepted by ${identity}.`,
    };
  }

  function renderMessage(item) {
    return messageMarkup(item, {
      itemStateClass,
      renderChainMeta,
    });
  }

  function renderOfferCard(item) {
    return offerCardMarkup(item, {
      itemStateClass,
      renderChainMeta,
    });
  }

  function renderInlineEvent(item) {
    return inlineEventMarkup(item, {
      itemStateClass,
      renderChainMeta,
    });
  }

  function workflowStageData() {
    const channel = currentChannel();
    if (!channel) return [];

    const directMemoFlow = !state.escrowReleased && state.screen === "payment";
    if (directMemoFlow) {
      return [
        { id: "direct-memo", label: "Direct encrypted memo", done: false, active: true },
        { id: "settlement", label: "Asset settlement unavailable", done: false, active: false },
      ];
    }

    if (state.screen === "deal" && !state.offerAccepted && !state.escrowReleased && !state.paymentSent) {
      return [
        { id: "negotiation", label: "Negotiation", done: false, active: true },
        { id: "escrow", label: "Escrow", done: false, active: false },
        { id: "settlement", label: "Settlement", done: false, active: false },
      ];
    }

    const status = String(channel.status || "").toLowerCase();
    const escrowSettlementComplete = state.escrowReleased && !state.paymentSent;
    const settlementReady = status.includes("settlement ready");
    const settlementStatusComplete = status.includes("deal completed") || (status.includes("settlement") && !status.includes("ready"));
    const channelInEscrow = status.includes("escrow") || status.includes("settlement") || status.includes("deal completed");
    const negotiationComplete = state.offerAccepted || settlementReady || escrowSettlementComplete || state.paymentSent || channelInEscrow;
    const escrowComplete = escrowSettlementComplete || settlementReady || state.paymentSent || settlementStatusComplete;
    const settlementComplete = escrowSettlementComplete || state.paymentSent || settlementStatusComplete;
    const activeStage = settlementComplete || settlementReady || state.screen === "payment" || state.screen === "settlement" || state.screen === "proof"
      ? "settlement"
      : negotiationComplete || state.screen === "escrow"
        ? "escrow"
        : "negotiation";

    return [
      { id: "negotiation", label: "Negotiation", done: negotiationComplete, active: activeStage === "negotiation" },
      { id: "escrow", label: "Escrow", done: escrowComplete, active: activeStage === "escrow" },
      { id: "settlement", label: "Settlement", done: settlementComplete, active: activeStage === "settlement" },
    ];
  }

  function renderWorkflowProgress() {
    const channel = currentChannel();
    const stages = channel ? workflowStageData() : [];
    document.querySelectorAll("[data-workflow-progress]").forEach((container) => {
      container.innerHTML = channel
        ? workflowProgressMarkup(channel.title || "Rights Transfer", stages)
        : "";
    });
  }

  return {
    compactInviteAcceptedEvent,
    isInviteAcceptedEvent,
    isInviteMetadataEvent,
    loadIndexedChannelTimeline,
    startChannelTimelineSync: messageTimelineSync.start,
    stopChannelTimelineSync: messageTimelineSync.stop,
    openChannel,
    renderChannel,
    renderConversationList,
    renderFeedItem,
    renderInlineEvent,
    renderMessage,
    renderOfferCard,
    renderWorkflowProgress,
    timelinePayloadToFeedItem,
    workflowStageData,
  };
}
