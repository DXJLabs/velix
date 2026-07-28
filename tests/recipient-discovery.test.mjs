import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createRecipientDiscoveryService,
  normalizeRecipientAddress,
  normalizeStarkName,
} from "../frontend/src/services/recipient-discovery-service.js";

const VEIL_POOL =
  "0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5";

test("resolves .stark and verifies the self-deployed VEIL Privacy Pool participant", async () => {
  const calls = [];
  const service = createRecipientDiscoveryService({
    privacyPoolAddress: VEIL_POOL,
    getProvider: async () => ({
      getChainId: async () => "SN_SEPOLIA",
      getAddressFromStarkName: async (name) => {
        calls.push(["forward", name]);
        return "0x000123";
      },
      getStarkName: async (address) => {
        calls.push(["reverse", address]);
        return "alice.stark";
      },
      callContract: async (call, blockId) => {
        calls.push(["pool", call, blockId]);
        return ["0x456"];
      },
    }),
  });

  const result = await service.resolve("Alice.Stark");
  assert.equal(result.status, "resolved");
  assert.equal(result.address, "0x123");
  assert.equal(result.reverseVerified, true);
  assert.equal(result.privacyPoolStatus, "registered");
  assert.deepEqual(calls, [
    ["forward", "alice.stark"],
    ["reverse", "0x123"],
    ["pool", {
      contractAddress: normalizeRecipientAddress(VEIL_POOL),
      entrypoint: "get_public_key",
      calldata: ["0x123"],
    }, "latest"],
  ]);
});

test("direct address can resolve while Privacy Pool registration is missing", async () => {
  const service = createRecipientDiscoveryService({
    privacyPoolAddress: VEIL_POOL,
    getProvider: async () => ({
      getChainId: async () => "0x534e5f5345504f4c4941",
      getStarkName: async () => { throw new Error("no reverse"); },
      callContract: async () => ["0x0"],
    }),
  });
  const result = await service.resolve("0x000abc");
  assert.equal(result.status, "resolved");
  assert.equal(result.address, "0xabc");
  assert.equal(result.privacyPoolStatus, "not_registered");
});

test("pool lookup fails closed without discarding successful identity resolution", async () => {
  const service = createRecipientDiscoveryService({
    privacyPoolAddress: VEIL_POOL,
    getProvider: async () => ({
      getChainId: async () => "SN_SEPOLIA",
      getAddressFromStarkName: async () => "0x123",
      callContract: async () => [],
    }),
  });
  const result = await service.resolve("alice.stark");
  assert.equal(result.status, "resolved");
  assert.equal(result.privacyPoolStatus, "unavailable");
});

test("bad input, missing name, wrong chain, and invalid pool fail closed", async () => {
  assert.throws(
    () => createRecipientDiscoveryService({ getProvider: async () => ({}), privacyPoolAddress: "" }),
    /verified VEIL Privacy Pool address/,
  );

  let reads = 0;
  const invalid = createRecipientDiscoveryService({
    privacyPoolAddress: VEIL_POOL,
    getProvider: async () => { reads += 1; return {}; },
  });
  assert.equal((await invalid.resolve("bad identity")).status, "invalid");
  assert.equal(reads, 0);

  const missing = createRecipientDiscoveryService({
    privacyPoolAddress: VEIL_POOL,
    getProvider: async () => ({
      getChainId: async () => "SN_SEPOLIA",
      getAddressFromStarkName: async () => "0x0",
    }),
  });
  assert.equal((await missing.resolve("missing.stark")).status, "not_found");

  const wrongChain = createRecipientDiscoveryService({
    privacyPoolAddress: VEIL_POOL,
    getProvider: async () => ({
      getChainId: async () => "SN_MAIN",
      getAddressFromStarkName: async () => "0x123",
    }),
  });
  assert.equal((await wrongChain.resolve("alice.stark")).status, "unavailable");
});

test("production remains locked after pool participant verification", async () => {
  assert.equal(normalizeRecipientAddress("0x000123"), "0x123");
  assert.equal(normalizeRecipientAddress("0x0"), "");
  assert.equal(normalizeStarkName(" Alice.Stark "), "alice.stark");

  const controller = await readFile(new URL("../frontend/src/features/invite/invite-controller.js", import.meta.url), "utf8");
  const registry = await readFile(new URL("../frontend/src/app/feature-registry.js", import.meta.url), "utf8");
  const bootstrap = await readFile(new URL("../frontend/src/app/bootstrap.js", import.meta.url), "utf8");

  assert.match(controller, /primaryAction\.disabled = true/);
  assert.match(controller, /Deal Creation Unavailable/);
  assert.match(controller, /Pool Participant/);
  assert.match(controller, /channel discovery and invite delivery pass two-party E2E verification/);
  assert.match(registry, /dealCreationEnabled:\s*config\.demoRuntimeMode/);
  assert.match(bootstrap, /privacyPoolAddress:\s*config\.privacyPoolAddress/);
});
