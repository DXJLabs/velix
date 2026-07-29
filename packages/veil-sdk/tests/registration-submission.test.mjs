import assert from "node:assert/strict";
import test from "node:test";

import { derivePrivacyPublicKey } from "../dist/privacy_pool_ecdh.js";
import {
  assertSuccessfulRegistrationReceipt,
  submitOfficialRegistration,
} from "../dist/privacy/registration-submission.js";
import { createPrivacyNamespace } from "../dist/privacy/namespace.js";
import { VeilPrivacyError } from "../dist/privacy/errors.js";

const VIEWING_KEY = 77n;
const PUBLIC_KEY = derivePrivacyPublicKey(VIEWING_KEY);

function namespace() {
  return createPrivacyNamespace({
    chainId: "SN_SEPOLIA",
    poolAddress: "0x123",
    accountAddress: "0x456",
    provider: "indexer",
    providerIdentity: "https://indexer.example.test",
  });
}

function result() {
  return {
    callAndProof: {
      call: {
        contractAddress: "0x123",
        entrypoint: "apply_actions",
        calldata: ["0x1"],
      },
      proof: {
        data: "0xproof",
        proofFacts: ["0xabc"],
        output: [],
      },
    },
    registry: {},
    warnings: [],
  };
}

function vault(value = VIEWING_KEY) {
  return {
    async get() {
      return value;
    },
    async put() {},
    async delete() {},
    createProvider() {
      return {
        async getViewingKey() {
          if (value === undefined) {
            throw new VeilPrivacyError(
              "VIEWING_KEY_UNAVAILABLE",
              "missing",
            );
          }
          return value;
        },
      };
    },
  };
}

test("Ready submission sends proof details and verifies Pool public key", async () => {
  const executions = [];
  const waits = [];
  const reads = [];
  const provingProvider = {
    invalidations: 0,
    invalidateNonceCache() {
      this.invalidations += 1;
    },
  };

  const submitted = await submitOfficialRegistration({
    account: {
      address: "0x0456",
      async execute(call, details) {
        executions.push({ call, details });
        return { transaction_hash: "0xABC" };
      },
    },
    provider: {
      async waitForTransaction(hash) {
        waits.push(hash);
        return {
          finality_status: "ACCEPTED_ON_L2",
          execution_status: "SUCCEEDED",
          isSuccess: () => true,
          isReverted: () => false,
        };
      },
      async callContract(call, blockIdentifier) {
        reads.push({ call, blockIdentifier });
        return [PUBLIC_KEY];
      },
    },
    result: result(),
    provingProvider,
    namespace: namespace(),
    viewingKeyVault: vault(),
    poolAddress: "0x0123",
  });

  assert.equal(executions.length, 1);
  assert.deepEqual(executions[0], {
    call: {
      contractAddress: "0x123",
      entrypoint: "apply_actions",
      calldata: ["0x1"],
    },
    details: {
      tip: 0n,
      proofFacts: ["0xabc"],
      proof: "0xproof",
    },
  });
  assert.deepEqual(waits, ["0xabc"]);
  assert.deepEqual(reads, [{
    call: {
      contractAddress: "0x123",
      entrypoint: "get_public_key",
      calldata: ["0x456"],
    },
    blockIdentifier: "latest",
  }]);
  assert.equal(submitted.transactionHash, "0xabc");
  assert.equal(submitted.registrationVerified, true);
  assert.equal(submitted.proofFactsCount, 1);
  assert.equal(provingProvider.invalidations, 0);
});

test("Ready submission fails closed when Pool key does not match device key", async () => {
  const provingProvider = {
    invalidations: 0,
    invalidateNonceCache() {
      this.invalidations += 1;
    },
  };

  await assert.rejects(
    () => submitOfficialRegistration({
      account: {
        address: "0x456",
        async execute() {
          return { transaction_hash: "0x1" };
        },
      },
      provider: {
        async waitForTransaction() {
          return {
            finality_status: "ACCEPTED_ON_L2",
            execution_status: "SUCCEEDED",
          };
        },
        async callContract() {
          return ["0x999"];
        },
      },
      result: result(),
      provingProvider,
      namespace: namespace(),
      viewingKeyVault: vault(),
      poolAddress: "0x123",
    }),
    (error) => error instanceof VeilPrivacyError
      && error.code === "SENDER_NOT_REGISTERED",
  );
  assert.equal(provingProvider.invalidations, 1);
});

test("Ready submission rejects reverted receipt and invalidates proof nonce", async () => {
  const provingProvider = {
    invalidations: 0,
    invalidateNonceCache() {
      this.invalidations += 1;
    },
  };

  await assert.rejects(
    () => submitOfficialRegistration({
      account: {
        address: "0x456",
        async execute() {
          return { transaction_hash: "0x1" };
        },
      },
      provider: {
        async waitForTransaction() {
          return {
            finality_status: "ACCEPTED_ON_L2",
            execution_status: "REVERTED",
            isReverted: () => true,
          };
        },
        async callContract() {
          throw new Error("must not read");
        },
      },
      result: result(),
      provingProvider,
      namespace: namespace(),
      viewingKeyVault: vault(),
      poolAddress: "0x123",
    }),
    (error) => error instanceof VeilPrivacyError
      && error.code === "SUBMISSION_FAILED",
  );
  assert.equal(provingProvider.invalidations, 1);
});

test("Ready submission rejects account and Pool namespace mismatches before execute", async () => {
  let executions = 0;
  const base = {
    account: {
      address: "0x999",
      async execute() {
        executions += 1;
        return { transaction_hash: "0x1" };
      },
    },
    provider: {
      async waitForTransaction() {
        throw new Error("must not wait");
      },
      async callContract() {
        throw new Error("must not read");
      },
    },
    result: result(),
    provingProvider: {},
    namespace: namespace(),
    viewingKeyVault: vault(),
    poolAddress: "0x123",
  };

  await assert.rejects(
    () => submitOfficialRegistration(base),
    (error) => error instanceof VeilPrivacyError
      && error.code === "ACCOUNT_CUSTODY_MISMATCH",
  );

  await assert.rejects(
    () => submitOfficialRegistration({
      ...base,
      account: {
        ...base.account,
        address: "0x456",
      },
      poolAddress: "0x999",
    }),
    (error) => error instanceof VeilPrivacyError
      && error.code === "POOL_VERSION_MISMATCH",
  );
  assert.equal(executions, 0);
});

test("receipt validator accepts successful Starknet receipt shapes", () => {
  assert.doesNotThrow(() => assertSuccessfulRegistrationReceipt({
    finality_status: "ACCEPTED_ON_L1",
    execution_status: "SUCCEEDED",
  }));
  assert.doesNotThrow(() => assertSuccessfulRegistrationReceipt({
    isSuccess: () => true,
    isReverted: () => false,
  }));
});
