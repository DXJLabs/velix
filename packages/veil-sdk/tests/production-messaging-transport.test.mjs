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
describe("VEIL onchain transport metadata and action preparation", () => {
  it("decodes helper timeline events as ciphertext-only metadata", () => {
    const decoded = decodeInvokeExternalEvent(
      {
        from_address: "0xhelper",
        keys: ["0xselector", "123", "1", "7"],
        data: ["111", "222", "2", "1700000000"],
        transaction_hash: "0xtx",
        block_number: 77,
      },
      { helperAddress: "0xhelper" },
    );

    assert.equal(decoded?.name, "TimelineEventStored");
    assert.equal(decoded?.category, "timeline");
    assert.equal(decoded?.fields.find((field) => field.name === "encrypted_payload")?.value, "111");
    assert.equal(decoded?.fields.find((field) => field.name === "payload_hash")?.value, "222");
    assert.equal(decoded?.fields.find((field) => field.name === "payload_chunk_count")?.value, "2");
    assert.equal(decoded?.fields.find((field) => field.name === "created_at")?.value, "1700000000");
    assert.equal(decoded?.fields.some((field) => field.name === "plaintext"), false);

    const chunk = decodeInvokeExternalEvent(
      {
        from_address: "0xhelper",
        keys: ["0xchunkselector", "123", "7", "0"],
        data: ["999"],
      },
      { helperAddress: "0xhelper" },
    );
    assert.equal(chunk?.name, "TimelinePayloadChunkStored");
    assert.equal(chunk?.fields.find((field) => field.name === "chunk")?.value, "999");

    const timeline = timelineItemsFromDecodedEvents([decoded, chunk], { channelId: "123", mode: "shield" });
    assert.equal(timeline.length, 1);
    assert.equal(timeline[0].encryptedPayload, "111");
    assert.equal(timeline[0].payloadHash, "222");
    assert.equal(timeline[0].payloadChunkCount, 1);
    assert.deepEqual(timeline[0].payloadChunks, ["999"]);
    assert.equal(timeline[0].transactionHash, "0xtx");
    assert.equal(timeline[0].blockNumber, 77);
    assert.equal(timeline[0].mode, "shield");
    assert.equal(timeline[0].status, "confirmed");
  });

  it("prepares canonical Privacy Pool ClientAction calldata for channel creation", () => {
    const actions = buildPrivacyPoolChannelActions({
      setViewingKey: { random: "11" },
      openChannel: {
        recipientAddress: "0xabc",
        index: 0,
        random: "22",
        salt: "33",
      },
      openSubchannel: {
        recipientAddress: "0xabc",
        recipientPublicKey: "44",
        channelKey: "55",
        index: 0,
        token: "0x123",
        salt: "66",
      },
    });

    assert.deepEqual(
      encodeClientActions(actions),
      [
        "3",
        "0",
        "11",
        "1",
        "0xabc",
        "0",
        "22",
        "33",
        "2",
        "0xabc",
        "44",
        "55",
        "0",
        "0x123",
        "66",
      ],
    );
    assert.deepEqual(
      prepareCompileActionsCalldata({
        userAddress: "0xaaa",
        userPrivateKey: "777",
        actions,
      }),
      [
        "0xaaa",
        "777",
        "3",
        "0",
        "11",
        "1",
        "0xabc",
        "0",
        "22",
        "33",
        "2",
        "0xabc",
        "44",
        "55",
        "0",
        "0x123",
        "66",
      ],
    );
  });

  it("rejects Privacy Pool action batches without replay protection", () => {
    const invokeOnly = [
      invokeExternalAction({
        contractAddress: "0xhelper",
        calldata: ["1", "1", "111", "222"],
      }),
    ];

    assert.equal(analyzeClientActionBatch(invokeOnly).hasReplayProtection, false);
    assert.throws(
      () => assertValidClientActionBatch(invokeOnly),
      /replay-protection/i,
    );
  });

  it("real Privacy Pool adapter prepares official ClientAction payloads without submitting", async () => {
    const adapter = new RealPrivacyPoolAdapter();

    const open = await adapter.openChannel({
      recipientAddress: "0xbob",
      index: 0,
      random: "99",
      salt: "100",
    });
    assert.equal(open.adapterMode, "real");
    assert.equal(open.action, "OpenChannel");
    assert.equal(open.hasReplayProtection, true);
    assert.deepEqual(open.encodedClientActions, ["1", "1", "0xbob", "0", "99", "100"]);

    const invoke = await adapter.prepareInvokeExternal({
      contractAddress: "0xhelper",
      calldata: ["123", "1", "111", "222", "0"],
    });
    assert.equal(invoke.hasReplayProtection, false);
    assert.deepEqual(invoke.encodedClientActions, [
      "1",
      "8",
      "0xhelper",
      "5",
      "123",
      "1",
      "111",
      "222",
      "0",
    ]);
  });

  it("passes canonical replay-protected InvokeExternal ClientAction data to the legacy Starknet Privacy builder", async () => {
    let builderInput;
    const transport = new StarknetPrivacyPoolTransport({
      privacyPoolAddress: "0xpool",
      helperAddress: "0xhelper",
      waitForConfirmation: false,
      provider: createFeeProvider(),
      privateFeeBalance: "10",
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
          builderInput = input;
          return { transaction: { kind: "privacy-pool-apply" } };
        },
      },
      paymaster: {
        async executeTransaction(transaction) {
          assert.deepEqual(transaction, { kind: "privacy-pool-apply" });
          return { transaction_hash: "0xshield" };
        },
      },
    });

    const item = await transport.invokeExternal({
      privacyPoolAddress: "0xpool",
      helperAddress: "0xhelper",
      mode: "shield",
      calldata: [],
      privacyPool: {
        createEncNote: {
          recipientAddress: "0xbob",
          recipientPublicKey: "44",
          token: "0x123",
          amount: "0",
          index: 0,
          salt: "66",
        },
      },
      item: {
        eventId: "0",
        channelId: "123",
        eventType: 1,
        encryptedPayload: "111",
        payloadHash: "222",
        nonce: "nonce",
        timestamp: Date.now(),
      },
    });

    assert.equal(item.transactionHash, "0xshield");
    assert.equal(item.status, "pending");
    assert.equal(builderInput.clientActions[0].type, "CreateEncNote");
    assert.equal(builderInput.clientActions[1].type, "InvokeExternal");
    assert.deepEqual(builderInput.helperCalldata, ["123", "1", "111", "222", "0"]);
    assert.deepEqual(builderInput.encodedClientActions, [
      "2",
      "3",
      "0xbob",
      "44",
      "0x123",
      "0",
      "0",
      "66",
      "8",
      "0xhelper",
      "5",
      "123",
      "1",
      "111",
      "222",
      "0",
    ]);
    assert.equal(builderInput.actionBatch.hasReplayProtection, true);
    assert.equal(builderInput.feeMode, "sponsored");
    assert.equal(builderInput.feeEstimate.poolFee.feeAmount, "10");
  });

});

