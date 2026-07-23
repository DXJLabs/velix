import {
  AddressMap,
  Channel,
  Witness,
  createEmptyRegistry,
} from "@starkware-libs/starknet-privacy-sdk";
import type {
  DiscoveryProviderInterface,
  Note,
  PrivateRegistry,
  ProvingBlockId,
} from "@starkware-libs/starknet-privacy-sdk";
import { ec } from "starknet";

import {
  computePrivacyPoolChannelKey,
  computePrivacyPoolChannelMarker,
  decryptChannelInfo,
} from "../packages/veil-sdk/dist/privacy_pool_ecdh.js";
import type {
  ShieldedMessageChainProvider,
} from "./veil-official-shielded-message-poc.ts";

export const VEIL_REPLAY_TOKEN_ADDRESS =
  0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938dn;
export const VEIL_REPLAY_ANCHOR_AMOUNT = 1n;

const FIELD_PRIME = BigInt(ec.starkCurve.CURVE.Fp.ORDER);
const TWO_POW_128 = 1n << 128n;
const MAX_OUTGOING_CHANNEL_SCAN = 4_096;
const MAX_SUBCHANNEL_SCAN = 256;
const MAX_NOTE_SCAN = 4_096;

const OUTGOING_CHANNEL_ID_TAG = "OUTGOING_CHANNEL_ID_TAG:V1";
const SUBCHANNEL_ID_TAG = "SUBCHANNEL_ID_TAG:V1";
const SUBCHANNEL_MARKER_TAG = "SUBCHANNEL_MARKER_TAG:V1";
const NOTE_ID_TAG = "NOTE_ID_TAG:V1";
const NULLIFIER_TAG = "NULLIFIER_TAG:V1";
const ENC_TOKEN_TAG = "ENC_TOKEN_TAG:V1";
const ENC_AMOUNT_TAG = "ENC_AMOUNT_TAG:V1";

function feltHex(value: bigint | string): string {
  return `0x${BigInt(value).toString(16)}`;
}

function shortStringToFelt(value: string): bigint {
  if (value.length > 31) {
    throw new Error("Privacy domain tag is too long.");
  }
  return BigInt(`0x${Buffer.from(value, "ascii").toString("hex")}`);
}

function privacyHash(tag: string, ...values: bigint[]): bigint {
  return ec.starkCurve.poseidonHashMany([
    shortStringToFelt(tag),
    ...values,
  ]);
}

function computeOutgoingChannelId(
  senderAddress: bigint,
  senderViewingKey: bigint,
  index: number,
): bigint {
  return privacyHash(
    OUTGOING_CHANNEL_ID_TAG,
    senderAddress,
    senderViewingKey,
    BigInt(index),
    0n,
  );
}

function computeSubchannelId(channelKey: bigint, index: number): bigint {
  return privacyHash(SUBCHANNEL_ID_TAG, channelKey, BigInt(index), 0n);
}

function computeSubchannelMarker(input: {
  channelKey: bigint;
  recipientAddress: bigint;
  recipientPublicKey: bigint;
  token: bigint;
}): bigint {
  return privacyHash(
    SUBCHANNEL_MARKER_TAG,
    input.channelKey,
    input.recipientAddress,
    input.recipientPublicKey,
    input.token,
  );
}

function computeNoteId(channelKey: bigint, token: bigint, index: number): bigint {
  return privacyHash(NOTE_ID_TAG, channelKey, token, BigInt(index), 0n);
}

function computeNullifier(input: {
  channelKey: bigint;
  token: bigint;
  index: number;
  ownerViewingKey: bigint;
}): bigint {
  return privacyHash(
    NULLIFIER_TAG,
    input.channelKey,
    input.token,
    BigInt(input.index),
    0n,
    input.ownerViewingKey,
  );
}

function computeEncryptedTokenPad(input: {
  channelKey: bigint;
  index: number;
  salt: bigint;
}): bigint {
  return privacyHash(
    ENC_TOKEN_TAG,
    input.channelKey,
    BigInt(input.index),
    0n,
    input.salt,
  );
}

function computeEncryptedAmountPad(input: {
  channelKey: bigint;
  token: bigint;
  index: number;
  salt: bigint;
}): bigint {
  return privacyHash(
    ENC_AMOUNT_TAG,
    input.channelKey,
    input.token,
    BigInt(input.index),
    0n,
    input.salt,
  );
}

function fieldSubtract(value: bigint, pad: bigint): bigint {
  return ((value - pad) % FIELD_PRIME + FIELD_PRIME) % FIELD_PRIME;
}

async function readBoolean(input: {
  provider: ShieldedMessageChainProvider;
  poolAddress: bigint;
  entrypoint: string;
  calldata: string[];
  blockIdentifier: ProvingBlockId;
}): Promise<boolean> {
  const response = await input.provider.callContract({
    contractAddress: feltHex(input.poolAddress),
    entrypoint: input.entrypoint,
    calldata: input.calldata,
  }, input.blockIdentifier);
  if (response.length !== 1) {
    throw new Error(`Privacy Pool returned invalid ${input.entrypoint} data.`);
  }
  return BigInt(response[0]!) !== 0n;
}

async function readChannelCount(input: {
  provider: ShieldedMessageChainProvider;
  poolAddress: bigint;
  recipientAddress: bigint;
  blockIdentifier: ProvingBlockId;
}): Promise<number> {
  const response = await input.provider.callContract({
    contractAddress: feltHex(input.poolAddress),
    entrypoint: "get_num_of_channels",
    calldata: [feltHex(input.recipientAddress)],
  }, input.blockIdentifier);
  if (response.length !== 1) {
    throw new Error("Privacy Pool returned an invalid incoming-channel count.");
  }
  const count = BigInt(response[0]!);
  if (count < 0n || count > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Privacy Pool returned an unsafe incoming-channel count.");
  }
  return Number(count);
}

export interface VeilDirectionChannelState {
  exists: boolean;
  recipientChannelIndex: number;
  channelKey: bigint;
  channelMarker: bigint;
}

export async function discoverDirectionChannel(input: {
  provider: ShieldedMessageChainProvider;
  poolAddress: bigint;
  senderAddress: bigint;
  senderViewingKey: bigint;
  recipientAddress: bigint;
  recipientViewingKey: bigint;
  recipientPublicKey: bigint;
  blockIdentifier: ProvingBlockId;
}): Promise<VeilDirectionChannelState> {
  const channelKey = BigInt(computePrivacyPoolChannelKey({
    senderAddress: input.senderAddress,
    senderPrivateKey: input.senderViewingKey,
    recipientAddress: input.recipientAddress,
    recipientPublicKey: input.recipientPublicKey,
  }));
  const channelMarker = BigInt(computePrivacyPoolChannelMarker({
    channelKey,
    senderAddress: input.senderAddress,
    recipientAddress: input.recipientAddress,
    recipientPublicKey: input.recipientPublicKey,
  }));
  const exists = await readBoolean({
    provider: input.provider,
    poolAddress: input.poolAddress,
    entrypoint: "channel_exists",
    calldata: [feltHex(channelMarker)],
    blockIdentifier: input.blockIdentifier,
  });
  const count = await readChannelCount({
    provider: input.provider,
    poolAddress: input.poolAddress,
    recipientAddress: input.recipientAddress,
    blockIdentifier: input.blockIdentifier,
  });
  if (!exists) {
    return {
      exists: false,
      recipientChannelIndex: count,
      channelKey,
      channelMarker,
    };
  }
  for (let index = 0; index < count; index += 1) {
    const response = await input.provider.callContract({
      contractAddress: feltHex(input.poolAddress),
      entrypoint: "get_channel_info",
      calldata: [feltHex(input.recipientAddress), String(index)],
    }, input.blockIdentifier);
    if (response.length !== 3) {
      throw new Error("Privacy Pool returned invalid encrypted channel information.");
    }
    try {
      const recovered = decryptChannelInfo({
        recipientPrivateKey: input.recipientViewingKey,
        recipientAddress: input.recipientAddress,
        recipientPublicKey: input.recipientPublicKey,
        expectedChannelMarker: channelMarker,
        encChannelInfo: {
          ephemeralPubkey: response[0]!,
          encChannelKey: response[1]!,
          encSenderAddr: response[2]!,
        },
      });
      if (BigInt(recovered.channelKey) === channelKey
          && BigInt(recovered.senderAddress) === input.senderAddress) {
        return {
          exists: true,
          recipientChannelIndex: index,
          channelKey,
          channelMarker,
        };
      }
    } catch {
      // This encrypted channel belongs to another sender/channel.
    }
  }
  throw new Error("Existing recipient channel marker could not be recovered by the recipient.");
}

export interface VeilReplayAnchorState {
  selfChannelExists: boolean;
  tokenSubchannelExists: boolean;
  selfChannelKey: bigint;
  selfChannelMarker: bigint;
  tokenIndex?: number;
  nextNoteNonce: number;
  anchorNote?: Note;
}

export async function discoverReplayAnchor(input: {
  provider: ShieldedMessageChainProvider;
  poolAddress: bigint;
  accountAddress: bigint;
  viewingKey: bigint;
  publicKey: bigint;
  blockIdentifier: ProvingBlockId;
}): Promise<VeilReplayAnchorState> {
  const selfChannelKey = BigInt(computePrivacyPoolChannelKey({
    senderAddress: input.accountAddress,
    senderPrivateKey: input.viewingKey,
    recipientAddress: input.accountAddress,
    recipientPublicKey: input.publicKey,
  }));
  const selfChannelMarker = BigInt(computePrivacyPoolChannelMarker({
    channelKey: selfChannelKey,
    senderAddress: input.accountAddress,
    recipientAddress: input.accountAddress,
    recipientPublicKey: input.publicKey,
  }));
  const selfChannelExists = await readBoolean({
    provider: input.provider,
    poolAddress: input.poolAddress,
    entrypoint: "channel_exists",
    calldata: [feltHex(selfChannelMarker)],
    blockIdentifier: input.blockIdentifier,
  });
  if (!selfChannelExists) {
    return {
      selfChannelExists: false,
      tokenSubchannelExists: false,
      selfChannelKey,
      selfChannelMarker,
      nextNoteNonce: 0,
    };
  }
  const tokenMarker = computeSubchannelMarker({
    channelKey: selfChannelKey,
    recipientAddress: input.accountAddress,
    recipientPublicKey: input.publicKey,
    token: VEIL_REPLAY_TOKEN_ADDRESS,
  });
  const tokenSubchannelExists = await readBoolean({
    provider: input.provider,
    poolAddress: input.poolAddress,
    entrypoint: "subchannel_exists",
    calldata: [feltHex(tokenMarker)],
    blockIdentifier: input.blockIdentifier,
  });
  if (!tokenSubchannelExists) {
    return {
      selfChannelExists: true,
      tokenSubchannelExists: false,
      selfChannelKey,
      selfChannelMarker,
      nextNoteNonce: 0,
    };
  }
  let tokenIndex: number | undefined;
  for (let index = 0; index < MAX_SUBCHANNEL_SCAN; index += 1) {
    const response = await input.provider.callContract({
      contractAddress: feltHex(input.poolAddress),
      entrypoint: "get_subchannel_info",
      calldata: [feltHex(computeSubchannelId(selfChannelKey, index))],
    }, input.blockIdentifier);
    if (response.length !== 2) {
      throw new Error("Privacy Pool returned invalid encrypted subchannel information.");
    }
    const salt = BigInt(response[0]!);
    if (salt === 0n) break;
    const encryptedToken = BigInt(response[1]!);
    const token = fieldSubtract(
      encryptedToken,
      computeEncryptedTokenPad({ channelKey: selfChannelKey, index, salt }),
    );
    if (token === VEIL_REPLAY_TOKEN_ADDRESS) {
      tokenIndex = index;
      break;
    }
  }
  if (tokenIndex === undefined) {
    throw new Error("Replay-token subchannel marker exists but its index was not found.");
  }
  let nextNoteNonce = 0;
  let anchorNote: Note | undefined;
  for (let index = 0; index < MAX_NOTE_SCAN; index += 1) {
    const noteId = computeNoteId(selfChannelKey, VEIL_REPLAY_TOKEN_ADDRESS, index);
    const response = await input.provider.callContract({
      contractAddress: feltHex(input.poolAddress),
      entrypoint: "get_note",
      calldata: [feltHex(noteId)],
    }, input.blockIdentifier);
    if (response.length !== 2) {
      throw new Error("Privacy Pool returned invalid replay-note information.");
    }
    const packedValue = BigInt(response[0]!);
    if (packedValue === 0n) break;
    nextNoteNonce = index + 1;
    const spent = await readBoolean({
      provider: input.provider,
      poolAddress: input.poolAddress,
      entrypoint: "nullifier_exists",
      calldata: [feltHex(computeNullifier({
        channelKey: selfChannelKey,
        token: VEIL_REPLAY_TOKEN_ADDRESS,
        index,
        ownerViewingKey: input.viewingKey,
      }))],
      blockIdentifier: input.blockIdentifier,
    });
    if (spent) continue;
    const salt = packedValue / TWO_POW_128;
    if (salt <= 1n) continue;
    const encryptedAmount = packedValue % TWO_POW_128;
    const pad = computeEncryptedAmountPad({
      channelKey: selfChannelKey,
      token: VEIL_REPLAY_TOKEN_ADDRESS,
      index,
      salt,
    }) % TWO_POW_128;
    const amount = (encryptedAmount + TWO_POW_128 - pad) % TWO_POW_128;
    if (amount !== VEIL_REPLAY_ANCHOR_AMOUNT) continue;
    anchorNote = {
      id: noteId,
      amount,
      witness: new Witness(selfChannelKey, index, salt),
      sender: input.accountAddress,
    };
  }
  return {
    selfChannelExists: true,
    tokenSubchannelExists: true,
    selfChannelKey,
    selfChannelMarker,
    tokenIndex,
    nextNoteNonce,
    ...(anchorNote === undefined ? {} : { anchorNote }),
  };
}

export async function readOutgoingChannelCount(input: {
  provider: ShieldedMessageChainProvider;
  poolAddress: bigint;
  senderAddress: bigint;
  senderViewingKey: bigint;
  blockIdentifier: ProvingBlockId;
}): Promise<number> {
  for (let index = 0; index < MAX_OUTGOING_CHANNEL_SCAN; index += 1) {
    const response = await input.provider.callContract({
      contractAddress: feltHex(input.poolAddress),
      entrypoint: "get_outgoing_channel_info",
      calldata: [feltHex(computeOutgoingChannelId(
        input.senderAddress,
        input.senderViewingKey,
        index,
      ))],
    }, input.blockIdentifier);
    if (response.length !== 2) {
      throw new Error("Privacy Pool returned invalid outgoing-channel information.");
    }
    if (BigInt(response[0]!) === 0n) return index;
  }
  throw new Error("Outgoing-channel count exceeded the replay-anchor safety limit.");
}

export interface VeilReplayRegistryInput {
  senderAddress: bigint;
  senderViewingKey: bigint;
  senderPublicKey: bigint;
  recipientAddress: bigint;
  recipientPublicKey: bigint;
  direction: VeilDirectionChannelState;
  anchor: VeilReplayAnchorState;
}

export function createReplayRegistry(input: VeilReplayRegistryInput): PrivateRegistry {
  const registry = createEmptyRegistry();
  if (input.direction.exists) {
    registry.channels.set(
      input.recipientAddress,
      new Channel(input.recipientPublicKey, input.direction.channelKey),
    );
  }
  if (input.anchor.selfChannelExists) {
    const tokens: Array<[
      bigint,
      { tokenIndex: number; noteNonce: number },
    ]> = [];
    if (input.anchor.tokenSubchannelExists
        && input.anchor.tokenIndex !== undefined) {
      tokens.push([
        VEIL_REPLAY_TOKEN_ADDRESS,
        {
          tokenIndex: input.anchor.tokenIndex,
          noteNonce: input.anchor.nextNoteNonce,
        },
      ]);
    }
    registry.channels.set(
      input.senderAddress,
      new Channel(input.senderPublicKey, input.anchor.selfChannelKey, tokens),
    );
  }
  if (input.anchor.anchorNote) {
    registry.notes.set(VEIL_REPLAY_TOKEN_ADDRESS, [input.anchor.anchorNote]);
  }
  return registry;
}

export class VeilReplaySnapshotDiscoveryProvider
implements DiscoveryProviderInterface {
  readonly #senderAddress: bigint;
  readonly #senderViewingKey: bigint;
  readonly #senderPublicKey: bigint;
  readonly #recipientAddress: bigint;
  readonly #recipientPublicKey: bigint;
  readonly #registry: PrivateRegistry;
  readonly #outgoingChannelCount: number;
  readonly #blockIdentifier: ProvingBlockId;

  constructor(input: VeilReplayRegistryInput & {
    registry: PrivateRegistry;
    outgoingChannelCount: number;
    blockIdentifier: ProvingBlockId;
  }) {
    this.#senderAddress = input.senderAddress;
    this.#senderViewingKey = input.senderViewingKey;
    this.#senderPublicKey = input.senderPublicKey;
    this.#recipientAddress = input.recipientAddress;
    this.#recipientPublicKey = input.recipientPublicKey;
    this.#registry = input.registry;
    this.#outgoingChannelCount = input.outgoingChannelCount;
    this.#blockIdentifier = input.blockIdentifier;
  }

  async discoverRequirement(
    ..._args: Parameters<DiscoveryProviderInterface["discoverRequirement"]>
  ): ReturnType<DiscoveryProviderInterface["discoverRequirement"]> {
    throw new Error("Replay-anchor PoC does not use discoverRequirement.");
  }

  async discoverNotes(
    address: bigint,
    viewingKey: bigint,
    params?: Parameters<DiscoveryProviderInterface["discoverNotes"]>[2],
  ): ReturnType<DiscoveryProviderInterface["discoverNotes"]> {
    this.#assertIdentity(address, viewingKey, params?.blockIdentifier);
    const notes = new AddressMap<Note[]>(() => []);
    const requested = params?.tokens;
    for (const [token, tokenNotes] of this.#registry.notes.entries()) {
      if (requested && requested.length > 0 && !requested.includes(token)) continue;
      notes.set(token, [...tokenNotes]);
    }
    return {
      timestamp: this.#blockIdentifier,
      notes,
      cursor: {
        blockId: this.#blockIdentifier,
        incomingChannels: new AddressMap(),
      },
    };
  }

  async discoverChannels(
    address: bigint,
    viewingKey: bigint,
    recipients: Parameters<DiscoveryProviderInterface["discoverChannels"]>[2],
    params?: Parameters<DiscoveryProviderInterface["discoverChannels"]>[3],
  ): ReturnType<DiscoveryProviderInterface["discoverChannels"]> {
    this.#assertIdentity(address, viewingKey, params?.blockIdentifier);
    if (recipients === "total-only") {
      return {
        timestamp: this.#blockIdentifier,
        total: this.#outgoingChannelCount,
      };
    }
    if (recipients === "all") {
      throw new Error("Unbounded replay-anchor channel discovery is not allowed.");
    }
    const channels = new AddressMap<Channel>();
    for (const recipient of recipients) {
      const existing = this.#registry.channels.get(recipient);
      if (existing) {
        channels.set(recipient, existing.clone());
        continue;
      }
      if (recipient === this.#senderAddress) {
        channels.set(recipient, new Channel(this.#senderPublicKey));
        continue;
      }
      if (recipient === this.#recipientAddress) {
        channels.set(recipient, new Channel(this.#recipientPublicKey));
        continue;
      }
      throw new Error("Replay-anchor discovery requested an unexpected recipient.");
    }
    return {
      timestamp: this.#blockIdentifier,
      channels,
    };
  }

  #assertIdentity(
    address: bigint,
    viewingKey: bigint,
    blockIdentifier: ProvingBlockId | undefined,
  ): void {
    if (address !== this.#senderAddress || viewingKey !== this.#senderViewingKey) {
      throw new Error("Replay-anchor discovery sender identity mismatch.");
    }
    if (blockIdentifier !== undefined
        && String(blockIdentifier) !== String(this.#blockIdentifier)) {
      throw new Error("Replay-anchor discovery block mismatch.");
    }
  }
}
