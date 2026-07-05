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

