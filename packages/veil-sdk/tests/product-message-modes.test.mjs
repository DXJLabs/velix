import { describe, it } from "node:test";
import { createRuntimeConfig, normalizeTimelineMode } from "../../../src/app/runtime-config.js";
import { assert, sdk } from "./production-messaging.helpers.mjs";

const {
  ChannelEncryptionAdapter,
  VeilClient,
} = sdk;

describe("production-safe VEIL message modes", () => {
  it("defaults production messaging to encrypted-direct", () => {
    assert.equal(normalizeTimelineMode("", { MODE: "production" }), "encrypted-direct");
    assert.equal(normalizeTimelineMode("direct-helper", { MODE: "production" }), "encrypted-direct");
    assert.equal(normalizeTimelineMode("privacy-pool", { MODE: "production" }), "strk20-shielded");
    const config = createRuntimeConfig({ MODE: "production", DEV: false }, "");
    assert.equal(config.timelineMode, "encrypted-direct");
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
});
