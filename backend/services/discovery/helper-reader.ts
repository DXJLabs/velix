import { RpcDiscoveryClient, toHexFelt } from "./rpc-discovery.js";

export interface HelperReaderInput {
  helperAddress: string;
  conversationTag: string;
  fromBlock: number;
  toBlock: number;
  maximumEvents?: number;
}

export interface HelperEvent {
  keys: readonly string[];
  data: readonly string[];
  blockNumber: number;
  blockHash: string | null;
  transactionHash: string | null;
  eventIndex: number | null;
}

export async function readHelperEvents(
  rpc: RpcDiscoveryClient,
  input: HelperReaderInput,
  signal?: AbortSignal,
): Promise<readonly HelperEvent[]> {
  const maximumEvents = input.maximumEvents ?? 200;
  if (!Number.isSafeInteger(maximumEvents) || maximumEvents < 1 || maximumEvents > 2_000) {
    throw new TypeError("maximumEvents must be between 1 and 2000.");
  }
  const helperAddress = toHexFelt(input.helperAddress, "helperAddress");
  const conversationTag = toHexFelt(input.conversationTag, "conversationTag");
  if (BigInt(conversationTag) === 0n) throw new TypeError("conversationTag must be nonzero.");

  const events: HelperEvent[] = [];
  const seenTokens = new Set<string>();
  let continuationToken: string | undefined;

  do {
    const page = await rpc.getEvents({
      fromBlock: input.fromBlock,
      toBlock: input.toBlock,
      address: helperAddress,
      keys: [[], [conversationTag]],
      chunkSize: Math.min(100, maximumEvents),
      ...(continuationToken === undefined ? {} : { continuationToken }),
    }, signal);

    if (events.length + page.events.length > maximumEvents) {
      throw new RangeError("The helper event page exceeds the configured maximumEvents boundary.");
    }
    for (const value of page.events) events.push(normalizeEvent(value, helperAddress, input));

    continuationToken = page.continuationToken ?? undefined;
    if (continuationToken !== undefined) {
      if (seenTokens.has(continuationToken)) throw new TypeError("The RPC repeated a continuation token.");
      seenTokens.add(continuationToken);
    }
  } while (continuationToken !== undefined);

  return Object.freeze(events);
}

function normalizeEvent(value: unknown, helperAddress: string, input: HelperReaderInput): HelperEvent {
  if (!isPlainRecord(value) || !Array.isArray(value.keys) || !Array.isArray(value.data)) {
    throw new TypeError("The helper event does not match the Starknet event schema.");
  }
  if (!Number.isSafeInteger(value.block_number) || Number(value.block_number) < input.fromBlock || Number(value.block_number) > input.toBlock) {
    throw new TypeError("The helper event block is outside the requested range.");
  }
  if (value.from_address !== undefined && toHexFelt(value.from_address, "event.from_address") !== helperAddress) {
    throw new TypeError("The helper event originated from an unexpected contract.");
  }

  return Object.freeze({
    keys: Object.freeze(value.keys.map((item) => toHexFelt(item, "event key"))),
    data: Object.freeze(value.data.map((item) => toHexFelt(item, "event data"))),
    blockNumber: Number(value.block_number),
    blockHash: value.block_hash === undefined ? null : toHexFelt(value.block_hash, "event block hash"),
    transactionHash: value.transaction_hash === undefined ? null : toHexFelt(value.transaction_hash, "event transaction hash"),
    eventIndex: Number.isSafeInteger(value.event_index) && Number(value.event_index) >= 0
      ? Number(value.event_index)
      : null,
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
