import assert from "node:assert/strict";
import test from "node:test";

import { ec } from "starknet";

import {
  encryptChannelInfo,
} from "../dist/privacy_pool_ecdh.js";
import {
  TWO_PARTY_PROOF_RESULT,
  assertTwoPartyShieldedMessageSummarySafe,
  loadVeilTwoPartyShieldedMessagePocConfig,
  prepareTwoPartyShieldedMessage,
  verifyRecipientShieldedMessageDecrypt,
  verifyRegisteredViewingKey,
} from "../../../tools/veil-official-two-party-shielded-message-poc.ts";

const SENDER_ADDRESS = "0x123";
const SENDER_PRIVATE_KEY = "0x123456789abcdef";
const SENDER_VIEWING_KEY = "0x777";
const RECIPIENT_ADDRESS = "0x456";
const RECIPIENT_VIEWING_KEY = "0x888";
const POOL_ADDRESS =
  "0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5";

function pocEnv(overrides = {}) {
  return {
    VEIL_POC_ACCOUNT_ADDRESS: SENDER_ADDRESS,
    VEIL_POC_ACCOUNT_PRIVATE_KEY: SENDER_PRIVATE_KEY,
    VEIL_POC_VIEWING_KEY: SENDER_VIEWING_KEY,
    VEIL_POC_RECIPIENT_ACCOUNT_ADDRESS: RECIPIENT_ADDRESS,
    VEIL_POC_RECIPIENT_VIEWING_KEY: RECIPIENT_VIEWING_KEY,
    STARKNET_SEPOLIA_RPC_URL: "https://rpc.example",
    VEIL_POC_PROVER_URL: "http://127.0.0.1:3000",
    VEIL_POC_GENERATE_PROOF: "false",
    VEIL_POC_SUBMIT_ONCHAIN: "false",
    ...overrides,
  };
}

async function preparedFixture() {
  const config = loadVeilTwoPartyShieldedMessagePocConfig(pocEnv());
  const recipientPublicKey = BigInt(ec.starkCurve.getStarkKey(
    RECIPIENT_VIEWING_KEY,
  ));
  const prepared = await prepareTwoPartyShieldedMessage({
    config,
    recipientPublicKey,
    recipientChannelIndex: 3,
  });
  return { config, recipientPublicKey, prepared };
}

test("two-party config keeps sender and recipient identities separate", () => {
  const config = loadVeilTwoPartyShieldedMessagePocConfig(pocEnv());
  assert.equal(config.identity.accountAddress, BigInt(SENDER_ADDRESS));
  assert.equal(config.recipientAccountAddress, BigInt(RECIPIENT_ADDRESS));
  assert.equal(config.identity.viewingKey, BigInt(SENDER_VIEWING_KEY));
  assert.equal(config.recipientViewingKey, BigInt(RECIPIENT_VIEWING_KEY));
});

test("two-party config rejects a self recipient", () => {
  assert.throws(
    () => loadVeilTwoPartyShieldedMessagePocConfig(pocEnv({
      VEIL_POC_RECIPIENT_ACCOUNT_ADDRESS: SENDER_ADDRESS,
    })),
    /different sender and recipient accounts/u,
  );
});

test("prepared payload binds sender, recipient, room, and ciphertext only", async () => {
  const { prepared } = await preparedFixture();
  assert.equal(prepared.recipientAddress, BigInt(RECIPIENT_ADDRESS));
  assert.equal(prepared.applicationContext.senderId, SENDER_ADDRESS);
  assert.equal(prepared.applicationContext.recipientId, RECIPIENT_ADDRESS);
  assert.match(
    prepared.applicationContext.roomId,
    /TWO_PARTY_SHIELDED_MESSAGE/u,
  );
  assert.equal(
    JSON.stringify(prepared.helperCalldata).includes(
      "VEIL_PRIVATE_MESSAGE_POC_V1",
    ),
    false,
  );
  assert.equal(prepared.helperCalldata[1], prepared.messageLocator);
  assert.equal(prepared.helperCalldata[2], prepared.payloadCommitment);
});

test("recipient registration must match the configured private viewing key", async () => {
  const publicKey = ec.starkCurve.getStarkKey(RECIPIENT_VIEWING_KEY);
  const provider = {
    async callContract(call) {
      assert.equal(call.entrypoint, "get_public_key");
      assert.deepEqual(call.calldata, [RECIPIENT_ADDRESS]);
      return [publicKey];
    },
  };
  const verified = await verifyRegisteredViewingKey({
    provider,
    poolAddress: BigInt(POOL_ADDRESS),
    accountAddress: BigInt(RECIPIENT_ADDRESS),
    viewingKey: BigInt(RECIPIENT_VIEWING_KEY),
    label: "recipient",
  });
  assert.equal(verified, BigInt(publicKey));
});

test("recipient recovers the channel, decrypts, and unrelated key is rejected", async () => {
  const { config, recipientPublicKey, prepared } = await preparedFixture();
  const encChannelInfo = encryptChannelInfo({
    ephemeralSecret: "55555555",
    recipientPublicKey,
    channelKey: prepared.channelKey,
    senderAddress: config.identity.accountAddress,
  });
  const provider = {
    async callContract(call) {
      if (call.entrypoint === "get_num_of_channels") {
        return [String(prepared.recipientChannelIndex + 1)];
      }
      if (call.entrypoint === "get_channel_info") {
        assert.deepEqual(call.calldata, [
          RECIPIENT_ADDRESS,
          String(prepared.recipientChannelIndex),
        ]);
        return [
          encChannelInfo.ephemeralPubkey,
          encChannelInfo.encChannelKey,
          encChannelInfo.encSenderAddr,
        ];
      }
      throw new Error(`unexpected entrypoint ${call.entrypoint}`);
    },
  };
  const result = await verifyRecipientShieldedMessageDecrypt({
    config,
    provider,
    prepared,
  });
  assert.deepEqual(result, {
    recipientChannelRecovered: true,
    recipientDecryptVerified: true,
    unrelatedViewingKeyRejected: true,
  });
});

test("safe summary excludes secrets, proof bytes, calldata, and ciphertext", () => {
  const summary = {
    result: TWO_PARTY_PROOF_RESULT,
    network: "SN_SEPOLIA",
    helperAddress: "0x1",
    privacyPoolAddress: POOL_ADDRESS,
    senderAddress: SENDER_ADDRESS,
    recipientAddress: RECIPIENT_ADDRESS,
    provingBlockId: "123",
    transactionHash: null,
    finalityStatus: "NOT_SUBMITTED",
    executionStatus: "NOT_SUBMITTED",
    messageLocator: "0xabc",
    payloadCommitment: "0xdef",
    ciphertextChunkCount: 7,
    recipientChannelIndex: 3,
    proofPresent: true,
    proofFactsCount: 1,
    messageEventFound: false,
    storageVerified: false,
    senderLocalDecryptVerified: true,
    recipientChannelRecovered: false,
    recipientDecryptVerified: false,
    unrelatedViewingKeyRejected: false,
  };
  assert.doesNotThrow(() => assertTwoPartyShieldedMessageSummarySafe(
    summary,
    [SENDER_PRIVATE_KEY, SENDER_VIEWING_KEY, RECIPIENT_VIEWING_KEY],
  ));
  assert.throws(
    () => assertTwoPartyShieldedMessageSummarySafe({
      ...summary,
      viewingKey: RECIPIENT_VIEWING_KEY,
    }),
    /unexpected field|forbidden field/u,
  );
});
