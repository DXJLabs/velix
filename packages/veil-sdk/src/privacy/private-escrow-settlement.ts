import { hash, shortString } from "starknet";
import { VeilPrivacyError } from "./errors.js";
import { normalizeAddressBigint } from "./namespace.js";

export const VEIL_PRIVATE_ESCROW_DEPOSIT_ACTION = 1n;
export const VEIL_PRIVATE_ESCROW_RELEASE_ACTION = 2n;
export const VEIL_PRIVATE_ESCROW_REFUND_ACTION = 3n;

export const VEIL_PRIVATE_ESCROW_RELEASE_DOMAIN =
  "VEIL_ESCROW_RELEASE_V1" as const;

export const VEIL_PRIVATE_ESCROW_REFUND_DOMAIN =
  "VEIL_ESCROW_REFUND_V1" as const;

const RELEASE_DOMAIN_FELT = shortString.encodeShortString(
  VEIL_PRIVATE_ESCROW_RELEASE_DOMAIN,
);

const REFUND_DOMAIN_FELT = shortString.encodeShortString(
  VEIL_PRIVATE_ESCROW_REFUND_DOMAIN,
);

const FELT_BOUND = 1n << 251n;
const U64_MAX = (1n << 64n) - 1n;

export interface PrivateEscrowFundingInput {
  settlementAddress: string | bigint;
  token: string | bigint;
  amount: bigint;
  custodyCommitment: string | bigint;
  releaseSecret: string | bigint;
  refundSecret: string | bigint;
  refundAfter: bigint;
}

export interface PrivateEscrowSettlementInput {
  settlementAddress: string | bigint;
  token: string | bigint;
  recipient: string | bigint;
  custodyCommitment: string | bigint;
  secret: string | bigint;
}

export interface PrivateEscrowFundingPlan {
  settlementAddress: bigint;
  token: bigint;
  amount: bigint;
  custodyCommitment: bigint;
  releaseCommitment: bigint;
  refundCommitment: bigint;
  refundAfter: bigint;
  calldata: readonly bigint[];
}

export interface NormalizedPrivateEscrowSettlement {
  settlementAddress: bigint;
  token: bigint;
  recipient: bigint;
  custodyCommitment: bigint;
  secret: bigint;
}

export function computePrivateEscrowReleaseCommitment(
  custodyCommitment: string | bigint,
  releaseSecret: string | bigint,
): string {
  return hash.computePoseidonHashOnElements([
    RELEASE_DOMAIN_FELT,
    normalizePrivateEscrowFelt(
      custodyCommitment,
      "custodyCommitment",
    ),
    normalizePrivateEscrowFelt(
      releaseSecret,
      "releaseSecret",
    ),
  ]);
}

export function computePrivateEscrowRefundCommitment(
  custodyCommitment: string | bigint,
  refundSecret: string | bigint,
): string {
  return hash.computePoseidonHashOnElements([
    REFUND_DOMAIN_FELT,
    normalizePrivateEscrowFelt(
      custodyCommitment,
      "custodyCommitment",
    ),
    normalizePrivateEscrowFelt(
      refundSecret,
      "refundSecret",
    ),
  ]);
}

export function buildPrivateEscrowFundingPlan(
  input: PrivateEscrowFundingInput,
): PrivateEscrowFundingPlan {
  const settlementAddress = normalizeAddressBigint(
    input.settlementAddress,
    "settlementAddress",
  );

  const token = normalizeAddressBigint(
    input.token,
    "token",
  );

  const amount = normalizePositiveAmount(
    input.amount,
    "amount",
  );

  const custodyCommitment = normalizePrivateEscrowFelt(
    input.custodyCommitment,
    "custodyCommitment",
  );

  const releaseCommitment = BigInt(
    computePrivateEscrowReleaseCommitment(
      custodyCommitment,
      input.releaseSecret,
    ),
  );

  const refundCommitment = BigInt(
    computePrivateEscrowRefundCommitment(
      custodyCommitment,
      input.refundSecret,
    ),
  );

  if (releaseCommitment === refundCommitment) {
    throw invalidEscrow(
      "Release and refund commitments must differ.",
    );
  }

  const refundAfter = normalizeU64(
    input.refundAfter,
    "refundAfter",
  );

  return Object.freeze({
    settlementAddress,
    token,
    amount,
    custodyCommitment,
    releaseCommitment,
    refundCommitment,
    refundAfter,
    calldata: Object.freeze([
      VEIL_PRIVATE_ESCROW_DEPOSIT_ACTION,
      custodyCommitment,
      releaseCommitment,
      refundCommitment,
      refundAfter,
      token,
      amount,
    ]),
  });
}

export function normalizePrivateEscrowSettlement(
  input: PrivateEscrowSettlementInput,
): NormalizedPrivateEscrowSettlement {
  return Object.freeze({
    settlementAddress: normalizeAddressBigint(
      input.settlementAddress,
      "settlementAddress",
    ),
    token: normalizeAddressBigint(
      input.token,
      "token",
    ),
    recipient: normalizeAddressBigint(
      input.recipient,
      "recipient",
    ),
    custodyCommitment: normalizePrivateEscrowFelt(
      input.custodyCommitment,
      "custodyCommitment",
    ),
    secret: normalizePrivateEscrowFelt(
      input.secret,
      "secret",
    ),
  });
}

export function buildPrivateEscrowReleaseCalldata(input: {
  custodyCommitment: string | bigint;
  releaseSecret: string | bigint;
  outputNoteId: string | bigint;
}): readonly bigint[] {
  return Object.freeze([
    VEIL_PRIVATE_ESCROW_RELEASE_ACTION,
    normalizePrivateEscrowFelt(
      input.custodyCommitment,
      "custodyCommitment",
    ),
    normalizePrivateEscrowFelt(
      input.releaseSecret,
      "releaseSecret",
    ),
    normalizePrivateEscrowFelt(
      input.outputNoteId,
      "outputNoteId",
    ),
  ]);
}

export function buildPrivateEscrowRefundCalldata(input: {
  custodyCommitment: string | bigint;
  refundSecret: string | bigint;
  outputNoteId: string | bigint;
}): readonly bigint[] {
  return Object.freeze([
    VEIL_PRIVATE_ESCROW_REFUND_ACTION,
    normalizePrivateEscrowFelt(
      input.custodyCommitment,
      "custodyCommitment",
    ),
    normalizePrivateEscrowFelt(
      input.refundSecret,
      "refundSecret",
    ),
    normalizePrivateEscrowFelt(
      input.outputNoteId,
      "outputNoteId",
    ),
  ]);
}

export function normalizePrivateEscrowFelt(
  value: string | bigint,
  label: string,
): bigint {
  let parsed: bigint;

  try {
    parsed =
      typeof value === "bigint"
        ? value
        : BigInt(value.trim());
  } catch (cause) {
    throw new VeilPrivacyError(
      "INVALID_ESCROW_STATE",
      `${label} must be a Starknet felt.`,
      { cause },
    );
  }

  if (parsed <= 0n || parsed >= FELT_BOUND) {
    throw invalidEscrow(
      `${label} must be a nonzero Starknet felt.`,
    );
  }

  return parsed;
}

function normalizePositiveAmount(
  value: bigint,
  label: string,
): bigint {
  if (typeof value !== "bigint" || value <= 0n) {
    throw invalidEscrow(
      `${label} must be a positive bigint.`,
    );
  }

  return value;
}

function normalizeU64(
  value: bigint,
  label: string,
): bigint {
  if (
    typeof value !== "bigint"
    || value <= 0n
    || value > U64_MAX
  ) {
    throw invalidEscrow(
      `${label} must be a positive u64 timestamp.`,
    );
  }

  return value;
}

function invalidEscrow(message: string): VeilPrivacyError {
  return new VeilPrivacyError(
    "INVALID_ESCROW_STATE",
    message,
  );
}
