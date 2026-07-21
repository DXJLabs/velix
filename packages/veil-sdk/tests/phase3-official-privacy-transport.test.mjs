import { describe, it } from "node:test";
import { assert, sdk } from "./production-messaging.helpers.mjs";

const {
  DirectHelperTransport,
  OfficialPrivacyTransport,
  StarknetPrivacyPoolTransport,
  VEIL_CANONICAL_MAX_CHUNKS,
  VEIL_DIRECT_ENCRYPTED_LABEL,
  VEIL_PRIVACY_TRANSPORT_STATUS,
  buildCanonicalHelperPayload,
  evaluateOfficialPrivacyTransport,
} = sdk;

const POOL = "0x222";
const HELPER = "0x555";

function validEnvelope(overrides = {}) {
  return {
    version: 1,
    algorithm: "A256GCM",
    salt: Buffer.alloc(32, 1).toString("base64url"),
    nonce: Buffer.alloc(12, 2).toString("base64url"),
    ciphertext: Buffer.alloc(64, 3).toString("base64url"),
    ...overrides,
  };
}

function validConfig(overrides = {}) {
  return {
    route: "wallet-api",
    sdk: { installed: true, version: "0.14.3-rc.2" },
    wallet: { supported: true, apiVersion: "0.10.3" },
    network: { chainId: "SN_SEPOLIA" },
    pool: {
      address: POOL,
      compatibility: "PRIVACY-0.14.3-RC.0",
      compatibleAddresses: [POOL],
    },
    transactionVersion: 3,
    outsideExecutionVersion: "V2",
    prover: { configured: true },
    discovery: { configured: true },
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
    messageReference: "msg-phase3-1",
    requestId: "phase3-request-1",
    operation: "message",
    keyDomain: "VEIL_MESSAGE_KEY_V1",
    envelope: validEnvelope(),
    messageLocator: "0x77",
    applicationInvokes: [{ contractAddress: HELPER, selector: "privacy_invoke" }],
    ...overrides,
  };
}

function hasReason(snapshot, code) {
  return snapshot.reasons.some((reason) => reason.code === code);
}

describe("Phase 3 official privacy transport boundary", () => {
  it("fails closed on unsupported wallet capability", () => {
    const snapshot = evaluateOfficialPrivacyTransport(validConfig({
      wallet: { supported: false, apiVersion: "0.10.2" },
    }));
    assert.equal(snapshot.status, VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_UNAVAILABLE);
    assert.equal(snapshot.prepared, false);
    assert.equal(hasReason(snapshot, "PRIVACY_WALLET_UNSUPPORTED"), true);
  });

  it("reports exact compatibility failures for SDK, Pool, chain, transaction, and authorization versions", () => {
    const cases = [
      [{ sdk: { installed: true, version: "0.14.3-rc.3" } }, "SDK_VERSION_MISMATCH"],
      [{ pool: { address: POOL, compatibility: "legacy-pre-screening", compatibleAddresses: [POOL] } }, "POOL_VERSION_MISMATCH"],
      [{ network: { chainId: "SN_MAIN" } }, "CHAIN_ID_MISMATCH"],
      [{ transactionVersion: 2 }, "TRANSACTION_VERSION_UNSUPPORTED"],
      [{ outsideExecutionVersion: "V1" }, "AUTHORIZATION_VERSION_UNSUPPORTED"],
    ];
    for (const [override, code] of cases) {
      const snapshot = evaluateOfficialPrivacyTransport(validConfig(override));
      assert.equal(snapshot.prepared, false);
      assert.equal(hasReason(snapshot, code), true);
    }
  });

  it("requires configured prover and discovery boundaries", () => {
    const snapshot = evaluateOfficialPrivacyTransport(validConfig({
      prover: { configured: false },
      discovery: { configured: false },
    }));
    assert.equal(snapshot.prepared, false);
    assert.equal(snapshot.reasons.filter((reason) => reason.code === "CANONICAL_CAPABILITY_UNAVAILABLE").length, 2);
  });

  it("restricts direct SDK use to integrator-owned account and viewing-key custody", () => {
    const rejected = evaluateOfficialPrivacyTransport(validConfig({
      route: "sdk-direct",
      wallet: undefined,
      directAccount: { accountCustody: "user-wallet", viewingKeyCustody: "wallet-managed" },
    }));
    assert.equal(rejected.prepared, false);
    assert.equal(hasReason(rejected, "ACCOUNT_CUSTODY_MISMATCH"), true);

    const accepted = evaluateOfficialPrivacyTransport(validConfig({
      route: "sdk-direct",
      wallet: undefined,
      directAccount: { accountCustody: "integrator-owned", viewingKeyCustody: "integrator-managed" },
    }));
    assert.equal(accepted.prepared, true);
    assert.equal(accepted.walletCapable, false);
  });

  it("rejects arbitrary helper targets, selectors, and more than one application invoke", () => {
    const transport = new OfficialPrivacyTransport(validConfig());
    assert.throws(
      () => transport.prepare(validInput({ applicationInvokes: [{ contractAddress: "0x666", selector: "privacy_invoke" }] })),
      (error) => error.code === "HELPER_TARGET_NOT_ALLOWED",
    );
    assert.throws(
      () => transport.prepare(validInput({ applicationInvokes: [{ contractAddress: HELPER, selector: "arbitrary_call" }] })),
      (error) => error.code === "HELPER_SELECTOR_NOT_ALLOWED",
    );
    assert.throws(
      () => transport.prepare(validInput({
        applicationInvokes: [
          { contractAddress: HELPER, selector: "privacy_invoke" },
          { contractAddress: HELPER, selector: "privacy_invoke" },
        ],
      })),
      (error) => error.code === "MULTIPLE_EXTERNAL_INVOKES",
    );
  });

  it("builds the versioned canonical helper profile with bounded deterministic commitment calldata", () => {
    const payload = buildCanonicalHelperPayload(validInput());
    assert.equal(payload.version, 1);
    assert.equal(payload.operation, "message");
    assert.equal(payload.keyDomain, "VEIL_MESSAGE_KEY_V1");
    assert.equal(payload.payloadChunks.length <= VEIL_CANONICAL_MAX_CHUNKS, true);
    assert.deepEqual(payload.calldata.slice(0, 4), [
      "1",
      "0x77",
      payload.payloadCommitment,
      String(payload.payloadChunks.length),
    ]);
    assert.equal(payload.serializedEnvelope.includes("message"), false);
    assert.equal(payload.serializedEnvelope.includes("VEIL_MESSAGE_KEY_V1"), false);
  });

  it("rejects malformed, oversized, and unknown-version payloads", () => {
    assert.throws(
      () => buildCanonicalHelperPayload(validInput({
        envelope: { ...validEnvelope(), plaintext: "must-never-be-public" },
      })),
      (error) => error.code === "PAYLOAD_MALFORMED",
    );
    assert.throws(
      () => buildCanonicalHelperPayload(validInput({
        envelope: validEnvelope({ ciphertext: Buffer.alloc(2_000, 4).toString("base64url") }),
      })),
      (error) => error.code === "PAYLOAD_TOO_LARGE",
    );
    assert.throws(
      () => buildCanonicalHelperPayload(validInput({ envelope: validEnvelope({ version: 2 }) })),
      (error) => error.code === "PAYLOAD_VERSION_UNSUPPORTED",
    );
  });

  it("keeps Unshield unavailable in the canonical product operation boundary", () => {
    assert.throws(
      () => buildCanonicalHelperPayload(validInput({ operation: "unshield" })),
      (error) => error.code === "UNSHIELD_UNAVAILABLE",
    );
  });

  it("never logs secrets or invokes a legacy fallback after canonical failure", async () => {
    const events = [];
    let directFallbackCalls = 0;
    let clock = 1_000;
    const transport = new OfficialPrivacyTransport(validConfig({
      onStatus: (event) => events.push(event),
      now: () => ++clock,
    }));
    const secret = "wallet-viewing-key-should-never-leak";
    await assert.rejects(
      () => transport.submit(validInput(), {
        async submit() {
          throw new Error(`upstream included ${secret}`);
        },
      }),
      (error) => error.status === VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_FAILED,
    );
    assert.equal(directFallbackCalls, 0);
    assert.equal(JSON.stringify(events).includes(secret), false);
    assert.equal(events.at(-1).status, VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_FAILED);
    assert.deepEqual(Object.keys(events.at(-1)).sort(), [
      "chain",
      "durationMs",
      "errorCode",
      "operation",
      "requestId",
      "status",
      "version",
    ]);
    void directFallbackCalls;
  });

  it("keeps prepared, submitted, accepted, and live-verified state distinct", async () => {
    const transport = new OfficialPrivacyTransport(validConfig());
    const snapshot = transport.snapshot();
    const prepared = transport.prepare(validInput());
    assert.equal(snapshot.status, VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_PREPARED);
    assert.equal(snapshot.prepared, true);
    assert.equal(snapshot.liveVerified, false);
    assert.equal(prepared.liveVerified, false);

    const submitted = await transport.submit(validInput(), {
      async submit() {
        return { transactionHash: "0xabc" };
      },
    });
    assert.equal(submitted.status, VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_SUBMITTED);
    assert.equal(submitted.liveVerified, false);

    const accepted = await transport.submit(validInput(), {
      async submit() {
        return { transactionHash: "0xdef", accepted: true };
      },
    });
    assert.equal(accepted.status, VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_ACCEPTED);
    assert.equal(accepted.liveVerified, false);
  });

  it("requires explicit legacy-test-only selection and keeps Direct encrypted labeled as legacy", () => {
    assert.throws(
      () => new StarknetPrivacyPoolTransport({
        privacyPoolAddress: POOL,
        helperAddress: HELPER,
        readTransport: {},
        actionBuilder: { async buildVeilMessageAction() { return {}; } },
      }),
      (error) => error.code === "CANONICAL_FALLBACK_FORBIDDEN",
    );
    const direct = new DirectHelperTransport({ helperAddress: HELPER, waitForConfirmation: false });
    assert.equal(VEIL_DIRECT_ENCRYPTED_LABEL, "Direct encrypted");
    assert.equal(VEIL_PRIVACY_TRANSPORT_STATUS.DIRECT_ENCRYPTED_LEGACY, "DIRECT_ENCRYPTED_LEGACY");
    assert.deepEqual(direct.supportedModes, ["encrypted-direct", "unshield"]);
  });
});
