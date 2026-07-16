import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import {
  decryptApplicationPayload,
  encryptApplicationPayload,
} from "../dist/privacy/application-encryption.js";
import {
  computeClaimCommitment,
  createPrivateClaimLink,
  generateClaimSecret,
  publicClaimUrl,
  readClaimSecretFromFragment,
} from "../dist/privacy/claim-link.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const context = {
  chainId: "SN_SEPOLIA",
  poolAddress: "0x123",
  roomId: "opaque-room-id",
  senderId: "alice",
  recipientId: "bob",
};
const secret = Uint8Array.from({ length: 32 }, (_, index) => index + 1);

test("application ciphertext roundtrips locally with authenticated versioned context", async () => {
  const envelope = await encryptApplicationPayload({
    domain: "VEIL_MEMO_KEY_V1",
    context,
    sharedSecret: secret,
    plaintext: encoder.encode("encrypted payment memo"),
  });
  assert.equal(envelope.version, 1);
  assert.equal(envelope.domain, "VEIL_MEMO_KEY_V1");
  assert.equal(JSON.stringify(envelope).includes("encrypted payment memo"), false);
  const plaintext = await decryptApplicationPayload({
    domain: "VEIL_MEMO_KEY_V1",
    context,
    sharedSecret: secret,
    envelope,
  });
  assert.equal(decoder.decode(plaintext), "encrypted payment memo");
});

test("application keys are separated by domain and context", async () => {
  const envelope = await encryptApplicationPayload({
    domain: "VEIL_MESSAGE_KEY_V1",
    context,
    sharedSecret: secret,
    plaintext: encoder.encode("ciphertext"),
  });
  await assert.rejects(
    () => decryptApplicationPayload({
      domain: "VEIL_OFFER_KEY_V1",
      context,
      sharedSecret: secret,
      envelope,
    }),
    (error) => error.code === "DECRYPTION_FAILED",
  );
  await assert.rejects(
    () => decryptApplicationPayload({
      domain: "VEIL_MESSAGE_KEY_V1",
      context: { ...context, roomId: "different-room" },
      sharedSecret: secret,
      envelope,
    }),
    (error) => error.code === "DECRYPTION_FAILED",
  );
});

test("tampered application ciphertext fails authenticated decryption", async () => {
  const envelope = await encryptApplicationPayload({
    domain: "VEIL_ESCROW_KEY_V1",
    context,
    sharedSecret: secret,
    plaintext: encoder.encode("escrow terms"),
  });
  const ciphertextBytes = Uint8Array.from(Buffer.from(envelope.ciphertext, "base64url"));
  ciphertextBytes[0] ^= 1;
  const tampered = {
    ...envelope,
    ciphertext: Buffer.from(ciphertextBytes).toString("base64url"),
  };
  await assert.rejects(
    () => decryptApplicationPayload({
      domain: "VEIL_ESCROW_KEY_V1",
      context,
      sharedSecret: secret,
      envelope: tampered,
    }),
    (error) => error.code === "DECRYPTION_FAILED",
  );
});

test("claim secrets are nonzero 31-byte values and commitments are deterministic", () => {
  const first = generateClaimSecret();
  const second = generateClaimSecret();
  assert.match(first, /^0x[0-9a-f]{62}$/u);
  assert.notEqual(first, second);
  assert.notEqual(BigInt(first), 0n);
  const fixed = `0x${"00".repeat(30)}01`;
  assert.equal(computeClaimCommitment(fixed), computeClaimCommitment(fixed));
  assert.notEqual(computeClaimCommitment(fixed), computeClaimCommitment(`0x${"00".repeat(30)}02`));
});

test("private claim links keep the secret exclusively in the URL fragment", () => {
  const secret = `0x${"12".repeat(31)}`;
  const link = createPrivateClaimLink({ baseUrl: "https://veil.example/app", claimId: "claim-7", secret });
  const url = new URL(link);
  assert.equal(url.search, "");
  assert.equal(url.hash.includes(secret), true);
  assert.equal(readClaimSecretFromFragment(url), secret);
  assert.equal(publicClaimUrl(url).includes(secret), false);
  assert.equal(`${url.origin}${url.pathname}${url.search}`.includes(secret), false);

  assert.throws(
    () => readClaimSecretFromFragment(`https://veil.example/claim/7?secret=${secret}`),
    (error) => error.code === "INVALID_ESCROW_STATE",
  );
});
