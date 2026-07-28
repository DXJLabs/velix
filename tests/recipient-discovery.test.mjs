import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createRecipientDiscoveryService,
  normalizeRecipientAddress,
  normalizeStarkName,
} from "../frontend/src/services/recipient-discovery-service.js";

test("resolves .stark names through the configured Sepolia provider", async () => {
  const calls = [];
  const service = createRecipientDiscoveryService({
    getProvider: async () => ({
      getChainId: async () => "SN_SEPOLIA",
      getAddressFromStarkName: async (name) => (calls.push(name), "0x000123"),
      getStarkName: async () => "alice.stark",
    }),
  });
  const result = await service.resolve("Alice.Stark");
  assert.equal(result.status, "resolved");
  assert.equal(result.address, "0x123");
  assert.equal(result.reverseVerified, true);
  assert.deepEqual(calls, ["alice.stark"]);
});

test("accepts direct addresses and treats reverse Starknet ID as optional", async () => {
  const service = createRecipientDiscoveryService({
    getProvider: async () => ({
      getChainId: async () => "0x534e5f5345504f4c4941",
      getStarkName: async () => { throw new Error("no primary name"); },
    }),
  });
  const result = await service.resolve("0x000abc");
  assert.equal(result.status, "resolved");
  assert.equal(result.address, "0xabc");
  assert.equal(result.starkName, "");
});

test("fails closed for bad input, missing names, RPC failure, and wrong chain", async () => {
  let reads = 0;
  const invalid = createRecipientDiscoveryService({ getProvider: async () => (reads += 1) });
  assert.equal((await invalid.resolve("bad identity")).status, "invalid");
  assert.equal(reads, 0);

  const missing = createRecipientDiscoveryService({
    getProvider: async () => ({
      getChainId: async () => "SN_SEPOLIA",
      getAddressFromStarkName: async () => "0x0",
    }),
  });
  assert.equal((await missing.resolve("missing.stark")).status, "not_found");

  const rpcFail = createRecipientDiscoveryService({
    getProvider: async () => ({
      getChainId: async () => "SN_SEPOLIA",
      getAddressFromStarkName: async () => { throw new Error("offline"); },
    }),
  });
  assert.equal((await rpcFail.resolve("alice.stark")).status, "unavailable");

  const wrongChain = createRecipientDiscoveryService({
    getProvider: async () => ({
      getChainId: async () => "SN_MAIN",
      getAddressFromStarkName: async () => "0x123",
    }),
  });
  assert.equal((await wrongChain.resolve("alice.stark")).status, "unavailable");
});

test("normalizes Starknet recipients and keeps production invite creation locked", async () => {
  assert.equal(normalizeRecipientAddress("0x000123"), "0x123");
  assert.equal(normalizeRecipientAddress("0x0"), "");
  assert.equal(normalizeStarkName(" Alice.Stark "), "alice.stark");

  const controller = await readFile(new URL("../frontend/src/features/invite/invite-controller.js", import.meta.url), "utf8");
  const registry = await readFile(new URL("../frontend/src/app/feature-registry.js", import.meta.url), "utf8");
  const bootstrap = await readFile(new URL("../frontend/src/app/bootstrap.js", import.meta.url), "utf8");
  assert.match(controller, /if \(!dealCreationEnabled\)/);
  assert.match(controller, /primaryAction\.disabled = true/);
  assert.match(controller, /Deal Creation Unavailable/);
  assert.match(controller, /recipientDiscovery\.resolve\(query\)/);
  assert.match(registry, /dealCreationEnabled:\s*config\.demoRuntimeMode/);
  assert.match(registry, /recipientDiscovery/);
  assert.match(bootstrap, /createRecipientDiscoveryService/);
  assert.match(bootstrap, /recipientDiscovery,/);
});
