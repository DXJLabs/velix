import { describe, it } from "node:test";
import { createRuntimeConfig } from "../../../src/app/runtime-config.js";
import { assert, sdk } from "./production-messaging.helpers.mjs";

const {
  MemoryEncryptedPayloadStore,
  PrivacyPoolChannelBootstrapEncryptionAdapter,
  StarknetPrivacyPoolTransport,
  VeilClient,
  VeilEventType,
  computePrivacyPoolChannelKey,
  computePrivacyPoolChannelMarker,
} = sdk;

const MATERIAL = {
  senderAddress: "703710",
  senderPrivacyScalar: "123456789",
  recipientAddress: "74565",
  recipientPrivateKey: "987654321",
  recipientPublicKey: "2926129818382058060292797586226983168500087817366526668609240955782226185378",
  channelIndex: "7",
  channelSalt: "4444",
  ephemeralSecret: "55555555",
};

const CONTEXT = { channelId: "phase3-channel", eventType: VeilEventType.CHAT };

function referenceChannel() {
  const channelKey = computePrivacyPoolChannelKey({
    senderAddress: MATERIAL.senderAddress,
    senderPrivateKey: MATERIAL.senderPrivacyScalar,
    recipientAddress: MATERIAL.recipientAddress,
    recipientPublicKey: MATERIAL.recipientPublicKey,
  });
  return {
    channelKey,
    channelMarker: computePrivacyPoolChannelMarker({
      channelKey,
      senderAddress: MATERIAL.senderAddress,
      recipientAddress: MATERIAL.recipientAddress,
      recipientPublicKey: MATERIAL.recipientPublicKey,
    }),
  };
}

function replayProtection(index = "0") {
  return {
    createEncNote: {
      recipientAddress: MATERIAL.recipientAddress,
      recipientPublicKey: MATERIAL.recipientPublicKey,
      token: "0x123",
      amount: "0",
      index,
      salt: "66",
    },
  };
}

function providerFixture() {
  return {
    async callContract(call) {
      if (call.entrypoint === "get_fee_amount") return ["10"];
      if (call.entrypoint === "get_fee_collector") return ["0xfee"];
      return [];
    },
    async waitForTransaction() {
      return { status: "ACCEPTED_ON_L2", block_number: 111 };
    },
  };
}

function itemFromEncrypted(encrypted) {
  return {
    eventId: "0",
    channelId: CONTEXT.channelId,
    eventType: CONTEXT.eventType,
    encryptedPayload: encrypted.encryptedPayload,
    payloadHash: encrypted.payloadHash,
    envelopeHash: encrypted.envelopeHash,
    nonce: encrypted.nonce,
    payloadChunks: encrypted.payloadChunks,
    timestamp: 1_700_000_000_000,
    mode: "shield",
  };
}

describe("VEIL Phase 3 channel lifecycle", () => {
  it("first message creates an OpenChannel action and channel bootstrap metadata", async () => {
    const adapter = new PrivacyPoolChannelBootstrapEncryptionAdapter({
      payloadStore: new MemoryEncryptedPayloadStore(),
      resolveBootstrapMaterial: () => ({
        channelLifecycle: "new",
        ...MATERIAL,
      }),
    });

    const encrypted = await adapter.encryptPayload(
      { kind: "chat", sender: "alice", message: "first message" },
      CONTEXT,
    );

    assert.deepEqual(Object.keys(encrypted.privacyPool), ["openChannel"]);
    assert.equal(encrypted.privacyPool.openChannel.recipientAddress, MATERIAL.recipientAddress);
    assert.equal(encrypted.privacyPool.openChannel.index, MATERIAL.channelIndex);
    assert.equal(encrypted.privacyPool.openChannel.random, MATERIAL.ephemeralSecret);
    assert.equal(encrypted.privacyPool.openChannel.salt, MATERIAL.channelSalt);
    assert.ok(encrypted.channelBootstrap?.encChannelInfo?.ephemeralPubkey);
  });

  it("subsequent messages use existing channel material and do not attach OpenChannel", async () => {
    const channel = referenceChannel();
    const adapter = new PrivacyPoolChannelBootstrapEncryptionAdapter({
      payloadStore: new MemoryEncryptedPayloadStore(),
      resolveBootstrapMaterial: () => ({
        channelLifecycle: "existing",
        ...MATERIAL,
        channelKey: channel.channelKey,
        channelMarker: channel.channelMarker,
        replayProtection: replayProtection("1"),
      }),
    });

    const encrypted = await adapter.encryptPayload(
      { kind: "chat", sender: "alice", message: "subsequent message" },
      CONTEXT,
    );

    assert.equal(encrypted.privacyPool.openChannel, undefined);
    assert.deepEqual(encrypted.privacyPool, replayProtection("1"));
    assert.equal(encrypted.channelBootstrap, undefined);
  });

  it("subsequent messages fail closed without explicit replay protection", async () => {
    const channel = referenceChannel();
    const adapter = new PrivacyPoolChannelBootstrapEncryptionAdapter({
      payloadStore: new MemoryEncryptedPayloadStore(),
      resolveBootstrapMaterial: () => ({
        channelLifecycle: "existing",
        ...MATERIAL,
        channelKey: channel.channelKey,
        channelMarker: channel.channelMarker,
      }),
    });

    await assert.rejects(
      () =>
        adapter.encryptPayload(
          { kind: "chat", sender: "alice", message: "missing replay protection" },
          CONTEXT,
        ),
      /replay-protection/i,
    );
  });

  it("subsequent messages reject accidental OpenChannel replay protection", async () => {
    const channel = referenceChannel();
    const adapter = new PrivacyPoolChannelBootstrapEncryptionAdapter({
      payloadStore: new MemoryEncryptedPayloadStore(),
      resolveBootstrapMaterial: () => ({
        channelLifecycle: "existing",
        ...MATERIAL,
        channelKey: channel.channelKey,
        channelMarker: channel.channelMarker,
        replayProtection: {
          openChannel: {
            recipientAddress: MATERIAL.recipientAddress,
            index: MATERIAL.channelIndex,
            random: MATERIAL.ephemeralSecret,
            salt: MATERIAL.channelSalt,
          },
        },
      }),
    });

    await assert.rejects(
      () => adapter.encryptPayload({ kind: "chat", sender: "alice", message: "bad lifecycle" }, CONTEXT),
      /must not include OpenChannel/i,
    );
  });

  it("subsequent message transport sequence is replay protection then InvokeExternal", async () => {
    const channel = referenceChannel();
    let captured;
    const adapter = new PrivacyPoolChannelBootstrapEncryptionAdapter({
      payloadStore: new MemoryEncryptedPayloadStore(),
      resolveBootstrapMaterial: () => ({
        channelLifecycle: "existing",
        ...MATERIAL,
        channelKey: channel.channelKey,
        channelMarker: channel.channelMarker,
        replayProtection: replayProtection("2"),
      }),
    });
    const transport = new StarknetPrivacyPoolTransport({
      privacyPoolAddress: "0xpool",
      helperAddress: "0xhelper",
      provider: providerFixture(),
      waitForConfirmation: false,
      readTransport: {
        async getEventCount() {
          return 0;
        },
        async getEvent() {
          throw new Error("not used");
        },
        async getTimeline() {
          return [];
        },
        async invokeExternal() {
          throw new Error("not used");
        },
      },
      actionBuilder: {
        async buildVeilMessageAction(input) {
          captured = input;
          return { execute: async () => ({ transaction_hash: "0xphase3" }) };
        },
      },
    });
    const client = new VeilClient({
      privacyPoolAddress: "0xpool",
      helperAddress: "0xhelper",
      rpcUrl: "http://localhost",
      encryption: adapter,
      transport,
    });

    const item = await client.sendMessage({
      channelId: CONTEXT.channelId,
      sender: "alice",
      message: "existing channel",
      mode: "shield",
    });

    assert.equal(item.transactionHash, "0xphase3");
    assert.equal(captured.helperCall.entrypoint, "privacy_invoke");
    assert.deepEqual(captured.clientActions.map((action) => action.type), ["CreateEncNote", "InvokeExternal"]);
    assert.equal(captured.actionBatch.hasReplayProtection, true);
    assert.equal(captured.actionBatch.invokeExternalCount, 1);
  });

  it("two independent runtime instances decrypt only with recipient material", async () => {
    const sender = new PrivacyPoolChannelBootstrapEncryptionAdapter({
      payloadStore: new MemoryEncryptedPayloadStore(),
      resolveBootstrapMaterial: () => ({
        channelLifecycle: "new",
        ...MATERIAL,
      }),
    });
    const encrypted = await sender.encryptPayload(
      { kind: "chat", sender: "alice", message: "independent receiver" },
      CONTEXT,
    );

    const receiver = new PrivacyPoolChannelBootstrapEncryptionAdapter({
      payloadStore: new MemoryEncryptedPayloadStore(),
      resolveBootstrapMaterial: () => ({
        channelLifecycle: "new",
        ...MATERIAL,
      }),
      resolveRecoveryMaterial: () => ({
        recipientPrivateKey: MATERIAL.recipientPrivateKey,
        recipientAddress: MATERIAL.recipientAddress,
        recipientPublicKey: MATERIAL.recipientPublicKey,
        expectedChannelMarker: encrypted.channelBootstrap.channelMarker,
        encChannelInfo: encrypted.channelBootstrap.encChannelInfo,
      }),
    });
    const wrongReceiver = new PrivacyPoolChannelBootstrapEncryptionAdapter({
      payloadStore: new MemoryEncryptedPayloadStore(),
      resolveBootstrapMaterial: () => ({
        channelLifecycle: "new",
        ...MATERIAL,
      }),
      resolveRecoveryMaterial: () => ({
        recipientPrivateKey: MATERIAL.senderPrivacyScalar,
        recipientAddress: MATERIAL.recipientAddress,
        recipientPublicKey: MATERIAL.recipientPublicKey,
        expectedChannelMarker: encrypted.channelBootstrap.channelMarker,
        encChannelInfo: encrypted.channelBootstrap.encChannelInfo,
      }),
    });

    const decrypted = await receiver.decryptPayload(itemFromEncrypted(encrypted), CONTEXT);
    assert.equal(decrypted.message, "independent receiver");
    await assert.rejects(
      () => wrongReceiver.decryptPayload(itemFromEncrypted(encrypted), CONTEXT),
      /channel marker validation/i,
    );
  });

  it("production runtime config defaults to encrypted direct", () => {
    const config = createRuntimeConfig(
      {
        MODE: "production",
        DEV: false,
        VITE_STARKNET_CHAIN_ID: "SN_SEPOLIA",
        VITE_VEIL_TIMELINE_MODE: "direct-helper",
      },
      "",
    );

    assert.equal(config.timelineMode, "encrypted-direct");
    assert.equal(config.expectedChainId, "SN_SEPOLIA");
    assert.notEqual(config.privacyPoolAddress, "mock-privacy-pool");
    assert.notEqual(config.helperAddress, "mock-veil-helper");
  });
});
