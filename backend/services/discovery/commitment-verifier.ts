import { hash, shortString } from "starknet";
import {
  VEIL_CANONICAL_COMMITMENT_DOMAIN,
  VEIL_CANONICAL_ENVELOPE_VERSION,
  VEIL_CANONICAL_MAX_CHUNKS,
} from "#veil-sdk/canonical-payload";
import { toHexFelt } from "./rpc-discovery.js";

const DOMAIN_FELT = shortString.encodeShortString(VEIL_CANONICAL_COMMITMENT_DOMAIN);

export interface CommitmentVerificationInput {
  messageLocator: string;
  payloadChunks: readonly string[];
  claimedCommitment: string;
  version?: number;
}

export interface CommitmentVerificationResult {
  valid: true;
  computedCommitment: string;
  claimedCommitment: string;
  chunkCount: number;
}

export function computePayloadCommitment(
  input: Omit<CommitmentVerificationInput, "claimedCommitment">,
): string {
  const version = input.version ?? VEIL_CANONICAL_ENVELOPE_VERSION;
  if (version !== VEIL_CANONICAL_ENVELOPE_VERSION) throw new TypeError("Unsupported canonical payload version.");
  if (input.payloadChunks.length < 1 || input.payloadChunks.length > VEIL_CANONICAL_MAX_CHUNKS) {
    throw new RangeError(`payloadChunks must contain between 1 and ${VEIL_CANONICAL_MAX_CHUNKS} felts.`);
  }
  const locator = toHexFelt(input.messageLocator, "messageLocator");
  if (BigInt(locator) === 0n) throw new TypeError("messageLocator must be nonzero.");
  const chunks = input.payloadChunks.map((value) => toHexFelt(value, "payload chunk"));

  return toHexFelt(hash.computePoseidonHashOnElements([
    DOMAIN_FELT,
    String(version),
    locator,
    String(chunks.length),
    ...chunks,
  ]), "payload commitment");
}

export function verifyPayloadCommitment(input: CommitmentVerificationInput): CommitmentVerificationResult {
  const computedCommitment = computePayloadCommitment(input);
  const claimedCommitment = toHexFelt(input.claimedCommitment, "claimedCommitment");
  if (computedCommitment !== claimedCommitment) {
    throw new TypeError("The payload commitment does not match the locator and ciphertext chunks.");
  }
  return Object.freeze({
    valid: true,
    computedCommitment,
    claimedCommitment,
    chunkCount: input.payloadChunks.length,
  });
}
