import { encodeInvokeCalldata, sortTimeline } from "./timeline";
import {
  type CreateChannelInput,
  type CreateChannelResult,
  type DirectHelperTransportConfig,
  type FeltLike,
  type InvokeExternalInput,
  type StarknetAccountLike,
  type StarknetContractCall,
  type StarknetProviderLike,
  type StarknetTransactionReceiptLike,
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

function normalizeCallResult(
  result: readonly FeltLike[] | { result: readonly FeltLike[] } | null | undefined,
): readonly FeltLike[] {
  if (result == null) {
    throw new Error(
      "Starknet RPC returned no call result. The RPC may be rate-limited or temporarily unavailable.",
    );
  }

  if (Array.isArray(result)) {
    return result;
  }

  if (
    typeof result === "object" &&
    "result" in result &&
    Array.isArray(result.result)
  ) {
    return result.result;
  }

  throw new Error("Starknet RPC returned an invalid callContract response.");
}

function extractTransactionHash(
  result: Awaited<ReturnType<StarknetAccountLike["execute"]>> | null | undefined,
): string | undefined {
  if (typeof result === "string") {
    return result;
  }

  if (!result || typeof result !== "object") {
    return undefined;
  }

  if ("hash" in result && typeof result.hash === "string") {
    return result.hash;
  }

  return result.transaction_hash ?? result.transactionHash;
}

function extractBlockNumber(receipt: StarknetTransactionReceiptLike): number | undefined {
  return receipt.block_number ?? receipt.blockNumber;
}

function isAcceptedReceipt(receipt: StarknetTransactionReceiptLike): boolean {
  const status = receipt.status ?? receipt.finality_status;
  const executionStatus = receipt.execution_status;
  if (executionStatus === "REVERTED" || status === "REJECTED" || status === "REVERTED") {
    return false;
  }

  return status === "ACCEPTED_ON_L2" || status === "ACCEPTED_ON_L1" || extractBlockNumber(receipt) !== undefined;
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
  readonly supportedModes = ["encrypted-direct", "unshield"] as const;
  readonly #helperAddress: string;
  readonly #entrypoint: string;
  readonly #account: StarknetAccountLike | undefined;
  readonly #provider: StarknetProviderLike | undefined;
  readonly #storePayloadChunks: boolean;
  readonly #sessionAccountResolver: DirectHelperTransportConfig["sessionAccountResolver"];
  readonly #onTransactionSubmitted: DirectHelperTransportConfig["onTransactionSubmitted"];
  readonly #now: () => number;
  readonly #channelIdEncoder: (channelId: string) => string;
  readonly #waitForConfirmation: boolean;
  readonly #confirmationTimeoutMs: number;
  readonly #confirmationPollMs: number;

  constructor(config: DirectHelperTransportConfig) {
    this.#helperAddress = config.helperAddress;
    this.#entrypoint = config.entrypoint ?? "invoke";
    this.#account = config.account;
    this.#provider = config.provider;
    this.#storePayloadChunks = config.storePayloadChunks ?? true;
    this.#sessionAccountResolver = config.sessionAccountResolver;
    this.#onTransactionSubmitted = config.onTransactionSubmitted;
    this.#now = config.now ?? (() => Date.now());
    this.#channelIdEncoder = config.channelIdEncoder ?? channelIdToFelt;
    this.#waitForConfirmation = config.waitForConfirmation ?? true;
    this.#confirmationTimeoutMs = config.confirmationTimeoutMs ?? 120_000;
    this.#confirmationPollMs = config.confirmationPollMs ?? 2_500;
  }

  encodeConversationTag(channelId: string): string {
    return this.#channelIdEncoder(channelId);
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
    if (input.mode !== "encrypted-direct" && input.mode !== "unshield") {
      throw new Error("DirectHelperTransport only supports Encrypted On-chain messages.");
    }

    const account = this.#sessionAccountResolver?.(input.session) ?? this.#account;
    if (!account) {
      throw new Error("DirectHelperTransport needs a Starknet account to submit helper transactions.");
    }
    if (this.#waitForConfirmation && !this.#provider) {
      throw new Error("DirectHelperTransport confirmation mode needs a Starknet provider.");
    }

    const channelFelt = this.#channelIdEncoder(input.item.channelId);
    if (!this.#storePayloadChunks && input.item.payloadChunks?.length) {
      throw new Error("DirectHelperTransport cannot omit payload chunks because payload_hash commits to them.");
    }
    // Best-effort only. A temporary RPC 429 must not block transaction submission.
    // If unavailable, preserve the caller-provided eventId and let later indexing
    // resolve the canonical event position.
    const eventCount = this.#provider
      ? await this.getEventCount(input.item.channelId).catch(() => undefined)
      : undefined;
    const calldata = input.calldata.length
      ? input.calldata.map((felt, index) => toFeltString(felt, `calldata_${index}`))
      : encodeInvokeCalldata(input.item, { conversationTag: channelFelt });

    const result = await account.execute([
      createSpanHelperCall(input.helperAddress || this.#helperAddress, this.#entrypoint, calldata),
    ]);
    const transactionHash = extractTransactionHash(result);
    if (!transactionHash) {
      throw new Error("DirectHelperTransport submission did not return a transaction hash.");
    }
    const item: TimelineItem = {
      ...input.item,
      eventId: eventCount === undefined ? input.item.eventId : String(eventCount + 1),
      status: "pending",
      optimistic: true,
    };
    item.transactionHash = transactionHash;
    this.#onTransactionSubmitted?.(transactionHash, item);
    if (this.#waitForConfirmation) {
      const receipt = await this.#waitForReceipt(transactionHash);
      const blockNumber = extractBlockNumber(receipt);

      // Do not immediately read the event and every payload chunk back from RPC.
      // The transaction has already been submitted and confirmed at this point.
      // A post-submit RPC 429 must not be misreported as transaction failure.
      const returnedItem: TimelineItem = {
        ...item,
        transactionHash,
        mode: input.mode,
        status: "confirmed",
        optimistic: false,
      };
      if (blockNumber !== undefined) {
        returnedItem.blockNumber = blockNumber;
      }
      return returnedItem;
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
      ? await this.#getPayloadChunksSequentially(channelId, index, payloadChunkCount)
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
      mode: "encrypted-direct",
      status: "confirmed",
      optimistic: false,
    };
  }

  async getTimeline(channelId: string): Promise<TimelineItem[]> {
    const count = await this.getEventCount(channelId);
    const events: TimelineItem[] = [];

    // Read sequentially to avoid bursting the RPC with many concurrent calls.
    for (let index = 0; index < count; index += 1) {
      events.push(await this.getEvent(channelId, index));
    }

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

  async #getPayloadChunksSequentially(
    channelId: string,
    eventIndex: number,
    count: number,
  ): Promise<string[]> {
    const chunks: string[] = [];

    // Sequential reads intentionally trade some latency for RPC stability.
    for (let chunkIndex = 0; chunkIndex < count; chunkIndex += 1) {
      chunks.push(await this.#getPayloadChunk(channelId, eventIndex, chunkIndex));
    }

    return chunks;
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

  async #waitForReceipt(transactionHash: string): Promise<StarknetTransactionReceiptLike> {
    if (!this.#provider) {
      throw new Error("DirectHelperTransport needs a Starknet provider to confirm transactions.");
    }

    if (this.#provider.waitForTransaction) {
      const receipt = await this.#provider.waitForTransaction(transactionHash);
      if (!isAcceptedReceipt(receipt)) {
        throw new Error(`Starknet transaction was not accepted: ${transactionHash}`);
      }
      return receipt;
    }

    if (!this.#provider.getTransactionReceipt) {
      throw new Error("Starknet provider cannot wait for transaction confirmation.");
    }

    const deadline = Date.now() + this.#confirmationTimeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const receipt = await this.#provider.getTransactionReceipt(transactionHash);
        if (isAcceptedReceipt(receipt)) {
          return receipt;
        }
      } catch (error) {
        lastError = error;
      }

      await new Promise((resolve) => setTimeout(resolve, this.#confirmationPollMs));
    }

    throw new Error(
      `Timed out waiting for Starknet transaction confirmation: ${transactionHash}${
        lastError instanceof Error ? ` (${lastError.message})` : ""
      }`,
    );
  }
}
