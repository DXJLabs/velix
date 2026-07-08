import { describe, it } from "node:test";
import { assert, sdk } from "./production-messaging.helpers.mjs";

const {
  createVeilDealCommitments,
  createVeilOnchainContracts,
} = sdk;

function createHarness() {
  const calls = [];
  const provider = {
    async callContract(call) {
      if (call.entrypoint === "get_offer_count") return ["4"];
      if (call.entrypoint === "get_escrow_count") return ["9"];
      throw new Error(`Unexpected call ${call.entrypoint}`);
    },
    async waitForTransaction() {
      return { status: "ACCEPTED_ON_L2", block_number: 55 };
    },
  };
  const account = {
    address: "0xabc",
    async execute(callList) {
      calls.push(callList);
      return { transaction_hash: "0xtx" };
    },
  };
  const contracts = createVeilOnchainContracts({
    offerAddress: "0xoffer",
    escrowAddress: "0xescrow",
    settlementHelperAddress: "0xsettlement",
    account,
    provider,
    now: () => 1_700_000_000_000,
  });
  return { calls, contracts };
}

describe("VEIL offer and escrow contract helpers", () => {
  it("builds VeilOffer create_offer calldata", async () => {
    const { calls, contracts } = createHarness();
    const result = await contracts.createOffer({
      channelId: "channel-1",
      taker: "0xdef",
      amount: "450",
      currency: "STRK",
      asset: "Rights Package / NFT",
      terms: "Buyer deposits funds, seller locks asset.",
    });

    assert.equal(result.offerId, "5");
    assert.equal(result.transactionHash, "0xtx");
    assert.equal(result.blockNumber, 55);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].length, 1);
    assert.equal(calls[0][0].contractAddress, "0xoffer");
    assert.equal(calls[0][0].entrypoint, "create_offer");
    assert.equal(calls[0][0].calldata.length, 8);
    assert.equal(calls[0][0].calldata[1], "0xdef");
    assert.equal(calls[0][0].calldata[7], String(1_700_000_000 + 24 * 60 * 60));
  });

  it("builds accept_offer plus create_escrow multicall", async () => {
    const { calls, contracts } = createHarness();
    const commitments = await createVeilDealCommitments({
      channelId: "channel-1",
      amount: "450",
      currency: "STRK",
      asset: "Rights Package / NFT",
      terms: "Buyer deposits funds, seller locks asset.",
      now: () => 1_700_000_000_000,
    });

    const result = await contracts.acceptOfferAndCreateEscrow({
      channelId: "channel-1",
      offerId: "7",
      seller: "0xdef",
      commitments,
    });

    assert.equal(result.escrowId, "10");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].length, 2);
    assert.equal(calls[0][0].contractAddress, "0xoffer");
    assert.equal(calls[0][0].entrypoint, "accept_offer");
    assert.deepEqual(calls[0][0].calldata, ["7"]);
    assert.equal(calls[0][1].contractAddress, "0xescrow");
    assert.equal(calls[0][1].entrypoint, "create_escrow");
    assert.equal(calls[0][1].calldata.length, 7);
    assert.equal(calls[0][1].calldata[1], "7");
    assert.equal(calls[0][1].calldata[2], "0xdef");
    assert.equal(calls[0][1].calldata[6], "0xsettlement");
  });
});
