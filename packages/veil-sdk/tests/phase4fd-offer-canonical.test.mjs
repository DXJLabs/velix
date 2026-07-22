import { describe, it } from "node:test";
import { assert, sdk } from "./production-messaging.helpers.mjs";

const {
  MockEncryptionAdapter,
  VeilClient,
} = sdk;

function createOfferClient(captured) {
  const mockEncryption = new MockEncryptionAdapter();

  return new VeilClient({
    privacyPoolAddress: "0xpool",
    helperAddress: "0xhelper",
    rpcUrl: "http://localhost",
    encryption: {
      async encryptPayload(payload, context) {
        const encrypted = await mockEncryption.encryptPayload(payload, context);

        return {
          ...encrypted,
          canonicalEnvelope: {
            version: 1,
            algorithm: "A256GCM",
            salt: Buffer.alloc(32, 1).toString("base64url"),
            nonce: Buffer.alloc(12, 2).toString("base64url"),
            ciphertext: Buffer.alloc(64, 3).toString("base64url"),
          },
        };
      },

      async decryptPayload(item, context) {
        return mockEncryption.decryptPayload(item, context);
      },
    },
    transport: {
      supportedModes: ["shield", "strk20-shielded"],

      async invokeExternal(input) {
        captured.push(input);

        return {
          ...input.item,
          transactionHash: `0xoffer${captured.length}`,
          status: "confirmed",
          optimistic: false,
        };
      },

      async getEventCount() {
        return 0;
      },

      async getEvent() {
        throw new Error("legacy indexed read must not be used");
      },

      async getTimeline() {
        return [];
      },
    },
  });
}

describe("VEIL canonical Shield offer lifecycle", () => {
  it("routes create, counter, accept, and reject through canonical calldata", async () => {
    const captured = [];
    const client = createOfferClient(captured);

    const cases = [
      {
        eventType: 3,
        reference: "offer-create-1",
        locator: 101n,
        run: () =>
          client.createOffer({
            channelId: "offer-room",
            amount: "100",
            currency: "USDC",
            terms: "Delivery after settlement",
            mode: "shield",
            messageReference: "offer-create-1",
            messageLocator: "101",
          }),
      },
      {
        eventType: 4,
        reference: "offer-counter-1",
        locator: 102n,
        run: () =>
          client.counterOffer({
            channelId: "offer-room",
            amount: "90",
            currency: "USDC",
            terms: "Delivery within two days",
            mode: "shield",
            messageReference: "offer-counter-1",
            messageLocator: "102",
          }),
      },
      {
        eventType: 5,
        reference: "offer-accept-1",
        locator: 103n,
        run: () =>
          client.acceptOffer({
            channelId: "offer-room",
            offerId: "offer-create-1",
            mode: "shield",
            messageReference: "offer-accept-1",
            messageLocator: "103",
          }),
      },
      {
        eventType: 6,
        reference: "offer-reject-1",
        locator: 104n,
        run: () =>
          client.rejectOffer({
            channelId: "offer-room",
            offerId: "offer-create-1",
            reason: "Terms changed",
            mode: "shield",
            messageReference: "offer-reject-1",
            messageLocator: "104",
          }),
      },
    ];

    for (const testCase of cases) {
      const item = await testCase.run();
      const input = captured.at(-1);

      assert.ok(input);
      assert.equal(item.status, "confirmed");
      assert.equal(input.mode, "shield");
      assert.equal(input.item.eventType, testCase.eventType);
      assert.equal(
        input.canonicalMessage.messageReference,
        testCase.reference,
      );
      assert.equal(
        BigInt(input.canonicalMessage.messageLocator),
        testCase.locator,
      );
      assert.deepEqual(
        input.calldata,
        input.canonicalMessage.helperCalldata,
      );
      assert.equal(
        input.canonicalMessage.payloadCommitment,
        input.canonicalMessage.helperCalldata[2],
      );
    }

    assert.equal(captured.length, 4);
  });
});
