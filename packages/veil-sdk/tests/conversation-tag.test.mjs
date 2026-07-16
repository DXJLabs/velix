import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveOpaqueConversationTag } from "../dist/conversation-tag.js";

describe("opaque conversation tag derivation", () => {
  it("is deterministic, context-separated, nonzero, and felt-bounded", async () => {
    const sharedSecret = new Uint8Array(32);
    sharedSecret[31] = 7;
    const first = await deriveOpaqueConversationTag({
      sharedSecret,
      context: "SN_SEPOLIA|0x123|0xabc|0xdef|deal-1",
    });
    const repeated = await deriveOpaqueConversationTag({
      sharedSecret,
      context: "SN_SEPOLIA|0x123|0xabc|0xdef|deal-1",
    });
    const separated = await deriveOpaqueConversationTag({
      sharedSecret,
      context: "SN_SEPOLIA|0x123|0xabc|0xdef|deal-2",
    });

    const fieldPrime = (1n << 251n) + (17n << 192n) + 1n;
    assert.equal(first, repeated);
    assert.notEqual(first, separated);
    assert.match(first, /^0x[0-9a-f]+$/);
    assert.ok(BigInt(first) > 0n && BigInt(first) < fieldPrime);
    assert.doesNotMatch(first, /deal-1/);
  });

  it("rejects zero, malformed, and context-free secret material", async () => {
    await assert.rejects(
      () => deriveOpaqueConversationTag({ sharedSecret: new Uint8Array(32), context: "deal" }),
      /nonzero/,
    );
    await assert.rejects(
      () => deriveOpaqueConversationTag({ sharedSecret: "not-a-felt", context: "deal" }),
      /felt-compatible/,
    );
    await assert.rejects(
      () => deriveOpaqueConversationTag({ sharedSecret: 1n, context: "" }),
      /context/,
    );
  });
});
