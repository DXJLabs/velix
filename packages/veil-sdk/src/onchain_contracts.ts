import { channelIdToFelt } from "./direct_helper_transport";
import { hashToFelt } from "./encryption";
import type {
  FeltLike,
  StarknetAccountLike,
  StarknetContractCall,
  StarknetExecuteResult,
  StarknetProviderLike,
  StarknetTransactionReceiptLike,
} from "./types";

export interface VeilDealCommitments {
  conversationTag: string;
  assetTypeCommitment: string;
  assetCommitment: string;
  paymentCommitment: string;
  priceCommitment: string;
  termsHash: string;
  expiresAt: string;
}

export interface VeilDealCommitmentInput {
  channelId: string;
  amount: string;
  currency?: string;
  asset?: string;
  terms?: string;
  expiresAt?: number | string | bigint;
  now?: () => number;
}

export interface VeilOnchainContractsConfig {
  offerAddress: string;
  escrowAddress: string;
  settlementHelperAddress: string;
  account: StarknetAccountLike;
  provider?: StarknetProviderLike;
  now?: () => number;
  waitForConfirmation?: boolean;
  confirmationTimeoutMs?: number;
  confirmationPollMs?: number;
}

export interface VeilOnchainTransactionResult {
  transactionHash: string;
  blockNumber?: number;
  status: "pending" | "confirmed";
  timestamp: number;
}

export interface VeilOfferTransactionResult extends VeilOnchainTransactionResult {
  offerId: string;
  commitments: VeilDealCommitments;
}

export interface VeilEscrowTransactionResult extends VeilOnchainTransactionResult {
  escrowId: string;
  offerId: string;
}

interface ExecuteCallsOptions {
  status?: VeilOnchainTransactionResult["status"];
}

const DEFAULT_EXPIRY_SECONDS = 24 * 60 * 60;
const CONFIRMATION_TIMEOUT_MS = 120_000;
const CONFIRMATION_POLL_MS = 2_500;

function normalizeCallResult(
  result: readonly FeltLike[] | { result: readonly FeltLike[] } | null | undefined,
): readonly FeltLike[] {
  if (result == null) {
    throw new Error(
      "Starknet RPC returned no call result. The RPC may be rate-limited or temporarily unavailable.",
    );
  }

  if (Array.isArray(result)) {
    return result;
  }

  if (
    typeof result === "object" &&
    "result" in result &&
    Array.isArray(result.result)
  ) {
    return result.result;
  }

  throw new Error("Starknet RPC returned an invalid callContract response.");
}

function feltLikeToBigInt(value: FeltLike, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative safe integer.`);
    }
    return BigInt(value);
  }

  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} cannot be empty.`);
  return BigInt(trimmed);
}

function feltLikeToString(value: FeltLike, label: string): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative safe integer.`);
    }
    return String(value);
  }

  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} cannot be empty.`);
  return trimmed;
}

function extractTransactionHash(
  result: StarknetExecuteResult | string | null | undefined,
): string | undefined {
  if (typeof result === "string") return result;

  if (!result || typeof result !== "object") {
    return undefined;
  }

  const maybeHash = result as StarknetExecuteResult & { hash?: string };
  return maybeHash.transaction_hash ?? maybeHash.transactionHash ?? maybeHash.hash;
}

function extractBlockNumber(receipt: StarknetTransactionReceiptLike): number | undefined {
  return receipt.block_number ?? receipt.blockNumber;
}

function isAcceptedReceipt(receipt: StarknetTransactionReceiptLike): boolean {
  const status = receipt.status ?? receipt.finality_status;
  const executionStatus = receipt.execution_status;
  if (executionStatus === "REVERTED" || status === "REJECTED" || status === "REVERTED") return false;
  return status === "ACCEPTED_ON_L2" || status === "ACCEPTED_ON_L1" || extractBlockNumber(receipt) !== undefined;
}

function call(contractAddress: string, entrypoint: string, calldata: readonly string[]): StarknetContractCall {
  return {
    contractAddress,
    entrypoint,
    calldata: [...calldata],
  };
}

async function commitment(label: string, parts: readonly FeltLike[]): Promise<string> {
  const value = await hashToFelt(["veil", label, ...parts.map((part) => feltLikeToString(part, label))].join(":"));
  return value === "0" ? "1" : value;
}

export async function createVeilDealCommitments(input: VeilDealCommitmentInput): Promise<VeilDealCommitments> {
  const currency = input.currency || "STRK";
  const asset = input.asset || "Rights Package / NFT";
  const terms = input.terms || "";
  const now = input.now ?? (() => Date.now());
  const expiresAt = input.expiresAt === undefined
    ? String(Math.floor(now() / 1000) + DEFAULT_EXPIRY_SECONDS)
    : feltLikeToString(input.expiresAt, "expires_at");
  const conversationTag = channelIdToFelt(input.channelId);
  const amount = input.amount.trim();

  return {
    conversationTag,
    assetTypeCommitment: await commitment("asset-type", [asset]),
    assetCommitment: await commitment("asset", [input.channelId, asset]),
    paymentCommitment: await commitment("payment", [input.channelId, amount, currency]),
    priceCommitment: await commitment("price", [amount, currency]),
    termsHash: await commitment("terms", [input.channelId, amount, currency, asset, terms]),
    expiresAt,
  };
}

export class VeilOnchainContracts {
  readonly offerAddress: string;
  readonly escrowAddress: string;
  readonly settlementHelperAddress: string;
  readonly #account: StarknetAccountLike;
  readonly #provider: StarknetProviderLike | undefined;
  readonly #now: () => number;
  readonly #waitForConfirmation: boolean;
  readonly #confirmationTimeoutMs: number;
  readonly #confirmationPollMs: number;

  constructor(config: VeilOnchainContractsConfig) {
    if (!config.offerAddress) throw new Error("VeilOffer address is not configured.");
    if (!config.escrowAddress) throw new Error("VeilEscrow address is not configured.");
    if (!config.settlementHelperAddress) throw new Error("VeilSettlementHelper address is not configured.");
    this.offerAddress = config.offerAddress;
    this.escrowAddress = config.escrowAddress;
    this.settlementHelperAddress = config.settlementHelperAddress;
    this.#account = config.account;
    this.#provider = config.provider;
    this.#now = config.now ?? (() => Date.now());
    this.#waitForConfirmation = config.waitForConfirmation ?? true;
    this.#confirmationTimeoutMs = config.confirmationTimeoutMs ?? CONFIRMATION_TIMEOUT_MS;
    this.#confirmationPollMs = config.confirmationPollMs ?? CONFIRMATION_POLL_MS;
  }

  async createOffer(input: VeilDealCommitmentInput & { taker: string }): Promise<VeilOfferTransactionResult> {
    const commitments = await createVeilDealCommitments({ ...input, now: input.now ?? this.#now });
    const offerId = await this.#nextId(this.offerAddress, "get_offer_count", "offer_count");
    const result = await this.#executeCalls([
      call(this.offerAddress, "create_offer", [
        commitments.conversationTag,
        input.taker,
        commitments.assetTypeCommitment,
        commitments.assetCommitment,
        commitments.paymentCommitment,
        commitments.priceCommitment,
        commitments.termsHash,
        commitments.expiresAt,
      ]),
    ]);
    return { ...result, offerId, commitments };
  }

  async counterOffer(
    input: VeilDealCommitmentInput & { offerId: string; baseCommitments: VeilDealCommitments },
  ): Promise<VeilOfferTransactionResult> {
    const nextCommitments = await createVeilDealCommitments({ ...input, now: input.now ?? this.#now });
    const commitments: VeilDealCommitments = {
      ...nextCommitments,
      conversationTag: input.baseCommitments.conversationTag,
      assetTypeCommitment: input.baseCommitments.assetTypeCommitment,
      assetCommitment: input.baseCommitments.assetCommitment,
      paymentCommitment: input.baseCommitments.paymentCommitment,
    };
    const offerId = await this.#nextId(this.offerAddress, "get_offer_count", "offer_count");
    const result = await this.#executeCalls([
      call(this.offerAddress, "counter_offer", [
        input.offerId,
        commitments.priceCommitment,
        commitments.termsHash,
        commitments.expiresAt,
      ]),
    ]);
    return { ...result, offerId, commitments };
  }

  async acceptOffer(input: { offerId: string }): Promise<VeilOnchainTransactionResult> {
    return this.#executeCalls([
      call(this.offerAddress, "accept_offer", [input.offerId]),
    ]);
  }

  async acceptOfferAndCreateEscrow(input: {
    channelId: string;
    offerId: string;
    seller: string;
    commitments: VeilDealCommitments;
  }): Promise<VeilEscrowTransactionResult> {
    const escrowId = await this.#nextId(this.escrowAddress, "get_escrow_count", "escrow_count");
    const result = await this.#executeCalls([
      call(this.offerAddress, "accept_offer", [input.offerId]),
      this.#createEscrowCall(input),
    ]);
    return { ...result, escrowId, offerId: input.offerId };
  }

  async createEscrow(input: {
    channelId: string;
    offerId: string;
    seller: string;
    commitments: VeilDealCommitments;
  }): Promise<VeilEscrowTransactionResult> {
    const escrowId = await this.#nextId(this.escrowAddress, "get_escrow_count", "escrow_count");
    const result = await this.#executeCalls([this.#createEscrowCall(input)]);
    return { ...result, escrowId, offerId: input.offerId };
  }

  async cancelOffer(input: { offerId: string }): Promise<VeilOnchainTransactionResult> {
    return this.#executeCalls([
      call(this.offerAddress, "cancel_offer", [input.offerId]),
    ]);
  }

  async rejectOffer(input: { offerId: string }): Promise<VeilOnchainTransactionResult> {
    return this.#executeCalls([
      call(this.offerAddress, "reject_offer", [input.offerId]),
    ]);
  }

  async confirmBuyerDeposit(input: { escrowId: string; depositCommitment?: string }): Promise<VeilOnchainTransactionResult> {
    const depositCommitment = input.depositCommitment ?? await commitment("buyer-deposit", [input.escrowId, this.#account.address ?? ""]);
    return this.#executeCalls([
      call(this.escrowAddress, "confirm_buyer_deposit", [input.escrowId, depositCommitment]),
    ]);
  }

  async confirmSellerDeposit(input: { escrowId: string; depositCommitment?: string }): Promise<VeilOnchainTransactionResult> {
    const depositCommitment = input.depositCommitment ?? await commitment("seller-deposit", [input.escrowId, this.#account.address ?? ""]);
    return this.#executeCalls([
      call(this.escrowAddress, "confirm_seller_deposit", [input.escrowId, depositCommitment]),
    ]);
  }

  async activateEscrow(input: { escrowId: string }): Promise<VeilOnchainTransactionResult> {
    return this.#executeCalls([
      call(this.escrowAddress, "activate", [input.escrowId]),
    ]);
  }

  async settleEscrow(input: { escrowId: string }): Promise<VeilOnchainTransactionResult> {
    return this.#executeCalls([
      call(this.escrowAddress, "settle", [input.escrowId]),
    ]);
  }

  async cancelEscrow(input: { escrowId: string }): Promise<VeilOnchainTransactionResult> {
    return this.#executeCalls([
      call(this.escrowAddress, "cancel", [input.escrowId]),
    ]);
  }

  #createEscrowCall(input: {
    channelId: string;
    offerId: string;
    seller: string;
    commitments: VeilDealCommitments;
  }): StarknetContractCall {
    return call(this.escrowAddress, "create_escrow", [
      input.commitments.conversationTag || channelIdToFelt(input.channelId),
      input.offerId,
      input.seller,
      input.commitments.assetTypeCommitment,
      input.commitments.assetCommitment,
      input.commitments.paymentCommitment,
      this.settlementHelperAddress,
    ]);
  }

  async #nextId(contractAddress: string, entrypoint: string, label: string): Promise<string> {
    if (!this.#provider) {
      throw new Error(`${entrypoint} requires a Starknet provider.`);
    }
    const result = normalizeCallResult(await this.#provider.callContract(call(contractAddress, entrypoint, [])));
    const count = result[0];
    if (count === undefined) throw new Error(`${entrypoint} returned no data.`);
    return (feltLikeToBigInt(count, label) + 1n).toString();
  }

  async #executeCalls(calls: readonly StarknetContractCall[], options: ExecuteCallsOptions = {}): Promise<VeilOnchainTransactionResult> {
    const executeResult = await this.#account.execute([...calls]);
    const transactionHash = extractTransactionHash(executeResult);
    if (!transactionHash) throw new Error("Starknet transaction did not return a transaction hash.");

    if (!this.#waitForConfirmation) {
      return {
        transactionHash,
        status: options.status ?? "pending",
        timestamp: this.#now(),
      };
    }

    const receipt = await this.#waitForReceipt(transactionHash);
    const blockNumber = extractBlockNumber(receipt);
    return {
      transactionHash,
      ...(blockNumber !== undefined ? { blockNumber } : {}),
      status: "confirmed",
      timestamp: this.#now(),
    };
  }

  async #waitForReceipt(transactionHash: string): Promise<StarknetTransactionReceiptLike> {
    if (!this.#provider) {
      throw new Error("Waiting for confirmation requires a Starknet provider.");
    }

    if (this.#provider.waitForTransaction) {
      const receipt = await this.#provider.waitForTransaction(transactionHash);
      if (!isAcceptedReceipt(receipt)) {
        throw new Error(`Starknet transaction was not accepted: ${transactionHash}`);
      }
      return receipt;
    }

    if (!this.#provider.getTransactionReceipt) {
      throw new Error("Starknet provider cannot wait for transaction confirmation.");
    }

    const deadline = Date.now() + this.#confirmationTimeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const receipt = await this.#provider.getTransactionReceipt(transactionHash);
        if (isAcceptedReceipt(receipt)) return receipt;
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, this.#confirmationPollMs));
    }

    throw new Error(
      `Timed out waiting for Starknet transaction confirmation: ${transactionHash}${
        lastError instanceof Error ? ` (${lastError.message})` : ""
      }`,
    );
  }
}

export function createVeilOnchainContracts(config: VeilOnchainContractsConfig): VeilOnchainContracts {
  return new VeilOnchainContracts(config);
}
