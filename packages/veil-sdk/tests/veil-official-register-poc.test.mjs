import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import {
  ISOLATED_POC_SIGNER_LABEL,
  LocalDiscoveryAccessError,
  LocalFailClosedDiscoveryProvider,
  assertRegisterProofSummarySafe,
  createOfficialProvingProvider,
  createRegisterProofSummary,
  createStandardPocSigner,
  executeOfficialRegisterProof,
} from "../../../tools/veil-official-register-poc.ts";
import { createEmptyRegistry } from "@starkware-libs/starknet-privacy-sdk";
import { constants } from "starknet";

const ACCOUNT_ADDRESS = 0x123n;
const POOL_ADDRESS = 0x456n;
const PRIVATE_KEY = "0x123456789abcdef";

function mockProvingProvider() {
  return {
    async getDefaultDetails() {
      return {
        versions: ["0x3"],
        nonce: 0n,
        skipValidate: true,
        resourceBounds: {
          l1_gas: { max_amount: 1n, max_price_per_unit: 0n },
          l2_gas: { max_amount: 100000000n, max_price_per_unit: 0n },
          l1_data_gas: { max_amount: 1n, max_price_per_unit: 0n },
        },
        tip: 0n,
        paymasterData: [],
        accountDeploymentData: [],
        nonceDataAvailabilityMode: "L1",
        feeDataAvailabilityMode: "L1",
        version: "0x3",
        chainId: constants.StarknetChainId.SN_SEPOLIA,
      };
    },
    async prove(invocation) {
      assert.ok(invocation.signature.length > 0);
      return {
        data: Buffer.from("isolated-register-proof").toString("base64"),
        output: ["0x1"],
        proofFacts: ["0x2"],
      };
    },
  };
}

test("LocalFailClosedDiscoveryProvider never performs a network request", async () => {
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => {
    networkCalls += 1;
    throw new Error("network must not be called");
  };
  try {
    const provider = new LocalFailClosedDiscoveryProvider();
    const calls = [
      ["discoverNotes", [1n, 2n]],
      ["discoverChannels", [1n, 2n, []]],
      ["discoverRequirement", [1n, 2n, 3n, 4n]],
    ];
    for (const [method, args] of calls) {
      await assert.rejects(
        () => provider[method](...args),
        (error) => error instanceof LocalDiscoveryAccessError
          && error.method === method,
      );
    }
    assert.equal(provider.discoveryCalls, 3);
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("official register builder path does not invoke discovery", async () => {
  const discoveryProvider = new LocalFailClosedDiscoveryProvider();
  const result = await executeOfficialRegisterProof({
    accountAddress: ACCOUNT_ADDRESS,
    signer: createStandardPocSigner(PRIVATE_KEY),
    viewingKey: 0x789n,
    provingProvider: mockProvingProvider(),
    discoveryProvider,
    registry: createEmptyRegistry(),
    poolAddress: POOL_ADDRESS,
    provingBlockId: "latest",
  });

  assert.equal(result.callAndProof.proof.proofFacts.length, 1);
  assert.equal(discoveryProvider.discoveryCalls, 0);
  assert.equal(discoveryProvider.lastMethod, undefined);
});

test("missing standard signer fails closed", async () => {
  assert.throws(
    () => createStandardPocSigner(""),
    new RegExp(ISOLATED_POC_SIGNER_LABEL),
  );
  await assert.rejects(
    () => executeOfficialRegisterProof({
      accountAddress: ACCOUNT_ADDRESS,
      signer: undefined,
      viewingKey: 0x789n,
      provingProvider: mockProvingProvider(),
      discoveryProvider: new LocalFailClosedDiscoveryProvider(),
      registry: createEmptyRegistry(),
      poolAddress: POOL_ADDRESS,
      provingBlockId: "latest",
    }),
    new RegExp(ISOLATED_POC_SIGNER_LABEL),
  );
});

test("missing official prover URL fails closed", () => {
  assert.throws(
    () => createOfficialProvingProvider({
      proverUrl: "",
      rpcUrl: "https://rpc.example/rpc/v0_9",
      poolAddress: POOL_ADDRESS,
      provingBlockId: "latest",
    }),
    /Official prover URL is required/u,
  );
});

test("register proof summary contains only safe metadata", () => {
  const sensitive = [PRIVATE_KEY, "viewing-material", "signature-material"];
  const summary = createRegisterProofSummary({
    result: {
      callAndProof: {
        call: { contractAddress: "0x456", entrypoint: "apply_actions", calldata: [] },
        proof: {
          data: Buffer.from("proof").toString("base64"),
          output: ["0x1", "0x2"],
          proofFacts: ["0x3"],
        },
      },
      registry: createEmptyRegistry(),
      warnings: [],
    },
    discoveryCalls: 0,
    accountAddress: ACCOUNT_ADDRESS,
    provingBlockId: "latest",
  });
  assertRegisterProofSummarySafe(summary, sensitive);
  assert.deepEqual(Object.keys(summary), [
    "result",
    "proofPresent",
    "proofLength",
    "proofFactsCount",
    "l2ToL1OutputCount",
    "discoveryCalls",
    "accountAddress",
    "provingBlockId",
  ]);
  const serialized = JSON.stringify(summary);
  for (const value of sensitive) assert.equal(serialized.includes(value), false);
});

test("removed indexer environment variable is absent from tracked tree", () => {
  const removedName = ["VEIL", "POC", "INDEXER", "URL"].join("_");
  assert.throws(
    () => execFileSync(
      "git",
      ["grep", "--fixed-strings", "--line-number", removedName, "--", "."],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
    (error) => error.status === 1 && error.stdout === "",
  );
});
