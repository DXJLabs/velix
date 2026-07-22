import assert from "node:assert/strict";
import test from "node:test";

import { OfficialPrivacyFlows } from "../dist/privacy/financial-flows.js";
import {
  buildPrivateEscrowFundingPlan,
  buildPrivateEscrowRefundCalldata,
  buildPrivateEscrowReleaseCalldata,
  computePrivateEscrowRefundCommitment,
  computePrivateEscrowReleaseCommitment,
} from "../dist/privacy/private-escrow-settlement.js";

const ACCOUNT = 0x111n;
const POOL = 0x222n;
const TOKEN = 0x333n;
const SETTLEMENT = 0x444n;
const RECIPIENT = 0x555n;
const CUSTODY = 0x123n;
const RELEASE_SECRET = 0x456n;
const REFUND_SECRET = 0x789n;

function createHarness(options = {}) {
  const batches = [];
  const submissions = [];
  let block = options.block ?? 100;
  const registry = { channels: {}, notes: {} };
  const notes = options.notes ?? [
    { id: 1n, amount: 70n, created: 80, witness: {}, sender: ACCOUNT },
    { id: 2n, amount: 500n, created: 95, witness: {}, sender: ACCOUNT },
  ];

  const transfers = {
    user: ACCOUNT,
    async discoverRequirement() {
      return 3;
    },
    async discoverNotes() {
      return { timestamp: block, notes: { get: () => notes } };
    },
    invalidateProofNonceCache() {},
    build(buildOptions) {
      const batch = { buildOptions, calls: [], invoke: undefined };
      batches.push(batch);
      const builder = {
        with(token) {
          batch.calls.push(["with", token]);
          return builder;
        },
        inputs(...selected) {
          batch.calls.push(["inputs", selected]);
          return builder;
        },
        withdraw(input) {
          batch.calls.push(["withdraw", input]);
          return builder;
        },
        transfer(input) {
          batch.calls.push(["transfer", input]);
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
          const withdrawalCall = batch.calls.find(([name]) => name === "withdraw");
          const transferToken = batch.calls.find(([name]) => name === "with")?.[1];
          const defaultArgs = {
            openNotes: batch.calls.some(([name]) => name === "transfer")
              ? [{ noteId: options.outputNoteId ?? 0xabcn, token: transferToken }]
              : [],
            withdrawals: withdrawalCall
              ? [{
                  recipient: withdrawalCall[1].recipient,
                  token: transferToken,
                  amount: withdrawalCall[1].amount,
                }]
              : [],
            poolAddress: POOL,
          };
          batch.invoke = callback(options.invokeArgs ?? defaultArgs);
          return builder;
        },
        async execute(executeOptions) {
          batch.calls.push(["execute", executeOptions]);
          return {
            callAndProof: {
              call: {
                contractAddress: "0x222",
                entrypoint: "apply_actions",
                calldata: ["0x1"],
              },
              proof: { data: "0xproof", output: [], proofFacts: ["0x123"] },
            },
            registry: { ...registry, batch: batches.length },
            warnings: [],
          };
        },
      };
      return builder;
    },
  };

  const flows = new OfficialPrivacyFlows({
    context: { transfers, registry, screeningCapable: true },
    poolAddress: POOL,
    accountAddress: ACCOUNT,
    approval: {
      async getAllowance() { return 0n; },
      async approveExact() { return "0xapprove"; },
    },
    chain: {
      async getCurrentBlock() {
        const current = block;
        block += 5;
        return current;
      },
      async waitForTransaction(transactionHash) {
        return { accepted: true, transactionHash };
      },
      isAccepted(receipt) { return receipt.accepted === true; },
    },
    submitter: {
      async submit(call, details) {
        submissions.push({ call, details });
        return { transactionHash: `0x${submissions.length}` };
      },
    },
    async refreshPrivateState() {},
    confirmUserLinkage: async () => true,
  });

  return { flows, batches, submissions };
}

test("commitments and calldata match the Cairo private escrow ABI", () => {
  assert.equal(
    computePrivateEscrowReleaseCommitment(CUSTODY, RELEASE_SECRET),
    "0x35e70acf82dc8e95d2e4dd641fb071550810429bad0341528f088ebcadf8236",
  );
  assert.equal(
    computePrivateEscrowRefundCommitment(CUSTODY, REFUND_SECRET),
    "0x44a23fb1d0392e9d937c7bad053d22005c1ad34de1338a6ba49f7445e84181c",
  );

  const plan = buildPrivateEscrowFundingPlan({
    settlementAddress: SETTLEMENT,
    token: TOKEN,
    amount: 50n,
    custodyCommitment: CUSTODY,
    releaseSecret: RELEASE_SECRET,
    refundSecret: REFUND_SECRET,
    refundAfter: 1_800_000_000n,
  });
  assert.deepEqual(plan.calldata, [
    1n,
    CUSTODY,
    BigInt(computePrivateEscrowReleaseCommitment(CUSTODY, RELEASE_SECRET)),
    BigInt(computePrivateEscrowRefundCommitment(CUSTODY, REFUND_SECRET)),
    1_800_000_000n,
    TOKEN,
    50n,
  ]);
  assert.deepEqual(buildPrivateEscrowReleaseCalldata({
    custodyCommitment: CUSTODY,
    releaseSecret: RELEASE_SECRET,
    outputNoteId: 0xabcn,
  }), [2n, CUSTODY, RELEASE_SECRET, 0xabcn]);
  assert.deepEqual(buildPrivateEscrowRefundCalldata({
    custodyCommitment: CUSTODY,
    refundSecret: REFUND_SECRET,
    outputNoteId: 0xdefn,
  }), [3n, CUSTODY, REFUND_SECRET, 0xdefn]);
});

test("fundPrivateEscrowCustody selects mature notes and binds one exact withdrawal", async () => {
  const harness = createHarness();
  await harness.flows.fundPrivateEscrowCustody({
    settlementAddress: SETTLEMENT,
    token: TOKEN,
    amount: 50n,
    custodyCommitment: CUSTODY,
    releaseSecret: RELEASE_SECRET,
    refundSecret: REFUND_SECRET,
    refundAfter: 1_800_000_000n,
  });

  const batch = harness.batches[0];
  assert.deepEqual(
    batch.calls.find(([name]) => name === "inputs")[1].map((note) => note.id),
    [1n],
  );
  assert.deepEqual(
    batch.calls.find(([name]) => name === "withdraw"),
    ["withdraw", { recipient: SETTLEMENT, amount: 50n }],
  );
  assert.deepEqual(
    batch.calls.find(([name]) => name === "surplusTo"),
    ["surplusTo", ACCOUNT],
  );
  assert.equal(batch.invoke.contractAddress, "0x444");
  assert.deepEqual(batch.invoke.calldata.slice(0, 2), [1n, CUSTODY]);
  assert.equal(batch.invoke.calldata[5], TOKEN);
  assert.equal(batch.invoke.calldata[6], 50n);
  assert.equal(harness.submissions.length, 1);
});

test("funding rejects missing, extra, or altered official withdrawals", async () => {
  for (const withdrawals of [
    [],
    [{ recipient: SETTLEMENT, token: TOKEN, amount: 49n }],
    [
      { recipient: SETTLEMENT, token: TOKEN, amount: 50n },
      { recipient: SETTLEMENT, token: TOKEN, amount: 50n },
    ],
  ]) {
    const harness = createHarness({
      invokeArgs: { openNotes: [], withdrawals, poolAddress: POOL },
    });
    await assert.rejects(
      () => harness.flows.fundPrivateEscrowCustody({
        settlementAddress: SETTLEMENT,
        token: TOKEN,
        amount: 50n,
        custodyCommitment: CUSTODY,
        releaseSecret: RELEASE_SECRET,
        refundSecret: REFUND_SECRET,
        refundAfter: 1_800_000_000n,
      }),
      (error) => error.code === "INVALID_ESCROW_STATE",
    );
    assert.equal(harness.submissions.length, 0);
  }
});

test("release uses the official Open output note id in settlement calldata", async () => {
  const harness = createHarness({ outputNoteId: 0xcafen });
  await harness.flows.releasePrivateEscrowCustody({
    settlementAddress: SETTLEMENT,
    token: TOKEN,
    recipient: RECIPIENT,
    custodyCommitment: CUSTODY,
    releaseSecret: RELEASE_SECRET,
  });

  const batch = harness.batches[0];
  const transfer = batch.calls.find(([name]) => name === "transfer")[1];
  assert.equal(transfer.recipient, RECIPIENT);
  assert.equal(typeof transfer.amount, "symbol");
  assert.equal(batch.invoke.contractAddress, "0x444");
  assert.deepEqual(batch.invoke.calldata, [2n, CUSTODY, RELEASE_SECRET, 0xcafen]);
  assert.equal(batch.buildOptions.autoSetup, true);
  assert.deepEqual(batch.buildOptions.autoDiscover, { channels: "refresh" });
});

test("refund uses the official Open output note id in settlement calldata", async () => {
  const harness = createHarness({ outputNoteId: 0xbeefn });
  await harness.flows.refundPrivateEscrowCustody({
    settlementAddress: SETTLEMENT,
    token: TOKEN,
    recipient: RECIPIENT,
    custodyCommitment: CUSTODY,
    refundSecret: REFUND_SECRET,
  });

  assert.deepEqual(
    harness.batches[0].invoke.calldata,
    [3n, CUSTODY, REFUND_SECRET, 0xbeefn],
  );
});

test("release and refund reject non-canonical Open output metadata", async () => {
  const invalidOpenNotes = [
    [],
    [{ noteId: 1n, token: 0x999n }],
    [{ noteId: 1n, token: TOKEN }, { noteId: 2n, token: TOKEN }],
  ];

  for (const openNotes of invalidOpenNotes) {
    const harness = createHarness({
      invokeArgs: { openNotes, withdrawals: [], poolAddress: POOL },
    });
    await assert.rejects(
      () => harness.flows.releasePrivateEscrowCustody({
        settlementAddress: SETTLEMENT,
        token: TOKEN,
        recipient: RECIPIENT,
        custodyCommitment: CUSTODY,
        releaseSecret: RELEASE_SECRET,
      }),
      (error) => error.code === "INVALID_ESCROW_STATE",
    );
    assert.equal(harness.submissions.length, 0);
  }
});
