import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

/*
 * Stateless SIWE-style ("Sign-In With Starknet") wallet authentication.
 *
 * Flow:
 *   1. Client requests a challenge for an `address` it controls.
 *   2. Server issues a human-readable `message` (for the wallet to sign)
 *      plus a `challengeToken`: an HMAC-signed, self-contained envelope
 *      carrying {address, nonce, issuedAtMs, expiresAtMs}. No database
 *      row is written — the token itself is the only state.
 *   3. Client has the wallet sign `message` (SNIP-12 typed data) and
 *      sends back {challengeToken, signature}.
 *   4. Server re-verifies the challengeToken HMAC + expiry, verifies the
 *      signature against the account contract (SNIP-6 isValidSignature,
 *      done by the caller via RPC — this module never does network I/O),
 *      then issues a `sessionToken`: the same HMAC envelope shape, but
 *      carrying only {address, issuedAtMs, expiresAtMs}, used as a
 *      bearer token for subsequent API calls.
 *
 * Trade-off, disclosed: because there is no server-side nonce or session
 * store, a session token cannot be revoked before it expires. Expiry is
 * kept short (see CHALLENGE_TTL_MS / SESSION_TTL_MS) to bound this.
 */

export const CHALLENGE_TTL_MS = 5 * 60_000;
export const SESSION_TTL_MS = 24 * 60 * 60_000;

const TOKEN_VERSION = "v1";

export class WalletSiweAuthError
extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "WalletSiweAuthError";

    this.code =
      code;
  }
}

export interface WalletAuthChallenge {
  readonly message: string;
  readonly typedData: Record<string, unknown>;
  readonly challengeToken: string;
  readonly expiresAtMs: number;
}

export interface WalletAuthChallengePayload {
  readonly address: string;
  readonly nonce: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
}

export interface WalletAuthSession {
  readonly sessionToken: string;
  readonly expiresAtMs: number;
}

export interface WalletAuthSessionPayload {
  readonly address: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
}

export function buildChallengeMessage(
  payload: WalletAuthChallengePayload,
): string {
  return [
    "VEIL wants you to sign in with your Starknet account.",
    "",
    `Address: ${payload.address}`,
    `Nonce: ${payload.nonce}`,
    `Issued At: ${new Date(payload.issuedAtMs).toISOString()}`,
    `Expiration Time: ${new Date(payload.expiresAtMs).toISOString()}`,
  ].join("\n");
}

export function buildChallengeTypedData(
  payload: WalletAuthChallengePayload,
  chainId: string,
): Record<string, unknown> {
  return {
    types: {
      StarknetDomain: [
        { name: "name", type: "shortstring" },
        { name: "version", type: "shortstring" },
        { name: "chainId", type: "shortstring" },
        { name: "revision", type: "shortstring" },
      ],
      Message: [
        { name: "statement", type: "shortstring" },
        { name: "address", type: "ContractAddress" },
        { name: "nonce", type: "shortstring" },
        { name: "issuedAt", type: "shortstring" },
        { name: "expiresAt", type: "shortstring" },
      ],
    },
    primaryType: "Message",
    domain: {
      name: "VEIL Auth",
      version: "1",
      chainId,
      revision: "1",
    },
    message: {
      statement: "Sign in to VEIL with your Starknet account.",
      address: payload.address,
      nonce: payload.nonce,
      issuedAt: String(payload.issuedAtMs),
      expiresAt: String(payload.expiresAtMs),
    },
  };
}

export function createWalletAuthChallenge(
  secret: Buffer,
  address: string,
  nowMs: number,
  chainId: string,
): WalletAuthChallenge {
  const normalizedAddress =
    requireAddress(address);

  const nonce =
    randomNonce();

  const issuedAtMs =
    requireTimestamp(nowMs);

  const expiresAtMs =
    issuedAtMs + CHALLENGE_TTL_MS;

  const payload: WalletAuthChallengePayload = {
    address: normalizedAddress,
    nonce,
    issuedAtMs,
    expiresAtMs,
  };

  const challengeToken =
    encodeToken(
      secret,
      "challenge",
      payload,
    );

  return Object.freeze({
    message:
      buildChallengeMessage(payload),

    typedData:
      buildChallengeTypedData(payload, chainId),

    challengeToken,

    expiresAtMs,
  });
}

export function verifyWalletAuthChallengeToken(
  secret: Buffer,
  challengeToken: string,
  expectedAddress: string,
  nowMs: number,
): WalletAuthChallengePayload {
  const payload =
    decodeToken<WalletAuthChallengePayload>(
      secret,
      "challenge",
      challengeToken,
    );

  requireTimestamp(payload.issuedAtMs);
  requireTimestamp(payload.expiresAtMs);
  requireNonce(payload.nonce);
  const normalizedAddress =
    requireAddress(payload.address);

  if (
    normalizedAddress
      !== requireAddress(expectedAddress)
  ) {
    throw authError(
      "AUTH_CHALLENGE_ADDRESS_MISMATCH",
      "The challenge token was not issued for this address.",
    );
  }

  if (requireTimestamp(nowMs) >= payload.expiresAtMs) {
    throw authError(
      "AUTH_CHALLENGE_EXPIRED",
      "The sign-in challenge has expired. Request a new one and sign again.",
    );
  }

  return payload;
}

export function createWalletAuthSession(
  secret: Buffer,
  address: string,
  nowMs: number,
): WalletAuthSession {
  const issuedAtMs =
    requireTimestamp(nowMs);

  const expiresAtMs =
    issuedAtMs + SESSION_TTL_MS;

  const payload: WalletAuthSessionPayload = {
    address: requireAddress(address),
    issuedAtMs,
    expiresAtMs,
  };

  const sessionToken =
    encodeToken(
      secret,
      "session",
      payload,
    );

  return Object.freeze({
    sessionToken,
    expiresAtMs,
  });
}

export function verifyWalletAuthSessionToken(
  secret: Buffer,
  sessionToken: string,
  nowMs: number,
): WalletAuthSessionPayload {
  const payload =
    decodeToken<WalletAuthSessionPayload>(
      secret,
      "session",
      sessionToken,
    );

  requireTimestamp(payload.issuedAtMs);
  requireTimestamp(payload.expiresAtMs);
  requireAddress(payload.address);

  if (requireTimestamp(nowMs) >= payload.expiresAtMs) {
    throw authError(
      "AUTH_SESSION_EXPIRED",
      "The wallet session has expired. Sign in again.",
    );
  }

  return payload;
}

function encodeToken(
  secret: Buffer,
  kind: "challenge" | "session",
  payload: WalletAuthChallengePayload | WalletAuthSessionPayload,
): string {
  const body =
    Buffer.from(
      JSON.stringify(payload),
      "utf8",
    ).toString("base64url");

  const signature =
    signBody(secret, kind, body);

  return `${TOKEN_VERSION}.${kind}.${body}.${signature}`;
}

function decodeToken<T>(
  secret: Buffer,
  expectedKind: "challenge" | "session",
  token: string,
): T {
  if (typeof token !== "string" || token.length < 1 || token.length > 4_096) {
    throw authError(
      "AUTH_TOKEN_MALFORMED",
      "The authentication token is malformed.",
    );
  }

  const parts =
    token.split(".");

  if (parts.length !== 4) {
    throw authError(
      "AUTH_TOKEN_MALFORMED",
      "The authentication token is malformed.",
    );
  }

  const [version, kind, body, signature] = parts;

  if (
    version !== TOKEN_VERSION
    || kind !== expectedKind
    || typeof body !== "string"
    || typeof signature !== "string"
  ) {
    throw authError(
      "AUTH_TOKEN_MALFORMED",
      "The authentication token is malformed.",
    );
  }

  const expectedSignature =
    signBody(secret, kind, body);

  if (!safeEqual(signature, expectedSignature)) {
    throw authError(
      "AUTH_TOKEN_SIGNATURE_INVALID",
      "The authentication token signature is invalid.",
    );
  }

  let parsed: unknown;
  try {
    parsed =
      JSON.parse(
        Buffer.from(body, "base64url").toString("utf8"),
      );
  } catch {
    throw authError(
      "AUTH_TOKEN_MALFORMED",
      "The authentication token is malformed.",
    );
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw authError(
      "AUTH_TOKEN_MALFORMED",
      "The authentication token is malformed.",
    );
  }

  return parsed as T;
}

function signBody(
  secret: Buffer,
  kind: string,
  body: string,
): string {
  return createHmac("sha256", secret)
    .update("veil-wallet-siwe-auth-v1", "utf8")
    .update("\0", "utf8")
    .update(kind, "utf8")
    .update("\0", "utf8")
    .update(body, "utf8")
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.byteLength !== rightBuffer.byteLength) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function randomNonce(): string {
  return Buffer.from(
    crypto.getRandomValues(new Uint8Array(16)),
  ).toString("hex");
}

function requireAddress(value: string): string {
  const normalized =
    typeof value === "string"
      ? value.trim().toLowerCase()
      : "";

  if (!/^0x[0-9a-f]{1,64}$/u.test(normalized)) {
    throw authError(
      "AUTH_ADDRESS_INVALID",
      "The Starknet address is invalid.",
    );
  }

  return normalized;
}

function requireNonce(value: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{32}$/u.test(value)) {
    throw authError(
      "AUTH_NONCE_INVALID",
      "The sign-in nonce is invalid.",
    );
  }

  return value;
}

function requireTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw authError(
      "AUTH_TIMESTAMP_INVALID",
      "The authentication timestamp is invalid.",
    );
  }

  return value;
}

function authError(
  code: string,
  message: string,
): WalletSiweAuthError {
  return new WalletSiweAuthError(code, message);
}
