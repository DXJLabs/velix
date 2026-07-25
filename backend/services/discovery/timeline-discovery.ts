import {
  hash,
} from "starknet";
import {
  readHelperEvents,
  type HelperReaderRpc,
} from "./helper-reader.js";
import {
  verifyTimelineCommitment,
} from "./commitment-verifier.js";
import {
  toHexFelt,
} from "./rpc-discovery.js";

const MAX_TIMELINE_CHUNKS = 64;

const TIMELINE_COMMITMENT_SELECTOR =
  toHexFelt(
    hash.getSelectorFromName(
      "TimelineCommitmentStored",
    ),
    "TimelineCommitmentStored selector",
  );

const GET_EVENT_SELECTOR =
  toHexFelt(
    hash.getSelectorFromName(
      "get_event",
    ),
    "get_event selector",
  );

const GET_PAYLOAD_CHUNK_SELECTOR =
  toHexFelt(
    hash.getSelectorFromName(
      "get_payload_chunk",
    ),
    "get_payload_chunk selector",
  );

const IS_PAYLOAD_COMMITTED_SELECTOR =
  toHexFelt(
    hash.getSelectorFromName(
      "is_payload_committed",
    ),
    "is_payload_committed selector",
  );

const IS_PRIVACY_POOL_EVENT_SELECTOR =
  toHexFelt(
    hash.getSelectorFromName(
      "is_privacy_pool_event",
    ),
    "is_privacy_pool_event selector",
  );

export interface TimelineDiscoveryRpc
  extends HelperReaderRpc {
  callContract(
    input: {
      contractAddress: string;
      entrypointSelector: string;
      calldata: readonly string[];
      blockNumber: number;
    },
    signal?: AbortSignal,
  ): Promise<readonly string[]>;
}

export interface TimelineDiscoveryInput {
  helperAddress: string;
  conversationTag: string;
  fromBlock: number;
  toBlock: number;
  maximumEvents?: number;
}

export interface VerifiedTimelineCiphertext {
  eventId: string;
  conversationTag: string;
  eventType: string;
  encryptedPayload: string;
  payloadHash: string;
  payloadChunkCount: number;
  payloadChunks: readonly string[];
  timestamp: number;
  transactionHash: string;
  blockHash: string;
  blockNumber: number;
  eventIndex: number;
  provenance: "privacy-pool";
  commitmentVerified: true;
}

export class TimelineDiscoveryError
  extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "TimelineDiscoveryError";

    this.code = code;
  }
}

export async function discoverVerifiedTimelineCiphertexts(
  rpc: TimelineDiscoveryRpc,
  input: TimelineDiscoveryInput,
  signal?: AbortSignal,
): Promise<
  readonly VerifiedTimelineCiphertext[]
> {
  const helperAddress =
    toHexFelt(
      input.helperAddress,
      "helperAddress",
    );

  const conversationTag =
    toHexFelt(
      input.conversationTag,
      "conversationTag",
    );

  if (
    BigInt(conversationTag) === 0n
  ) {
    throw discoveryError(
      "TIMELINE_CONVERSATION_TAG_INVALID",
      "conversationTag must be nonzero.",
    );
  }

  const events =
    await readHelperEvents(
      rpc,
      {
        helperAddress,
        conversationTag,
        fromBlock:
          input.fromBlock,
        toBlock:
          input.toBlock,

        ...(input.maximumEvents
          === undefined
          ? {}
          : {
              maximumEvents:
                input.maximumEvents,
            }),
      },
      signal,
    );

  const messages:
    VerifiedTimelineCiphertext[] = [];

  const seenEventIds =
    new Set<string>();

  for (
    const event
    of events
  ) {
    if (
      event.keys[0]
      !== TIMELINE_COMMITMENT_SELECTOR
    ) {
      continue;
    }

    if (
      event.keys.length !== 3
      || event.data.length !== 1
      || event.keys[1]
        !== conversationTag
    ) {
      throw discoveryError(
        "TIMELINE_EVENT_SCHEMA_INVALID",
        "TimelineCommitmentStored does not match the pinned event schema.",
      );
    }

    if (
      event.blockHash === null
      || event.transactionHash === null
      || event.eventIndex === null
    ) {
      throw discoveryError(
        "TIMELINE_EVENT_METADATA_MISSING",
        "Verified timeline discovery requires block hash, transaction hash, and event index.",
      );
    }

    const eventId =
      toHexFelt(
        event.keys[2],
        "timeline eventId",
      );

    if (
      BigInt(eventId) === 0n
    ) {
      throw discoveryError(
        "TIMELINE_EVENT_ID_INVALID",
        "Timeline eventId must be nonzero.",
      );
    }

    if (
      seenEventIds.has(eventId)
    ) {
      throw discoveryError(
        "TIMELINE_EVENT_DUPLICATE",
        "The RPC returned a duplicate timeline commitment event.",
      );
    }

    seenEventIds.add(eventId);

    const eventCommitment =
      toHexFelt(
        event.data[0],
        "timeline event commitment",
      );

    const storageIndex =
      toHexFelt(
        BigInt(eventId) - 1n,
        "timeline storage index",
      );

    const stored =
      await rpc.callContract(
        {
          contractAddress:
            helperAddress,

          entrypointSelector:
            GET_EVENT_SELECTOR,

          calldata: [
            conversationTag,
            storageIndex,
          ],

          blockNumber:
            event.blockNumber,
        },
        signal,
      );

    if (
      stored.length !== 7
    ) {
      throw discoveryError(
        "TIMELINE_HELPER_ABI_MISMATCH",
        "get_event returned an unexpected Helper storage schema.",
      );
    }

    const normalizedStored =
      stored.map(
        (value) =>
          toHexFelt(
            value,
            "timeline storage field",
          ),
      );

    /*
     * The exact seven-field length was verified before normalization.
     * Preserve that runtime guarantee for strict indexed-access typing.
     */
    const [
      storedEventId,
      storedTag,
      eventType,
      encryptedPayload,
      payloadHash,
      rawChunkCount,
      createdAt,
    ] = normalizedStored as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];

    if (
      storedEventId !== eventId
      || storedTag !== conversationTag
      || payloadHash
        !== eventCommitment
    ) {
      throw discoveryError(
        "TIMELINE_STORAGE_MISMATCH",
        "Timeline event metadata does not match Helper storage.",
      );
    }

    const payloadChunkCount =
      boundedChunkCount(
        rawChunkCount,
      );

    const payloadChunks:
      string[] = [];

    for (
      let index = 0;
      index < payloadChunkCount;
      index += 1
    ) {
      const chunkResult =
        await rpc.callContract(
          {
            contractAddress:
              helperAddress,

            entrypointSelector:
              GET_PAYLOAD_CHUNK_SELECTOR,

            calldata: [
              conversationTag,
              storageIndex,

              toHexFelt(
                index,
                "payload chunk index",
              ),
            ],

            blockNumber:
              event.blockNumber,
          },
          signal,
        );

      if (
        chunkResult.length !== 1
      ) {
        throw discoveryError(
          "TIMELINE_HELPER_ABI_MISMATCH",
          "get_payload_chunk returned an unexpected result.",
        );
      }

      payloadChunks.push(
        toHexFelt(
          chunkResult[0],
          "timeline payload chunk",
        ),
      );
    }

    verifyTimelineCommitment({
      conversationTag,
      eventType,
      encryptedPayload,
      payloadChunks,
      claimedCommitment:
        payloadHash,
    });

    const committed =
      await rpc.callContract(
        {
          contractAddress:
            helperAddress,

          entrypointSelector:
            IS_PAYLOAD_COMMITTED_SELECTOR,

          calldata: [
            conversationTag,
            payloadHash,
          ],

          blockNumber:
            event.blockNumber,
        },
        signal,
      );

    if (
      committed.length !== 1
      || toHexFelt(
        committed[0],
        "is_payload_committed result",
      ) !== "0x1"
    ) {
      throw discoveryError(
        "TIMELINE_PAYLOAD_NOT_COMMITTED",
        "Helper storage did not confirm the timeline payload commitment.",
      );
    }

    const provenance =
      await rpc.callContract(
        {
          contractAddress:
            helperAddress,

          entrypointSelector:
            IS_PRIVACY_POOL_EVENT_SELECTOR,

          calldata: [
            conversationTag,
            storageIndex,
          ],

          blockNumber:
            event.blockNumber,
        },
        signal,
      );

    if (
      provenance.length !== 1
    ) {
      throw discoveryError(
        "TIMELINE_PROVENANCE_INVALID",
        "The Helper provenance reader returned an unexpected result.",
      );
    }

    const provenanceValue =
      toHexFelt(
        provenance[0],
        "is_privacy_pool_event result",
      );

    if (
      provenanceValue !== "0x1"
    ) {
      throw discoveryError(
        "TIMELINE_DIRECT_EVENT_FORBIDDEN",
        "Verified ciphertext discovery rejects direct Helper events.",
      );
    }

    messages.push(
      Object.freeze({
        eventId,
        conversationTag,
        eventType,
        encryptedPayload,
        payloadHash,
        payloadChunkCount,

        payloadChunks:
          Object.freeze([
            ...payloadChunks,
          ]),

        timestamp:
          timestampMilliseconds(
            createdAt,
          ),

        transactionHash:
          event.transactionHash,

        blockHash:
          event.blockHash,

        blockNumber:
          event.blockNumber,

        eventIndex:
          event.eventIndex,

        provenance:
          "privacy-pool",

        commitmentVerified:
          true,
      }),
    );
  }

  messages.sort(
    (left, right) => {
      if (
        left.blockNumber
        !== right.blockNumber
      ) {
        return left.blockNumber
          - right.blockNumber;
      }

      if (
        left.eventIndex
        !== right.eventIndex
      ) {
        return left.eventIndex
          - right.eventIndex;
      }

      const leftEventId =
        BigInt(left.eventId);

      const rightEventId =
        BigInt(right.eventId);

      return leftEventId < rightEventId
        ? -1
        : leftEventId > rightEventId
          ? 1
          : 0;
    },
  );

  return Object.freeze(messages);
}

function boundedChunkCount(
  value: string,
): number {
  const parsed =
    BigInt(value);

  if (
    parsed < 0n
    || parsed
      > BigInt(
        MAX_TIMELINE_CHUNKS,
      )
  ) {
    throw discoveryError(
      "TIMELINE_CHUNK_COUNT_INVALID",
      "The Helper payload chunk count exceeds the pinned boundary.",
    );
  }

  return Number(parsed);
}

function timestampMilliseconds(
  value: string,
): number {
  const seconds =
    BigInt(value);

  const maximum =
    BigInt(
      Math.floor(
        Number.MAX_SAFE_INTEGER
        / 1_000,
      ),
    );

  if (
    seconds < 0n
    || seconds > maximum
  ) {
    throw discoveryError(
      "TIMELINE_TIMESTAMP_INVALID",
      "The Helper timestamp is outside the safe JavaScript range.",
    );
  }

  return Number(seconds)
    * 1_000;
}

function discoveryError(
  code: string,
  message: string,
): TimelineDiscoveryError {
  return new TimelineDiscoveryError(
    code,
    message,
  );
}
