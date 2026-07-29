import assert from "node:assert/strict";
import test from "node:test";

import {
  PrivacyProfileViewingKeyVault,
  viewingKeyNamespace,
} from "../dist/privacy/viewing-key-vault.js";
import { createPrivacyNamespace } from "../dist/privacy/namespace.js";
import { VeilPrivacyError } from "../dist/privacy/errors.js";

class MemoryEncryptedStore {
  records = new Map();

  async get(namespace) {
    const value = this.records.get(namespace.key);
    return value ? Uint8Array.from(value) : undefined;
  }

  async put(namespace, value) {
    this.records.set(namespace.key, Uint8Array.from(value));
  }

  async delete(namespace) {
    this.records.delete(namespace.key);
  }
}

function namespace(accountAddress = "0x456") {
  return createPrivacyNamespace({
    chainId: "SN_SEPOLIA",
    poolAddress: "0x123",
    accountAddress,
    provider: "indexer",
    providerIdentity: "https://indexer.example.test",
  });
}

test("viewing-key vault uses a separate namespace and round-trips bigint", async () => {
  const store = new MemoryEncryptedStore();
  const vault = new PrivacyProfileViewingKeyVault(store);
  const base = namespace();
  const scoped = viewingKeyNamespace(base);

  assert.notEqual(scoped.key, base.key);
  assert.match(scoped.key, /:viewing-key:v1$/);

  await vault.put(base, 0x123456789n);
  assert.equal(await vault.get(base), 0x123456789n);
  assert.equal(store.records.has(base.key), false);
  assert.equal(store.records.has(scoped.key), true);
});

test("viewing-key provider fails closed when the device vault is empty", async () => {
  const vault = new PrivacyProfileViewingKeyVault(new MemoryEncryptedStore());
  const provider = vault.createProvider(namespace());

  await assert.rejects(
    () => provider.getViewingKey(),
    (error) => error instanceof VeilPrivacyError
      && error.code === "VIEWING_KEY_UNAVAILABLE",
  );
});

test("viewing-key vault isolates account namespaces and supports deletion", async () => {
  const store = new MemoryEncryptedStore();
  const vault = new PrivacyProfileViewingKeyVault(store);
  const alice = namespace("0x456");
  const bob = namespace("0x457");

  await vault.put(alice, 11n);
  await vault.put(bob, 22n);

  assert.equal(await vault.get(alice), 11n);
  assert.equal(await vault.get(bob), 22n);

  await vault.delete(alice);
  assert.equal(await vault.get(alice), undefined);
  assert.equal(await vault.get(bob), 22n);
});

test("viewing-key vault rejects corrupted records", async () => {
  const store = new MemoryEncryptedStore();
  const vault = new PrivacyProfileViewingKeyVault(store);
  const base = namespace();
  const scoped = viewingKeyNamespace(base);

  store.records.set(scoped.key, new Uint8Array([1, 2, 3]));
  await assert.rejects(
    () => vault.get(base),
    (error) => error instanceof VeilPrivacyError
      && error.code === "REGISTRY_CORRUPTED",
  );

  store.records.set(scoped.key, new Uint8Array(32));
  await assert.rejects(
    () => vault.get(base),
    (error) => error instanceof VeilPrivacyError
      && error.code === "REGISTRY_CORRUPTED",
  );
});
