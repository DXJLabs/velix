import { describe, it } from "node:test";
import { createRuntimeConfig, normalizeTimelineMode } from "../../../src/app/runtime-config.js";
import { assert, sdk } from "./production-messaging.helpers.mjs";

const {
  MemoryEncryptedPayloadStore,
  PrivacyPoolChannelBootstrapEncryptionAdapter,
  StarknetPrivacyPoolTransport,
  VeilClient,
  VeilEventType,
  computePrivacyPoolChannelKey,
  computePrivacyPoolChannelMarker,
  derivePrivacyPublicKey,
  encryptChannelInfo,
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

const CONTEXT = { channelId: "phase2-channel", eventType: VeilEventType.CHAT };

function providerFixture() {
  return {
    async callContract(call) {
      if (call.entrypoint === "get_fee_amount") return ["10"];
      if (call.entrypoint === "get_fee_collector") return ["0xfee"];
      return [];
    },
    async waitForTransaction() {
      return { status: "ACCEPTED_ON_L2", block_number: 99 };
    },
  };
}

function timelineItemFromEncrypted(encrypted) {
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

function expectedChannelInfo() {
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
    encChannelInfo: encryptChannelInfo({
      ephemeralSecret: MATERIAL.ephemeralSecret,
      recipientPublicKey: MATERIAL.recipientPublicKey,
      channelKey,
      senderAddress: MATERIAL.senderAddress,
    }),
  };
}

describe("VEIL Phase 2 shielded runtime bootstrap", () => {
  it("creates Privacy Pool OpenChannel bootstrap metadata and receiver decrypts with recovered channel material", async () => {
    const senderStore = new MemoryEncryptedPayloadStore();
    const sender = new PrivacyPoolChannelBootstrapEncryptionAdapter({
      payloadStore: senderStore,
      resolveBootstrapMaterial: () => MATERIAL,
      now: () => 1_700_000_000_000,
    });

    const encrypted = await sender.encryptPayload(
      { kind: "chat", sender: "alice", message: "phase 2 shielded bootstrap" },
      CONTEXT,
    );
    const expected = expectedChannelInfo();

    assert.deepEqual(encrypted.privacyPool, {
      openChannel: {
        recipientAddress: MATERIAL.recipientAddress,
        index: MATERIAL.channelIndex,
        random: MATERIAL.ephemeralSecret,
        salt: MATERIAL.channelSalt,
      },
    });
    assert.equal(encrypted.channelBootstrap.senderAddress, MATERIAL.senderAddress);
    assert.equal(encrypted.channelBootstrap.senderPublicKey, derivePrivacyPublicKey(MATERIAL.senderPrivacyScalar));
    assert.equal(encrypted.channelBootstrap.recipientAddress, MATERIAL.recipientAddress);
    assert.equal(encrypted.channelBootstrap.recipientPublicKey, MATERIAL.recipientPublicKey);
    assert.equal(encrypted.channelBootstrap.channelMarker, expected.channelMarker);
    assert.deepEqual(encrypted.channelBootstrap.encChannelInfo, expected.encChannelInfo);

    const receiver = new PrivacyPoolChannelBootstrapEncryptionAdapter({
      payloadStore: new MemoryEncryptedPayloadStore(),
      resolveBootstrapMaterial: () => MATERIAL,
      resolveRecoveryMaterial: () => ({
        recipientPrivateKey: MATERIAL.recipientPrivateKey,
        recipientAddress: MATERIAL.recipientAddress,
        channelIndex: MATERIAL.channelIndex,
        expectedChannelMarker: expected.channelMarker,
        encChannelInfo: expected.encChannelInfo,
      }),
    });
    const decrypted = await receiver.decryptPayload(timelineItemFromEncrypted(encrypted), CONTEXT);

    assert.equal(decrypted.message, "phase 2 shielded bootstrap");
  });

  it("rejects wrong-recipient channel recovery with marker validation before AES-GCM decrypt", async () => {
    const sender = new PrivacyPoolChannelBootstrapEncryptionAdapter({
      payloadStore: new MemoryEncryptedPayloadStore(),
      resolveBootstrapMaterial: () => MATERIAL,
    });
    const encrypted = await sender.encryptPayload(
      { kind: "chat", sender: "alice", message: "wrong recipient must fail" },
      CONTEXT,
    );
    const expected = expectedChannelInfo();
    const wrongRecipient = new PrivacyPoolChannelBootstrapEncryptionAdapter({
      payloadStore: new MemoryEncryptedPayloadStore(),
      resolveBootstrapMaterial: () => MATERIAL,
      resolveRecoveryMaterial: () => ({
        recipientPrivateKey: "123456789",
        recipientAddress: MATERIAL.recipientAddress,
        channelIndex: MATERIAL.channelIndex,
        expectedChannelMarker: expected.channelMarker,
        encChannelInfo: expected.encChannelInfo,
      }),
    });

    await assert.rejects(
      () => wrongRecipient.decryptPayload(timelineItemFromEncrypted(encrypted), CONTEXT),
      /channel marker validation/i,
    );
  });

  it("wires bootstrap OpenChannel before InvokeExternal through StarknetPrivacyPoolTransport", async () => {
    let capturedActionInput;
    const encryption = new PrivacyPoolChannelBootstrapEncryptionAdapter({
      payloadStore: new MemoryEncryptedPayloadStore(),
      resolveBootstrapMaterial: () => MATERIAL,
      now: () => 1_700_000_000_000,
    });
    const transport = new StarknetPrivacyPoolTransport({
      privacyPoolAddress: "0xpool",
      helperAddress: "0xhelper",
      provider: providerFixture(),
      waitForConfirmation: true,
      confirmationTimeoutMs: 1_000,
      confirmationPollMs: 1,
      readTransport: {
        async getEventCount(channelId) {
          assert.equal(channelId, CONTEXT.channelId);
          return 0;
        },
        async getEvent(channelId, index) {
          assert.equal(channelId, CONTEXT.channelId);
          assert.equal(index, 0);
          return {
            ...capturedActionInput.item,
            eventId: "1",
            timestamp: 1_700_000_000_000,
            status: "confirmed",
            optimistic: false,
          };
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
          capturedActionInput = input;
          return { execute: async () => ({ transaction_hash: "0xphase2" }) };
        },
      },
    });
    const client = new VeilClient({
      privacyPoolAddress: "0xpool",
      helperAddress: "0xhelper",
      rpcUrl: "http://localhost",
      encryption,
      transport,
      now: () => 1_700_000_000_000,
    });

    const item = await client.sendMessage({
      channelId: CONTEXT.channelId,
      sender: "alice",
      message: "wired through privacy pool",
      mode: "shield",
    });

    assert.equal(item.transactionHash, "0xphase2");
    assert.equal(item.status, "confirmed");
    assert.equal(item.optimistic, false);
    assert.equal(item.blockNumber, 99);
    assert.equal(capturedActionInput.kind, "message");
    assert.equal(capturedActionInput.helperCall.entrypoint, "privacy_invoke");
    assert.equal(capturedActionInput.helperCall.contractAddress, "0xhelper");
    assert.deepEqual(capturedActionInput.clientActions.map((action) => action.type), ["OpenChannel", "InvokeExternal"]);
    assert.equal(capturedActionInput.actionBatch.hasReplayProtection, true);
    assert.equal(capturedActionInput.actionBatch.invokeExternalCount, 1);
    assert.equal(capturedActionInput.item.mode, "shield");
    assert.deepEqual(capturedActionInput.clientActions[0].input, {
      recipientAddress: MATERIAL.recipientAddress,
      index: MATERIAL.channelIndex,
      random: MATERIAL.ephemeralSecret,
      salt: MATERIAL.channelSalt,
    });
    assert.equal(capturedActionInput.clientActions[1].input.contractAddress, "0xhelper");
    assert.deepEqual(capturedActionInput.clientActions[1].input.calldata, capturedActionInput.helperCalldata);
  });

  it("fails closed when Privacy Pool action builder/SDK is missing", async () => {
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
    });

    await assert.rejects(
      () =>
        transport.invokeExternal({
          privacyPoolAddress: "0xpool",
          helperAddress: "0xhelper",
          mode: "shield",
          calldata: [],
          privacyPool: {
            openChannel: {
              recipientAddress: MATERIAL.recipientAddress,
              index: MATERIAL.channelIndex,
              random: MATERIAL.ephemeralSecret,
              salt: MATERIAL.channelSalt,
            },
          },
          item: {
            eventId: "0",
            channelId: CONTEXT.channelId,
            eventType: CONTEXT.eventType,
            encryptedPayload: "111",
            payloadHash: "222",
            timestamp: 1_700_000_000_000,
            mode: "shield",
          },
        }),
      /Starknet Privacy SDK integration/i,
    );
  });

  it("maps the legacy direct chat API onto encrypted-direct transport", async () => {
    let submitted;
    const client = new VeilClient({
      privacyPoolAddress: "0xpool",
      helperAddress: "0xhelper",
      rpcUrl: "http://localhost",
      encryption: {
        async encryptPayload() {
          return { encryptedPayload: "111", payloadHash: "222" };
        },
        async decryptPayload() {
          return null;
        },
      },
      transport: {
        supportedModes: ["encrypted-direct", "unshield"],
        async invokeExternal(input) {
          submitted = input;
          return { ...input.item, transactionHash: "0xdirect", status: "confirmed" };
        },
        async getEventCount() {
          return 0;
        },
        async getEvent() {
          throw new Error("not used");
        },
        async getTimeline() {
          return [];
        },
      },
    });

    await client.sendUnshieldedMessage({ channelId: CONTEXT.channelId, message: "legacy" });
    assert.equal(submitted.mode, "encrypted-direct");
  });

  it("normalizes production runtime to encrypted-direct by default", () => {
    assert.equal(normalizeTimelineMode("", {}), "encrypted-direct");
    assert.equal(normalizeTimelineMode("direct-helper", { MODE: "production", DEV: false }), "encrypted-direct");
    assert.equal(normalizeTimelineMode("privacy-pool", { MODE: "development", DEV: true }), "strk20-shielded");

    const productionConfig = createRuntimeConfig(
      {
        MODE: "production",
        DEV: false,
        VITE_STARKNET_CHAIN_ID: "SN_SEPOLIA",
        VITE_VEIL_TIMELINE_MODE: "direct-helper",
      },
      "",
    );
    assert.equal(productionConfig.timelineMode, "encrypted-direct");
  });
});
