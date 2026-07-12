import { describe, it } from "node:test";
import { assert, sdk } from "./production-messaging.helpers.mjs";

const {
  DirectEcdhEncryptionAdapter,
  EncryptionPublicKeyRegistryService,
  MemoryEncryptionIdentityStore,
  VeilEncryptionIdentityService,
  VeilClient,
  canonicalKdfContext,
  addRegistrationSafetyMargin,
  derivePrivacyPublicKey,
} = sdk;

const ALICE = "0x111";
const BOB = "0x222";
const CHARLIE = "0x333";
const REGISTRY = "0xabc";
const HELPER = "0xdef";

function registryFixture(entries, identity) {
  const calls = [];
  const provider = {
    async callContract(call) {
      calls.push(call);
      const entry = entries.get(call.calldata[0]);
      if (call.entrypoint === "get_public_key") return [entry?.publicKey ?? "0"];
      if (call.entrypoint === "get_key_version") return [String(entry?.version ?? 0)];
      throw new Error("unexpected registry call");
    },
  };
  return { calls, service: new EncryptionPublicKeyRegistryService({ registryAddress: REGISTRY, provider, identity }) };
}

describe("VEIL encryption identity and key registry boundary", () => {
  it("generates, encrypts, reloads, and rotates local Stark identities", async () => {
    const store = new MemoryEncryptionIdentityStore();
    const firstService = new VeilEncryptionIdentityService(store, () => 1000);
    const first = await firstService.getOrCreateIdentity();
    assert.equal(first.version, 1);
    assert.equal(first.publicKey, await firstService.withPrivateScalar(1, (scalar) => derivePrivacyPublicKey(scalar)));
    const persisted = store.records.get(1);
    assert.ok(persisted.encryptedPrivateScalar);
    assert.equal(JSON.stringify(persisted).includes(await firstService.withPrivateScalar(1, (scalar) => scalar)), false);

    const reloaded = new VeilEncryptionIdentityService(store);
    assert.deepEqual(await reloaded.getOrCreateIdentity(), first);
    const second = await reloaded.rotateIdentity();
    assert.equal(second.version, 2);
    assert.notEqual(second.publicKey, first.publicKey);
    assert.equal((await store.loadRecord(1)).publicKey, first.publicKey);
    assert.equal(await reloaded.withPrivateScalar(1, (scalar) => derivePrivacyPublicKey(scalar)), first.publicKey);
  });

  it("rejects an incorrect non-extractable wrapping key", async () => {
    const store = new MemoryEncryptionIdentityStore();
    const service = new VeilEncryptionIdentityService(store);
    await service.getOrCreateIdentity();
    store.wrappingKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await assert.rejects(() => service.withPrivateScalar(1, () => true), /operation failed|decrypt/i);
  });

  it("builds self-registration calldata containing only the public key", async () => {
    const identity = new VeilEncryptionIdentityService(new MemoryEncryptionIdentityStore());
    const local = await identity.getOrCreateIdentity();
    const { service } = registryFixture(new Map(), identity);
    assert.deepEqual(service.buildRegistrationCall(local.publicKey), {
      contractAddress: REGISTRY,
      entrypoint: "register_public_key",
      calldata: [local.publicKey],
    });
  });

  it("includes account validation and doubles registration resource bounds", async () => {
    const identity = new VeilEncryptionIdentityService(new MemoryEncryptionIdentityStore());
    const { service } = registryFixture(new Map(), identity);
    let estimateDetails;
    let executeDetails;
    const account = {
      async estimateInvokeFee(_call, details) {
        estimateDetails = details;
        return { resourceBounds: {
          l1_gas: { max_amount: 1n, max_price_per_unit: 2n },
          l2_gas: { max_amount: 3n, max_price_per_unit: 4n },
          l1_data_gas: { max_amount: 5n, max_price_per_unit: 6n },
        } };
      },
      async execute(_call, details) { executeDetails = details; return { transaction_hash: "0x1" }; },
    };
    await service.registerCurrentUserKey(account);
    assert.deepEqual(estimateDetails, { skipValidate: false });
    assert.deepEqual(executeDetails.resourceBounds, {
      l1_gas: { max_amount: 2n, max_price_per_unit: 4n },
      l2_gas: { max_amount: 6n, max_price_per_unit: 8n },
      l1_data_gas: { max_amount: 10n, max_price_per_unit: 12n },
    });
    assert.deepEqual(addRegistrationSafetyMargin({ custom: { max_amount: 7n, max_price_per_unit: 11n } }), {
      custom: { max_amount: 14n, max_price_per_unit: 22n },
    });
  });

  it("rejects zero registry addresses and unsafe key versions", async () => {
    const identity = new VeilEncryptionIdentityService(new MemoryEncryptionIdentityStore());
    assert.throws(
      () => new EncryptionPublicKeyRegistryService({ registryAddress: "0x0", provider: {}, identity }),
      (error) => error.code === "ENCRYPTION_KEY_REGISTRY_UNAVAILABLE",
    );
    const recipient = await new VeilEncryptionIdentityService(new MemoryEncryptionIdentityStore()).getOrCreateIdentity();
    const { service } = registryFixture(
      new Map([[BOB, { publicKey: recipient.publicKey, version: BigInt(Number.MAX_SAFE_INTEGER) + 1n }]]),
      identity,
    );
    await assert.rejects(
      () => service.resolveRecipientPublicKey(BOB),
      (error) => error.code === "RECIPIENT_ENCRYPTION_KEY_INVALID",
    );
  });

  it("resolves registered keys and fails closed for missing or malformed keys", async () => {
    const identity = new VeilEncryptionIdentityService(new MemoryEncryptionIdentityStore());
    const bobIdentity = new VeilEncryptionIdentityService(new MemoryEncryptionIdentityStore());
    const bob = await bobIdentity.getOrCreateIdentity();
    const entries = new Map([[BOB, { publicKey: bob.publicKey, version: bob.version }]]);
    const { service } = registryFixture(entries, identity);
    assert.equal((await service.resolveRecipientPublicKey(BOB)).publicKey, bob.publicKey);
    await assert.rejects(
      () => service.resolveRecipientPublicKey(CHARLIE),
      (error) => error.code === "RECIPIENT_ENCRYPTION_KEY_NOT_FOUND",
    );
    entries.set(CHARLIE, { publicKey: "0x800000000000011000000000000000000000000000000000000000000000001", version: 1 });
    await assert.rejects(
      () => service.resolveRecipientPublicKey(CHARLIE),
      (error) => error.code === "ENCRYPTION_KEY_REGISTRY_UNAVAILABLE" || error.code === "RECIPIENT_ENCRYPTION_KEY_INVALID",
    );
  });

  it("derives matching channel keys across isolated A/B contexts and separates contexts", async () => {
    const aliceIdentity = new VeilEncryptionIdentityService(new MemoryEncryptionIdentityStore());
    const bobIdentity = new VeilEncryptionIdentityService(new MemoryEncryptionIdentityStore());
    const alice = await aliceIdentity.getOrCreateIdentity();
    const bob = await bobIdentity.getOrCreateIdentity();
    const entries = new Map([
      [ALICE, { publicKey: alice.publicKey, version: 1 }],
      [BOB, { publicKey: bob.publicKey, version: 1 }],
    ]);
    const aliceRegistry = registryFixture(entries, aliceIdentity).service;
    const bobRegistry = registryFixture(entries, bobIdentity).service;
    const base = { channelId: "deal-1", chainId: "SN_SEPOLIA", helperAddress: HELPER };
    const aliceAdapter = new DirectEcdhEncryptionAdapter({
      identity: aliceIdentity,
      registry: aliceRegistry,
      resolveContext: () => ({ ...base, localAccountAddress: ALICE, recipientAccountAddress: BOB }),
    });
    const bobAdapter = new DirectEcdhEncryptionAdapter({
      identity: bobIdentity,
      registry: bobRegistry,
      resolveContext: () => ({ ...base, localAccountAddress: BOB, recipientAccountAddress: ALICE }),
    });
    const context = { channelId: "deal-1", eventType: 1 };
    const encrypted = await aliceAdapter.encryptPayload({ kind: "chat", message: "identity boundary" }, context);
    const item = { eventId: "1", eventType: 1, channelId: "deal-1", timestamp: 1, ...encrypted };
    assert.equal((await bobAdapter.decryptPayload(item, context)).message, "identity boundary");
    assert.equal(
      canonicalKdfContext({ ...base, localAccountAddress: ALICE, recipientAccountAddress: BOB }),
      canonicalKdfContext({ ...base, localAccountAddress: BOB, recipientAccountAddress: ALICE }),
    );
    assert.notEqual(
      canonicalKdfContext({ ...base, localAccountAddress: ALICE, recipientAccountAddress: BOB }),
      canonicalKdfContext({ ...base, channelId: "deal-2", localAccountAddress: ALICE, recipientAccountAddress: BOB }),
    );
    assert.notEqual(
      canonicalKdfContext({ ...base, localAccountAddress: ALICE, recipientAccountAddress: BOB }),
      canonicalKdfContext({ ...base, chainId: "SN_MAIN", localAccountAddress: ALICE, recipientAccountAddress: BOB }),
    );
  });

  it("stops before encryption/transport when recipient registration is missing", async () => {
    const identity = new VeilEncryptionIdentityService(new MemoryEncryptionIdentityStore());
    const local = await identity.getOrCreateIdentity();
    const { service } = registryFixture(new Map([[ALICE, { publicKey: local.publicKey, version: 1 }]]), identity);
    const adapter = new DirectEcdhEncryptionAdapter({
      identity,
      registry: service,
      resolveContext: () => ({ localAccountAddress: ALICE, recipientAccountAddress: BOB, channelId: "deal", chainId: "SN_SEPOLIA", helperAddress: HELPER }),
    });
    let transportCalls = 0;
    const client = new VeilClient({
      privacyPoolAddress: "0xpool",
      helperAddress: HELPER,
      rpcUrl: "http://localhost",
      encryption: adapter,
      transport: {
        supportedModes: ["encrypted-direct"],
        async invokeExternal() { transportCalls += 1; throw new Error("must not run"); },
        async getEventCount() { return 0; },
        async getEvent() { throw new Error("not used"); },
        async getTimeline() { return []; },
      },
    });
    await assert.rejects(
      () => client.sendMessage({ channelId: "deal", message: "must not leave memory" }),
      (error) => error.code === "RECIPIENT_ENCRYPTION_KEY_NOT_FOUND",
    );
    assert.equal(transportCalls, 0);
  });
});
