import { describe, it } from "node:test";
import { assert, sdk } from "./production-messaging.helpers.mjs";

const {
  generateMessageLocator,
  normalizeMessageLocator,
  createMessageLocatorResolver,
  VEIL_MESSAGE_LOCATOR_ENTROPY_BITS,
  VeilPrivacyError,
} = sdk;

const FELT_BOUND = 1n << 251n;
const CANONICAL_HEX = /^0x[0-9a-f]+$/u;

describe("Phase 4F-B message locator generator", () => {
  it("produces canonical lowercase 0x-prefixed hexadecimal", () => {
    for (let index = 0; index < 20; index += 1) {
      const locator = generateMessageLocator();
      assert.equal(CANONICAL_HEX.test(locator), true, `locator ${locator} is not canonical hex`);
      assert.equal(locator, locator.toLowerCase(), "locator must be lowercase");
      assert.equal(locator.startsWith("0x"), true);
    }
  });

  it("always produces a nonzero value", () => {
    for (let index = 0; index < 50; index += 1) {
      const locator = generateMessageLocator();
      assert.notEqual(BigInt(locator), 0n);
    }
  });

  it("stays within the Starknet felt bound (< 2^251)", () => {
    for (let index = 0; index < 50; index += 1) {
      const locator = generateMessageLocator();
      const value = BigInt(locator);
      assert.equal(value > 0n, true);
      assert.equal(value < FELT_BOUND, true, `locator ${locator} exceeds felt bound`);
    }
  });

  it("provides at least 128 bits of entropy (251-bit range)", () => {
    assert.equal(VEIL_MESSAGE_LOCATOR_ENTROPY_BITS >= 128, true);
    assert.equal(VEIL_MESSAGE_LOCATOR_ENTROPY_BITS, 251);
  });

  it("produces distinct locators across multiple calls", () => {
    const seen = new Set();
    for (let index = 0; index < 50; index += 1) {
      seen.add(generateMessageLocator());
    }
    assert.equal(seen.size, 50, "all generated locators must be unique");
  });

  it("fails closed when secure crypto is unavailable", () => {
    assert.throws(
      () => generateMessageLocator(null),
      (error) => error instanceof VeilPrivacyError && error.code === "PAYLOAD_MALFORMED",
    );
    assert.throws(
      () => generateMessageLocator({}),
      (error) => error instanceof VeilPrivacyError && error.code === "PAYLOAD_MALFORMED",
    );
    assert.throws(
      () => generateMessageLocator({ getRandomValues: "not-a-function" }),
      (error) => error instanceof VeilPrivacyError && error.code === "PAYLOAD_MALFORMED",
    );
  });

  it("fails closed when getRandomValues returns all-zero bytes repeatedly", () => {
    const fakeCrypto = {
      getRandomValues(target) {
        for (let index = 0; index < target.length; index += 1) target[index] = 0;
        return target;
      },
    };
    assert.throws(
      () => generateMessageLocator(fakeCrypto),
      (error) => error instanceof VeilPrivacyError && error.code === "PAYLOAD_MALFORMED",
    );
  });
});

describe("Phase 4F-B normalizeMessageLocator", () => {
  it("accepts valid bigint and string locators", () => {
    assert.equal(normalizeMessageLocator(0x77n), "0x77");
    assert.equal(normalizeMessageLocator("0x77"), "0x77");
    assert.equal(normalizeMessageLocator("0xABC"), "0xabc");
    assert.equal(normalizeMessageLocator("  0xff  "), "0xff");
  });

  it("rejects zero, negative, and out-of-range values", () => {
    assert.throws(() => normalizeMessageLocator(0n), (e) => e.code === "PAYLOAD_MALFORMED");
    assert.throws(() => normalizeMessageLocator("0x0"), (e) => e.code === "PAYLOAD_MALFORMED");
    assert.throws(() => normalizeMessageLocator(-1n), (e) => e.code === "PAYLOAD_MALFORMED");
    assert.throws(() => normalizeMessageLocator(FELT_BOUND), (e) => e.code === "PAYLOAD_MALFORMED");
    assert.throws(() => normalizeMessageLocator(FELT_BOUND + 100n), (e) => e.code === "PAYLOAD_MALFORMED");
  });

  it("rejects non-numeric strings", () => {
    assert.throws(() => normalizeMessageLocator("not-a-felt"), (e) => e.code === "PAYLOAD_MALFORMED");
    assert.throws(() => normalizeMessageLocator(""), (e) => e.code === "PAYLOAD_MALFORMED");
  });
});

describe("Phase 4F-B createMessageLocatorResolver", () => {
  it("stores the first explicit locator for a messageId", () => {
    const resolver = createMessageLocatorResolver();
    const explicit = "0xdeadbeef";
    const resolved = resolver.resolve({ explicitLocator: explicit, messageId: "msg-1" });
    assert.equal(resolved, "0xdeadbeef");
    assert.equal(resolver.has("msg-1"), true, "first explicit locator must be stored");
    assert.equal(resolver.peek("msg-1"), "0xdeadbeef");
  });

  it("rejects a different locator for the same messageId", () => {
    const resolver = createMessageLocatorResolver();
    resolver.resolve({ explicitLocator: "0xaaa", messageId: "msg-clash" });
    assert.throws(
      () => resolver.resolve({ explicitLocator: "0xbbb", messageId: "msg-clash" }),
      (e) => e instanceof VeilPrivacyError && e.code === "PAYLOAD_MALFORMED",
    );
  });

  it("rejects an explicit locator that differs from a generated one", () => {
    const resolver = createMessageLocatorResolver();
    const generated = resolver.resolve({ messageId: "msg-gen-clash" });
    assert.throws(
      () => resolver.resolve({ explicitLocator: "0x123", messageId: "msg-gen-clash" }),
      (e) => e instanceof VeilPrivacyError && e.code === "PAYLOAD_MALFORMED",
    );
    assert.equal(resolver.peek("msg-gen-clash"), generated, "generated locator must survive");
  });

  it("allows the same locator to be supplied again for the same messageId", () => {
    const resolver = createMessageLocatorResolver();
    const first = resolver.resolve({ explicitLocator: "0xcafe", messageId: "msg-reuse" });
    const second = resolver.resolve({ explicitLocator: "0xCAFE", messageId: "msg-reuse" });
    const third = resolver.resolve({ messageId: "msg-reuse" });
    assert.equal(first, "0xcafe");
    assert.equal(second, "0xcafe");
    assert.equal(third, "0xcafe");
  });

  it("returns the same locator for the same messageId on retry", () => {
    const resolver = createMessageLocatorResolver();
    const first = resolver.resolve({ messageId: "msg-retry" });
    const second = resolver.resolve({ messageId: "msg-retry" });
    const third = resolver.resolve({ messageId: "msg-retry" });
    assert.equal(first, second);
    assert.equal(second, third);
    assert.equal(resolver.has("msg-retry"), true);
    assert.equal(resolver.peek("msg-retry"), first);
  });

  it("generates different locators for different messageIds", () => {
    const resolver = createMessageLocatorResolver();
    const a = resolver.resolve({ messageId: "msg-a" });
    const b = resolver.resolve({ messageId: "msg-b" });
    assert.notEqual(a, b);
  });

  it("does not rotate locator when called repeatedly for the same message", () => {
    const resolver = createMessageLocatorResolver();
    const original = resolver.resolve({ messageId: "msg-stable" });
    for (let index = 0; index < 10; index += 1) {
      assert.equal(resolver.resolve({ messageId: "msg-stable" }), original);
    }
  });

  it("rejects empty or control-character messageIds", () => {
    const resolver = createMessageLocatorResolver();
    assert.throws(
      () => resolver.resolve({ messageId: "" }),
      (e) => e.code === "PAYLOAD_MALFORMED",
    );
    assert.throws(
      () => resolver.resolve({ messageId: "bad\x00id" }),
      (e) => e.code === "PAYLOAD_MALFORMED",
    );
  });

  it("fails when crypto is unavailable for new message resolution", () => {
    const resolver = createMessageLocatorResolver({});
    assert.throws(
      () => resolver.resolve({ messageId: "msg-no-crypto" }),
      (e) => e instanceof VeilPrivacyError && e.code === "PAYLOAD_MALFORMED",
    );
  });
});
