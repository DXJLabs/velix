import { describe, it } from "node:test";
import { assert, sdk } from "./production-messaging.helpers.mjs";

const { buildCanonicalHelperPayload } = sdk;

const FIXTURE_ENVELOPE = Object.freeze({
  version: 1,
  algorithm: "A256GCM",
  salt: Buffer.alloc(32, 1).toString("base64url"),
  nonce: Buffer.alloc(12, 2).toString("base64url"),
  ciphertext: Buffer.alloc(64, 3).toString("base64url"),
});

const FIXTURE_MESSAGE_LOCATOR = "0x77";
const FIXTURE_PAYLOAD_COMMITMENT = "0x66192296df89bdcb1ff2a0114d3d8cf07a51448e22117314b5b9246e6501b24";
const FIXTURE_PAYLOAD_CHUNK_COUNT = 7;
const FIXTURE_CIPHERTEXT_CHUNKS = Object.freeze([
  "217560040300862673593977166552124278026005872843966633135598651400730785351",
  "118911109094954338182446703046557953179470845693076459373783079942856200517",
  "117062710837398703043088504135544480729013957295663051284056668875778911843",
  "178687780202837731477292851993289132301881347301318977305263125973685138533",
  "212823173110025413427193681810680855888131992284966893137802692984530289015",
  "136518307699999070517679151246806737927611224026604261341840807648981500993",
  "210788075348080856589622086772965142203500315072052578912337703608700576381",
]);

const FIXTURE_CALLDATA = Object.freeze([
  "1",
  FIXTURE_MESSAGE_LOCATOR,
  FIXTURE_PAYLOAD_COMMITMENT,
  String(FIXTURE_PAYLOAD_CHUNK_COUNT),
  ...FIXTURE_CIPHERTEXT_CHUNKS,
]);

const MUTATED_CIPHERTEXT_COMMITMENT = "0x604b601d71c708757c1feb72eeb6d036cfd35d987edc1111b3636e2b1241715";

function buildFixturePayload() {
  return buildCanonicalHelperPayload({
    operation: "message",
    keyDomain: "VEIL_MESSAGE_KEY_V1",
    envelope: FIXTURE_ENVELOPE,
    messageLocator: FIXTURE_MESSAGE_LOCATOR,
  });
}

describe("Phase 4F-B canonical helper payload fixture", () => {
  it("produces a commitment that matches the deterministic expected value", () => {
    const payload = buildFixturePayload();
    assert.equal(payload.payloadCommitment, FIXTURE_PAYLOAD_COMMITMENT);
  });

  it("produces calldata that exactly matches the expected array", () => {
    const payload = buildFixturePayload();
    assert.deepEqual([...payload.calldata], [...FIXTURE_CALLDATA]);
  });

  it("lays out calldata as [1, messageLocator, payloadCommitment, payloadChunkCount, ...ciphertextChunks]", () => {
    const payload = buildFixturePayload();
    const calldata = [...payload.calldata];

    assert.equal(calldata[0], "1", "envelopeVersion");
    assert.equal(calldata[1], FIXTURE_MESSAGE_LOCATOR, "messageLocator");
    assert.equal(calldata[2], FIXTURE_PAYLOAD_COMMITMENT, "payloadCommitment");
    assert.equal(calldata[3], String(FIXTURE_PAYLOAD_CHUNK_COUNT), "payloadChunkCount");

    const tail = calldata.slice(4);
    assert.equal(tail.length, FIXTURE_CIPHERTEXT_CHUNKS.length);
    for (let index = 0; index < tail.length; index += 1) {
      assert.equal(tail[index], FIXTURE_CIPHERTEXT_CHUNKS[index], `ciphertext chunk ${index}`);
    }
  });

  it("produces a different commitment when a single ciphertext chunk changes", () => {
    const mutatedEnvelope = {
      ...FIXTURE_ENVELOPE,
      ciphertext: Buffer.alloc(64, 4).toString("base64url"),
    };
    const mutated = buildCanonicalHelperPayload({
      operation: "message",
      keyDomain: "VEIL_MESSAGE_KEY_V1",
      envelope: mutatedEnvelope,
      messageLocator: FIXTURE_MESSAGE_LOCATOR,
    });

    assert.notEqual(mutated.payloadCommitment, FIXTURE_PAYLOAD_COMMITMENT);
    assert.equal(mutated.payloadCommitment, MUTATED_CIPHERTEXT_COMMITMENT);
  });
});
