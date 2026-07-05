import { conversationRowsMarkup } from "../../ui/conversation-ui.js";
import { renderChannelHeader, channelFeedMarkup } from "../../ui/deals/channel-ui.js";
import { inlineEventMarkup, messageMarkup, offerCardMarkup } from "../../ui/timeline-ui.js";
import { workflowProgressMarkup } from "../../ui/workflow-ui.js";

function isInviteMetadataEvent(item = {}) {
  const title = String(item.title || "").trim().toLowerCase();
  const subtitle = String(item.subtitle || "").trim().toLowerCase();
  const detailLabels = Array.isArray(item.details)
    ? item.details.map(([label]) => String(label || "").trim().toLowerCase())
    : [];
  return title === "invite status"
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
  function openChannel(channelId) {
    state.channelId = channelId;
    const channel = currentChannel();
    channel.unread = 0;
    showScreen("channel");
    loadIndexedChannelTimeline(channelId);
  }

  async function loadIndexedChannelTimeline(channelId) {
    if (timelineMode !== "direct-helper" || !helperAddress) return;

    try {
      const response = await fetch(`/api/indexer/messages?channelId=${encodeURIComponent(channelId)}`);
      if (!response.ok) return;
      const payload = await response.json();
      const indexedItems = Array.isArray(payload.messages) ? payload.messages : [];
      if (!indexedItems.length) return;

      const feedItems = [];
      for (const indexedItem of indexedItems) {
        const timelineItem = {
          ...indexedItem,
          channelId,
          eventType: Number(indexedItem.eventType),
          timestamp: Number(indexedItem.timestamp || Date.now()),
        };
        const decrypted = await getVeilClient().encryption.decryptPayload(timelineItem).catch(() => null);
        const feedItem = decrypted ? timelinePayloadToFeedItem(timelineItem, decrypted) : null;
        if (feedItem) feedItems.push(feedItem);
      }

      if (!feedItems.length) return;
      messages[channelId] = feedItems;
      const channel = channels.find((item) => item.id === channelId);
      const lastItem = feedItems[feedItems.length - 1];
      if (channel && lastItem) {
        channel.last = lastItem.type === "message" ? `${lastItem.sender}: ${lastItem.body}` : lastItem.title;
        channel.time = "now";
      }
      if (state.channelId === channelId && state.screen === "channel") {
        renderChannel();
      }
    } catch (error) {
      veilError("indexer.timeline.load.failed", error, {
        where: "loadIndexedChannelTimeline",
        howToFix: "Check /api/indexer/messages, VEIL_INDEXER_FROM_BLOCK, and the helper deployment address for this channel.",
      });
    }
  }

  function timelinePayloadToFeedItem(item, payload) {
    const sender = payload.sender === "you" ? "You" : payload.sender || "Peer";
    const base = {
      time: item.timestamp,
      txHash: item.transactionHash,
      blockNumber: item.blockNumber,
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
    renderChannelHeader(document, {
      channel,
      dealId: currentDealId(channel),
      statusPillClass,
    });
    messageFeed.innerHTML = channelFeedMarkup({
      waitingMarkup: waitingForCounterparty ? renderInviteWaitingCard(channel) : "",
      feedMarkup: channelMessages().map(renderFeedItem).join(""),
    });
    if (composerForm) composerForm.hidden = waitingForCounterparty;
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
    const directPaymentFlow = !state.escrowReleased && (state.screen === "payment" || state.paymentSent);
    if (directPaymentFlow) {
      return [
        { id: "direct-payment", label: "Direct Pay", done: state.paymentSent, active: !state.paymentSent },
        { id: "settlement", label: "Settlement", done: state.paymentSent, active: state.paymentSent },
      ];
    }

    if (state.screen === "deal" && !state.offerAccepted && !state.escrowReleased && !state.paymentSent) {
      return [
        { id: "negotiation", label: "Negotiation", done: false, active: true },
        { id: "escrow", label: "Escrow", done: false, active: false },
        { id: "settlement", label: "Settlement", done: false, active: false },
      ];
    }

    const status = String(currentChannel().status || "").toLowerCase();
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
    const stages = workflowStageData();
    document.querySelectorAll("[data-workflow-progress]").forEach((container) => {
      container.innerHTML = workflowProgressMarkup(currentChannel().title || "Rights Transfer", stages);
    });
  }

  return {
    compactInviteAcceptedEvent,
    isInviteAcceptedEvent,
    isInviteMetadataEvent,
    loadIndexedChannelTimeline,
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
