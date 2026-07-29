import assert from "node:assert/strict";
import test from "node:test";

import {
  PersistentDeviceStorageKeyProvider,
  createPersistentDeviceStorageKeyGetter,
  validateDeviceStorageKey,
} from "../dist/privacy/device-storage-key.js";
import { VeilPrivacyError } from "../dist/privacy/errors.js";

class MemoryDeviceKeyRepository {
  records = new Map();
  gets = 0;
  puts = 0;
  deletes = 0;

  async get(id) {
    this.gets += 1;
    return this.records.get(id);
  }

  async put(id, key) {
    this.puts += 1;
    this.records.set(id, key);
  }

  async delete(id) {
    this.deletes += 1;
    this.records.delete(id);
  }
}

test("persistent device key is non-extractable AES-GCM and reused", async () => {
  const repository = new MemoryDeviceKeyRepository();
  const provider = new PersistentDeviceStorageKeyProvider({
    repository,
    crypto: globalThis.crypto,
  });

  const [first, concurrent] = await Promise.all([
    provider.getDeviceStorageKey(),
    provider.getDeviceStorageKey(),
  ]);
  const cached = await provider.getDeviceStorageKey();

  assert.equal(first, concurrent);
  assert.equal(first, cached);
  assert.equal(first.algorithm.name, "AES-GCM");
  assert.equal(first.extractable, false);
  assert.deepEqual(
    [...first.usages].sort(),
    ["decrypt", "encrypt"],
  );
  assert.equal(repository.puts, 1);
  assert.equal(repository.gets, 2);

  await assert.rejects(
    () => globalThis.crypto.subtle.exportKey("raw", first),
    /extractable|key is not extractable/i,
  );

  const reloadedProvider = new PersistentDeviceStorageKeyProvider({
    repository,
    crypto: globalThis.crypto,
  });
  const reloaded = await reloadedProvider.getDeviceStorageKey();
  assert.equal(reloaded, first);
  assert.equal(repository.puts, 1);
});

test("persistent device key getter supplies the same cached key", async () => {
  const repository = new MemoryDeviceKeyRepository();
  const getDeviceStorageKey = createPersistentDeviceStorageKeyGetter({
    repository,
    crypto: globalThis.crypto,
    keyId: "veil-test-device-key",
  });

  const first = await getDeviceStorageKey();
  const second = await getDeviceStorageKey();

  assert.equal(first, second);
  assert.equal(repository.puts, 1);
});

test("persistent device key provider rejects invalid stored keys", async () => {
  const repository = new MemoryDeviceKeyRepository();
  const extractable = await globalThis.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  repository.records.set("veil-device-aes-gcm-v1", extractable);

  const provider = new PersistentDeviceStorageKeyProvider({
    repository,
    crypto: globalThis.crypto,
  });

  await assert.rejects(
    () => provider.getDeviceStorageKey(),
    (error) => error instanceof VeilPrivacyError
      && error.code === "REGISTRY_CORRUPTED",
  );
  assert.equal(repository.puts, 0);
});

test("deleting persistent device key clears cached and stored key", async () => {
  const repository = new MemoryDeviceKeyRepository();
  const provider = new PersistentDeviceStorageKeyProvider({
    repository,
    crypto: globalThis.crypto,
  });

  const first = await provider.getDeviceStorageKey();
  await provider.deleteDeviceStorageKey();
  const second = await provider.getDeviceStorageKey();

  assert.notEqual(first, second);
  assert.equal(repository.deletes, 1);
  assert.equal(repository.puts, 2);
});

test("device-key validation rejects wrong key types", async () => {
  const hmac = await globalThis.crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

  assert.throws(
    () => validateDeviceStorageKey(hmac),
    (error) => error instanceof VeilPrivacyError
      && error.code === "REGISTRY_CORRUPTED",
  );
});
