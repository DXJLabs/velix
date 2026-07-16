import { hash, shortString } from "starknet";

import { ApiError } from "../../_lib/privy.js";
import { normalizeFelt } from "./starknet-rpc.js";

const MAX_PAYLOAD_CHUNKS = 64;
const MAX_U64 = 2n ** 64n - 1n;
const TIMELINE_COMMITMENT_SELECTOR = normalizeFelt(hash.getSelectorFromName("TimelineCommitmentStored"));
const TIMELINE_PAYLOAD_DOMAIN = shortString.encodeShortString("VEIL_TIMELINE_V1");

export async function materializeTimeline({
  events,
  conversationTag,
  helperAddress,
  rpcClient,
  messageLimit,
  context,
}) {
  const normalizedTag = normalizeFelt(conversationTag, "conversation tag");
  const minimalCommitments = new Map();
  const legacyHeaders = new Map();
  const legacyChunks = new Map();

  for (const event of events) {
    const { keys, data } = event;
    if (keys.length < 2 || keys[1] !== normalizedTag) continue;

    if (
      keys[0] === TIMELINE_COMMITMENT_SELECTOR
      && keys.length === 3
      && data.length === 1
    ) {
      putUnique(minimalCommitments, keys[2], {
        eventId: keys[2],
        payloadHash: data[0],
        ...publicEventMeta(event),
      }, context);
      continue;
    }

    // Compatibility for the currently deployed pre-hardening helper. Its
    // event selectors are not treated as canonical, and provenance therefore
    // remains explicitly unverified.
    if (keys.length >= 4 && data.length >= 4) {
      putUnique(legacyHeaders, keys[3], {
        eventId: keys[3],
        eventType: keys[2],
        encryptedPayload: data[0],
        payloadHash: data[1],
        payloadChunkCount: boundedChunkCount(data[2], context),
        timestamp: timestampMilliseconds(data[3], context),
        ...publicEventMeta(event),
      }, context);
      continue;
    }

    if (keys.length >= 4 && data.length === 1) {
      const eventId = keys[2];
      const chunkIndex = boundedChunkIndex(keys[3], context);
      const bucket = legacyChunks.get(eventId) || new Map();
      if (bucket.has(chunkIndex) && bucket.get(chunkIndex) !== data[0]) {
        throw indexerDataConflict(context);
      }
      bucket.set(chunkIndex, data[0]);
      legacyChunks.set(eventId, bucket);
    }
  }

  if (minimalCommitments.size + legacyHeaders.size > messageLimit) {
    throw new ApiError(
      422,
      "INDEXER_MESSAGE_LIMIT",
      context.route,
      "This block page contains more conversation events than the requested message limit.",
      "Retry with a smaller pageBlocks value so no ciphertext events are dropped.",
    );
  }

  const messages = [];
  const optionalProvenanceReaders = { supported: PROVENANCE_READER_SUPPORT.get(helperAddress) };
  for (const commitment of minimalCommitments.values()) {
    messages.push(await materializeCommitment({
      commitment,
      conversationTag: normalizedTag,
      helperAddress,
      rpcClient,
      optionalProvenanceReaders,
      context,
    }));
    if (optionalProvenanceReaders.supported !== undefined) {
      PROVENANCE_READER_SUPPORT.set(helperAddress, optionalProvenanceReaders.supported);
    }
  }

  for (const header of legacyHeaders.values()) {
    const chunkMap = legacyChunks.get(header.eventId) || new Map();
    const payloadChunks = exactChunks(chunkMap, header.payloadChunkCount, context);
    assertCommitment({
      conversationTag: normalizedTag,
      eventType: header.eventType,
      encryptedPayload: header.encryptedPayload,
      payloadHash: header.payloadHash,
      payloadChunks,
      context,
    });
    messages.push({
      eventId: header.eventId,
      conversationTag: normalizedTag,
      eventType: jsonFelt(header.eventType),
      encryptedPayload: header.encryptedPayload,
      payloadHash: header.payloadHash,
      payloadChunkCount: header.payloadChunkCount,
      payloadChunks,
      timestamp: header.timestamp,
      transactionHash: header.transactionHash,
      blockHash: header.blockHash,
      blockNumber: header.blockNumber,
      eventIndex: header.eventIndex,
      eventKey: eventKey(header),
      status: "confirmed",
      provenance: "unverified-legacy",
      commitmentVerified: true,
    });
  }

  return messages.sort((left, right) => {
    if (left.blockNumber !== right.blockNumber) return left.blockNumber - right.blockNumber;
    if ((left.eventIndex ?? -1) !== (right.eventIndex ?? -1)) {
      return (left.eventIndex ?? -1) - (right.eventIndex ?? -1);
    }
    const first = BigInt(left.eventId);
    const second = BigInt(right.eventId);
    return first < second ? -1 : first > second ? 1 : 0;
  });
}

async function materializeCommitment({
  commitment,
  conversationTag,
  helperAddress,
  rpcClient,
  optionalProvenanceReaders,
  context,
}) {
  const eventId = BigInt(commitment.eventId);
  if (eventId <= 0n || eventId - 1n > MAX_U64) throw helperAbiMismatch(context);
  const storageIndex = (eventId - 1n).toString();
  const blockNumber = commitment.blockNumber;

  const stored = await rpcClient.callContract({
    helperAddress,
    entrypoint: "get_event",
    calldata: [conversationTag, storageIndex],
    blockNumber,
  });
  let privacyPoolOrigin = null;
  let committed = null;
  if (optionalProvenanceReaders.supported !== false) {
    try {
      privacyPoolOrigin = await rpcClient.callContract({
        helperAddress,
        entrypoint: "is_privacy_pool_event",
        calldata: [conversationTag, storageIndex],
        blockNumber,
      });
      committed = await rpcClient.callContract({
        helperAddress,
        entrypoint: "is_payload_committed",
        calldata: [conversationTag, commitment.payloadHash],
        blockNumber,
      });
      optionalProvenanceReaders.supported = true;
    } catch (error) {
      if (error instanceof ApiError && error.code === "INDEXER_RPC_REJECTED") {
        optionalProvenanceReaders.supported = false;
        privacyPoolOrigin = null;
        committed = null;
      } else {
        throw error;
      }
    }
  }

  if (
    stored.length !== 7
    || (privacyPoolOrigin && privacyPoolOrigin.length !== 1)
    || (committed && committed.length !== 1)
  ) {
    throw helperAbiMismatch(context);
  }

  const [storedEventId, storedTag, eventType, encryptedPayload, payloadHash, rawChunkCount, createdAt] = stored;
  if (
    storedEventId !== commitment.eventId
    || storedTag !== conversationTag
    || payloadHash !== commitment.payloadHash
    || (privacyPoolOrigin && !["0", "1"].includes(privacyPoolOrigin[0]))
    || (committed && committed[0] !== "1")
  ) {
    throw helperAbiMismatch(context);
  }

  const payloadChunkCount = boundedChunkCount(rawChunkCount, context);
  const payloadChunks = await mapWithConcurrency(
    Array.from({ length: payloadChunkCount }, (_, index) => index),
    1,
    (chunkIndex) => rpcClient.callContract({
      helperAddress,
      entrypoint: "get_payload_chunk",
      calldata: [conversationTag, storageIndex, String(chunkIndex)],
      blockNumber,
    }).then((result) => {
      if (result.length !== 1) throw helperAbiMismatch(context);
      return result[0];
    }),
  );

  assertCommitment({
    conversationTag,
    eventType,
    encryptedPayload,
    payloadHash,
    payloadChunks,
    context,
  });

  const provenance = privacyPoolOrigin
    ? (privacyPoolOrigin[0] === "1" ? "privacy-pool" : "direct")
    : "unverified-helper-provenance";
  const result = {
    eventId: commitment.eventId,
    conversationTag,
    eventType: jsonFelt(eventType),
    encryptedPayload,
    payloadHash,
    payloadChunkCount,
    payloadChunks,
    timestamp: timestampMilliseconds(createdAt, context),
    transactionHash: commitment.transactionHash,
    blockHash: commitment.blockHash,
    blockNumber,
    eventIndex: commitment.eventIndex,
    eventKey: eventKey(commitment),
    status: "confirmed",
    provenance,
    commitmentVerified: true,
  };
  if (privacyPoolOrigin) result.mode = provenance === "privacy-pool" ? "shield" : "unshield";
  return result;
}

const PROVENANCE_READER_SUPPORT = new Map();

function assertCommitment({
  conversationTag,
  eventType,
  encryptedPayload,
  payloadHash,
  payloadChunks,
  context,
}) {
  const computed = normalizeFelt(hash.computePoseidonHashOnElements([
    TIMELINE_PAYLOAD_DOMAIN,
    conversationTag,
    eventType,
    encryptedPayload,
    String(payloadChunks.length),
    ...payloadChunks,
  ]));
  if (computed !== payloadHash) {
    throw new ApiError(
      502,
      "INDEXER_PAYLOAD_COMMITMENT_MISMATCH",
      context.route,
      "A helper event did not match its domain-separated ciphertext commitment.",
      "Do not decrypt or display this event; verify the helper ABI/deployment and replay the page from a trusted cursor.",
    );
  }
}

function exactChunks(chunkMap, count, context) {
  if (chunkMap.size !== count) throw helperAbiMismatch(context);
  return Array.from({ length: count }, (_, index) => {
    const chunk = chunkMap.get(index);
    if (chunk === undefined) throw helperAbiMismatch(context);
    return chunk;
  });
}

function publicEventMeta(event) {
  return {
    blockNumber: event.blockNumber,
    blockHash: event.blockHash,
    transactionHash: event.transactionHash,
    eventIndex: event.eventIndex,
  };
}

function eventKey(event) {
  if (!event.blockHash || !event.transactionHash) return undefined;
  return `${event.blockHash}:${event.transactionHash}:${event.eventId}`;
}

function putUnique(map, key, value, context) {
  if (map.has(key)) {
    const existing = map.get(key);
    if (JSON.stringify(existing) !== JSON.stringify(value)) throw indexerDataConflict(context);
    return;
  }
  map.set(key, value);
}

function boundedChunkCount(value, context) {
  const count = BigInt(value);
  if (count < 0n || count > BigInt(MAX_PAYLOAD_CHUNKS)) throw helperAbiMismatch(context);
  return Number(count);
}

function boundedChunkIndex(value, context) {
  const index = BigInt(value);
  if (index < 0n || index >= BigInt(MAX_PAYLOAD_CHUNKS)) throw helperAbiMismatch(context);
  return Number(index);
}

function timestampMilliseconds(value, context) {
  const seconds = BigInt(value);
  const maximum = BigInt(Math.floor(Number.MAX_SAFE_INTEGER / 1_000));
  if (seconds < 0n || seconds > maximum) throw helperAbiMismatch(context);
  return Number(seconds) * 1_000;
}

function jsonFelt(value) {
  const parsed = BigInt(value);
  return parsed <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(parsed) : parsed.toString();
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const result = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      result[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return result;
}

function indexerDataConflict(context) {
  return new ApiError(
    502,
    "INDEXER_EVENT_CONFLICT",
    context.route,
    "Conflicting helper events were returned for the same conversation event id.",
    "Stop processing this page and verify RPC consistency and helper deployment history.",
  );
}

function helperAbiMismatch(context) {
  return new ApiError(
    502,
    "INDEXER_HELPER_ABI_MISMATCH",
    context.route,
    "The helper event or storage response does not match the pinned bounded VEIL schema.",
    "Verify the configured helper address, class hash, ABI, and deployment block before replaying this page.",
  );
}
