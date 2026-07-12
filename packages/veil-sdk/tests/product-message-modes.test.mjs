import { describe, it } from "node:test";
import { createRuntimeConfig, normalizeTimelineMode } from "../../../src/app/runtime-config.js";
import { encryptionRegistrationErrorMessage } from "../../../src/app/events/click-events.js";
import { createDealStorage } from "../../../src/services/storage/deal-storage.js";
import { assert, sdk } from "./production-messaging.helpers.mjs";

const {
  ChannelEncryptionAdapter,
  DirectHelperTransport,
  MemoryEncryptedPayloadStore,
  VeilClient,
  deriveMessageKey,
  derivePrivacyPublicKey,
  deriveReceiverSharedX,
  deriveSenderSharedX,
  feltChunksToString,
  hashToFelt,
  stringToFeltChunks,
} = sdk;

describe("production-safe VEIL message modes", () => {
  it("sanitizes raw registration RPC errors before showing them in Settings", () => {
    const raw = 'RPC: starknet_addInvokeTransaction {"invoke_transaction":{"signature":["secret-sized-payload"]}} Out of gas';
    const message = encryptionRegistrationErrorMessage(new Error(raw));
    assert.equal(message, "Wallet gas estimate was too low. Please retry registration.");
    assert.equal(message.includes("invoke_transaction"), false);
  });

  it("defaults production messaging to encrypted-direct", () => {
    assert.equal(normalizeTimelineMode("", { MODE: "production" }), "encrypted-direct");
    assert.equal(normalizeTimelineMode("direct-helper", { MODE: "production" }), "encrypted-direct");
    assert.equal(normalizeTimelineMode("privacy-pool", { MODE: "production" }), "strk20-shielded");
    const config = createRuntimeConfig({ MODE: "production", DEV: false }, "");
    assert.equal(config.timelineMode, "encrypted-direct");
  });

  it("accepts a registry only when its explicit chain matches runtime", () => {
    const address = "0x123";
    const matching = createRuntimeConfig({
      VITE_STARKNET_CHAIN_ID: "SN_SEPOLIA",
      VITE_VEIL_KEY_REGISTRY_ADDRESS: address,
      VITE_VEIL_KEY_REGISTRY_CHAIN_ID: "SN_SEPOLIA",
    }, "");
    assert.equal(matching.encryptionKeyRegistryAddress, address);

    const wrongChain = createRuntimeConfig({
      VITE_STARKNET_CHAIN_ID: "SN_MAIN",
      VITE_VEIL_KEY_REGISTRY_ADDRESS: address,
      VITE_VEIL_KEY_REGISTRY_CHAIN_ID: "SN_SEPOLIA",
    }, "");
    assert.equal(wrongChain.encryptionKeyRegistryAddress, "");

    const zero = createRuntimeConfig({
      VITE_STARKNET_CHAIN_ID: "SN_SEPOLIA",
      VITE_VEIL_KEY_REGISTRY_ADDRESS: "0x0",
      VITE_VEIL_KEY_REGISTRY_CHAIN_ID: "SN_SEPOLIA",
    }, "");
    assert.equal(zero.encryptionKeyRegistryAddress, "");
  });

  it("encrypts before direct submission and excludes plaintext from helper calldata", async () => {
    const plaintext = "private direct message sentinel";
    let transportInput;
    const transport = {
      supportedModes: ["encrypted-direct"],
      async invokeExternal(input) {
        transportInput = input;
        return { ...input.item, transactionHash: "0xdirect", status: "confirmed" };
      },
      async getEventCount() { return 0; },
      async getEvent() { throw new Error("not used"); },
      async getTimeline() { return []; },
    };
    const client = new VeilClient({
      privacyPoolAddress: "0xpool",
      helperAddress: "0xhelper",
      rpcUrl: "http://localhost",
      encryption: new ChannelEncryptionAdapter({ channelKey: new Uint8Array(32).fill(7) }),
      transport,
    });

    const item = await client.sendMessage({ channelId: "channel-1", message: plaintext });

    assert.equal(item.mode, "encrypted-direct");
    assert.equal(transportInput.mode, "encrypted-direct");
    assert.equal(transportInput.privacyPool, undefined);
    assert.ok(transportInput.item.payloadChunks.length > 0);
    assert.equal(JSON.stringify(transportInput.calldata).includes(plaintext), false);
    assert.equal(JSON.stringify(transportInput.item).includes(plaintext), false);
  });

  it("fails closed for STRK20 without invoking transport or falling back", async () => {
    let transportCalls = 0;
    const client = new VeilClient({
      privacyPoolAddress: "0xpool",
      helperAddress: "0xhelper",
      rpcUrl: "http://localhost",
      encryption: new ChannelEncryptionAdapter({ channelKey: new Uint8Array(32).fill(9) }),
      transport: {
        supportedModes: ["encrypted-direct"],
        async invokeExternal() { transportCalls += 1; throw new Error("must not run"); },
        async getEventCount() { return 0; },
        async getEvent() { throw new Error("not used"); },
        async getTimeline() { return []; },
      },
    });

    await assert.rejects(
      () => client.sendMessage({ channelId: "channel-1", message: "secret", mode: "strk20-shielded" }),
      (error) => error.code === "STRK20_RUNTIME_UNAVAILABLE"
        && error.message === "Shielded messaging via STRK20 is coming soon.",
    );
    assert.equal(transportCalls, 0);
  });

  it("roundtrips two isolated Stark ECDH users through the direct helper boundary", async () => {
    const plaintext = "two-device encrypted message sentinel";
    const channelId = "two-party-channel";
    const recipientPrivateKey = "987654321";
    const recipientPublicKey = derivePrivacyPublicKey(recipientPrivateKey);
    const sender = deriveSenderSharedX("55555555", recipientPublicKey);
    const receiverSharedX = deriveReceiverSharedX(recipientPrivateKey, sender.ephemeralPublicKey);
    assert.equal(sender.sharedX, receiverSharedX);

    const senderKey = await deriveMessageKey({ channelKey: sender.sharedX, channelId });
    const receiverKey = await deriveMessageKey({ channelKey: receiverSharedX, channelId });
    const wrongKey = await deriveMessageKey({
      channelKey: deriveReceiverSharedX("123456789", sender.ephemeralPublicKey),
      channelId,
    });
    const senderEncryption = new ChannelEncryptionAdapter({ channelKey: senderKey, payloadStore: new MemoryEncryptedPayloadStore() });
    const receiverEncryption = new ChannelEncryptionAdapter({ channelKey: receiverKey, payloadStore: new MemoryEncryptedPayloadStore() });
    const unrelatedEncryption = new ChannelEncryptionAdapter({ channelKey: wrongKey, payloadStore: new MemoryEncryptedPayloadStore() });
    let helperCalls;
    const transport = new DirectHelperTransport({
      helperAddress: "0xhelper",
      waitForConfirmation: false,
      account: {
        async execute(calls) {
          helperCalls = calls;
          return { transaction_hash: "0xtwo-party" };
        },
      },
    });
    const client = new VeilClient({
      privacyPoolAddress: "0xpool",
      helperAddress: "0xhelper",
      rpcUrl: "http://localhost",
      encryption: senderEncryption,
      transport,
    });

    const first = await client.sendMessage({ channelId, sender: "alice", message: plaintext });
    const second = await client.sendMessage({ channelId, sender: "alice", message: "second message" });
    assert.equal(first.mode, "encrypted-direct");
    assert.equal(JSON.stringify(helperCalls).includes(plaintext), false);
    assert.equal(first.transactionHash, "0xtwo-party");
    assert.notEqual(first.nonce, second.nonce);

    const recovered = await receiverEncryption.decryptPayload(first, { channelId, eventType: 1 });
    assert.equal(recovered.message, plaintext);
    await assert.rejects(
      () => unrelatedEncryption.decryptPayload(first, { channelId, eventType: 1 }),
      /operation failed|decrypt|hash mismatch/i,
    );

    const tamperedEnvelope = JSON.parse(feltChunksToString(first.payloadChunks));
    tamperedEnvelope.ciphertext = `${tamperedEnvelope.ciphertext[0] === "A" ? "B" : "A"}${tamperedEnvelope.ciphertext.slice(1)}`;
    tamperedEnvelope.envelopeHash = await hashToFelt(`veil:ciphertext:${tamperedEnvelope.ciphertext}`);
    tamperedEnvelope.payloadHash = tamperedEnvelope.envelopeHash;
    await assert.rejects(
      () => new ChannelEncryptionAdapter({ channelKey: receiverKey, payloadStore: new MemoryEncryptedPayloadStore() }).decryptPayload({
        ...first,
        envelopeHash: tamperedEnvelope.envelopeHash,
        payloadChunks: stringToFeltChunks(JSON.stringify(tamperedEnvelope)),
      }, { channelId, eventType: 1 }),
      /operation failed|decrypt/i,
    );

    const wrongNonceEnvelope = JSON.parse(feltChunksToString(first.payloadChunks));
    wrongNonceEnvelope.nonce = "AAAAAAAAAAAAAAAA";
    await assert.rejects(
      () => new ChannelEncryptionAdapter({ channelKey: receiverKey, payloadStore: new MemoryEncryptedPayloadStore() }).decryptPayload({
        ...first,
        payloadChunks: stringToFeltChunks(JSON.stringify(wrongNonceEnvelope)),
      }, { channelId, eventType: 1 }),
      /operation failed|decrypt/i,
    );
  });

  it("does not persist plaintext channel previews or message bodies", () => {
    let persisted;
    const storage = createDealStorage({
      channels: [{ id: "local", local: true, title: "Deal", last: "plaintext preview" }],
      messages: { local: [{ type: "message", body: "plaintext body", status: "confirmed" }] },
      readJsonStorage: () => [],
      writeJsonStorage: (_key, value) => { persisted = value; },
      logger: { veilError() {} },
    });
    storage.saveLocalChannels();
    assert.equal(JSON.stringify(persisted).includes("plaintext preview"), false);
    assert.equal(JSON.stringify(persisted).includes("plaintext body"), false);
    assert.equal(persisted[0].messages[0].status, "confirmed");
  });
});
