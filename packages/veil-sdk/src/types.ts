import type { VeilSession, VeilSessionManagerLike } from "./session-key-types";

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

export interface EncryptionContext {
  channelId: string;
  eventType: number;
}

export interface EncryptionAdapter {
  encryptPayload(payload: VeilTimelinePayload, context?: EncryptionContext): Promise<EncryptedPayload>;
  decryptPayload(item: TimelineItem, context?: EncryptionContext): Promise<VeilTimelinePayload | null>;
}

export interface VeilClientConfig {
  privacyPoolAddress: string;
  helperAddress: string;
  rpcUrl: string;
  encryption?: EncryptionAdapter;
  transport?: VeilTransport;
  sessionManager?: VeilSessionManagerLike;
  requireSession?: boolean;
  now?: () => number;
}

export interface InvokeExternalInput {
  privacyPoolAddress: string;
  helperAddress: string;
  calldata: readonly string[];
  item: TimelineItem;
  session?: VeilSession;
}

export interface VeilTransport {
  createChannel?(input: CreateChannelInput): Promise<CreateChannelResult>;
  invokeExternal(input: InvokeExternalInput): Promise<TimelineItem>;
  getEventCount(channelId: string): Promise<number>;
  getEvent(channelId: string, index: number): Promise<TimelineItem>;
  getTimeline(channelId: string): Promise<TimelineItem[]>;
}

export type FeltLike = string | number | bigint;

export interface StarknetContractCall {
  contractAddress: string;
  entrypoint: string;
  calldata: string[];
}

export interface StarknetExecuteResult {
  transaction_hash?: string;
  transactionHash?: string;
}

export interface StarknetAccountLike {
  address?: string;
  execute(call: StarknetContractCall | StarknetContractCall[]): Promise<StarknetExecuteResult | string>;
}

export interface StarknetCallResult {
  result: readonly FeltLike[];
}

export interface StarknetProviderLike {
  callContract(call: StarknetContractCall): Promise<readonly FeltLike[] | StarknetCallResult>;
}

export interface DirectHelperTransportConfig {
  helperAddress: string;
  account?: StarknetAccountLike;
  provider?: StarknetProviderLike;
  sessionAccountResolver?: (session: VeilSession | undefined) => StarknetAccountLike | undefined;
  now?: () => number;
  channelIdEncoder?: (channelId: string) => string;
}

export type PrivacyPoolAdapterMode = "mock" | "research" | "real";

export interface PrivacyPoolAdapterActionResult {
  adapterMode: PrivacyPoolAdapterMode;
  action: "OpenChannel" | "OpenSubchannel" | "CreateEncNote" | "InvokeExternal";
  calldata: readonly string[];
  notes: readonly string[];
}

export interface PrivacyPoolOpenChannelInput {
  recipientAddress: string;
  index: number;
  random: string;
  salt: string;
}

export interface PrivacyPoolOpenSubchannelInput {
  recipientAddress: string;
  recipientPublicKey: string;
  channelKey: string;
  index: number;
  token: string;
  salt: string;
}

export interface PrivacyPoolCreateEncryptedNoteInput {
  recipientAddress: string;
  recipientPublicKey: string;
  token: string;
  amount: string;
  index: number;
  salt: string;
}

export interface PrivacyPoolInvokeExternalCalldataInput {
  contractAddress: string;
  calldata: readonly string[];
}

export interface PrivacyPoolAdapter {
  readonly mode: PrivacyPoolAdapterMode;
  openChannel(input: PrivacyPoolOpenChannelInput): Promise<PrivacyPoolAdapterActionResult>;
  openSubchannel(input: PrivacyPoolOpenSubchannelInput): Promise<PrivacyPoolAdapterActionResult>;
  createEncryptedNote(input: PrivacyPoolCreateEncryptedNoteInput): Promise<PrivacyPoolAdapterActionResult>;
  prepareInvokeExternal(input: PrivacyPoolInvokeExternalCalldataInput): Promise<PrivacyPoolAdapterActionResult>;
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
