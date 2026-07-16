import { hash, shortString } from "starknet";
import { VeilPrivacyError } from "./errors.js";

export const VEIL_CLAIM_COMMITMENT_DOMAIN = shortString.encodeShortString("VEIL_CLAIM_V1");
export const VEIL_CLAIM_SECRET_BYTES = 31;

export function generateClaimSecret(crypto: Crypto = globalThis.crypto): string {
  if (!crypto?.getRandomValues) throw new Error("Secure randomness is unavailable.");
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(VEIL_CLAIM_SECRET_BYTES));
    const secret = bytesToHex(bytes);
    if (BigInt(secret) !== 0n) return secret;
  }
}

export function normalizeClaimSecret(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{62}$/u.test(normalized)) {
    throw new VeilPrivacyError("INVALID_ESCROW_STATE", "Claim secret must be exactly 31 random bytes.");
  }
  if (BigInt(normalized) === 0n) {
    throw new VeilPrivacyError("INVALID_ESCROW_STATE", "Claim secret cannot be zero.");
  }
  return normalized;
}

export function computeClaimCommitment(secret: string): string {
  return hash.computePoseidonHashOnElements([
    VEIL_CLAIM_COMMITMENT_DOMAIN,
    normalizeClaimSecret(secret),
  ]);
}

export function createPrivateClaimLink(input: {
  baseUrl: string;
  claimId: string;
  secret: string;
}): string {
  const secret = normalizeClaimSecret(input.secret);
  const claimId = input.claimId.trim();
  if (!claimId || /[\u0000-\u001f]/u.test(claimId)) throw new Error("claimId is invalid.");
  const url = new URL(input.baseUrl);
  if (url.username || url.password) throw new Error("Claim base URL must not contain credentials.");
  url.pathname = `${url.pathname.replace(/\/$/u, "")}/claim/${encodeURIComponent(claimId)}`;
  url.search = "";
  url.hash = new URLSearchParams({ secret }).toString();
  return url.toString();
}

export function readClaimSecretFromFragment(value: string | URL): string {
  const url = value instanceof URL ? new URL(value.toString()) : new URL(value);
  if (url.searchParams.has("secret")) {
    throw new VeilPrivacyError("INVALID_ESCROW_STATE", "Claim secrets are forbidden in URL query parameters.");
  }
  const params = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  const values = params.getAll("secret");
  if (values.length !== 1) throw new VeilPrivacyError("INVALID_ESCROW_STATE", "Claim link fragment is missing a unique secret.");
  return normalizeClaimSecret(values[0] ?? "");
}

export function publicClaimUrl(value: string | URL): string {
  const url = value instanceof URL ? new URL(value.toString()) : new URL(value);
  url.hash = "";
  url.searchParams.delete("secret");
  return url.toString();
}

function bytesToHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}
