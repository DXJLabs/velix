import { describe, it } from "node:test";
import { hash } from "starknet";
import { assert, sdk } from "./production-messaging.helpers.mjs";

const {
  TIMELINE_PAYLOAD_DOMAIN,
  VeilClient,
  computeTimelinePayloadHash,
  encodeInvokeCalldata,
} = sdk;

describe("VEIL canonical timeline payload hash", () => {
  it("matches the Cairo poseidon_hash_span input vector", () => {
    assert.equal(TIMELINE_PAYLOAD_DOMAIN, "0x5645494c5f54494d454c494e455f5631");
    assert.equal(
      computeTimelinePayloadHash({
        conversationTag: "1001",
        encryptedEventType: "2002",
        encryptedPayload: "3003",
      }),
      "0x2a4ac8ff8d3bccf56f474476045a9b67da37a6ceb9433344ae37f77f924699",
    );
  });

  it("includes payload_chunk_count and every chunk in order", () => {
    const canonical = computeTimelinePayloadHash({
      conversationTag: "7007",
      encryptedEventType: "8008",
      encryptedPayload: "9009",
      payloadChunks: ["111", "222"],
    });

    assert.equal(canonical, "0x7c313dafedaabe86f45f8a5cea959a9417137719bc5c10534608339def3202a");
    assert.notEqual(
      canonical,
      hash.computePoseidonHashOnElements([
        TIMELINE_PAYLOAD_DOMAIN,
        "7007",
        "8008",
        "9009",
        "111",
        "222",
      ]),
    );
    assert.notEqual(
      canonical,
      computeTimelinePayloadHash({
        conversationTag: "7007",
        encryptedEventType: "8008",
        encryptedPayload: "9009",
        payloadChunks: ["222", "111"],
      }),
    );
  });

  it("changes when the same encrypted payload is committed under a different conversation tag", () => {
    const first = computeTimelinePayloadHash({
      conversationTag: "7007",
      encryptedEventType: "8008",
      encryptedPayload: "9009",
      payloadChunks: ["111", "222"],
    });
    const second = computeTimelinePayloadHash({
      conversationTag: "7008",
      encryptedEventType: "8008",
      encryptedPayload: "9009",
      payloadChunks: ["111", "222"],
    });

    assert.notEqual(first, second);
    assert.equal(second, "0x5a23e042dfc965e995fe0301010c578ae84fabb38facaa236705de185c90636");
  });

  it("encodes helper calldata with payload_chunk_count even when there are no chunks", () => {
    assert.deepEqual(
      encodeInvokeCalldata(
        {
          eventId: "0",
          channelId: "rights-transfer",
          eventType: 1,
          encryptedPayload: "111",
          payloadHash: "222",
          timestamp: 1,
        },
        { conversationTag: "123" },
      ),
      ["123", "1", "111", "222", "0"],
    );
  });

  it("VeilClient stores the onchain commitment separately from the local envelope hash", async () => {
    let captured;
    const envelopeHash = "999";
    const payloadChunks = ["42", "43"];
    const client = new VeilClient({
      privacyPoolAddress: "0xpool",
      helperAddress: "0xhelper",
      rpcUrl: "http://localhost",
      encryption: {
        async encryptPayload() {
          return {
            encryptedPayload: "111",
            payloadHash: envelopeHash,
            envelopeHash,
            nonce: "nonce",
            payloadChunks,
          };
        },
        async decryptPayload() {
          return null;
        },
      },
      transport: {
        supportedModes: ["unshield"],
        encodeConversationTag(channelId) {
          assert.equal(channelId, "chat-room");
          return "123";
        },
        async invokeExternal(input) {
          captured = input;
          return input.item;
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
      now: () => 1_700_000_000_000,
    });

    await client.sendMessage({
      channelId: "chat-room",
      message: "hello",
    });

    const expectedPayloadHash = computeTimelinePayloadHash({
      conversationTag: "123",
      encryptedEventType: 1,
      encryptedPayload: "111",
      payloadChunks,
    });
    assert.equal(captured.item.payloadHash, expectedPayloadHash);
    assert.equal(captured.item.envelopeHash, envelopeHash);
    assert.deepEqual(captured.calldata, ["123", "1", "111", expectedPayloadHash, "2", "42", "43"]);
  });
});
