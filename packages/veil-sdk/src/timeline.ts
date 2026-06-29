import { VeilEventType, type TimelineItem, type VeilEventGroup, type VeilTimelinePayload } from "./types";

export function encodeInvokeCalldata(item: TimelineItem): readonly string[] {
  const payloadChunks = item.payloadChunks ?? [];
  return [
    item.channelId,
    String(item.eventType),
    item.encryptedPayload,
    item.payloadHash,
    ...(payloadChunks.length ? [String(payloadChunks.length), ...payloadChunks] : []),
  ];
}

export function getEventGroup(eventType: number): VeilEventGroup {
  return eventType === VeilEventType.CHAT ? "messages" : "events";
}

export function isMessageEvent(item: TimelineItem): boolean {
  return item.eventType === VeilEventType.CHAT;
}

export function isOfferEvent(item: TimelineItem): boolean {
  return item.eventType === VeilEventType.OFFER || item.eventType === VeilEventType.COUNTER_OFFER;
}

export function isEscrowEvent(item: TimelineItem): boolean {
  return item.eventType >= VeilEventType.ESCROW_CREATED && item.eventType <= VeilEventType.ESCROW_CANCELLED;
}

export function isPaymentMemoEvent(item: TimelineItem): boolean {
  return item.eventType === VeilEventType.PAYMENT_MEMO;
}

export function isProofEvent(item: TimelineItem): boolean {
  return item.eventType === VeilEventType.PROOF_ATTACHED;
}

export function eventTypeToPayloadKind(eventType: VeilEventType): VeilTimelinePayload["kind"] {
  switch (eventType) {
    case VeilEventType.CHAT:
      return "chat";
    case VeilEventType.PAYMENT_MEMO:
      return "payment_memo";
    case VeilEventType.OFFER:
      return "offer";
    case VeilEventType.COUNTER_OFFER:
      return "counter_offer";
    case VeilEventType.ACCEPT_OFFER:
      return "accept_offer";
    case VeilEventType.REJECT_OFFER:
      return "reject_offer";
    case VeilEventType.PROOF_ATTACHED:
      return "proof";
    default:
      return "escrow";
  }
}

export function createOptimisticTimelineItem(input: {
  channelId: string;
  eventType: VeilEventType;
  payload: VeilTimelinePayload;
  now?: () => number;
}): TimelineItem {
  const timestamp = input.now?.() ?? Date.now();
  return {
    eventId: `optimistic-${timestamp}`,
    channelId: input.channelId,
    eventType: input.eventType,
    encryptedPayload: "pending",
    payloadHash: "pending",
    timestamp,
    payload: input.payload,
    optimistic: true,
  };
}

export function sortTimeline(items: readonly TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => Number(a.eventId) - Number(b.eventId));
}

export function getEventLabel(item: TimelineItem): string {
  switch (item.eventType) {
    case VeilEventType.CHAT:
      return "Message";
    case VeilEventType.PAYMENT_MEMO:
      return "Memo attached";
    case VeilEventType.OFFER:
      return "Offer created";
    case VeilEventType.COUNTER_OFFER:
      return "Counter offer";
    case VeilEventType.ACCEPT_OFFER:
      return "Offer accepted";
    case VeilEventType.REJECT_OFFER:
      return "Offer rejected";
    case VeilEventType.ESCROW_CREATED:
      return "Escrow created";
    case VeilEventType.ESCROW_DEPOSITED:
      return "Escrow deposited";
    case VeilEventType.ESCROW_SETTLED:
      return "Escrow settled";
    case VeilEventType.ESCROW_CANCELLED:
      return "Escrow cancelled";
    case VeilEventType.PROOF_ATTACHED:
      return "Proof attached";
    default:
      return "Channel event";
  }
}
