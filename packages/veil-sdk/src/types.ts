export enum VeilEventType {
  CHAT = 1,
  PAYMENT_MEMO = 2,
  OFFER = 3,
  COUNTER_OFFER = 4,
  ACCEPT_OFFER = 5,
  REJECT_OFFER = 6,
  ESCROW_CREATED = 7,
  ESCROW_DEPOSITED = 8,
  ESCROW_SETTLED = 9,
  ESCROW_CANCELLED = 10,
  PROOF_ATTACHED = 11,
}

export type VeilEventGroup = "messages" | "events";
export type VeilActor = "buyer" | "seller" | "you" | "assistant" | "system";

export interface TimelineItem {
  eventId: string;
  channelId: string;
  eventType: number;
  encryptedPayload: string;
  payloadHash: string;
  timestamp: number;
  payload?: VeilTimelinePayload;
  transactionHash?: string;
  optimistic?: boolean;
}

export type VeilTimelinePayload =
  | ChatPayload
  | PaymentMemoPayload
  | OfferPayload
  | OfferDecisionPayload
  | EscrowStatusPayload
  | ProofPayload;

export interface BasePayload {
  sender?: VeilActor | string;
  createdBy?: string;
}

export interface ChatPayload extends BasePayload {
  kind: "chat";
  message: string;
}

export interface PaymentMemoPayload extends BasePayload {
  kind: "payment_memo";
  memo: string;
  amount?: string;
  mode?: "Shield" | "Unshield" | string;
}

export interface OfferPayload extends BasePayload {
  kind: "offer" | "counter_offer";
  amount: string;
  currency?: string;
  terms?: string;
}

export interface OfferDecisionPayload extends BasePayload {
  kind: "accept_offer" | "reject_offer";
  offerId?: string;
  reason?: string;
}

export interface EscrowStatusPayload extends BasePayload {
  kind: "escrow";
  status: "created" | "deposited" | "settled" | "cancelled";
  details?: string;
}

export interface ProofPayload extends BasePayload {
  kind: "proof";
  proofRef: string;
  label?: string;
}

export interface EncryptedPayload {
  encryptedPayload: string;
  payloadHash: string;
}

export interface EncryptionAdapter {
  encryptPayload(payload: VeilTimelinePayload): Promise<EncryptedPayload>;
  decryptPayload(item: TimelineItem): Promise<VeilTimelinePayload | null>;
}

export interface VeilClientConfig {
  privacyPoolAddress: string;
  helperAddress: string;
  rpcUrl: string;
  encryption?: EncryptionAdapter;
  transport?: VeilTransport;
  now?: () => number;
}

export interface InvokeExternalInput {
  privacyPoolAddress: string;
  helperAddress: string;
  calldata: readonly string[];
  item: TimelineItem;
}

export interface VeilTransport {
  createChannel?(input: CreateChannelInput): Promise<CreateChannelResult>;
  invokeExternal(input: InvokeExternalInput): Promise<TimelineItem>;
  getEventCount(channelId: string): Promise<number>;
  getEvent(channelId: string, index: number): Promise<TimelineItem>;
  getTimeline(channelId: string): Promise<TimelineItem[]>;
}

export interface CreateChannelInput {
  channelId?: string;
  title?: string;
}

export interface CreateChannelResult {
  channelId: string;
  title?: string;
  createdAt: number;
}

export interface SendMessageInput {
  channelId: string;
  message: string;
  sender?: VeilActor | string;
}

export interface SendPaymentMemoInput {
  channelId: string;
  memo: string;
  amount?: string;
  mode?: "Shield" | "Unshield" | string;
  sender?: VeilActor | string;
}

export interface OfferInput {
  channelId: string;
  amount: string;
  currency?: string;
  terms?: string;
  sender?: VeilActor | string;
}

export interface OfferDecisionInput {
  channelId: string;
  offerId?: string;
  reason?: string;
  sender?: VeilActor | string;
}

export interface EscrowStatusInput {
  channelId: string;
  status: EscrowStatusPayload["status"];
  details?: string;
  sender?: VeilActor | string;
}

export interface AttachProofInput {
  channelId: string;
  proofRef: string;
  label?: string;
  sender?: VeilActor | string;
}

export interface TimelineQuery {
  channelId: string;
  decrypt?: boolean;
}

export interface UseVeilMutationOptions {
  revalidate?: boolean;
}
