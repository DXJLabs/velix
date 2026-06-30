import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
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
} = await jiti.import("../src/index.ts");

function createFeeProvider({ amount = "10", collector = "0xfee" } = {}) {
  return {
    async callContract(call) {
      if (call.entrypoint === "get_fee_amount") return [amount];
      if (call.entrypoint === "get_fee_collector") return [collector];
      return [];
    },
  };
}

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

describe("Privacy Pool fee handling", () => {
  it("discovers pool fee amount and collector from Privacy Pool views", async () => {
    const feeInfo = await getFeeInfo({
      provider: createFeeProvider({ amount: "12", collector: "0xfee" }),
      privacyPoolAddress: "0xpool",
    });

    assert.equal(feeInfo.enabled, true);
    assert.equal(feeInfo.feeAmount, "12");
    assert.equal(feeInfo.feeCollector, "0xfee");
    assert.equal(feeInfo.feeTokenAddress, PRIVACY_POOL_STRK_FEE_TOKEN_ADDRESS);
  });

  it("supports official sponsored, sponsored_private, and gasless modes", async () => {
    assert.deepEqual(getSupportedFeeModes(), ["sponsored", "sponsored_private", "gasless"]);

    const sponsored = await estimateTotalCost({
      provider: createFeeProvider({ amount: "15", collector: "0xfee" }),
      privacyPoolAddress: "0xpool",
      feeMode: "sponsored",
      privateBalance: "15",
    });
    assert.equal(sponsored.networkGasFee.gasSponsored, true);
    assert.equal(sponsored.networkGasFee.gasFeeAmount, "0");
    assert.equal(sponsored.poolFee.feeAmount, "15");
    assert.equal(sponsored.poolFee.paidFrom, "private_balance");

    const sponsoredPrivate = await estimatePoolFee({
      provider: createFeeProvider({ amount: "15", collector: "0xfee" }),
      privacyPoolAddress: "0xpool",
      feeMode: "sponsored_private",
      feeTokenAddress: "0xprivatefee",
      privateBalance: "30",
      quoteProvider: {
        async quotePoolFee(input) {
          assert.equal(input.sourceAmount, "15");
          return {
            sourceAmount: input.sourceAmount,
            sourceTokenAddress: input.sourceTokenAddress,
            feeTokenAddress: input.feeTokenAddress,
            amount: "30",
          };
        },
      },
    });
    assert.equal(sponsoredPrivate.feeTokenAddress, "0xprivatefee");
    assert.equal(sponsoredPrivate.feeAmount, "30");

    const gasless = await estimateTotalCost({
      provider: createFeeProvider({ amount: "15", collector: "0xfee" }),
      privacyPoolAddress: "0xpool",
      feeMode: "gasless",
      privateBalance: "100",
      gasEstimate: "9",
    });
    assert.equal(gasless.networkGasFee.gasSponsored, false);
    assert.equal(gasless.networkGasFee.gasFeeAmount, "9");
    assert.equal(gasless.totalsByToken[PRIVACY_POOL_STRK_FEE_TOKEN_ADDRESS], "24");

    const directHelper = await estimateTotalCost({
      transactionType: "direct-helper",
      feeMode: "gasless",
      gasEstimate: "9",
    });
    assert.equal(directHelper.poolFee.enabled, false);
    assert.equal(directHelper.poolFee.feeAmount, "0");
    assert.equal(directHelper.totalsByToken[PRIVACY_POOL_STRK_FEE_TOKEN_ADDRESS], "9");
  });

  it("exposes fee discovery and total cost estimation through VeilClient", async () => {
    const client = new VeilClient({
      privacyPoolAddress: "0xpool",
      helperAddress: "0xhelper",
      rpcUrl: "http://localhost",
      allowMock: true,
      provider: createFeeProvider({ amount: "7", collector: "0xfee" }),
      feeMode: "gasless",
      gasEstimate: "3",
      privateFeeBalance: "10",
    });

    assert.deepEqual(client.getSupportedFeeModes(), ["sponsored", "sponsored_private", "gasless"]);
    const feeInfo = await client.getFeeInfo();
    assert.equal(feeInfo.feeAmount, "7");

    const total = await client.estimateTotalCost();
    assert.equal(total.feeMode, "gasless");
    assert.equal(total.poolFee.feeAmount, "7");
    assert.equal(total.networkGasFee.gasFeeAmount, "3");
    assert.equal(total.totalsByToken[PRIVACY_POOL_STRK_FEE_TOKEN_ADDRESS], "10");

    const directHelperTotal = await client.estimateTotalCost({ transactionType: "direct-helper" });
    assert.equal(directHelperTotal.poolFee.enabled, false);
    assert.equal(directHelperTotal.poolFee.feeAmount, "0");
    assert.equal(directHelperTotal.networkGasFee.gasFeeAmount, "3");
    assert.equal(directHelperTotal.totalsByToken[PRIVACY_POOL_STRK_FEE_TOKEN_ADDRESS], "3");
  });

  it("rejects fee collector misconfiguration and insufficient private balance", async () => {
    await assert.rejects(
      () => getFeeInfo({ provider: createFeeProvider({ amount: "1", collector: "0" }), privacyPoolAddress: "0xpool" }),
      (error) => error instanceof PrivacyPoolFeeError && error.code === "FEE_COLLECTOR_NOT_CONFIGURED",
    );

    await assert.rejects(
      () =>
        estimatePoolFee({
          provider: createFeeProvider({ amount: "10", collector: "0xfee" }),
          privacyPoolAddress: "0xpool",
          feeMode: "sponsored",
          privateBalance: "9",
        }),
      (error) => error instanceof PrivacyPoolFeeError && error.code === "INSUFFICIENT_PRIVATE_BALANCE",
    );
  });

  it("rejects unsupported fee mode and fee estimation failures", async () => {
    await assert.rejects(
      () =>
        estimatePoolFee({
          provider: createFeeProvider({ amount: "10", collector: "0xfee" }),
          privacyPoolAddress: "0xpool",
          feeMode: "unsupported",
        }),
      (error) => error instanceof PrivacyPoolFeeError && error.code === "UNSUPPORTED_FEE_MODE",
    );

    await assert.rejects(
      () => estimateTransactionFee({ feeMode: "gasless" }),
      (error) => error instanceof PrivacyPoolFeeError && error.code === "FEE_ESTIMATION_FAILED",
    );
  });
});

describe("VEIL onchain transports", () => {
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
      calldata: ["123", "1", "111", "222"],
    });
    assert.equal(invoke.hasReplayProtection, false);
    assert.deepEqual(invoke.encodedClientActions, [
      "1",
      "8",
      "0xhelper",
      "4",
      "123",
      "1",
      "111",
      "222",
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
    assert.deepEqual(builderInput.helperCalldata, ["123", "1", "111", "222"]);
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
      "4",
      "123",
      "1",
      "111",
      "222",
    ]);
    assert.equal(builderInput.actionBatch.hasReplayProtection, true);
    assert.equal(builderInput.feeMode, "sponsored");
    assert.equal(builderInput.feeEstimate.poolFee.feeAmount, "10");
  });

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
    const transport = new DirectHelperTransport({
      helperAddress: "0x123",
      account: {
        async execute(calls) {
          assert.equal(Array.isArray(calls), true);
          assert.equal(calls[0].entrypoint, "privacy_invoke");
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
        timestamp: Date.now(),
      },
    });

    assert.equal(item.transactionHash, "0xabc");
    assert.equal(item.status, "confirmed");
    assert.equal(item.optimistic, false);
    assert.equal(item.blockNumber, 1234);
    assert.equal(item.timestamp, 1700000000000);
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
      /only supports unshield/i,
    );
  });
});
