import { MockEncryptionAdapter } from "./encryption";
import { MockPrivacyPoolAdapter } from "./privacy_pool_adapter";
import { encodeInvokeCalldata } from "./timeline";
import {
  VeilEventType,
  type AttachProofInput,
  type CreateChannelInput,
  type CreateChannelResult,
  type EncryptionAdapter,
  type EscrowStatusInput,
  type InvokeExternalInput,
  type OfferDecisionInput,
  type OfferInput,
  type SendMessageInput,
  type SendPaymentMemoInput,
  type TimelineItem,
  type TimelineQuery,
  type VeilClientConfig,
  type VeilTimelinePayload,
  type VeilTransport,
} from "./types";

const DEFAULT_CHANNEL_ID = "1";

export class VeilClient {
  readonly privacyPoolAddress: string;
  readonly helperAddress: string;
  readonly rpcUrl: string;
  readonly encryption: EncryptionAdapter;
  readonly transport: VeilTransport;
  readonly cacheKey: string;
  readonly #now: () => number;

  constructor(config: VeilClientConfig) {
    this.privacyPoolAddress = config.privacyPoolAddress;
    this.helperAddress = config.helperAddress;
    this.rpcUrl = config.rpcUrl;
    this.#now = config.now ?? (() => Date.now());
    this.encryption = config.encryption ?? new MockEncryptionAdapter();
    this.transport = config.transport ?? new MockPrivacyPoolAdapter(this.#now);
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

  async sendMessage(input: SendMessageInput): Promise<TimelineItem> {
    return this.#storeEvent(VeilEventType.CHAT, input.channelId, {
      kind: "chat",
      message: input.message,
      sender: input.sender ?? "you",
    });
  }

  async sendPaymentMemo(input: SendPaymentMemoInput): Promise<TimelineItem> {
    return this.#storeEvent(VeilEventType.PAYMENT_MEMO, input.channelId, {
      kind: "payment_memo",
      memo: input.memo,
      ...(input.amount ? { amount: input.amount } : {}),
      ...(input.mode ? { mode: input.mode } : {}),
      sender: input.sender ?? "you",
    });
  }

  async createOffer(input: OfferInput): Promise<TimelineItem> {
    return this.#storeEvent(VeilEventType.OFFER, input.channelId, {
      kind: "offer",
      amount: input.amount,
      ...(input.currency ? { currency: input.currency } : {}),
      ...(input.terms ? { terms: input.terms } : {}),
      sender: input.sender ?? "seller",
    });
  }

  async counterOffer(input: OfferInput): Promise<TimelineItem> {
    return this.#storeEvent(VeilEventType.COUNTER_OFFER, input.channelId, {
      kind: "counter_offer",
      amount: input.amount,
      ...(input.currency ? { currency: input.currency } : {}),
      ...(input.terms ? { terms: input.terms } : {}),
      sender: input.sender ?? "you",
    });
  }

  async acceptOffer(input: OfferDecisionInput): Promise<TimelineItem> {
    return this.#storeEvent(VeilEventType.ACCEPT_OFFER, input.channelId, {
      kind: "accept_offer",
      ...(input.offerId ? { offerId: input.offerId } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      sender: input.sender ?? "buyer",
    });
  }

  async rejectOffer(input: OfferDecisionInput): Promise<TimelineItem> {
    return this.#storeEvent(VeilEventType.REJECT_OFFER, input.channelId, {
      kind: "reject_offer",
      ...(input.offerId ? { offerId: input.offerId } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      sender: input.sender ?? "buyer",
    });
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
    });
  }

  async attachProof(input: AttachProofInput): Promise<TimelineItem> {
    return this.#storeEvent(VeilEventType.PROOF_ATTACHED, input.channelId, {
      kind: "proof",
      proofRef: input.proofRef,
      ...(input.label ? { label: input.label } : {}),
      sender: input.sender ?? "system",
    });
  }

  async getTimeline(query: TimelineQuery): Promise<TimelineItem[]> {
    const items = await this.transport.getTimeline(query.channelId);
    if (!query.decrypt) {
      return items;
    }

    return Promise.all(items.map((item) => this.#withDecryptedPayload(item)));
  }

  async getEvent(channelId: string, index: number, decrypt = true): Promise<TimelineItem> {
    const item = await this.transport.getEvent(channelId, index);
    return decrypt ? this.#withDecryptedPayload(item) : item;
  }

  async getEventCount(channelId: string): Promise<number> {
    return this.transport.getEventCount(channelId);
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
      mode: "Shield",
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
  ): Promise<TimelineItem> {
    const encrypted = await this.encryption.encryptPayload(payload);
    const item: TimelineItem = {
      eventId: "0",
      channelId,
      eventType,
      encryptedPayload: encrypted.encryptedPayload,
      payloadHash: encrypted.payloadHash,
      timestamp: this.#now(),
      payload,
    };
    const calldata = encodeInvokeCalldata(item);

    return this.transport.invokeExternal({
      privacyPoolAddress: this.privacyPoolAddress,
      helperAddress: this.helperAddress,
      calldata,
      item,
    });
  }

  async #withDecryptedPayload(item: TimelineItem): Promise<TimelineItem> {
    const payload = item.payload ?? (await this.encryption.decryptPayload(item));
    return payload ? { ...item, payload } : item;
  }
}
