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
describe("VEIL shield transport submission", () => {
  it("sendShieldedMessage runs the Starknet Privacy SDK compile/proof/apply pipeline and updates the confirmed timeline", async () => {
    const calls = [];
    let sdkMessageInput;
    let applyInput;
    const transport = new StarknetPrivacyPoolTransport({
      privacyPoolAddress: "0xpool",
      helperAddress: "0xhelper",
      provider: {
        async callContract(call) {
          if (call.entrypoint === "get_fee_amount") return ["10"];
          if (call.entrypoint === "get_fee_collector") return ["0xfee"];
          return [];
        },
        async waitForTransaction(transactionHash) {
          calls.push(`wait:${transactionHash}`);
          return { status: "ACCEPTED_ON_L2", block_number: 99 };
        },
      },
      privateFeeBalance: "10",
      readTransport: {
        async getEventCount(channelId) {
          calls.push(`count:${channelId}`);
          return 0;
        },
        async getEvent(channelId, index) {
          calls.push(`event:${channelId}:${index}`);
          assert.equal(channelId, "123");
          assert.equal(index, 0);
          return {
            ...sdkMessageInput.item,
            eventId: "1",
            timestamp: 1710000000000,
            mode: "shield",
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
      privacySdk: {
        async compileActions(input) {
          calls.push("compile");
          sdkMessageInput = input;
          assert.equal(input.kind, "message");
          assert.equal(input.clientActions[0].type, "CreateEncNote");
          assert.equal(input.clientActions[1].type, "InvokeExternal");
          return { serverActionsCalldata: ["2", "9", "8"], raw: { compiled: true } };
        },
        async generateProof(input) {
          calls.push("proof");
          assert.deepEqual(input.compiledActions.serverActionsCalldata, ["2", "9", "8"]);
          return { proofFacts: ["7"], raw: { proof: true } };
        },
        async buildApplyActionsTransaction(input) {
          calls.push("build-apply");
          applyInput = input;
          assert.equal(input.applyActionsCall.contractAddress, "0xpool");
          assert.equal(input.applyActionsCall.entrypoint, "apply_actions");
          assert.deepEqual(input.applyActionsCall.calldata, ["3", "2", "9", "8"]);
          return {
            transaction: {
              kind: "apply_actions",
              call: input.applyActionsCall,
              proof: input.proof.raw,
            },
          };
        },
      },
      paymaster: {
        async executeTransaction(transaction) {
          calls.push("paymaster");
          assert.equal(transaction.kind, "apply_actions");
          return { transaction_hash: "0xshielded" };
        },
      },
    });
    const client = new VeilClient({
      privacyPoolAddress: "0xpool",
      helperAddress: "0xhelper",
      rpcUrl: "http://localhost",
      encryption: new MockEncryptionAdapter(),
      transport,
    });

    const item = await client.sendShieldedMessage({
      channelId: "123",
      message: "real shield pipeline",
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
    });

    assert.equal(item.transactionHash, "0xshielded");
    assert.equal(item.status, "confirmed");
    assert.equal(item.optimistic, false);
    assert.equal(item.blockNumber, 99);
    assert.equal(item.timestamp, 1710000000000);
    assert.equal(applyInput.proof.raw.proof, true);
    assert.deepEqual(calls, [
      "count:123",
      "compile",
      "proof",
      "build-apply",
      "paymaster",
      "wait:0xshielded",
      "event:123:0",
    ]);
  });

  it("fails closed when a shield helper invoke has no Privacy Pool replay-protection action", async () => {
    const transport = new StarknetPrivacyPoolTransport({
      privacyPoolAddress: "0xpool",
      helperAddress: "0xhelper",
      waitForConfirmation: false,
      provider: createFeeProvider(),
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
        async buildVeilMessageAction() {
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
          item: {
            eventId: "0",
            channelId: "123",
            eventType: 1,
            encryptedPayload: "111",
            payloadHash: "222",
            nonce: "nonce",
            timestamp: Date.now(),
          },
        }),
      /replay-protection/i,
    );
  });

  it("fails closed when the AVNU Paymaster rejects a shield transaction", async () => {
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
        async buildVeilMessageAction() {
          return { transaction: { kind: "privacy-pool-apply" } };
        },
      },
      paymaster: {
        async executeTransaction() {
          throw new Error("paymaster rejected");
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
        }),
      (error) => error instanceof PrivacyPoolFeeError && error.code === "PAYMASTER_REJECTED",
    );
  });

  it("builds shield channel creation with official Privacy Pool channel actions", async () => {
    let channelInput;
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
        async buildVeilMessageAction() {
          throw new Error("not used");
        },
        async buildVeilChannelAction(input) {
          channelInput = input;
          return { execute: async () => ({ transaction_hash: "0xchannel" }) };
        },
      },
    });

    const result = await transport.createChannel({
      channelId: "42",
      title: "Privacy channel",
      privacyPool: {
        openChannel: {
          recipientAddress: "0xbob",
          index: 0,
          random: "99",
          salt: "100",
        },
      },
    });

    assert.equal(result.transactionHash, "0xchannel");
    assert.equal(result.status, "pending");
    assert.equal(channelInput.clientActions[0].type, "OpenChannel");
    assert.equal(channelInput.actionBatch.hasReplayProtection, true);
    assert.equal(channelInput.feeEstimate.poolFee.feeAmount, "10");
    assert.deepEqual(channelInput.encodedClientActions, [
      "1",
      "1",
      "0xbob",
      "0",
      "99",
      "100",
    ]);
  });

  it("builds shield subchannel creation with official Privacy Pool OpenSubchannel action", async () => {
    let subchannelInput;
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
        async buildVeilMessageAction() {
          throw new Error("not used");
        },
        async buildVeilChannelAction(input) {
          subchannelInput = input;
          return { execute: async () => ({ transaction_hash: "0xsubchannel" }) };
        },
      },
    });

    const result = await transport.openSubchannel({
      channelId: "42",
      recipientAddress: "0xbob",
      recipientPublicKey: "44",
      channelKey: "55",
      index: 0,
      token: "0x123",
      salt: "66",
    });

    assert.equal(result.transactionHash, "0xsubchannel");
    assert.equal(result.status, "pending");
    assert.equal(subchannelInput.clientActions[0].type, "OpenSubchannel");
    assert.equal(subchannelInput.actionBatch.hasReplayProtection, true);
    assert.deepEqual(subchannelInput.encodedClientActions, [
      "1",
      "2",
      "0xbob",
      "44",
      "55",
      "0",
      "0x123",
      "66",
    ]);
  });

});

