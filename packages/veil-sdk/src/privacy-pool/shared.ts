import { analyzeClientActionBatch, type PrivacyPoolClientAction } from "../privacy_pool_actions";
import type {
  FeltLike,
  PrivacyPoolAdapterActionResult,
  StarknetAccountLike,
  StarknetContractCall,
  StarknetTransactionReceiptLike,
} from "../types";

export const RESEARCH_ONLY_ERROR = "ResearchPrivacyPoolAdapter is read-only and does not submit Privacy Pool actions.";

export function createPreparedActionResult(
  adapterMode: PrivacyPoolAdapterActionResult["adapterMode"],
  action: PrivacyPoolAdapterActionResult["action"],
  clientActions: readonly PrivacyPoolClientAction[],
  notes: readonly string[],
): PrivacyPoolAdapterActionResult {
  const actionBatch = analyzeClientActionBatch(clientActions);
  return {
    adapterMode,
    action,
    calldata: actionBatch.encodedClientActions,
    notes,
    clientActions,
    encodedClientActions: actionBatch.encodedClientActions,
    hasReplayProtection: actionBatch.hasReplayProtection,
  };
}

export function toFeltString(value: FeltLike, label: string): string {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative safe integer.`);
    }
    return String(value);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} cannot be empty.`);
  }

  return trimmed;
}

export function extractTransactionHash(result: Awaited<ReturnType<StarknetAccountLike["execute"]>>): string | undefined {
  if (typeof result === "string") {
    return result;
  }

  if ("hash" in result && typeof result.hash === "string") {
    return result.hash;
  }

  return result.transaction_hash ?? result.transactionHash;
}

export function extractBlockNumber(receipt: StarknetTransactionReceiptLike): number | undefined {
  return receipt.block_number ?? receipt.blockNumber;
}

export function isAcceptedReceipt(receipt: StarknetTransactionReceiptLike): boolean {
  const status = receipt.status ?? receipt.finality_status;
  const executionStatus = receipt.execution_status;
  if (executionStatus === "REVERTED" || status === "REJECTED" || status === "REVERTED") {
    return false;
  }

  return status === "ACCEPTED_ON_L2" || status === "ACCEPTED_ON_L1" || extractBlockNumber(receipt) !== undefined;
}

export function createSpanHelperCall(contractAddress: string, calldata: readonly string[]): StarknetContractCall {
  return {
    contractAddress,
    entrypoint: "privacy_invoke",
    calldata: [String(calldata.length), ...calldata],
  };
}
