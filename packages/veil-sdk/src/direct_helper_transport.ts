import { sortTimeline } from "./timeline";
import {
  type CreateChannelInput,
  type CreateChannelResult,
  type DirectHelperTransportConfig,
  type FeltLike,
  type InvokeExternalInput,
  type StarknetAccountLike,
  type StarknetContractCall,
  type StarknetProviderLike,
  type TimelineItem,
  type VeilTransport,
} from "./types";

const FELT_MODULUS = 2n ** 251n + 17n * 2n ** 192n + 1n;
const HEX_FELT = /^0x[0-9a-fA-F]+$/;
const DECIMAL_FELT = /^\d+$/;
const textEncoder = new TextEncoder();

function feltHash(value: string): string {
  let hash = 1469598103934665603n;
  for (const byte of textEncoder.encode(value)) {
    hash ^= BigInt(byte);
    hash = (hash * 1099511628211n) % FELT_MODULUS;
  }
  return hash.toString();
}

function toFeltString(value: FeltLike, label: string): string {
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

function feltToNumber(value: FeltLike, label: string): number {
  const parsed = Number(toFeltString(value, label));
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} is not a safe integer.`);
  }
  return parsed;
}

function normalizeCallResult(result: readonly FeltLike[] | { result: readonly FeltLike[] }): readonly FeltLike[] {
  return "result" in result ? result.result : result;
}

function extractTransactionHash(result: Awaited<ReturnType<StarknetAccountLike["execute"]>>): string | undefined {
  if (typeof result === "string") {
    return result;
  }

  return result.transaction_hash ?? result.transactionHash;
}

function timestampFromChain(value: FeltLike): number {
  const timestamp = feltToNumber(value, "created_at");
  return timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
}

function createHelperCall(contractAddress: string, entrypoint: string, calldata: readonly string[]): StarknetContractCall {
  return {
    contractAddress,
    entrypoint,
    calldata: [...calldata],
  };
}

function createSpanHelperCall(contractAddress: string, entrypoint: string, calldata: readonly string[]): StarknetContractCall {
  return createHelperCall(contractAddress, entrypoint, [String(calldata.length), ...calldata]);
}

export function channelIdToFelt(channelId: string): string {
  const trimmed = channelId.trim();
  if (!trimmed) {
    throw new Error("channelId cannot be empty.");
  }

  if (DECIMAL_FELT.test(trimmed) || HEX_FELT.test(trimmed)) {
    return trimmed;
  }

  return feltHash(`veil:channel:${trimmed}`);
}

export class DirectHelperTransport implements VeilTransport {
  readonly #helperAddress: string;
  readonly #entrypoint: string;
  readonly #account: StarknetAccountLike | undefined;
  readonly #provider: StarknetProviderLike | undefined;
  readonly #storePayloadChunks: boolean;
  readonly #sessionAccountResolver: DirectHelperTransportConfig["sessionAccountResolver"];
  readonly #now: () => number;
  readonly #channelIdEncoder: (channelId: string) => string;

  constructor(config: DirectHelperTransportConfig) {
    this.#helperAddress = config.helperAddress;
    this.#entrypoint = config.entrypoint ?? "privacy_invoke";
    this.#account = config.account;
    this.#provider = config.provider;
    this.#storePayloadChunks = config.storePayloadChunks ?? true;
    this.#sessionAccountResolver = config.sessionAccountResolver;
    this.#now = config.now ?? (() => Date.now());
    this.#channelIdEncoder = config.channelIdEncoder ?? channelIdToFelt;
  }

  async createChannel(input: CreateChannelInput = {}): Promise<CreateChannelResult> {
    const channelId = input.channelId ?? "1";
    const result: CreateChannelResult = {
      channelId,
      createdAt: this.#now(),
    };
    if (input.title) {
      result.title = input.title;
    }
    return result;
  }

  async invokeExternal(input: InvokeExternalInput): Promise<TimelineItem> {
    const account = this.#sessionAccountResolver?.(input.session) ?? this.#account;
    if (!account) {
      throw new Error("DirectHelperTransport needs a Starknet account to submit helper transactions.");
    }

    const channelFelt = this.#channelIdEncoder(input.item.channelId);
    const eventCount = this.#provider
      ? await this.getEventCount(input.item.channelId).catch(() => undefined)
      : undefined;
    const calldata = [
      channelFelt,
      toFeltString(input.item.eventType, "event_type"),
      toFeltString(input.item.encryptedPayload, "encrypted_payload"),
      toFeltString(input.item.payloadHash, "payload_hash"),
      ...(this.#storePayloadChunks && input.item.payloadChunks?.length
        ? [
            String(input.item.payloadChunks.length),
            ...input.item.payloadChunks.map((chunk) => toFeltString(chunk, "payload_chunk")),
          ]
        : []),
    ];

    const result = await account.execute([
      createSpanHelperCall(input.helperAddress || this.#helperAddress, this.#entrypoint, calldata),
    ]);
    const transactionHash = extractTransactionHash(result);
    const item: TimelineItem = {
      ...input.item,
      eventId: eventCount === undefined ? input.item.eventId : String(eventCount + 1),
      optimistic: true,
    };
    if (transactionHash) {
      item.transactionHash = transactionHash;
    }

    return item;
  }

  async getEventCount(channelId: string): Promise<number> {
    const result = await this.#callHelper("get_event_count", [this.#channelIdEncoder(channelId)]);
    const count = result[0];
    if (count === undefined) {
      throw new Error("get_event_count returned no data.");
    }
    return feltToNumber(count, "event_count");
  }

  async getEvent(channelId: string, index: number): Promise<TimelineItem> {
    const result = await this.#callHelper("get_event", [this.#channelIdEncoder(channelId), String(index)]);
    if (result.length < 6) {
      throw new Error("get_event returned an incomplete VeilTimelineEvent.");
    }

    const hasPayloadChunkCount = result.length >= 7;
    const payloadChunkCount = hasPayloadChunkCount
      ? feltToNumber(result[5] as FeltLike, "payload_chunk_count")
      : 0;
    const payloadChunks = payloadChunkCount > 0
      ? await Promise.all(
          Array.from({ length: payloadChunkCount }, async (_, chunkIndex) =>
            this.#getPayloadChunk(channelId, index, chunkIndex),
          ),
        )
      : undefined;
    const payloadChunkFields = payloadChunks ? { payloadChunkCount, payloadChunks } : {};

    return {
      eventId: toFeltString(result[0] as FeltLike, "event_id"),
      channelId,
      eventType: feltToNumber(result[2] as FeltLike, "event_type"),
      encryptedPayload: toFeltString(result[3] as FeltLike, "encrypted_payload"),
      payloadHash: toFeltString(result[4] as FeltLike, "payload_hash"),
      ...payloadChunkFields,
      timestamp: timestampFromChain(result[hasPayloadChunkCount ? 6 : 5] as FeltLike),
      optimistic: false,
    };
  }

  async getTimeline(channelId: string): Promise<TimelineItem[]> {
    const count = await this.getEventCount(channelId);
    const events = await Promise.all(
      Array.from({ length: count }, async (_, index) => this.getEvent(channelId, index)),
    );
    return sortTimeline(events);
  }

  async #callHelper(entrypoint: string, calldata: readonly string[]): Promise<readonly FeltLike[]> {
    if (!this.#provider) {
      throw new Error("DirectHelperTransport needs a Starknet provider to read helper state.");
    }

    return normalizeCallResult(
      await this.#provider.callContract(createHelperCall(this.#helperAddress, entrypoint, calldata)),
    );
  }

  async #getPayloadChunk(channelId: string, eventIndex: number, chunkIndex: number): Promise<string> {
    const result = await this.#callHelper("get_payload_chunk", [
      this.#channelIdEncoder(channelId),
      String(eventIndex),
      String(chunkIndex),
    ]);
    const chunk = result[0];
    if (chunk === undefined) {
      throw new Error("get_payload_chunk returned no data.");
    }
    return toFeltString(chunk, "payload_chunk");
  }
}
