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
describe("VEIL transport confirmation and direct helper", () => {
  it("can wait for shield transaction confirmation and helper event indexing", async () => {
    const transport = new StarknetPrivacyPoolTransport({
      privacyPoolAddress: "0xpool",
      helperAddress: "0xhelper",
      waitForConfirmation: true,
      confirmationTimeoutMs: 1_000,
      confirmationPollMs: 1,
      provider: {
        async callContract(call) {
          if (call.entrypoint === "get_fee_amount") return ["10"];
          if (call.entrypoint === "get_fee_collector") return ["0xfee"];
          return [];
        },
        async waitForTransaction() {
          return { status: "ACCEPTED_ON_L2", block_number: 77 };
        },
      },
      readTransport: {
        async getEventCount() {
          return 0;
        },
        async getEvent(channelId, index) {
          assert.equal(channelId, "123");
          assert.equal(index, 0);
          return {
            eventId: "1",
            channelId,
            eventType: 1,
            encryptedPayload: "111",
            payloadHash: "222",
            timestamp: 1700000000000,
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
      transportRoute: "legacy-test-only",
      actionBuilder: {
        async buildVeilMessageAction() {
          return { execute: async () => ({ transaction_hash: "0xconfirmedshield" }) };
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

    assert.equal(item.transactionHash, "0xconfirmedshield");
    assert.equal(item.status, "confirmed");
    assert.equal(item.optimistic, false);
    assert.equal(item.blockNumber, 77);
    assert.equal(item.timestamp, 1700000000000);
  });

  it("submits unshield helper messages and returns confirmed chain metadata", async () => {
    let submittedCallback;
    const submittedTimestamp = 1700000000000;
    const transport = new DirectHelperTransport({
      helperAddress: "0x123",
      account: {
        async execute(calls) {
          assert.equal(Array.isArray(calls), true);
          assert.equal(calls[0].entrypoint, "invoke");
          assert.equal(calls[0].calldata[0], "5");
          assert.equal(calls[0].calldata.at(-1), "0");
          return { transaction_hash: "0xabc" };
        },
      },
      provider: {
        async callContract(call) {
          if (call.entrypoint === "get_event_count") {
            return ["0"];
          }
          if (call.entrypoint === "get_event") {
            return ["1", "123", "1", "111", "222", "0", "1700000000"];
          }
          throw new Error(`Unexpected call ${call.entrypoint}`);
        },
        async waitForTransaction() {
          return { status: "ACCEPTED_ON_L2", block_number: 1234 };
        },
      },
      onTransactionSubmitted(transactionHash, item) {
        submittedCallback = { transactionHash, item };
      },
    });

    const item = await transport.invokeExternal({
      privacyPoolAddress: "0xpool",
      helperAddress: "0x123",
      mode: "unshield",
      calldata: [],
      item: {
        eventId: "0",
        channelId: "rights-transfer",
        eventType: 1,
        encryptedPayload: "111",
        payloadHash: "222",
        nonce: "nonce",
        timestamp: submittedTimestamp,
      },
    });

    assert.equal(item.transactionHash, "0xabc");
    assert.equal(submittedCallback.transactionHash, "0xabc");
    assert.equal(submittedCallback.item.status, "pending");
    assert.equal(submittedCallback.item.optimistic, true);
    assert.equal(item.status, "confirmed");
    assert.equal(item.optimistic, false);
    assert.equal(item.blockNumber, 1234);
    assert.equal(item.timestamp, submittedTimestamp);
  });

  it("uses caller-provided canonical calldata for direct invoke submissions", async () => {
    let submittedCalldata;
    const transport = new DirectHelperTransport({
      helperAddress: "0x123",
      waitForConfirmation: false,
      channelIdEncoder: () => "999",
      account: {
        async execute(calls) {
          assert.equal(calls[0].entrypoint, "invoke");
          submittedCalldata = calls[0].calldata;
          return { transaction_hash: "0xabc" };
        },
      },
    });

    await transport.invokeExternal({
      privacyPoolAddress: "0xpool",
      helperAddress: "0x123",
      mode: "unshield",
      calldata: ["123", "1", "111", "222", "0"],
      item: {
        eventId: "0",
        channelId: "rights-transfer",
        eventType: 1,
        encryptedPayload: "111",
        payloadHash: "222",
        timestamp: Date.now(),
      },
    });

    assert.deepEqual(submittedCalldata, ["5", "123", "1", "111", "222", "0"]);
  });

  it("rejects shield mode on the direct helper transport", async () => {
    const transport = new DirectHelperTransport({
      helperAddress: "0x123",
      account: {
        async execute() {
          return { transaction_hash: "0xabc" };
        },
      },
    });

    await assert.rejects(
      () =>
        transport.invokeExternal({
          privacyPoolAddress: "0xpool",
          helperAddress: "0x123",
          mode: "shield",
          calldata: [],
          item: {
            eventId: "0",
            channelId: "rights-transfer",
            eventType: 1,
            encryptedPayload: "111",
            payloadHash: "222",
            nonce: "nonce",
            timestamp: Date.now(),
          },
        }),
      /only supports Direct encrypted/i,
    );
  });
});

