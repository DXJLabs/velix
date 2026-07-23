import assert from "node:assert/strict";
import test from "node:test";

import { Witness } from "@starkware-libs/starknet-privacy-sdk";
import { ec } from "starknet";

import {
  VEIL_REPLAY_ANCHOR_AMOUNT,
  VEIL_REPLAY_TOKEN_ADDRESS,
  VeilReplaySnapshotDiscoveryProvider,
  createReplayRegistry,
  discoverDirectionChannel,
  discoverReplayAnchor,
} from "../../../tools/veil-replay-anchor.ts";

const POOL = 0x123n;
const SENDER = 0x456n;
const RECIPIENT = 0x789n;
const SENDER_VIEWING_KEY = 0x111n;
const RECIPIENT_VIEWING_KEY = 0x222n;
const SENDER_PUBLIC_KEY = BigInt(
  ec.starkCurve.getStarkKey(`0x${SENDER_VIEWING_KEY.toString(16)}`),
);
const RECIPIENT_PUBLIC_KEY = BigInt(
  ec.starkCurve.getStarkKey(`0x${RECIPIENT_VIEWING_KEY.toString(16)}`),
);
const BLOCK = 123;

test("missing direction channel uses the current recipient append index", async () => {
  const provider = {
    async callContract(call) {
      if (call.entrypoint === "channel_exists") return ["0x0"];
      if (call.entrypoint === "get_num_of_channels") return ["0x5"];
      throw new Error(`unexpected entrypoint ${call.entrypoint}`);
    },
  };

  const result = await discoverDirectionChannel({
    provider,
    poolAddress: POOL,
    senderAddress: SENDER,
    senderViewingKey: SENDER_VIEWING_KEY,
    recipientAddress: RECIPIENT,
    recipientViewingKey: RECIPIENT_VIEWING_KEY,
    recipientPublicKey: RECIPIENT_PUBLIC_KEY,
    blockIdentifier: BLOCK,
  });

  assert.equal(result.exists, false);
  assert.equal(result.recipientChannelIndex, 5);
  assert.notEqual(result.channelKey, 0n);
  assert.notEqual(result.channelMarker, 0n);
});

test("missing replay self-channel produces a clean bootstrap state", async () => {
  const provider = {
    async callContract(call) {
      assert.equal(call.entrypoint, "channel_exists");
      return ["0x0"];
    },
  };

  const result = await discoverReplayAnchor({
    provider,
    poolAddress: POOL,
    accountAddress: SENDER,
    viewingKey: SENDER_VIEWING_KEY,
    publicKey: SENDER_PUBLIC_KEY,
    blockIdentifier: BLOCK,
  });

  assert.deepEqual(
    {
      selfChannelExists: result.selfChannelExists,
      tokenSubchannelExists: result.tokenSubchannelExists,
      nextNoteNonce: result.nextNoteNonce,
      anchorNote: result.anchorNote,
    },
    {
      selfChannelExists: false,
      tokenSubchannelExists: false,
      nextNoteNonce: 0,
      anchorNote: undefined,
    },
  );
});

test("replay registry contains only the pinned direction and private anchor", async () => {
  const direction = {
    exists: true,
    recipientChannelIndex: 2,
    channelKey: 0xabcn,
    channelMarker: 0xdefn,
  };
  const anchorNote = {
    id: 0x999n,
    amount: VEIL_REPLAY_ANCHOR_AMOUNT,
    witness: new Witness(0x777n, 4, 0x555n),
    sender: SENDER,
  };
  const anchor = {
    selfChannelExists: true,
    tokenSubchannelExists: true,
    selfChannelKey: 0x777n,
    selfChannelMarker: 0x888n,
    tokenIndex: 0,
    nextNoteNonce: 5,
    anchorNote,
  };

  const registry = createReplayRegistry({
    senderAddress: SENDER,
    senderViewingKey: SENDER_VIEWING_KEY,
    senderPublicKey: SENDER_PUBLIC_KEY,
    recipientAddress: RECIPIENT,
    recipientPublicKey: RECIPIENT_PUBLIC_KEY,
    direction,
    anchor,
  });

  assert.equal(registry.channels.get(RECIPIENT)?.key, direction.channelKey);
  assert.equal(registry.channels.get(SENDER)?.key, anchor.selfChannelKey);
  assert.deepEqual(registry.notes.get(VEIL_REPLAY_TOKEN_ADDRESS), [anchorNote]);

  const discovery = new VeilReplaySnapshotDiscoveryProvider({
    senderAddress: SENDER,
    senderViewingKey: SENDER_VIEWING_KEY,
    senderPublicKey: SENDER_PUBLIC_KEY,
    recipientAddress: RECIPIENT,
    recipientPublicKey: RECIPIENT_PUBLIC_KEY,
    direction,
    anchor,
    registry,
    outgoingChannelCount: 3,
    blockIdentifier: BLOCK,
  });

  const channels = await discovery.discoverChannels(
    SENDER,
    SENDER_VIEWING_KEY,
    [SENDER, RECIPIENT],
    { blockIdentifier: BLOCK },
  );
  assert.equal(channels.total, undefined);
  assert.equal(channels.channels?.get(SENDER)?.key, anchor.selfChannelKey);
  assert.equal(channels.channels?.get(RECIPIENT)?.key, direction.channelKey);

  const count = await discovery.discoverChannels(
    SENDER,
    SENDER_VIEWING_KEY,
    "total-only",
    { blockIdentifier: BLOCK },
  );
  assert.equal(count.total, 3);

  const notes = await discovery.discoverNotes(
    SENDER,
    SENDER_VIEWING_KEY,
    {
      tokens: [VEIL_REPLAY_TOKEN_ADDRESS],
      blockIdentifier: BLOCK,
    },
  );
  assert.deepEqual(notes.notes.get(VEIL_REPLAY_TOKEN_ADDRESS), [anchorNote]);
});
