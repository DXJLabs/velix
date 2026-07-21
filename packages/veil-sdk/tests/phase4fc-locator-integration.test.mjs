import { describe, it } from "node:test";
import { assert, sdk } from "./production-messaging.helpers.mjs";

const {
  OfficialPrivacyTransport,
} = sdk;

const POOL = "0x222";
const HELPER = "0x555";

function validEnvelope() {
  return {
    version: 1,
    algorithm: "A256GCM",
    salt: Buffer.alloc(32, 1).toString("base64url"),
    nonce: Buffer.alloc(12, 2).toString("base64url"),
    ciphertext: Buffer.alloc(64, 3).toString("base64url"),
  };
}

function validConfig(overrides = {}) {
  return {
    route: "sdk-direct",
    sdk: {
      installed: true,
      version: "0.14.3-rc.2",
    },
    directAccount: {
      accountCustody: "integrator-owned",
      viewingKeyCustody: "integrator-managed",
    },
    network: {
      chainId: "SN_SEPOLIA",
    },
    pool: {
      address: POOL,
      compatibility: "PRIVACY-0.14.3-RC.0",
      compatibleAddresses: [POOL],
    },
    transactionVersion: 3,
    outsideExecutionVersion: "V2",
    prover: {
      configured: true,
    },
    discovery: {
      configured: true,
    },
    helper: {
      address: HELPER,
      selector: "privacy_invoke",
      allowedAddresses: [HELPER],
      allowedSelectors: ["privacy_invoke"],
    },
    ...overrides,
  };
}

function validInput(overrides = {}) {
  return {
    messageReference: "logical-message-1",
    requestId: "proof-request-1",
    operation: "message",
    keyDomain: "VEIL_MESSAGE_KEY_V1",
    envelope: validEnvelope(),
    messageLocator: "0x77",
    applicationInvokes: [
      {
        contractAddress: HELPER,
        selector: "privacy_invoke",
      },
    ],
    ...overrides,
  };
}

describe("Phase 4F-C message locator validation", () => {
  it("preserves an upstream-resolved locator", () => {
    const transport = new OfficialPrivacyTransport(validConfig());
    const prepared = transport.prepare(validInput());

    assert.equal(prepared.payload.messageLocator, "0x77");
    assert.equal(prepared.payload.calldata[1], "0x77");
  });

  it("accepts the same locator for the same logical message across requests", () => {
    const transport = new OfficialPrivacyTransport(validConfig());

    const first = transport.prepare(
      validInput({
        requestId: "proof-request-a",
      }),
    );

    const second = transport.prepare(
      validInput({
        requestId: "proof-request-b",
      }),
    );

    assert.equal(first.payload.messageLocator, "0x77");
    assert.equal(second.payload.messageLocator, "0x77");
    assert.equal(
      first.payload.payloadCommitment,
      second.payload.payloadCommitment,
    );
  });

  it("rejects a different locator for an existing logical message", () => {
    const transport = new OfficialPrivacyTransport(validConfig());

    transport.prepare(
      validInput({
        requestId: "proof-request-a",
        messageLocator: "0x77",
      }),
    );

    assert.throws(
      () =>
        transport.prepare(
          validInput({
            requestId: "proof-request-b",
            messageLocator: "0x88",
          }),
        ),
      (error) => error?.code === "PAYLOAD_MALFORMED",
    );
  });

  it("allows different logical messages to use different locators", () => {
    const transport = new OfficialPrivacyTransport(validConfig());

    const first = transport.prepare(
      validInput({
        messageReference: "logical-message-a",
        messageLocator: "0x77",
      }),
    );

    const second = transport.prepare(
      validInput({
        messageReference: "logical-message-b",
        messageLocator: "0x88",
      }),
    );

    assert.equal(first.payload.messageLocator, "0x77");
    assert.equal(second.payload.messageLocator, "0x88");
  });

  it("rejects an empty logical message reference", () => {
    const transport = new OfficialPrivacyTransport(validConfig());

    assert.throws(
      () =>
        transport.prepare(
          validInput({
            messageReference: "   ",
          }),
        ),
      (error) => error?.code === "PAYLOAD_MALFORMED",
    );
  });

  it("rejects a missing locator instead of generating one", () => {
    const transport = new OfficialPrivacyTransport(validConfig());
    const input = validInput();

    delete input.messageLocator;

    assert.throws(
      () => transport.prepare(input),
      (error) =>
        error?.code === "PAYLOAD_MALFORMED" &&
        error?.status === "CANONICAL_FAILED",
    );
  });
});
