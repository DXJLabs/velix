import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChallengeMessage,
  buildChallengeTypedData,
  createWalletAuthChallenge,
  createWalletAuthSession,
  verifyWalletAuthChallengeToken,
  verifyWalletAuthSessionToken,
  WalletSiweAuthError,
  CHALLENGE_TTL_MS,
  SESSION_TTL_MS,
} from "../services/security/wallet-siwe-auth.js";

const SECRET =
  Buffer.from("a".repeat(32), "utf8");

const OTHER_SECRET =
  Buffer.from("b".repeat(32), "utf8");

const ADDRESS =
  "0x04c8a3d2f10b7e4c93f6a58219d0de8fa2";

test("createWalletAuthChallenge issues a message, typed data, and a verifiable token", () => {
  const now = Date.now();
  const challenge = createWalletAuthChallenge(SECRET, ADDRESS, now, "SN_SEPOLIA");

  assert.equal(challenge.expiresAtMs, now + CHALLENGE_TTL_MS);
  assert.match(challenge.message, /VEIL wants you to sign in/);
  assert.match(challenge.message, new RegExp(ADDRESS));
  assert.equal(challenge.typedData.primaryType, "Message");
  assert.equal((challenge.typedData as { domain: { chainId: string } }).domain.chainId, "SN_SEPOLIA");

  const payload = verifyWalletAuthChallengeToken(SECRET, challenge.challengeToken, ADDRESS, now);
  assert.equal(payload.address, ADDRESS.toLowerCase());
});

test("challenge verification rejects a token signed with a different secret", () => {
  const now = Date.now();
  const challenge = createWalletAuthChallenge(SECRET, ADDRESS, now, "SN_SEPOLIA");

  assert.throws(
    () => verifyWalletAuthChallengeToken(OTHER_SECRET, challenge.challengeToken, ADDRESS, now),
    (error) => error instanceof WalletSiweAuthError && error.code === "AUTH_TOKEN_SIGNATURE_INVALID",
  );
});

test("challenge verification rejects a token bound to a different address", () => {
  const now = Date.now();
  const challenge = createWalletAuthChallenge(SECRET, ADDRESS, now, "SN_SEPOLIA");

  assert.throws(
    () => verifyWalletAuthChallengeToken(SECRET, challenge.challengeToken, "0x999", now),
    (error) => error instanceof WalletSiweAuthError && error.code === "AUTH_CHALLENGE_ADDRESS_MISMATCH",
  );
});

test("challenge verification rejects an expired token", () => {
  const now = Date.now();
  const challenge = createWalletAuthChallenge(SECRET, ADDRESS, now, "SN_SEPOLIA");

  assert.throws(
    () => verifyWalletAuthChallengeToken(SECRET, challenge.challengeToken, ADDRESS, now + CHALLENGE_TTL_MS + 1),
    (error) => error instanceof WalletSiweAuthError && error.code === "AUTH_CHALLENGE_EXPIRED",
  );
});

test("challenge verification rejects a tampered payload even with a valid-looking signature", () => {
  const now = Date.now();
  const challenge = createWalletAuthChallenge(SECRET, ADDRESS, now, "SN_SEPOLIA");
  const [version, kind, , signature] = challenge.challengeToken.split(".");
  const tamperedBody = Buffer.from(JSON.stringify({
    address: ADDRESS.toLowerCase(),
    nonce: "0".repeat(32),
    issuedAtMs: now,
    expiresAtMs: now + CHALLENGE_TTL_MS,
  }), "utf8").toString("base64url");
  const tamperedToken = `${version}.${kind}.${tamperedBody}.${signature}`;

  assert.throws(
    () => verifyWalletAuthChallengeToken(SECRET, tamperedToken, ADDRESS, now),
    (error) => error instanceof WalletSiweAuthError && error.code === "AUTH_TOKEN_SIGNATURE_INVALID",
  );
});

test("a session token cannot be used in place of a challenge token", () => {
  const now = Date.now();
  const session = createWalletAuthSession(SECRET, ADDRESS, now);

  assert.throws(
    () => verifyWalletAuthChallengeToken(SECRET, session.sessionToken, ADDRESS, now),
    (error) => error instanceof WalletSiweAuthError && error.code === "AUTH_TOKEN_MALFORMED",
  );
});

test("createWalletAuthSession issues a session that verifies to the same address", () => {
  const now = Date.now();
  const session = createWalletAuthSession(SECRET, ADDRESS, now);

  assert.equal(session.expiresAtMs, now + SESSION_TTL_MS);
  const payload = verifyWalletAuthSessionToken(SECRET, session.sessionToken, now);
  assert.equal(payload.address, ADDRESS.toLowerCase());
});

test("an expired session token is rejected", () => {
  const now = Date.now();
  const session = createWalletAuthSession(SECRET, ADDRESS, now);

  assert.throws(
    () => verifyWalletAuthSessionToken(SECRET, session.sessionToken, now + SESSION_TTL_MS + 1),
    (error) => error instanceof WalletSiweAuthError && error.code === "AUTH_SESSION_EXPIRED",
  );
});

test("a malformed session token is rejected without throwing an unrelated error", () => {
  assert.throws(
    () => verifyWalletAuthSessionToken(SECRET, "not-a-real-token", Date.now()),
    (error) => error instanceof WalletSiweAuthError && error.code === "AUTH_TOKEN_MALFORMED",
  );
});

test("buildChallengeMessage and buildChallengeTypedData agree on the same nonce and address", () => {
  const payload = {
    address: ADDRESS,
    nonce: "abc123",
    issuedAtMs: 1_000,
    expiresAtMs: 2_000,
  };
  const message = buildChallengeMessage(payload);
  const typedData = buildChallengeTypedData(payload, "SN_SEPOLIA");

  assert.match(message, /Nonce: abc123/);
  const typedMessage = (typedData as { message: { nonce: string; address: string } }).message;
  assert.equal(typedMessage.nonce, "abc123");
  assert.equal(typedMessage.address, ADDRESS);
});
