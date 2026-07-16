import type { Note } from "@starkware-libs/starknet-privacy-sdk";
import { VeilPrivacyError } from "./errors.js";

export const DEFAULT_NOTE_MATURITY_BLOCKS = 10;

export interface PrivateBalanceSummary {
  total: bigint;
  spendable: bigint;
  maturing: bigint;
  spendableNoteCount: number;
  maturingNoteCount: number;
}

export function isNoteMature(
  note: Pick<Note, "created">,
  currentBlock: number,
  maturityBlocks = DEFAULT_NOTE_MATURITY_BLOCKS,
): boolean {
  assertBlock(currentBlock, "currentBlock");
  assertBlock(maturityBlocks, "maturityBlocks");
  if (note.created === undefined) return false;
  const created = Number(note.created);
  if (!Number.isSafeInteger(created) || created < 0) return false;
  return currentBlock >= created + maturityBlocks;
}

export function computePrivateBalance(
  notes: readonly Pick<Note, "amount" | "created">[],
  currentBlock: number,
  maturityBlocks = DEFAULT_NOTE_MATURITY_BLOCKS,
): PrivateBalanceSummary {
  assertBlock(currentBlock, "currentBlock");
  assertBlock(maturityBlocks, "maturityBlocks");

  let total = 0n;
  let spendable = 0n;
  let maturing = 0n;
  let spendableNoteCount = 0;
  let maturingNoteCount = 0;
  for (const note of notes) {
    if (typeof note.amount !== "bigint" || note.amount < 0n) {
      throw new VeilPrivacyError("DISCOVERY_FAILED", "Discovery returned a note with an invalid amount.");
    }
    total += note.amount;
    if (isNoteMature(note, currentBlock, maturityBlocks)) {
      spendable += note.amount;
      spendableNoteCount += 1;
    } else {
      maturing += note.amount;
      maturingNoteCount += 1;
    }
  }
  return { total, spendable, maturing, spendableNoteCount, maturingNoteCount };
}

export function assertSpendableBalance(summary: PrivateBalanceSummary, amount: bigint): void {
  if (amount <= 0n) throw new VeilPrivacyError("INSUFFICIENT_PRIVATE_BALANCE", "Amount must be positive.");
  if (summary.spendable >= amount) return;
  if (summary.total >= amount) {
    throw new VeilPrivacyError("PRIVATE_FUNDS_MATURING", "Sufficient private value exists but is not mature.");
  }
  throw new VeilPrivacyError("INSUFFICIENT_PRIVATE_BALANCE", "Insufficient spendable private balance.");
}

function assertBlock(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer.`);
}
