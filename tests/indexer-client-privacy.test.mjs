import assert from "node:assert/strict";
import test from "node:test";

import { createDealRoomController } from "../src/features/deals/deal-room-controller.js";

function controllerFixture({ client, messages = {} }) {
  const state = { channelId: "private-room-id", screen: "inbox" };
  const channels = [{ id: state.channelId, title: "Deal", last: "", time: "" }];
  const controller = createDealRoomController({
    state,
    channels,
    messages,
    document: { querySelectorAll: () => [] },
    conversationList: { innerHTML: "" },
    conversationSearch: null,
    messageFeed: { innerHTML: "" },
    composerForm: null,
    timelineMode: "encrypted-direct",
    helperAddress: "0x123",
    chatDisplayMode: "Direct encrypted",
    bobIdentity: "bob.stark",
    currentChannel: () => channels[0],
    currentDealId: () => "deal-1",
    channelMessages: () => messages[state.channelId] || [],
    channelRequiresJoin: () => false,
    renderInviteWaitingCard: () => "",
    getVeilClient: () => client,
    veilError: (_event, error) => { throw error; },
    statusPillClass: () => "",
    starkIdentityName: (value) => value,
    itemStateClass: () => "",
    renderChainMeta: () => "",
    showScreen: () => {},
    iconRefresh: () => {},
  });
  return { controller, messages };
}

test("indexer client sends only an opaque conversation tag and persists the signed cursor", async () => {
  const originalFetch = globalThis.fetch;
  const sessionDescriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const storage = new Map();
  const requests = [];
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
  });
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return {
      ok: true,
      async json() {
        return {
          conversationTag: "0xabc",
          nextCursor: "signed.cursor",
          reorg: { detected: false, rollbackFromBlock: null },
          messages: [{
            eventId: "7",
            eventType: 1,
            encryptedPayload: "44",
            payloadHash: "55",
            timestamp: 123,
            transactionHash: "0x777",
            blockNumber: 99,
            status: "confirmed",
            mode: "encrypted-direct",
          }],
        };
      },
    };
  };

  try {
    const { controller, messages } = controllerFixture({
      client: {
        encryption: {
          deriveConversationTag: async () => "0xabc",
          decryptPayload: async () => ({ kind: "chat", sender: "peer", message: "locally decrypted" }),
        },
      },
    });
    await controller.loadIndexedChannelTimeline("private-room-id");

    assert.equal(requests.length, 1);
    const requestUrl = new URL(requests[0], "https://veil.invalid");
    assert.equal(requestUrl.searchParams.get("conversationTag"), "0xabc");
    assert.equal(requestUrl.searchParams.has("channelId"), false);
    assert.equal(requests[0].includes("private-room-id"), false);
    assert.equal([...storage.values()][0], "signed.cursor");
    assert.equal(messages["private-room-id"][0].body, "locally decrypted");
    assert.equal(messages["private-room-id"][0].indexed, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (sessionDescriptor) Object.defineProperty(globalThis, "sessionStorage", sessionDescriptor);
    else delete globalThis.sessionStorage;
  }
});

test("indexer client fails closed before fetch when no tag derivation capability exists", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error("must not fetch"); };
  try {
    const { controller } = controllerFixture({ client: { encryption: {} } });
    await controller.loadIndexedChannelTimeline("private-room-id");
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
