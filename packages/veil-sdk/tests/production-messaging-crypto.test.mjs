import { describe, it } from "node:test";
import { assert, createFeeProvider, sdk } from "./production-messaging.helpers.mjs";

const {
  DirectHelperTransport,
  MemoryEncryptedPayloadStore,
  MemorySessionKeyStore,
  MockEncryptionAdapter,
  PRIVACY_POOL_STRK_FEE_TOKEN_ADDRESS,
  PrivacyPoolFeeError,
  RealPrivacyPoolAdapter,
  StarknetPrivacyPoolTransport,
  VeilClient,
  VeilSessionError,
  VeilSessionKeyManager,
  analyzeClientActionBatch,
  assertValidClientActionBatch,
  buildPrivacyPoolChannelActions,
  decodeInvokeExternalEvent,
  decryptMessage,
  deriveSharedSecret,
  encodeClientActions,
  encryptMessage,
  estimatePoolFee,
  estimateTotalCost,
  estimateTransactionFee,
  generateEcdhKeyPair,
  getFeeInfo,
  getSupportedFeeModes,
  invokeExternalAction,
  timelineItemsFromDecodedEvents,
  prepareCompileActionsCalldata,
  validateTimelineNonces,
} = sdk;
describe("VEIL production messaging crypto", () => {
  it("derives matching HKDF keys from Privacy Pool secret material and decrypts locally", async () => {
    const channelId = "rights-transfer";
    const aliceKey = await deriveSharedSecret({
      privacyPoolSharedSecret: "123456789987654321",
      channelId,
    });
    const bobKey = await deriveSharedSecret({
      privacyPoolSharedSecret: "123456789987654321",
      channelId,
    });

    const encrypted = await encryptMessage({
      payload: { kind: "chat", message: "encrypted onchain only", sender: "you" },
      key: aliceKey,
      context: { channelId, eventType: 1 },
      payloadStore: new MemoryEncryptedPayloadStore(),
    });
    const decrypted = await decryptMessage({
      item: {
        eventId: "1",
        channelId,
        eventType: 1,
        encryptedPayload: encrypted.encryptedPayload,
        payloadHash: encrypted.payloadHash,
        nonce: encrypted.nonce,
        payloadChunks: encrypted.payloadChunks,
        timestamp: Date.now(),
      },
      key: bobKey,
      context: { channelId, eventType: 1 },
      payloadStore: new MemoryEncryptedPayloadStore(),
    });

    assert.equal(decrypted?.kind, "chat");
    assert.equal(decrypted?.message, "encrypted onchain only");
    assert.ok(encrypted.nonce);
    assert.notEqual(encrypted.encryptedPayload, "encrypted onchain only");
  });

  it("fails closed instead of generating a non-Privacy-Pool ECDH key pair", async () => {
    await assert.rejects(
      () => generateEcdhKeyPair(),
      /official STRK20 Privacy Pool/i,
    );
    await assert.rejects(
      () => deriveSharedSecret({ channelId: "rights-transfer" }),
      /official STRK20 protocol/i,
    );
  });

  it("rejects duplicate nonces in a channel timeline", () => {
    const base = {
      eventType: 1,
      encryptedPayload: "123",
      payloadHash: "456",
      timestamp: Date.now(),
      nonce: "same-nonce",
      mode: "unshield",
    };

    assert.throws(
      () => validateTimelineNonces([
        { ...base, eventId: "1", channelId: "a" },
        { ...base, eventId: "2", channelId: "a" },
      ]),
      /duplicate nonce/i,
    );
  });
});

describe("VEIL scoped session keys", () => {
  it("allows chat-scoped sessions and expires them", async () => {
    let now = 1_000;
    const manager = new VeilSessionKeyManager({
      store: new MemorySessionKeyStore(),
      now: () => now,
    });

    await manager.createSession({
      publicKey: "session-pubkey",
      permissions: ["MESSAGE_SEND", "OFFER_CREATE", "MEMO_SEND", "NEGOTIATION_METADATA"],
      channelIds: ["rights-transfer"],
      expiresAt: 2_000,
    });

    assert.ok(await manager.requirePermission("MESSAGE_SEND", { channelId: "rights-transfer" }));
    now = 2_001;
    await assert.rejects(
      () => manager.requirePermission("MESSAGE_SEND", { channelId: "rights-transfer" }),
      (error) => error instanceof VeilSessionError && error.code === "SESSION_EXPIRED",
    );
  });

  it("rejects unsupported financial permissions", async () => {
    const manager = new VeilSessionKeyManager({
      store: new MemorySessionKeyStore(),
      now: () => 1_000,
    });

    await assert.rejects(
      () =>
        manager.createSession({
          publicKey: "session-pubkey",
          permissions: ["ESCROW_UPDATE"],
          channelIds: ["rights-transfer"],
          expiresAt: 2_000,
        }),
      (error) => error instanceof VeilSessionError && error.code === "SESSION_INVALID_PERMISSION",
    );
  });
});

