import type { FeltLike, StarknetContractCall, StarknetProviderLike } from "./types";

export const PRIVACY_POOL_STRK_FEE_TOKEN_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

export const PRIVACY_POOL_FEE_MODES = ["sponsored", "sponsored_private", "gasless"] as const;

export type PrivacyPoolFeeMode = (typeof PRIVACY_POOL_FEE_MODES)[number];
export type PrivacyPoolFeeTransactionType = "privacy-pool" | "direct-helper";

export type PrivacyPoolFeeErrorCode =
  | "FEE_AMOUNT_UNAVAILABLE"
  | "FEE_COLLECTOR_NOT_CONFIGURED"
  | "UNSUPPORTED_FEE_MODE"
  | "INSUFFICIENT_PRIVATE_BALANCE"
  | "FEE_ESTIMATION_FAILED"
  | "PAYMASTER_REJECTED"
  | "FEE_TOKEN_QUOTE_REQUIRED";

export class PrivacyPoolFeeError extends Error {
  readonly code: PrivacyPoolFeeErrorCode;

  constructor(code: PrivacyPoolFeeErrorCode, message: string) {
    super(message);
    this.name = "PrivacyPoolFeeError";
    this.code = code;
  }
}

export interface StarknetFeeEstimateLike {
  overall_fee?: FeltLike;
  overallFee?: FeltLike;
  suggestedMaxFee?: FeltLike;
  amount?: FeltLike;
  gas_consumed?: FeltLike;
  gasConsumed?: FeltLike;
  gas_price?: FeltLike;
  gasPrice?: FeltLike;
  unit?: string;
}

export interface StarknetFeeEstimatorLike {
  estimateFee(call: StarknetContractCall | StarknetContractCall[]): Promise<StarknetFeeEstimateLike | FeltLike>;
}

export interface PrivacyPoolFeeInfo {
  feeAmount: string;
  feeCollector: string;
  feeTokenAddress: string;
  feeTokenSymbol: "STRK";
  enabled: boolean;
}

export interface PrivacyPoolFeeQuote {
  feeTokenAddress: string;
  amount: string;
  sourceAmount: string;
  sourceTokenAddress: string;
}

export interface PrivacyPoolFeeQuoteProvider {
  quotePoolFee(input: {
    sourceAmount: string;
    sourceTokenAddress: string;
    feeTokenAddress: string;
  }): Promise<PrivacyPoolFeeQuote>;
}

export interface PrivacyPoolFeeValidationInput {
  privateBalance?: FeltLike;
}

export interface PrivacyPoolFeeDiscoveryInput {
  provider: StarknetProviderLike;
  privacyPoolAddress: string;
}

export interface EstimatePoolFeeInput extends PrivacyPoolFeeValidationInput {
  provider?: StarknetProviderLike;
  privacyPoolAddress?: string;
  feeInfo?: PrivacyPoolFeeInfo;
  feeMode?: PrivacyPoolFeeMode;
  transactionType?: PrivacyPoolFeeTransactionType;
  feeTokenAddress?: FeltLike;
  quoteProvider?: PrivacyPoolFeeQuoteProvider;
}

export interface PrivacyPoolFeeEstimate {
  feeMode: PrivacyPoolFeeMode;
  feeAmount: string;
  feeTokenAddress: string;
  feeCollector: string;
  enabled: boolean;
  paidFrom: "private_balance";
  quote?: PrivacyPoolFeeQuote;
}

export interface EstimateTransactionFeeInput {
  feeMode?: PrivacyPoolFeeMode;
  transactionType?: PrivacyPoolFeeTransactionType;
  call?: StarknetContractCall | StarknetContractCall[];
  feeEstimator?: StarknetFeeEstimatorLike;
  gasEstimate?: FeltLike;
}

export interface NetworkFeeEstimate {
  feeMode: PrivacyPoolFeeMode;
  gasSponsored: boolean;
  gasFeeAmount: string;
  gasFeeTokenAddress: string;
  gasFeeTokenSymbol: "STRK";
}

export interface EstimateTotalCostInput extends EstimatePoolFeeInput, EstimateTransactionFeeInput {}

export interface PrivacyPoolTotalCostEstimate {
  feeMode: PrivacyPoolFeeMode;
  networkGasFee: NetworkFeeEstimate;
  poolFee: PrivacyPoolFeeEstimate;
  totalsByToken: Record<string, string>;
}

export function getSupportedFeeModes(): readonly PrivacyPoolFeeMode[] {
  return PRIVACY_POOL_FEE_MODES;
}

export async function getFeeInfo(input: PrivacyPoolFeeDiscoveryInput): Promise<PrivacyPoolFeeInfo> {
  const [feeAmountResult, feeCollectorResult] = await Promise.all([
    callPrivacyPoolView(input.provider, input.privacyPoolAddress, "get_fee_amount"),
    callPrivacyPoolView(input.provider, input.privacyPoolAddress, "get_fee_collector"),
  ]);
  const feeAmount = feeAmountResult[0];
  const feeCollector = feeCollectorResult[0];
  if (feeAmount === undefined) {
    throw new PrivacyPoolFeeError("FEE_AMOUNT_UNAVAILABLE", "Privacy Pool get_fee_amount returned no value.");
  }
  if (feeCollector === undefined) {
    throw new PrivacyPoolFeeError("FEE_AMOUNT_UNAVAILABLE", "Privacy Pool get_fee_collector returned no value.");
  }

  const info: PrivacyPoolFeeInfo = {
    feeAmount: felt(feeAmount, "fee_amount"),
    feeCollector: address(feeCollector, "fee_collector"),
    feeTokenAddress: PRIVACY_POOL_STRK_FEE_TOKEN_ADDRESS,
    feeTokenSymbol: "STRK",
    enabled: !isZeroFelt(feeAmount),
  };
  validateFeeCollector(info);
  return info;
}

export async function estimatePoolFee(input: EstimatePoolFeeInput): Promise<PrivacyPoolFeeEstimate> {
  const feeMode = normalizeFeeMode(input.feeMode);
  if (normalizeTransactionType(input.transactionType) === "direct-helper") {
    return disabledPoolFeeEstimate(feeMode, input.feeTokenAddress);
  }

  const feeInfo = input.feeInfo ?? await discoverFeeInfo(input);
  validateFeeCollector(feeInfo);
  const requestedToken = address(input.feeTokenAddress ?? feeInfo.feeTokenAddress, "feeTokenAddress");
  if (feeMode !== "sponsored_private" && !sameFelt(requestedToken, feeInfo.feeTokenAddress)) {
    throw new PrivacyPoolFeeError(
      "UNSUPPORTED_FEE_MODE",
      `${feeMode} mode must use the Privacy Pool STRK fee token.`,
    );
  }

  let feeAmount = feeInfo.feeAmount;
  let quote: PrivacyPoolFeeQuote | undefined;
  if (feeInfo.enabled && !sameFelt(requestedToken, feeInfo.feeTokenAddress)) {
    if (!input.quoteProvider) {
      throw new PrivacyPoolFeeError(
        "FEE_TOKEN_QUOTE_REQUIRED",
        "sponsored_private with a non-STRK pool fee token requires a fee quote provider.",
      );
    }
    quote = await input.quoteProvider.quotePoolFee({
      sourceAmount: feeInfo.feeAmount,
      sourceTokenAddress: feeInfo.feeTokenAddress,
      feeTokenAddress: requestedToken,
    });
    feeAmount = quote.amount;
  }

  if (feeInfo.enabled) {
    validatePrivateBalance(feeAmount, input.privateBalance, requestedToken);
  }

  const estimate: PrivacyPoolFeeEstimate = {
    feeMode,
    feeAmount,
    feeTokenAddress: requestedToken,
    feeCollector: feeInfo.feeCollector,
    enabled: feeInfo.enabled,
    paidFrom: "private_balance",
  };
  if (quote) estimate.quote = quote;
  return estimate;
}

export async function estimateTransactionFee(input: EstimateTransactionFeeInput = {}): Promise<NetworkFeeEstimate> {
  const feeMode = normalizeFeeMode(input.feeMode);
  if (feeMode === "sponsored" || feeMode === "sponsored_private") {
    return {
      feeMode,
      gasSponsored: true,
      gasFeeAmount: "0",
      gasFeeTokenAddress: PRIVACY_POOL_STRK_FEE_TOKEN_ADDRESS,
      gasFeeTokenSymbol: "STRK",
    };
  }

  const gasFeeAmount = input.gasEstimate !== undefined
    ? felt(input.gasEstimate, "gasEstimate")
    : await estimateGasWithEstimator(input);
  return {
    feeMode,
    gasSponsored: false,
    gasFeeAmount,
    gasFeeTokenAddress: PRIVACY_POOL_STRK_FEE_TOKEN_ADDRESS,
    gasFeeTokenSymbol: "STRK",
  };
}

export async function estimateTotalCost(input: EstimateTotalCostInput): Promise<PrivacyPoolTotalCostEstimate> {
  const feeMode = normalizeFeeMode(input.feeMode);
  const [networkGasFee, poolFee] = await Promise.all([
    estimateTransactionFee({ ...input, feeMode }),
    estimatePoolFee({ ...input, feeMode }),
  ]);
  const totalsByToken: Record<string, string> = {};
  addTokenAmount(totalsByToken, networkGasFee.gasFeeTokenAddress, networkGasFee.gasFeeAmount);
  addTokenAmount(totalsByToken, poolFee.feeTokenAddress, poolFee.feeAmount);
  return { feeMode, networkGasFee, poolFee, totalsByToken };
}

export function assertPaymasterAccepted(error: unknown): never {
  throw new PrivacyPoolFeeError(
    "PAYMASTER_REJECTED",
    error instanceof Error ? error.message : "AVNU Paymaster rejected the transaction.",
  );
}

function normalizeFeeMode(mode: PrivacyPoolFeeMode | undefined): PrivacyPoolFeeMode {
  const resolved = mode ?? "sponsored";
  if (!PRIVACY_POOL_FEE_MODES.includes(resolved)) {
    throw new PrivacyPoolFeeError("UNSUPPORTED_FEE_MODE", `Unsupported Privacy Pool fee mode: ${String(mode)}.`);
  }
  return resolved;
}

async function discoverFeeInfo(input: EstimatePoolFeeInput): Promise<PrivacyPoolFeeInfo> {
  if (!input.provider || !input.privacyPoolAddress) {
    throw new PrivacyPoolFeeError(
      "FEE_AMOUNT_UNAVAILABLE",
      "Privacy Pool fee discovery requires provider and privacyPoolAddress.",
    );
  }
  return getFeeInfo({ provider: input.provider, privacyPoolAddress: input.privacyPoolAddress });
}

function normalizeTransactionType(type: PrivacyPoolFeeTransactionType | undefined): PrivacyPoolFeeTransactionType {
  return type ?? "privacy-pool";
}

function disabledPoolFeeEstimate(
  feeMode: PrivacyPoolFeeMode,
  feeTokenAddress: FeltLike | undefined,
): PrivacyPoolFeeEstimate {
  return {
    feeMode,
    feeAmount: "0",
    feeTokenAddress: address(feeTokenAddress ?? PRIVACY_POOL_STRK_FEE_TOKEN_ADDRESS, "feeTokenAddress"),
    feeCollector: "0",
    enabled: false,
    paidFrom: "private_balance",
  };
}

async function callPrivacyPoolView(
  provider: StarknetProviderLike,
  privacyPoolAddress: string,
  entrypoint: string,
): Promise<readonly FeltLike[]> {
  try {
    const result = await provider.callContract({ contractAddress: privacyPoolAddress, entrypoint, calldata: [] });
    return "result" in result ? result.result : result;
  } catch (error) {
    throw new PrivacyPoolFeeError(
      "FEE_ESTIMATION_FAILED",
      error instanceof Error ? error.message : `Privacy Pool ${entrypoint} call failed.`,
    );
  }
}

async function estimateGasWithEstimator(input: EstimateTransactionFeeInput): Promise<string> {
  if (!input.feeEstimator || !input.call) {
    throw new PrivacyPoolFeeError(
      "FEE_ESTIMATION_FAILED",
      "Gasless mode requires a gas estimate, or a fee estimator and call.",
    );
  }
  try {
    const estimate = await input.feeEstimator.estimateFee(input.call);
    return normalizeFeeEstimate(estimate);
  } catch (error) {
    throw new PrivacyPoolFeeError(
      "FEE_ESTIMATION_FAILED",
      error instanceof Error ? error.message : "Fee estimation failed.",
    );
  }
}

function normalizeFeeEstimate(estimate: StarknetFeeEstimateLike | FeltLike): string {
  if (typeof estimate === "string" || typeof estimate === "number" || typeof estimate === "bigint") {
    return felt(estimate, "fee_estimate");
  }
  const amount =
    estimate.overall_fee ??
    estimate.overallFee ??
    estimate.suggestedMaxFee ??
    estimate.amount;
  if (amount !== undefined) return felt(amount, "fee_estimate");

  const gasConsumed = estimate.gas_consumed ?? estimate.gasConsumed;
  const gasPrice = estimate.gas_price ?? estimate.gasPrice;
  if (gasConsumed !== undefined && gasPrice !== undefined) {
    return (BigInt(felt(gasConsumed, "gas_consumed")) * BigInt(felt(gasPrice, "gas_price"))).toString();
  }

  throw new PrivacyPoolFeeError("FEE_ESTIMATION_FAILED", "Fee estimator returned no usable fee amount.");
}

function validateFeeCollector(info: PrivacyPoolFeeInfo): void {
  if (info.enabled && isZeroFelt(info.feeCollector)) {
    throw new PrivacyPoolFeeError(
      "FEE_COLLECTOR_NOT_CONFIGURED",
      "Privacy Pool fee is enabled but fee collector is zero.",
    );
  }
}

function validatePrivateBalance(amount: string, privateBalance: FeltLike | undefined, token: string): void {
  if (privateBalance === undefined) return;
  if (BigInt(felt(privateBalance, "privateBalance")) < BigInt(amount)) {
    throw new PrivacyPoolFeeError(
      "INSUFFICIENT_PRIVATE_BALANCE",
      `Insufficient private balance for Privacy Pool fee token ${token}.`,
    );
  }
}

function addTokenAmount(totals: Record<string, string>, token: string, amount: string): void {
  const current = totals[token] ? BigInt(totals[token]) : 0n;
  totals[token] = (current + BigInt(amount)).toString();
}

function felt(value: FeltLike, label: string): string {
  if (typeof value === "bigint") {
    if (value < 0n) throw new Error(`${label} must be non-negative.`);
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
  try {
    return BigInt(trimmed).toString();
  } catch {
    return trimmed;
  }
}

function address(value: FeltLike, label: string): string {
  if (typeof value === "bigint" || typeof value === "number") {
    return felt(value, label);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} cannot be empty.`);
  }
  return trimmed;
}

function isZeroFelt(value: FeltLike): boolean {
  try {
    return BigInt(felt(value, "felt")) === 0n;
  } catch {
    return felt(value, "felt").toLowerCase() === "0x0";
  }
}

function sameFelt(left: FeltLike, right: FeltLike): boolean {
  try {
    return BigInt(felt(left, "left")) === BigInt(felt(right, "right"));
  } catch {
    return felt(left, "left").toLowerCase() === felt(right, "right").toLowerCase();
  }
}
