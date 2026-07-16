import assert from "node:assert/strict";
import test from "node:test";

import { VeilPrivacyError, privacyErrorMessage } from "../dist/privacy/errors.js";
import {
  OFFICIAL_MAX_VIEWING_KEY,
  assertViewingKey,
  createLocalViewingKeyProvider,
} from "../dist/privacy/viewing-key.js";
import {
  createPrivacyNamespace,
  normalizeAddressBigint,
  readDiscoveryCursor,
  wrapDiscoveryCursor,
} from "../dist/privacy/namespace.js";
import { assertSpendableBalance, computePrivateBalance } from "../dist/privacy/balances.js";
import {
  computeProvingBlockId,
  serializeProofSubmission,
  submitWithFreshProof,
} from "../dist/privacy/proving.js";
import {
  assertScreeningCapableDeposit,
  mapSetupRequirement,
} from "../dist/privacy/official-sdk.js";

test("viewing keys are bigint-only and use the official SDK range", async () => {
  assert.doesNotThrow(() => assertViewingKey(1n));
  assert.doesNotThrow(() => assertViewingKey(OFFICIAL_MAX_VIEWING_KEY));
  for (const invalid of ["1", 1, 0n, -1n, OFFICIAL_MAX_VIEWING_KEY + 1n, undefined]) {
    assert.throws(() => assertViewingKey(invalid), VeilPrivacyError);
  }

  const provider = createLocalViewingKeyProvider(async () => 7n);
  assert.equal(await provider.getViewingKey(), 7n);
});

test("address and privacy namespace normalization are deterministic", () => {
  assert.equal(normalizeAddressBigint("0x10"), 16n);
  const base = createPrivacyNamespace({
    chainId: "SN_SEPOLIA",
    poolAddress: "0x123",
    accountAddress: "0x456",
    provider: "indexer",
    providerIdentity: "https://indexer.example.test/?secret=redacted",
  });
  const changedProvider = createPrivacyNamespace({
    chainId: "SN_SEPOLIA",
    poolAddress: "0x123",
    accountAddress: "0x456",
    provider: "contract",
    providerIdentity: "https://rpc.example.test",
  });
  assert.notEqual(base.key, changedProvider.key);
  assert.equal(base.providerIdentity, "https://indexer.example.test");
  assert.equal(base.key.includes("secret"), false);
});

test("discovery cursors cannot cross provider/account namespaces", () => {
  const first = createPrivacyNamespace({
    chainId: "SN_SEPOLIA",
    poolAddress: "0x123",
    accountAddress: "0x456",
    provider: "indexer",
    providerIdentity: "https://indexer.example.test",
  });
  const second = createPrivacyNamespace({
    chainId: "SN_SEPOLIA",
    poolAddress: "0x123",
    accountAddress: "0x457",
    provider: "indexer",
    providerIdentity: "https://indexer.example.test",
  });
  const cursor = wrapDiscoveryCursor(first, { page: 3 });
  assert.deepEqual(readDiscoveryCursor(first, cursor), { page: 3 });
  assert.throws(() => readDiscoveryCursor(second, cursor), /namespace/i);
});

test("private balances separate spendable and maturing notes", () => {
  const balance = computePrivateBalance(
    [
      { amount: 60n, created: 80 },
      { amount: 40n, created: 95 },
      { amount: 5n },
    ],
    100,
  );
  assert.deepEqual(balance, {
    total: 105n,
    spendable: 60n,
    maturing: 45n,
    spendableNoteCount: 1,
    maturingNoteCount: 2,
  });
  assert.throws(() => assertSpendableBalance(balance, 80n), (error) => error.code === "PRIVATE_FUNDS_MATURING");
  assert.throws(() => assertSpendableBalance(balance, 120n), (error) => error.code === "INSUFFICIENT_PRIVATE_BALANCE");
});

test("proof submission omits empty proof keys and always sets V3 tip to zero", () => {
  const call = { contractAddress: "0x1", entrypoint: "apply_actions", calldata: [] };
  const empty = serializeProofSubmission({ call, proof: { data: "ignored", proofFacts: [] } });
  assert.deepEqual(empty.details, { tip: 0n });
  assert.equal(Object.hasOwn(empty.details, "proof"), false);
  assert.equal(Object.hasOwn(empty.details, "proofFacts"), false);

  const populated = serializeProofSubmission({ call, proof: { data: "0xproof", proofFacts: ["0x1"] } });
  assert.deepEqual(populated.details, { tip: 0n, proofFacts: ["0x1"], proof: "0xproof" });
});

test("failed submission invalidates nonce and rebuilds against a fresh block", async () => {
  const built = [];
  let currentBlock = 100;
  let submits = 0;
  let invalidations = 0;
  let refreshes = 0;
  const result = await submitWithFreshProof({
    async getCurrentBlock() {
      const block = currentBlock;
      currentBlock += 5;
      return block;
    },
    async build(input) {
      const value = { id: Symbol(`build-${input.attempt}`), ...input };
      built.push(value);
      return value;
    },
    async submit(build) {
      submits += 1;
      if (submits === 1) throw new Error("invalid nonce");
      return { transactionHash: "0xabc", build };
    },
    async wait(submitted) {
      return { accepted: true, submitted };
    },
    invalidateProofNonceCache() {
      invalidations += 1;
    },
    async refreshPrivateState() {
      refreshes += 1;
    },
    shouldRetry(error) {
      return error.code === "INVALID_NONCE";
    },
  });

  assert.equal(built.length, 2);
  assert.notEqual(built[0], built[1]);
  assert.deepEqual(built.map((item) => item.provingBlockId), [90, 95]);
  assert.equal(invalidations, 1);
  assert.equal(refreshes, 1);
  assert.equal(result.attempt, 1);
});

test("screening, proving block, requirement and product errors fail closed", () => {
  assert.equal(computeProvingBlockId(150), 140);
  assert.throws(() => assertScreeningCapableDeposit({ screeningCapable: false }), (error) => error.code === "POOL_VERSION_MISMATCH");
  assert.doesNotThrow(() => assertScreeningCapableDeposit({ screeningCapable: true }));
  assert.deepEqual([0, 1, 2, 3].map(mapSetupRequirement), [
    "RECIPIENT_NOT_REGISTERED",
    "CHANNEL_SETUP_REQUIRED",
    "TOKEN_SETUP_REQUIRED",
    "READY",
  ]);
  const discoveryError = new VeilPrivacyError("DISCOVERY_FAILED", "rpc failed");
  assert.match(privacyErrorMessage(discoveryError), /unknown, not zero/i);
});
