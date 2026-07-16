import assert from "node:assert/strict";
import test from "node:test";

import {
  Strk20WalletApiClient,
  detectStrk20WalletCapabilities,
  strk20InvokeAction,
  strk20TransferAction,
} from "../dist/privacy/wallet-api.js";

test("capability detection uses the official wallet_supportedWalletApi version without probing private state", async () => {
  const requests = [];
  const capable = await detectStrk20WalletCapabilities({
    async request(input) {
      requests.push(input);
      return ["0.10.2", "0.10.3"];
    },
  });
  assert.deepEqual(requests, [{ type: "wallet_supportedWalletApi" }]);
  assert.equal(capable.supported, true);
  assert.equal(capable.privateTransfer, true);
  assert.equal(capable.walletProofManagement, true);
  assert.equal(capable.registration, false);
  assert.equal(capable.shield, false);
  assert.equal(capable.screeningCapableDeposit, false);

  const old = await detectStrk20WalletCapabilities({ request: async () => ["0.10.2"] });
  assert.equal(old.supported, false);
  assert.equal(old.apiVersion, "0.10.2");
  const absent = await detectStrk20WalletCapabilities({});
  assert.equal(absent.supported, false);
});

test("wallet balances use exact official method/params and preserve bigint amounts", async () => {
  const requests = [];
  const client = new Strk20WalletApiClient({
    wallet: {
      async request(input) {
        requests.push(input);
        return [{ token: "0x333", balance: "0x2a" }];
      },
    },
    allowedInvokeContracts: [0x555n],
  });
  const balances = await client.balances([0x333n]);
  assert.deepEqual(balances, [{ token: "0x333", balance: 42n }]);
  assert.deepEqual(requests[0], {
    type: "wallet_strk20Balances",
    params: { tokens: ["0x333"], api_version: "0.10.3" },
  });
});

test("wallet action submission allows only configured VEIL targets and one invoke", async () => {
  const requests = [];
  const client = new Strk20WalletApiClient({
    wallet: {
      async request(input) {
        requests.push(input);
        return { transaction_hash: "0xabc" };
      },
    },
    allowedInvokeContracts: [0x555n],
  });
  const hash = await client.invoke([
    strk20TransferAction(0x333n, 0x444n, 10n),
    strk20InvokeAction(0x555n, [1n, 2n]),
  ]);
  assert.equal(hash, "0xabc");
  assert.equal(requests[0].type, "wallet_strk20InvokeTransaction");
  assert.deepEqual(requests[0].params.actions, [
    { type: "transfer", token: "0x333", amount: "0xa", recipient: "0x444" },
    { type: "invoke", contract: "0x555", calldata: ["0x1", "0x2"] },
  ]);

  await assert.rejects(
    () => client.invoke([strk20InvokeAction(0x666n, [1n])]),
    /not a configured VEIL contract/,
  );
  await assert.rejects(
    () => client.invoke([strk20InvokeAction(0x555n, [1n]), strk20InvokeAction(0x555n, [2n])]),
    (error) => error.code === "MULTIPLE_EXTERNAL_INVOKES",
  );
});

test("prepared wallet proofs are validated and simulation cannot be mistaken for submission", async () => {
  const action = strk20TransferAction(0x333n, 0x444n, 10n);
  const simulatedClient = new Strk20WalletApiClient({
    wallet: {
      async request() {
        return {
          call: { contract_address: "0x222", entry_point: "apply_actions", calldata: ["0x1"] },
          proof: { data: "", output: [], proof_facts: [] },
        };
      },
    },
    allowedInvokeContracts: [],
  });
  const simulated = await simulatedClient.prepare([action], true);
  assert.equal(simulated.simulated, true);
  assert.equal(simulated.proof.data, "");
  await assert.rejects(
    () => simulatedClient.prepare([action], false),
    (error) => error.code === "INVALID_PROOF_FACTS",
  );
});

test("official wallet error codes map to typed product failures", async () => {
  const client = new Strk20WalletApiClient({
    wallet: { request: async () => Promise.reject({ code: 118 }) },
    allowedInvokeContracts: [],
  });
  await assert.rejects(() => client.balances([]), (error) => error.code === "SENDER_NOT_REGISTERED");
});
