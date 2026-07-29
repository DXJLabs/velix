import assert from "node:assert/strict";
import test from "node:test";

import {
  FailClosedRegistrationDiscoveryProvider,
  RegistrationDiscoveryAccessError,
  generateLocalViewingKey,
  prepareOfficialRegistrationProof,
} from "../dist/privacy/registration-proof.js";
import {
  OFFICIAL_MAX_VIEWING_KEY,
} from "../dist/privacy/viewing-key.js";
import { createPrivacyNamespace } from "../dist/privacy/namespace.js";
import { VeilPrivacyError } from "../dist/privacy/errors.js";

function namespace() {
  return createPrivacyNamespace({
    chainId: "SN_SEPOLIA",
    poolAddress: "0x123",
    accountAddress: "0x456",
    provider: "indexer",
    providerIdentity: "https://indexer.example.test",
  });
}

class MemoryViewingKeyVault {
  value;
  puts = 0;

  async get() {
    return this.value;
  }

  async put(_namespace, value) {
    this.puts += 1;
    this.value = value;
  }

  async delete() {
    this.value = undefined;
  }

  createProvider() {
    return {
      getViewingKey: async () => {
        if (this.value === undefined) {
          throw new VeilPrivacyError(
            "VIEWING_KEY_UNAVAILABLE",
            "Missing test viewing key.",
          );
        }
        return this.value;
      },
    };
  }
}

function user() {
  return {
    address: "0x456",
    signer: {
      async signTransaction() {
        return ["0x1", "0x2"];
      },
    },
  };
}

function proofResult() {
  return {
    callAndProof: {
      call: {
        contractAddress: "0x123",
        entrypoint: "apply_actions",
        calldata: [],
      },
      proof: {
        data: "0xproof",
        output: [],
        proofFacts: ["0x1"],
      },
    },
    registry: {},
    warnings: [],
  };
}

test("secure viewing-key generator returns official-range bigint", () => {
  for (let index = 0; index < 32; index += 1) {
    const value = generateLocalViewingKey(globalThis.crypto);
    assert.equal(typeof value, "bigint");
    assert.ok(value >= 1n);
    assert.ok(value <= OFFICIAL_MAX_VIEWING_KEY);
  }
});

test("registration proof creates and persists one key before official register", async () => {
  const vault = new MemoryViewingKeyVault();
  const calls = [];

  const prepared = await prepareOfficialRegistrationProof({
    user: user(),
    namespace: namespace(),
    viewingKeyVault: vault,
    provingProvider: {},
    poolAddress: "0x123",
    provingBlockId: 100,
    createTransfers(input) {
      calls.push(["factory", input]);
      return {
        build(options) {
          calls.push(["build", options]);
          return {
            register() {
              calls.push(["register"]);
              return {
                async execute(options) {
                  calls.push(["execute", options]);
                  assert.equal(
                    await input.viewingKeyProvider.getViewingKey(),
                    vault.value,
                  );
                  return proofResult();
                },
              };
            },
          };
        },
      };
    },
  });

  assert.equal(vault.puts, 1);
  assert.equal(prepared.viewingKeyCreated, true);
  assert.equal(prepared.proofPresent, true);
  assert.equal(prepared.proofFactsCount, 1);
  assert.equal(prepared.discoveryCalls, 0);
  assert.equal(calls[0][0], "factory");
  assert.equal(calls[0][1].poolMode, "compatibility");
  assert.equal(calls[1][1].registryConst, true);
  assert.deepEqual(calls.at(-1), ["execute", { provingBlockId: 100 }]);
});

test("registration proof reuses an existing encrypted viewing key", async () => {
  const vault = new MemoryViewingKeyVault();
  vault.value = 77n;

  const prepared = await prepareOfficialRegistrationProof({
    user: user(),
    namespace: namespace(),
    viewingKeyVault: vault,
    provingProvider: {},
    poolAddress: "0x123",
    provingBlockId: 100,
    createTransfers() {
      return {
        build() {
          return {
            register() {
              return {
                async execute() {
                  return proofResult();
                },
              };
            },
          };
        },
      };
    },
  });

  assert.equal(vault.puts, 0);
  assert.equal(prepared.viewingKeyCreated, false);
});

test("registration proof fails closed on empty proof or missing signer", async () => {
  const vault = new MemoryViewingKeyVault();

  await assert.rejects(
    () => prepareOfficialRegistrationProof({
      user: { address: "0x456", signer: {} },
      namespace: namespace(),
      viewingKeyVault: vault,
      provingProvider: {},
      poolAddress: "0x123",
      provingBlockId: 100,
      createTransfers() {
        throw new Error("must not run");
      },
    }),
    (error) => error instanceof VeilPrivacyError
      && error.code === "PRIVACY_WALLET_UNSUPPORTED",
  );

  await assert.rejects(
    () => prepareOfficialRegistrationProof({
      user: user(),
      namespace: namespace(),
      viewingKeyVault: vault,
      provingProvider: {},
      poolAddress: "0x123",
      provingBlockId: 100,
      createTransfers() {
        return {
          build() {
            return {
              register() {
                return {
                  async execute() {
                    const result = proofResult();
                    result.callAndProof.proof.data = "";
                    result.callAndProof.proof.proofFacts = [];
                    return result;
                  },
                };
              },
            };
          },
        };
      },
    }),
    (error) => error instanceof VeilPrivacyError
      && error.code === "PROVING_FAILED",
  );
});

test("registration discovery provider always fails closed", async () => {
  const provider = new FailClosedRegistrationDiscoveryProvider();

  await assert.rejects(
    () => provider.discoverRequirement(),
    (error) => error instanceof RegistrationDiscoveryAccessError
      && error.method === "discoverRequirement",
  );
  assert.equal(provider.discoveryCalls, 1);
  assert.equal(provider.lastMethod, "discoverRequirement");
});
