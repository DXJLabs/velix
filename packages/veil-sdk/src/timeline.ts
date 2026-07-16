import { hash, shortString } from "starknet";
import { VeilEventType, type FeltLike, type TimelineItem, type VeilEventGroup, type VeilTimelinePayload } from "./types";
import type { DecodedPrivacyPoolEvent } from "./event_decoder";

export const TIMELINE_PAYLOAD_DOMAIN = shortString.encodeShortString("VEIL_TIMELINE_V1");

export interface TimelinePayloadHashInput {
  conversationTag: FeltLike;
  encryptedEventType: FeltLike;
  encryptedPayload: FeltLike;
  payloadChunks?: readonly FeltLike[];
}

function feltLikeToString(value: FeltLike, label: string): string {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative safe integer.`);
    }
    return String(value);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} cannot be empty.`);
  }

  return trimmed;
}

export function computeTimelinePayloadHash(input: TimelinePayloadHashInput): string {
  const payloadChunks = input.payloadChunks ?? [];
  return hash.computePoseidonHashOnElements([
    TIMELINE_PAYLOAD_DOMAIN,
    feltLikeToString(input.conversationTag, "conversation_tag"),
    feltLikeToString(input.encryptedEventType, "encrypted_event_type"),
    feltLikeToString(input.encryptedPayload, "encrypted_payload"),
    String(payloadChunks.length),
    ...payloadChunks.map((chunk) => feltLikeToString(chunk, "payload_chunk")),
  ]);
}

export function encodeInvokeCalldata(item: TimelineItem, options: { conversationTag?: FeltLike } = {}): readonly string[] {
  const payloadChunks = item.payloadChunks ?? [];
  return [
    feltLikeToString(options.conversationTag ?? item.channelId, "conversation_tag"),
    String(item.eventType),
    item.encryptedPayload,
    item.payloadHash,
    String(payloadChunks.length),
    ...payloadChunks,
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
    mode: "unshield",
    status: "encrypting",
    timestamp,
    payload: input.payload,
    optimistic: true,
  };
}

export function sortTimeline(items: readonly TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => Number(a.eventId) - Number(b.eventId));
}

export function mergeTimelineItems(...sources: readonly TimelineItem[][]): TimelineItem[] {
  const merged = new Map<string, TimelineItem>();
  for (const item of sources.flat()) {
    const key = item.transactionHash
      ? `${item.channelId}:${item.eventId}:${item.transactionHash}`
      : `${item.channelId}:${item.eventId}`;
    const previous = merged.get(key);
    const mergedItem: TimelineItem = { ...previous, ...item };
    if (!item.payloadChunks && previous?.payloadChunks) mergedItem.payloadChunks = previous.payloadChunks;
    if (!item.payload && previous?.payload) mergedItem.payload = previous.payload;
    merged.set(key, mergedItem);
  }
  return sortTimeline([...merged.values()]);
}

export function timelineItemsFromDecodedEvents(
  events: readonly DecodedPrivacyPoolEvent[],
  options: { channelId?: string; mode?: TimelineItem["mode"] } = {},
): TimelineItem[] {
  const items = new Map<string, TimelineItem>();
  const chunks = new Map<string, string[]>();

  for (const event of events) {
    if (event.category !== "timeline") continue;
    const channelId = fieldValue(event, "channel_id");
    if (!channelId || (options.channelId && channelId !== options.channelId)) continue;

    if (event.name === "TimelinePayloadChunkStored") {
      const eventId = fieldValue(event, "event_id");
      const chunkIndex = numberField(event, "chunk_index");
      const chunk = fieldValue(event, "chunk");
      if (eventId && chunkIndex !== undefined && chunk) {
        const bucket = chunks.get(eventId) ?? [];
        bucket[chunkIndex] = chunk;
        chunks.set(eventId, bucket);
      }
      continue;
    }

    if (event.name !== "TimelineEventStored") continue;
    const eventId = fieldValue(event, "event_id");
    const eventType = numberField(event, "event_type");
    const encryptedPayload = fieldValue(event, "encrypted_payload");
    const payloadHash = fieldValue(event, "payload_hash");
    const timestamp = timestampMs(numberField(event, "created_at"));
    if (!eventId || eventType === undefined || !encryptedPayload || !payloadHash || timestamp === undefined) {
      continue;
    }

    const item: TimelineItem = {
      eventId,
      channelId,
      eventType,
      encryptedPayload,
      payloadHash,
      timestamp,
      mode: options.mode ?? "shield",
      status: "confirmed",
      optimistic: false,
    };
    const payloadChunkCount = numberField(event, "payload_chunk_count");
    if (payloadChunkCount && payloadChunkCount > 0) item.payloadChunkCount = payloadChunkCount;
    if (event.raw.transaction_hash) item.transactionHash = event.raw.transaction_hash;
    if (event.raw.block_number !== undefined) item.blockNumber = event.raw.block_number;
    items.set(eventId, item);
  }

  for (const [eventId, payloadChunks] of chunks) {
    const item = items.get(eventId);
    if (!item) continue;
    item.payloadChunks = payloadChunks;
    item.payloadChunkCount = payloadChunks.length;
  }

  return sortTimeline([...items.values()]);
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

function fieldValue(event: DecodedPrivacyPoolEvent, name: string): string | undefined {
  return event.fields.find((field) => field.name === name)?.value;
}

function numberField(event: DecodedPrivacyPoolEvent, name: string): number | undefined {
  const value = fieldValue(event, name);
  if (value === undefined) return undefined;
  try {
    const parsed = Number(BigInt(value));
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function timestampMs(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return value > 1_000_000_000_000 ? value : value * 1000;
}
