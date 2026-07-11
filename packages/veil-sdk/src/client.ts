import { MockEncryptionAdapter } from "./encryption";
import { MockPrivacyPoolAdapter } from "./privacy_pool_adapter";
import { channelIdToFelt } from "./direct_helper_transport";
import {
  deriveSharedSecret,
  decryptMessage,
  encryptMessage,
  validateTimelineNonces,
  type DecryptMessageInput,
  type DeriveSharedSecretInput,
  type EncryptMessageInput,
} from "./ecdh";
import {
  estimatePoolFee,
  estimateTotalCost,
  estimateTransactionFee,
  getFeeInfo,
  getSupportedFeeModes,
  type EstimatePoolFeeInput,
  type EstimateTotalCostInput,
  type EstimateTransactionFeeInput,
  type PrivacyPoolFeeMode,
} from "./privacy_pool_fees";
import type { CreateVeilSessionInput, VeilSessionPermission } from "./session-key-types";
import { computeTimelinePayloadHash, encodeInvokeCalldata } from "./timeline";
import {
  VeilEventType,
  type EncryptedPayload,
  type AttachProofInput,
  type CreateChannelInput,
  type CreateChannelResult,
  type EncryptionAdapter,
  type EscrowStatusInput,
  type InvokeExternalInput,
  type OpenSubchannelInput,
  type OpenSubchannelResult,
  type OfferDecisionInput,
  type OfferInput,
  type SendMessageInput,
  type SendPaymentMemoInput,
  type TimelineItem,
  type TimelineQuery,
  type VeilClientConfig,
  type VeilMessageMode,
  type VeilTimelinePayload,
  type VeilTransport,
} from "./types";

const DEFAULT_CHANNEL_ID = "1";
type MessagePrivacyPoolInput = SendMessageInput["privacyPool"];
const PRIVACY_POOL_MESSAGE_ACTION_KEYS = [
  "setViewingKey",
  "openChannel",
  "openSubchannel",
  "deposit",
  "useNote",
  "createEncNote",
  "createOpenNote",
  "withdraw",
] as const;

function mergePrivacyPoolInputs(
  generated: MessagePrivacyPoolInput | undefined,
  supplied: MessagePrivacyPoolInput | undefined,
): MessagePrivacyPoolInput | undefined {
  if (!generated) return supplied;
  if (!supplied) return generated;

  const merged: Record<string, unknown> = { ...generated };
  for (const key of PRIVACY_POOL_MESSAGE_ACTION_KEYS) {
    const value = supplied[key];
    if (value === undefined) continue;
    if (merged[key] !== undefined) {
      throw new Error(`Privacy Pool action ${key} was supplied by both encryption bootstrap and caller input.`);
    }
    merged[key] = value;
  }

  return merged as NonNullable<MessagePrivacyPoolInput>;
}

export class VeilClient {
  readonly privacyPoolAddress: string;
  readonly helperAddress: string;
  readonly rpcUrl: string;
  readonly encryption: EncryptionAdapter;
  readonly transport: VeilTransport;
  readonly cacheKey: string;
  readonly #now: () => number;
  readonly #sessionManager: VeilClientConfig["sessionManager"];
  readonly #requireSession: boolean;
  readonly #allowMock: boolean;
  readonly #provider: VeilClientConfig["provider"];
  readonly #feeMode: PrivacyPoolFeeMode;
  readonly #feeTokenAddress: VeilClientConfig["feeTokenAddress"];
  readonly #privateFeeBalance: VeilClientConfig["privateFeeBalance"];
  readonly #feeEstimator: VeilClientConfig["feeEstimator"];
  readonly #gasEstimate: VeilClientConfig["gasEstimate"];

  constructor(config: VeilClientConfig) {
    this.privacyPoolAddress = config.privacyPoolAddress;
    this.helperAddress = config.helperAddress;
    this.rpcUrl = config.rpcUrl;
    this.#now = config.now ?? (() => Date.now());
    this.#allowMock = config.allowMock ?? false;
    this.#provider = config.provider;
    this.#feeMode = config.feeMode ?? "sponsored";
    this.#feeTokenAddress = config.feeTokenAddress;
    this.#privateFeeBalance = config.privateFeeBalance;
    this.#feeEstimator = config.feeEstimator;
    this.#gasEstimate = config.gasEstimate;
    if (!config.encryption && !this.#allowMock) {
      throw new Error("VeilClient requires a production encryption adapter. Set allowMock only for mock mode.");
    }
    if (!config.transport && !this.#allowMock) {
      throw new Error("VeilClient requires a production transport. Set allowMock only for mock mode.");
    }

    this.encryption = config.encryption ?? new MockEncryptionAdapter();
    this.transport = config.transport ?? new MockPrivacyPoolAdapter(this.#now);
    this.#sessionManager = config.sessionManager;
    this.#requireSession = config.requireSession ?? false;
    this.cacheKey = `${this.privacyPoolAddress}:${this.helperAddress}:${this.rpcUrl}`;
  }

  async createChannel(input: CreateChannelInput = {}): Promise<CreateChannelResult> {
    if (this.transport.createChannel) {
      return this.transport.createChannel(input);
    }

    return {
      channelId: input.channelId ?? DEFAULT_CHANNEL_ID,
      createdAt: this.#now(),
      ...(input.title ? { title: input.title } : {}),
    };
  }

  async openSubchannel(input: OpenSubchannelInput): Promise<OpenSubchannelResult> {
    const transport = this.transport as VeilTransport & {
      openSubchannel?: (input: OpenSubchannelInput) => Promise<OpenSubchannelResult>;
    };
    if (!transport.openSubchannel) {
      throw new Error("VeilClient openSubchannel requires a Privacy Pool transport.");
    }

    return transport.openSubchannel(input);
  }

  async sendMessage(input: SendMessageInput): Promise<TimelineItem> {
    if (input.mode === "unshield") {
      throw new Error("Chat messages are shielded-only. Unshielded chat transport is obsolete.");
    }
    return this.#storeEvent(VeilEventType.CHAT, input.channelId, {
      kind: "chat",
      message: input.message,
      sender: input.sender ?? "you",
    }, "shield", input.privacyPool);
  }

  async sendShieldedMessage(input: Omit<SendMessageInput, "mode">): Promise<TimelineItem> {
    return this.sendMessage({ ...input, mode: "shield" });
  }

  async sendUnshieldedMessage(input: Omit<SendMessageInput, "mode">): Promise<TimelineItem> {
    void input;
    throw new Error("sendUnshieldedMessage is disabled: VEIL chat/message is shielded-only.");
  }

  async sendPaymentMemo(input: SendPaymentMemoInput): Promise<TimelineItem> {
    return this.#storeEvent(VeilEventType.PAYMENT_MEMO, input.channelId, {
      kind: "payment_memo",
      memo: input.memo,
      ...(input.amount ? { amount: input.amount } : {}),
      ...(input.mode ? { mode: input.mode } : {}),
      sender: input.sender ?? "you",
    }, input.mode ?? "unshield", input.privacyPool);
  }

  async createOffer(input: OfferInput): Promise<TimelineItem> {
    return this.#storeEvent(VeilEventType.OFFER, input.channelId, {
      kind: "offer",
      amount: input.amount,
      ...(input.currency ? { currency: input.currency } : {}),
      ...(input.terms ? { terms: input.terms } : {}),
      sender: input.sender ?? "seller",
    }, input.mode ?? "unshield", input.privacyPool);
  }

  async counterOffer(input: OfferInput): Promise<TimelineItem> {
    return this.#storeEvent(VeilEventType.COUNTER_OFFER, input.channelId, {
      kind: "counter_offer",
      amount: input.amount,
      ...(input.currency ? { currency: input.currency } : {}),
      ...(input.terms ? { terms: input.terms } : {}),
      sender: input.sender ?? "seller",
    }, input.mode ?? "unshield", input.privacyPool);
  }

  async acceptOffer(input: OfferDecisionInput): Promise<TimelineItem> {
    return this.#storeEvent(VeilEventType.ACCEPT_OFFER, input.channelId, {
      kind: "accept_offer",
      ...(input.offerId ? { offerId: input.offerId } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      sender: input.sender ?? "buyer",
    }, input.mode ?? "unshield", input.privacyPool);
  }

  async rejectOffer(input: OfferDecisionInput): Promise<TimelineItem> {
    return this.#storeEvent(VeilEventType.REJECT_OFFER, input.channelId, {
      kind: "reject_offer",
      ...(input.offerId ? { offerId: input.offerId } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      sender: input.sender ?? "buyer",
    }, input.mode ?? "unshield", input.privacyPool);
  }

  async recordEscrowStatus(input: EscrowStatusInput): Promise<TimelineItem> {
    const eventType = {
      created: VeilEventType.ESCROW_CREATED,
      deposited: VeilEventType.ESCROW_DEPOSITED,
      settled: VeilEventType.ESCROW_SETTLED,
      cancelled: VeilEventType.ESCROW_CANCELLED,
    }[input.status];

    return this.#storeEvent(eventType, input.channelId, {
      kind: "escrow",
      status: input.status,
      ...(input.details ? { details: input.details } : {}),
      sender: input.sender ?? "system",
    }, "unshield", undefined);
  }

  async attachProof(input: AttachProofInput): Promise<TimelineItem> {
    return this.#storeEvent(VeilEventType.PROOF_ATTACHED, input.channelId, {
      kind: "proof",
      proofRef: input.proofRef,
      ...(input.label ? { label: input.label } : {}),
      sender: input.sender ?? "system",
    }, input.mode ?? "unshield", input.privacyPool);
  }

  async getTimeline(query: TimelineQuery): Promise<TimelineItem[]> {
    const items = await this.transport.getTimeline(query.channelId);
    validateTimelineNonces(items);
    if (!query.decrypt) {
      return items;
    }

    return this.decryptTimeline(items);
  }

  async getEvent(channelId: string, index: number, decrypt = true): Promise<TimelineItem> {
    const item = await this.transport.getEvent(channelId, index);
    return decrypt ? this.#withDecryptedPayload(item) : item;
  }

  async getEventCount(channelId: string): Promise<number> {
    return this.transport.getEventCount(channelId);
  }

  getSupportedFeeModes() {
    return getSupportedFeeModes();
  }

  async getFeeInfo() {
    if (!this.#provider) {
      throw new Error("VeilClient getFeeInfo requires a Starknet provider.");
    }

    return getFeeInfo({
      provider: this.#provider,
      privacyPoolAddress: this.privacyPoolAddress,
    });
  }

  async estimatePoolFee(input: Omit<EstimatePoolFeeInput, "provider" | "privacyPoolAddress"> = {}) {
    const feeInput: EstimatePoolFeeInput = {
      privacyPoolAddress: this.privacyPoolAddress,
      feeMode: input.feeMode ?? this.#feeMode,
    };
    if (this.#provider) feeInput.provider = this.#provider;
    const feeTokenAddress = input.feeTokenAddress ?? this.#feeTokenAddress;
    if (feeTokenAddress !== undefined) feeInput.feeTokenAddress = feeTokenAddress;
    const privateBalance = input.privateBalance ?? this.#privateFeeBalance;
    if (privateBalance !== undefined) feeInput.privateBalance = privateBalance;
    if (input.feeInfo) feeInput.feeInfo = input.feeInfo;
    if (input.quoteProvider) feeInput.quoteProvider = input.quoteProvider;
    return estimatePoolFee(feeInput);
  }

  async estimateTransactionFee(input: EstimateTransactionFeeInput = {}) {
    const feeInput: EstimateTransactionFeeInput = {
      ...input,
      feeMode: input.feeMode ?? this.#feeMode,
    };
    const feeEstimator = input.feeEstimator ?? this.#feeEstimator;
    if (feeEstimator) feeInput.feeEstimator = feeEstimator;
    const gasEstimate = input.gasEstimate ?? this.#gasEstimate;
    if (gasEstimate !== undefined) feeInput.gasEstimate = gasEstimate;
    return estimateTransactionFee(feeInput);
  }

  async estimateTotalCost(input: Omit<EstimateTotalCostInput, "provider" | "privacyPoolAddress"> = {}) {
    const feeInput: EstimateTotalCostInput = {
      privacyPoolAddress: this.privacyPoolAddress,
      ...input,
      feeMode: input.feeMode ?? this.#feeMode,
    };
    if (this.#provider) feeInput.provider = this.#provider;
    const feeTokenAddress = input.feeTokenAddress ?? this.#feeTokenAddress;
    if (feeTokenAddress !== undefined) feeInput.feeTokenAddress = feeTokenAddress;
    const privateBalance = input.privateBalance ?? this.#privateFeeBalance;
    if (privateBalance !== undefined) feeInput.privateBalance = privateBalance;
    const feeEstimator = input.feeEstimator ?? this.#feeEstimator;
    if (feeEstimator) feeInput.feeEstimator = feeEstimator;
    const gasEstimate = input.gasEstimate ?? this.#gasEstimate;
    if (gasEstimate !== undefined) feeInput.gasEstimate = gasEstimate;
    return estimateTotalCost(feeInput);
  }

  async decryptTimeline(items: readonly TimelineItem[]): Promise<TimelineItem[]> {
    validateTimelineNonces(items);
    return Promise.all(items.map((item) => this.#withDecryptedPayload(item)));
  }

  deriveSharedSecret(input: DeriveSharedSecretInput): Promise<CryptoKey> {
    return deriveSharedSecret(input);
  }

  encryptMessage(input: EncryptMessageInput): Promise<EncryptedPayload> {
    return encryptMessage(input);
  }

  decryptMessage(input: DecryptMessageInput): Promise<VeilTimelinePayload | null> {
    return decryptMessage(input);
  }

  async createSession(input: CreateVeilSessionInput) {
    if (!this.#sessionManager?.createSession) {
      throw new Error("VeilClient createSession requires VeilSessionKeyManager.");
    }

    return this.#sessionManager.createSession(input);
  }

  async destroySession(sessionId?: string): Promise<void> {
    if (!this.#sessionManager?.revokeSession) {
      throw new Error("VeilClient destroySession requires VeilSessionKeyManager.");
    }

    await this.#sessionManager.revokeSession(sessionId);
  }

  async restoreSession() {
    return this.#sessionManager?.getActiveSession() ?? null;
  }

  watchChannel(channelId: string, callback: (items: TimelineItem[]) => void, options: { intervalMs?: number } = {}) {
    return this.watchMessages(channelId, callback, options);
  }

  watchMessages(channelId: string, callback: (items: TimelineItem[]) => void, options: { intervalMs?: number } = {}) {
    const intervalMs = options.intervalMs ?? 2_500;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) {
        return;
      }

      const items = await this.getTimeline({ channelId, decrypt: true });
      callback(items);
      timer = setTimeout(tick, intervalMs);
    };
    void tick();

    return () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }

  async seedDemoChannel(channelId = "rights-transfer"): Promise<CreateChannelResult> {
    const channel = await this.createChannel({ channelId, title: "Rights Transfer" });
    if ((await this.getEventCount(channel.channelId)) > 0) {
      return channel;
    }

    await this.sendMessage({
      channelId: channel.channelId,
      sender: "seller",
      message: "Digital rights package is listed at 500 STRK. Metadata and transfer conditions are ready.",
    });
    await this.createOffer({
      channelId: channel.channelId,
      amount: "500",
      currency: "STRK",
      terms: "Transfer conditions attached.",
      sender: "seller",
    });
    await this.sendMessage({
      channelId: channel.channelId,
      sender: "buyer",
      message: "I can open at 400 STRK if the proof includes the metadata memo.",
    });
    await this.counterOffer({
      channelId: channel.channelId,
      amount: "450",
      currency: "STRK",
      terms: "Private settlement terms added.",
      sender: "you",
    });
    await this.sendMessage({
      channelId: channel.channelId,
      sender: "you",
      message: "Countering at 450 STRK with private settlement and proof attached.",
    });
    await this.recordEscrowStatus({
      channelId: channel.channelId,
      status: "created",
      details: "Buyer deposit completed. Seller deposit pending before release.",
    });
    await this.sendPaymentMemo({
      channelId: channel.channelId,
      memo: "Shielded settlement instructions saved.",
      amount: "450 STRK",
      mode: "shield",
    });
    await this.attachProof({
      channelId: channel.channelId,
      proofRef: "proof://rights-transfer/offer-action",
      label: "Offer action proof",
    });

    return channel;
  }

  async #storeEvent(
    eventType: VeilEventType,
    channelId: string,
    payload: VeilTimelinePayload,
    mode: VeilMessageMode,
    privacyPool: SendMessageInput["privacyPool"] | undefined,
  ): Promise<TimelineItem> {
    const session = await this.#requirePermission(this.#permissionForEvent(eventType), channelId);
    const encrypted = await this.encryption.encryptPayload(payload, { channelId, eventType });
    const privacyPoolInput = mergePrivacyPoolInputs(encrypted.privacyPool, privacyPool);
    const payloadChunks = encrypted.payloadChunks ?? [];
    const conversationTag = this.#conversationTag(channelId);
    const timelinePayloadHash = computeTimelinePayloadHash({
      conversationTag,
      encryptedEventType: eventType,
      encryptedPayload: encrypted.encryptedPayload,
      payloadChunks,
    });
    const envelopeHash = encrypted.envelopeHash ?? encrypted.payloadHash;
    const item: TimelineItem = {
      eventId: "0",
      channelId,
      eventType,
      encryptedPayload: encrypted.encryptedPayload,
      payloadHash: timelinePayloadHash,
      envelopeHash,
      ...(encrypted.nonce ? { nonce: encrypted.nonce } : {}),
      mode,
      status: "signing",
      payloadChunkCount: payloadChunks.length,
      ...(payloadChunks.length
        ? { payloadChunks }
        : {}),
      timestamp: this.#now(),
    };
    const calldata = encodeInvokeCalldata(item, { conversationTag });
    const invokeInput: InvokeExternalInput = {
      privacyPoolAddress: this.privacyPoolAddress,
      helperAddress: this.helperAddress,
      calldata,
      item,
      mode,
    };
    if (privacyPoolInput) {
      invokeInput.privacyPool = privacyPoolInput;
    }
    if (session) {
      invokeInput.session = session;
    }

    return this.transport.invokeExternal(invokeInput);
  }

  #conversationTag(channelId: string): string {
    return this.transport.encodeConversationTag?.(channelId) ?? channelIdToFelt(channelId);
  }

  async #withDecryptedPayload(item: TimelineItem): Promise<TimelineItem> {
    const payload =
      item.payload ??
      (await this.encryption.decryptPayload(item, {
        channelId: item.channelId,
        eventType: item.eventType,
      }));
    return payload ? { ...item, payload } : item;
  }

  #permissionForEvent(eventType: VeilEventType): VeilSessionPermission | undefined {
    switch (eventType) {
      case VeilEventType.CHAT:
        return "MESSAGE_SEND";
      case VeilEventType.PAYMENT_MEMO:
        return "MEMO_SEND";
      case VeilEventType.OFFER:
      case VeilEventType.COUNTER_OFFER:
        return "OFFER_CREATE";
      case VeilEventType.ACCEPT_OFFER:
      case VeilEventType.REJECT_OFFER:
        return "NEGOTIATION_METADATA";
      case VeilEventType.ESCROW_DEPOSITED:
      case VeilEventType.ESCROW_SETTLED:
      case VeilEventType.ESCROW_CANCELLED:
      case VeilEventType.ESCROW_CREATED:
        return undefined;
      case VeilEventType.PROOF_ATTACHED:
      default:
        return "NEGOTIATION_METADATA";
    }
  }

  async #requirePermission(permission: VeilSessionPermission | undefined, channelId: string) {
    if (!permission) {
      if (this.#requireSession) {
        throw new Error("This action requires wallet approval and cannot be authorized by a VEIL session key.");
      }
      return undefined;
    }

    if (this.#sessionManager) {
      return this.#sessionManager.requirePermission(permission, {
        channelId,
        action: permission,
      });
    }

    if (this.#requireSession) {
      throw new Error("VEIL session manager is required for this client.");
    }

    return undefined;
  }
}
