import type { VeilSession, VeilSessionManagerLike } from "./session-key-types";
import type {
  BuildPrivacyPoolChannelActionsInput,
  BuildPrivacyPoolMessageActionsInput,
  PrivacyPoolClientAction,
  PrivacyPoolClientActionBatchAnalysis,
} from "./privacy_pool_actions";
import type {
  PrivacyPoolFeeMode,
  PrivacyPoolTotalCostEstimate,
  StarknetFeeEstimatorLike,
} from "./privacy_pool_fees";

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
export type VeilMessageMode = "shield" | "unshield";
export type VeilMessageStatus = "encrypting" | "signing" | "pending" | "confirmed" | "failed";

export interface VeilChannelParticipant {
  participantId: string;
  walletAddress?: string;
  privacyPoolPublicKey?: string;
  /** @deprecated Browser ECDH keys are not Privacy Pool-compatible. */
  ecdhPublicKey?: JsonWebKey;
}

export interface TimelineItem {
  eventId: string;
  channelId: string;
  eventType: number;
  encryptedPayload: string;
  payloadHash: string;
  nonce?: string;
  mode?: VeilMessageMode;
  status?: VeilMessageStatus;
  payloadChunkCount?: number;
  payloadChunks?: string[];
  timestamp: number;
  payload?: VeilTimelinePayload;
  transactionHash?: string;
  blockNumber?: number;
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
  nonce?: string;
  payloadChunks?: string[];
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
  allowMock?: boolean;
  provider?: StarknetProviderLike;
  feeMode?: PrivacyPoolFeeMode;
  feeTokenAddress?: FeltLike;
  privateFeeBalance?: FeltLike;
  feeEstimator?: StarknetFeeEstimatorLike;
  gasEstimate?: FeltLike;
  now?: () => number;
}

export interface InvokeExternalInput {
  privacyPoolAddress: string;
  helperAddress: string;
  calldata: readonly string[];
  item: TimelineItem;
  mode: VeilMessageMode;
  privacyPool?: BuildPrivacyPoolMessageActionsInput;
  session?: VeilSession;
}

export interface VeilTransport {
  supportedModes?: readonly VeilMessageMode[];
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
  getTransactionReceipt?(transactionHash: string): Promise<StarknetTransactionReceiptLike>;
  waitForTransaction?(transactionHash: string, options?: Record<string, unknown>): Promise<StarknetTransactionReceiptLike>;
}

export interface StarknetTransactionReceiptLike {
  block_number?: number;
  blockNumber?: number;
  status?: string;
  finality_status?: string;
  execution_status?: string;
}

export interface DirectHelperTransportConfig {
  helperAddress: string;
  entrypoint?: string;
  account?: StarknetAccountLike;
  provider?: StarknetProviderLike;
  storePayloadChunks?: boolean;
  sessionAccountResolver?: (session: VeilSession | undefined) => StarknetAccountLike | undefined;
  now?: () => number;
  channelIdEncoder?: (channelId: string) => string;
  onTransactionSubmitted?: (transactionHash: string, item: TimelineItem) => void;
  waitForConfirmation?: boolean;
  confirmationTimeoutMs?: number;
  confirmationPollMs?: number;
}

export interface AvnuPaymasterLike {
  executeTransaction(transaction: unknown): Promise<StarknetExecuteResult | string>;
}

export interface StarknetPrivacyMessageActionInput {
  privacyPoolAddress: string;
  helperAddress: string;
  helperCall: StarknetContractCall;
  helperCalldata: readonly string[];
  clientActions: readonly PrivacyPoolClientAction[];
  encodedClientActions: readonly string[];
  actionBatch: PrivacyPoolClientActionBatchAnalysis;
  feeMode: PrivacyPoolFeeMode;
  feeTokenAddress: string;
  feeEstimate: PrivacyPoolTotalCostEstimate;
  item: TimelineItem;
  session?: VeilSession;
}

export interface StarknetPrivacyChannelActionInput {
  privacyPoolAddress: string;
  channelId: string;
  title?: string;
  participants?: readonly VeilChannelParticipant[];
  clientActions: readonly PrivacyPoolClientAction[];
  encodedClientActions: readonly string[];
  actionBatch: PrivacyPoolClientActionBatchAnalysis;
  feeMode: PrivacyPoolFeeMode;
  feeTokenAddress: string;
  feeEstimate: PrivacyPoolTotalCostEstimate;
}

export interface StarknetPrivacyMessageAction {
  transaction?: unknown;
  execute?: () => Promise<StarknetExecuteResult | string>;
}

export type StarknetPrivacySdkActionKind = "message" | "channel" | "subchannel";

export interface StarknetPrivacySdkExecutionInput {
  kind: StarknetPrivacySdkActionKind;
  privacyPoolAddress: string;
  helperAddress?: string;
  helperCall?: StarknetContractCall;
  helperCalldata?: readonly string[];
  channelId?: string;
  title?: string;
  participants?: readonly VeilChannelParticipant[];
  clientActions: readonly PrivacyPoolClientAction[];
  encodedClientActions: readonly string[];
  actionBatch: PrivacyPoolClientActionBatchAnalysis;
  feeMode: PrivacyPoolFeeMode;
  feeTokenAddress: string;
  feeEstimate: PrivacyPoolTotalCostEstimate;
  item?: TimelineItem;
  session?: VeilSession;
}

export interface StarknetPrivacyCompiledActions {
  serverActions?: unknown;
  serverActionsCalldata?: readonly FeltLike[];
  raw?: unknown;
}

export interface StarknetPrivacyProofResult {
  proof?: unknown;
  proofFacts?: readonly FeltLike[];
  raw?: unknown;
}

export interface StarknetPrivacyApplyActionsTransactionInput extends StarknetPrivacySdkExecutionInput {
  compiledActions: StarknetPrivacyCompiledActions;
  proof: StarknetPrivacyProofResult;
  applyActionsCall?: StarknetContractCall;
}

export interface StarknetPrivacySdkLike {
  compileActions(input: StarknetPrivacySdkExecutionInput): Promise<StarknetPrivacyCompiledActions>;
  generateProof?(input: StarknetPrivacySdkExecutionInput & {
    compiledActions: StarknetPrivacyCompiledActions;
  }): Promise<StarknetPrivacyProofResult>;
  prove?(input: StarknetPrivacySdkExecutionInput & {
    compiledActions: StarknetPrivacyCompiledActions;
  }): Promise<StarknetPrivacyProofResult>;
  buildApplyActionsTransaction?(
    input: StarknetPrivacyApplyActionsTransactionInput,
  ): Promise<StarknetPrivacyMessageAction | unknown>;
  invokeAndApplyAction?(
    input: StarknetPrivacyApplyActionsTransactionInput,
  ): Promise<StarknetExecuteResult | string>;
  applyAction?(
    input: StarknetPrivacyApplyActionsTransactionInput,
  ): Promise<StarknetExecuteResult | string>;
}

export interface StarknetPrivacyActionBuilderLike {
  buildVeilMessageAction(input: StarknetPrivacyMessageActionInput): Promise<StarknetPrivacyMessageAction>;
  buildVeilChannelAction?(input: StarknetPrivacyChannelActionInput): Promise<StarknetPrivacyMessageAction>;
}

export interface StarknetPrivacyPoolTransportConfig {
  privacyPoolAddress: string;
  helperAddress: string;
  privacySdk?: StarknetPrivacySdkLike;
  actionBuilder?: StarknetPrivacyActionBuilderLike;
  paymaster?: AvnuPaymasterLike;
  provider?: StarknetProviderLike;
  readTransport: VeilTransport;
  feeMode?: PrivacyPoolFeeMode;
  feeTokenAddress?: FeltLike;
  privateFeeBalance?: FeltLike;
  feeEstimator?: StarknetFeeEstimatorLike;
  gasEstimate?: FeltLike;
  now?: () => number;
  channelIdEncoder?: (channelId: string) => string;
  waitForConfirmation?: boolean;
  confirmationTimeoutMs?: number;
  confirmationPollMs?: number;
}

/** @deprecated Use AvnuPaymasterLike. */
export type AvnuPrivacyPaymasterLike = AvnuPaymasterLike;

/** @deprecated Use StarknetPrivacyMessageActionInput. */
export type AvnuPrivacyMessageActionInput = StarknetPrivacyMessageActionInput;

/** @deprecated Use StarknetPrivacyMessageAction. */
export type AvnuPrivacyMessageAction = StarknetPrivacyMessageAction;

/** @deprecated Use StarknetPrivacyChannelActionInput. */
export type AvnuPrivacyChannelActionInput = StarknetPrivacyChannelActionInput;

/** @deprecated Use StarknetPrivacyActionBuilderLike. */
export type AvnuPrivacyActionBuilderLike = StarknetPrivacyActionBuilderLike;

/** @deprecated Use StarknetPrivacyPoolTransportConfig. */
export type AvnuPrivacyPoolTransportConfig = StarknetPrivacyPoolTransportConfig;

export type PrivacyPoolAdapterMode = "mock" | "research" | "real";

export interface PrivacyPoolAdapterActionResult {
  adapterMode: PrivacyPoolAdapterMode;
  action: "SetViewingKey" | "OpenChannel" | "OpenSubchannel" | "CreateEncNote" | "InvokeExternal";
  calldata: readonly string[];
  notes: readonly string[];
  clientActions?: readonly PrivacyPoolClientAction[];
  encodedClientActions?: readonly string[];
  hasReplayProtection?: boolean;
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
  participants?: readonly VeilChannelParticipant[];
  privacyPool?: BuildPrivacyPoolChannelActionsInput;
}

export interface CreateChannelResult {
  channelId: string;
  title?: string;
  createdAt: number;
  participants?: readonly VeilChannelParticipant[];
  transactionHash?: string;
  status?: VeilMessageStatus;
  optimistic?: boolean;
  privacyPoolClientActions?: readonly PrivacyPoolClientAction[];
  encodedPrivacyPoolClientActions?: readonly string[];
}

export interface OpenSubchannelInput extends PrivacyPoolOpenSubchannelInput {
  channelId?: string;
}

export interface OpenSubchannelResult {
  channelId: string;
  openedAt: number;
  transactionHash?: string;
  status?: VeilMessageStatus;
  optimistic?: boolean;
  privacyPoolClientActions?: readonly PrivacyPoolClientAction[];
  encodedPrivacyPoolClientActions?: readonly string[];
}

export interface SendMessageInput {
  channelId: string;
  message: string;
  sender?: VeilActor | string;
  mode?: VeilMessageMode;
  privacyPool?: BuildPrivacyPoolMessageActionsInput;
}

export interface SendPaymentMemoInput {
  channelId: string;
  memo: string;
  amount?: string;
  mode?: VeilMessageMode;
  sender?: VeilActor | string;
  privacyPool?: BuildPrivacyPoolMessageActionsInput;
}

export interface OfferInput {
  channelId: string;
  amount: string;
  currency?: string;
  terms?: string;
  sender?: VeilActor | string;
  mode?: VeilMessageMode;
  privacyPool?: BuildPrivacyPoolMessageActionsInput;
}

export interface OfferDecisionInput {
  channelId: string;
  offerId?: string;
  reason?: string;
  sender?: VeilActor | string;
  mode?: VeilMessageMode;
  privacyPool?: BuildPrivacyPoolMessageActionsInput;
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
  mode?: VeilMessageMode;
  privacyPool?: BuildPrivacyPoolMessageActionsInput;
}

export interface TimelineQuery {
  channelId: string;
  decrypt?: boolean;
}

export interface UseVeilMutationOptions {
  revalidate?: boolean;
}
