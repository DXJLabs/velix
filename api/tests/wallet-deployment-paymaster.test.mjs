import assert from "node:assert/strict";
import test from "node:test";

import {
  expectedArgentXV050Deployment,
  validateWalletDeployPayload,
  walletDeploySponsorshipEnabled,
} from "../_lib/wallet-deployment.js";

const CONTEXT = { route: "/api/paymaster", requestId: "wallet-deploy-test" };
const PUBLIC_KEY = "0x123456789abcdef";
const EXPECTED = expectedArgentXV050Deployment(PUBLIC_KEY);

function payload(overrides = {}) {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "paymaster_buildTransaction",
    params: {
      transaction: {
        type: "deploy",
        deployment: {
          address: EXPECTED.address,
          class_hash: EXPECTED.classHash,
          salt: EXPECTED.salt,
          calldata: [...EXPECTED.calldata],
          version: 1,
        },
      },
      parameters: {
        version: "0x1",
        fee_mode: { mode: "sponsored" },
      },
    },
    ...overrides,
  };
}

test("legacy paymaster flag enables wallet deployment only", () => {
  assert.equal(walletDeploySponsorshipEnabled({ VITE_AVNU_PAYMASTER_ENABLED: "true" }), true);
  assert.equal(walletDeploySponsorshipEnabled({ VITE_AVNU_PAYMASTER_ENABLED: "false" }), false);
  assert.equal(walletDeploySponsorshipEnabled({
    VITE_AVNU_PAYMASTER_ENABLED: "true",
    VITE_AVNU_WALLET_DEPLOY_ENABLED: "false",
  }), false);
});

test("wallet deployment validator accepts the pinned Argent X sponsored deploy", () => {
  const result = validateWalletDeployPayload(payload(), PUBLIC_KEY, CONTEXT);
  assert.equal(result.method, "paymaster_buildTransaction");
  assert.equal(result.deployment.address, EXPECTED.address);
});

test("wallet deployment validator rejects invoke and deploy_and_invoke sponsorship", () => {
  for (const type of ["invoke", "deploy_and_invoke"]) {
    const input = payload();
    input.params.transaction = type === "invoke"
      ? { type, invoke: { user_address: EXPECTED.address, calls: [] } }
      : {
          type,
          deployment: input.params.transaction.deployment,
          invoke: { user_address: EXPECTED.address, calls: [] },
        };
    assert.throws(
      () => validateWalletDeployPayload(input, PUBLIC_KEY, CONTEXT),
      (error) => error.code === "PAYMASTER_TRANSACTION_FORBIDDEN",
    );
  }
});

test("wallet deployment validator rejects non-sponsored mode and mismatched account data", () => {
  const nonSponsored = payload();
  nonSponsored.params.parameters.fee_mode = { mode: "default", gas_token: "0x1" };
  assert.throws(
    () => validateWalletDeployPayload(nonSponsored, PUBLIC_KEY, CONTEXT),
    (error) => error.code === "PAYMASTER_FEE_MODE_FORBIDDEN",
  );

  const mismatch = payload();
  mismatch.params.transaction.deployment.address = "0x1";
  assert.throws(
    () => validateWalletDeployPayload(mismatch, PUBLIC_KEY, CONTEXT),
    (error) => error.code === "PAYMASTER_DEPLOYMENT_MISMATCH",
  );
});


test("paymaster deployment accepts AVNU null sigdata and still rejects malformed values", async () => {
  const { normalizeDeployment } = await import("../_lib/wallet-deployment.js");
  const context = { route: "/api/paymaster" };
  const base = {
    address: "0x1",
    class_hash: "0x2",
    salt: "0x3",
    calldata: ["0x4"],
    version: 1,
  };

  assert.doesNotThrow(() => normalizeDeployment({ ...base, sigdata: null }, context));
  assert.doesNotThrow(() => normalizeDeployment({ ...base, sigdata: [] }, context));
  assert.doesNotThrow(() => normalizeDeployment({ ...base, sigdata: ["0x5", "6"] }, context));

  assert.throws(
    () => normalizeDeployment({ ...base, sigdata: "0x5" }, context),
    /bounded felt array/i,
  );
  assert.throws(
    () => normalizeDeployment({ ...base, sigdata: { r: "0x5" } }, context),
    /bounded felt array/i,
  );
  assert.throws(
    () => normalizeDeployment({ ...base, sigdata: ["not-a-felt"] }, context),
    /hexadecimal or decimal felt/i,
  );
});
