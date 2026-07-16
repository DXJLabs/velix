import assert from "node:assert/strict";
import test from "node:test";

import { OfficialPrivacyFlows } from "../dist/privacy/financial-flows.js";

function createHarness(options = {}) {
  const operations = [];
  const submissions = [];
  const stages = [];
  let allowance = options.allowance ?? 0n;
  let block = options.block ?? 100;
  let invalidations = 0;
  let refreshes = 0;
  let submitAttempts = 0;
  const notes = options.notes ?? [
    { id: 1n, amount: 70n, created: 80, witness: {}, sender: 1n },
    { id: 2n, amount: 40n, created: 95, witness: {}, sender: 1n },
  ];
  const registry = { channels: {}, notes: {} };

  const transfers = {
    user: 0x111n,
    async discoverRequirement() {
      operations.push(["requirement"]);
      if (options.discoveryError) throw new Error("discovery offline");
      return options.requirement ?? 3;
    },
    async discoverNotes() {
      operations.push(["discoverNotes"]);
      if (options.discoveryError) throw new Error("discovery offline");
      return { timestamp: block, notes: { get: () => notes } };
    },
    invalidateProofNonceCache() {
      invalidations += 1;
    },
    build(buildOptions) {
      const batch = { buildOptions, calls: [], invokeCount: 0 };
      operations.push(["build", batch]);
      const builder = {
        register() {
          batch.calls.push(["register"]);
          return builder;
        },
        with(token) {
          batch.calls.push(["with", token]);
          return builder;
        },
        inputs(...selected) {
          batch.calls.push(["inputs", selected]);
          return builder;
        },
        deposit(input) {
          batch.calls.push(["deposit", input]);
          return builder;
        },
        transfer(input) {
          batch.calls.push(["transfer", input]);
          return builder;
        },
        withdraw(input) {
          batch.calls.push(["withdraw", input]);
          return builder;
        },
        surplusTo(recipient) {
          batch.calls.push(["surplusTo", recipient]);
          return builder;
        },
        done() {
          return builder;
        },
        invoke(callback) {
          batch.invokeCount += 1;
          batch.calls.push(["invoke", callback({ openNotes: [], withdrawals: [], poolAddress: 0x222n })]);
          return builder;
        },
        async execute(executeOptions) {
          batch.calls.push(["execute", executeOptions]);
          const proofFacts = options.emptyProofFacts ? [] : ["0x123"];
          return {
            callAndProof: {
              call: { contractAddress: "0x222", entrypoint: "apply_actions", calldata: ["0x1"] },
              proof: { data: "0xproof", output: [], proofFacts },
            },
            registry: { ...registry, attempt: operations.filter(([name]) => name === "build").length },
            warnings: options.warnings ?? [],
          };
        },
      };
      return builder;
    },
  };

  const flows = new OfficialPrivacyFlows({
    context: { transfers, registry, screeningCapable: options.screeningCapable ?? true },
    poolAddress: 0x222n,
    accountAddress: 0x111n,
    approval: {
      async getAllowance() {
        operations.push(["allowance", allowance]);
        return allowance;
      },
      async approveExact(input) {
        operations.push(["approve", input]);
        allowance = input.amount;
        return "0xapprove";
      },
    },
    chain: {
      async getCurrentBlock() {
        const value = block;
        block += 5;
        return value;
      },
      async waitForTransaction(transactionHash) {
        operations.push(["wait", transactionHash]);
        return { accepted: true, transactionHash };
      },
      isAccepted(receipt) {
        return receipt.accepted === true;
      },
    },
    submitter: {
      async submit(call, details) {
        submitAttempts += 1;
        submissions.push({ call, details });
        if (options.failFirstSubmit && submitAttempts === 1) throw new Error("invalid nonce");
        return { transactionHash: `0xprivate${submitAttempts}` };
      },
    },
    async refreshPrivateState() {
      refreshes += 1;
    },
    onStage(stage) {
      stages.push(stage);
    },
    confirmUserLinkage: options.confirmUserLinkage,
  });

  return {
    flows,
    operations,
    submissions,
    stages,
    stats: () => ({ invalidations, refreshes, submitAttempts }),
  };
}

test("Shield fails closed before approval on a non-screening Pool", async () => {
  const harness = createHarness({ screeningCapable: false });
  await assert.rejects(() => harness.flows.shield({ token: 0x333n, amount: 50n }), (error) => error.code === "POOL_VERSION_MISMATCH");
  assert.equal(harness.operations.length, 0);
});

test("Shield performs exact approval, waits, then builds a fresh private deposit", async () => {
  const harness = createHarness({ allowance: 999n });
  const result = await harness.flows.shield({ token: 0x333n, amount: 50n });
  assert.equal(result.approval.required, true);
  assert.equal(result.provingBlockId, 90);
  const names = harness.operations.map(([name]) => name);
  assert.deepEqual(names.slice(0, 4), ["allowance", "approve", "wait", "build"]);
  const batch = harness.operations.find(([name]) => name === "build")[1];
  assert.deepEqual(batch.calls.find(([name]) => name === "deposit")[1], { amount: 50n });
  assert.deepEqual(batch.calls.find(([name]) => name === "surplusTo"), ["surplusTo", 0x111n]);
  assert.ok(harness.stages.indexOf("approval-confirmed") < harness.stages.indexOf("generating-proof"));
});

test("private transfer rejects unregistered recipients and never treats discovery failure as zero", async () => {
  const unregistered = createHarness({ requirement: 0 });
  await assert.rejects(
    () => unregistered.flows.transfer({ token: 0x333n, recipient: 0x444n, amount: 50n }),
    (error) => error.code === "RECIPIENT_NOT_REGISTERED",
  );
  assert.equal(unregistered.operations.some(([name]) => name === "discoverNotes"), false);

  const failed = createHarness({ discoveryError: true });
  await assert.rejects(
    () => failed.flows.transfer({ token: 0x333n, recipient: 0x444n, amount: 50n }),
    (error) => error.code === "DISCOVERY_FAILED",
  );
});

test("private transfer selects only mature notes and sends surplus to the active account", async () => {
  const harness = createHarness();
  await harness.flows.transfer({ token: 0x333n, recipient: 0x444n, amount: 50n });
  const batch = harness.operations.find(([name]) => name === "build")[1];
  const selected = batch.calls.find(([name]) => name === "inputs")[1];
  assert.deepEqual(selected.map((note) => note.id), [1n]);
  assert.deepEqual(batch.calls.find(([name]) => name === "surplusTo"), ["surplusTo", 0x111n]);
});

test("payment and encrypted memo compose one proof and exactly one external invoke", async () => {
  const harness = createHarness({ emptyProofFacts: true });
  await harness.flows.payWithEncryptedMemo({
    token: 0x333n,
    recipient: 0x444n,
    helperAddress: 0x555n,
    amount: 50n,
    encryptedMemoCalldata: [1n, 2n, 3n],
  });
  const batch = harness.operations.find(([name]) => name === "build")[1];
  assert.equal(batch.invokeCount, 1);
  assert.deepEqual(batch.calls.find(([name]) => name === "invoke")[1], {
    contractAddress: "0x555",
    calldata: [1n, 2n, 3n],
  });
  assert.deepEqual(harness.submissions[0].details, { tip: 0n });
});

test("withdrawal linkage warnings require explicit confirmation before submission", async () => {
  const warning = { code: "USER_LINKAGE", message: "public linkage" };
  const blocked = createHarness({ warnings: [warning] });
  await assert.rejects(
    () => blocked.flows.withdraw({ token: 0x333n, recipient: 0x111n, amount: 50n }),
    (error) => error.code === "USER_LINKAGE_WARNING",
  );
  assert.equal(blocked.submissions.length, 0);

  const allowed = createHarness({ warnings: [warning], confirmUserLinkage: async () => true });
  await allowed.flows.withdraw({ token: 0x333n, recipient: 0x111n, amount: 50n });
  assert.equal(allowed.submissions.length, 1);
});

test("stale nonce retry invalidates state and rebuilds instead of resubmitting old proof", async () => {
  const harness = createHarness({ failFirstSubmit: true });
  const result = await harness.flows.transfer({ token: 0x333n, recipient: 0x444n, amount: 50n });
  assert.equal(result.attempt, 1);
  assert.equal(harness.operations.filter(([name]) => name === "build").length, 2);
  assert.deepEqual(harness.stats(), { invalidations: 1, refreshes: 1, submitAttempts: 2 });
  assert.deepEqual(harness.submissions.map(({ details }) => details.tip), [0n, 0n]);
});

test("Fund and Pay Privately composes deposit, recipient output, and sender surplus atomically", async () => {
  const harness = createHarness({ allowance: 80n });
  await harness.flows.fundAndPay({
    token: 0x333n,
    recipient: 0x444n,
    amount: 50n,
    depositAmount: 80n,
  });
  const batch = harness.operations.find(([name]) => name === "build")[1];
  assert.deepEqual(batch.calls.filter(([name]) => ["deposit", "transfer", "surplusTo"].includes(name)), [
    ["deposit", { amount: 80n }],
    ["transfer", { recipient: 0x444n, amount: 50n }],
    ["surplusTo", 0x111n],
  ]);
});
