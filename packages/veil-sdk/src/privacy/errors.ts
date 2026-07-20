export const VEIL_PRIVACY_ERROR_CODES = [
  "WALLET_NOT_CONNECTED",
  "PRIVACY_WALLET_UNSUPPORTED",
  "SENDER_NOT_REGISTERED",
  "RECIPIENT_NOT_REGISTERED",
  "CHANNEL_SETUP_REQUIRED",
  "TOKEN_SETUP_REQUIRED",
  "DISCOVERY_FAILED",
  "DISCOVERY_RATE_LIMITED",
  "REGISTRY_CORRUPTED",
  "VIEWING_KEY_UNAVAILABLE",
  "INVALID_VIEWING_KEY",
  "INSUFFICIENT_PUBLIC_BALANCE",
  "INSUFFICIENT_PRIVATE_BALANCE",
  "PRIVATE_FUNDS_MATURING",
  "NOTE_NOT_MATURE",
  "NOTE_ALREADY_SPENT",
  "APPROVAL_REJECTED",
  "APPROVAL_FAILED",
  "APPROVAL_NOT_CONFIRMED",
  "SCREENING_REJECTED",
  "SCREENING_UNAVAILABLE",
  "PROVING_FAILED",
  "PROVER_ENDPOINT_MISSING",
  "PROVER_ENDPOINT_INVALID",
  "PROVER_ENDPOINT_INSECURE",
  "PROVER_REDIRECT_FORBIDDEN",
  "PROVER_UNREACHABLE",
  "PROVER_RPC_UNSUPPORTED",
  "PROVER_VERSION_MISMATCH",
  "SDK_PROVER_MISMATCH",
  "POOL_PROVER_MISMATCH",
  "WRONG_CHAIN",
  "PROVER_DEGRADED",
  "PROVER_TIMEOUT",
  "PROVER_CANCELLED",
  "PROVER_REQUEST_INVALID",
  "PROVER_RESPONSE_INVALID",
  "PROVER_RESPONSE_TOO_LARGE",
  "PROVER_BROADCAST_FORBIDDEN",
  "PROOF_STALE",
  "INVALID_PROOF_FACTS",
  "PROOF_TOO_LARGE",
  "INVALID_NONCE",
  "PAYMASTER_FAILED",
  "SUBMISSION_FAILED",
  "SDK_VERSION_MISMATCH",
  "POOL_VERSION_MISMATCH",
  "CHAIN_ID_MISMATCH",
  "TRANSACTION_VERSION_UNSUPPORTED",
  "AUTHORIZATION_VERSION_UNSUPPORTED",
  "CANONICAL_CAPABILITY_UNAVAILABLE",
  "CANONICAL_FALLBACK_FORBIDDEN",
  "ACCOUNT_CUSTODY_MISMATCH",
  "HELPER_TARGET_NOT_ALLOWED",
  "HELPER_SELECTOR_NOT_ALLOWED",
  "MULTIPLE_EXTERNAL_INVOKES",
  "PAYLOAD_VERSION_UNSUPPORTED",
  "PAYLOAD_MALFORMED",
  "PAYLOAD_TOO_LARGE",
  "UNSHIELD_UNAVAILABLE",
  "USER_LINKAGE_WARNING",
  "ESCROW_ALREADY_CLAIMED",
  "INVALID_ESCROW_STATE",
  "DECRYPTION_FAILED",
] as const;

export type VeilPrivacyErrorCode = (typeof VEIL_PRIVACY_ERROR_CODES)[number];

export interface VeilPrivacyErrorOptions {
  cause?: unknown;
  retryable?: boolean;
  details?: Readonly<Record<string, string | number | boolean>>;
}

export class VeilPrivacyError extends Error {
  readonly code: VeilPrivacyErrorCode;
  readonly retryable: boolean;
  readonly details: Readonly<Record<string, string | number | boolean>>;

  constructor(code: VeilPrivacyErrorCode, message: string, options: VeilPrivacyErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "VeilPrivacyError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.details = options.details ?? {};
  }
}

const PRODUCT_MESSAGES: Readonly<Record<VeilPrivacyErrorCode, string>> = {
  WALLET_NOT_CONNECTED: "Connect a Starknet wallet to continue.",
  PRIVACY_WALLET_UNSUPPORTED: "This wallet has not exposed the privacy capabilities required for this action.",
  SENDER_NOT_REGISTERED: "Set up your private identity before continuing.",
  RECIPIENT_NOT_REGISTERED: "This recipient is not ready for a private transfer. Invite them or create a private claim link.",
  CHANNEL_SETUP_REQUIRED: "A private channel must be prepared for this recipient.",
  TOKEN_SETUP_REQUIRED: "A private token channel must be prepared for this recipient.",
  DISCOVERY_FAILED: "Private-state discovery failed. Your balance is unknown, not zero.",
  DISCOVERY_RATE_LIMITED: "Private-state discovery is temporarily rate limited. Try again shortly.",
  REGISTRY_CORRUPTED: "The local private profile is unreadable and must be rebuilt from discovery.",
  VIEWING_KEY_UNAVAILABLE: "The wallet did not provide the viewing key required on this device.",
  INVALID_VIEWING_KEY: "The private viewing key is outside the range supported by the official SDK.",
  INSUFFICIENT_PUBLIC_BALANCE: "The public token balance is too low for this action.",
  INSUFFICIENT_PRIVATE_BALANCE: "The spendable private balance is too low for this action.",
  PRIVATE_FUNDS_MATURING: "Enough private funds exist, but some notes are still maturing.",
  NOTE_NOT_MATURE: "A selected private note is still maturing.",
  NOTE_ALREADY_SPENT: "A selected private note was already spent. Refresh private state and rebuild.",
  APPROVAL_REJECTED: "Token approval was rejected in the wallet.",
  APPROVAL_FAILED: "Token approval failed.",
  APPROVAL_NOT_CONFIRMED: "Token approval was submitted but was not confirmed.",
  SCREENING_REJECTED: "The required deposit screening rejected this transaction.",
  SCREENING_UNAVAILABLE: "The required deposit screening service is unavailable.",
  PROVING_FAILED: "The privacy proof could not be generated.",
  PROVER_ENDPOINT_MISSING: "A transaction prover endpoint must be configured explicitly.",
  PROVER_ENDPOINT_INVALID: "The transaction prover endpoint is malformed or unsupported.",
  PROVER_ENDPOINT_INSECURE: "A non-local transaction prover endpoint must use HTTPS.",
  PROVER_REDIRECT_FORBIDDEN: "The transaction prover endpoint attempted a forbidden redirect.",
  PROVER_UNREACHABLE: "The transaction prover process or RPC endpoint is unreachable.",
  PROVER_RPC_UNSUPPORTED: "The transaction prover RPC schema is unsupported.",
  PROVER_VERSION_MISMATCH: "The transaction prover image or RPC version does not match the reviewed pin.",
  SDK_PROVER_MISMATCH: "The transaction prover is incompatible with the pinned Privacy SDK.",
  POOL_PROVER_MISMATCH: "The transaction prover is incompatible with the pinned Privacy Pool.",
  WRONG_CHAIN: "The transaction prover is configured for the wrong Starknet chain.",
  PROVER_DEGRADED: "The transaction prover is reachable but cannot currently accept this proof job.",
  PROVER_TIMEOUT: "The transaction prover operation exceeded its configured timeout.",
  PROVER_CANCELLED: "The transaction prover operation was cancelled.",
  PROVER_REQUEST_INVALID: "The transaction proof request failed strict validation.",
  PROVER_RESPONSE_INVALID: "The transaction prover returned an invalid or unrelated response.",
  PROVER_RESPONSE_TOO_LARGE: "The transaction prover response exceeded the configured limit.",
  PROVER_BROADCAST_FORBIDDEN: "Network broadcast is disabled during the transaction prover phase.",
  PROOF_STALE: "The privacy proof is stale and must be rebuilt.",
  INVALID_PROOF_FACTS: "The proving response contained invalid proof facts.",
  PROOF_TOO_LARGE: "The generated proof exceeds the supported transaction size.",
  INVALID_NONCE: "The privacy proof nonce is stale and the action must be rebuilt.",
  PAYMASTER_FAILED: "The optional paymaster could not submit this privacy transaction.",
  SUBMISSION_FAILED: "The privacy transaction could not be submitted.",
  SDK_VERSION_MISMATCH: "The installed official Privacy SDK does not match the reviewed version.",
  POOL_VERSION_MISMATCH: "The configured Privacy Pool is incompatible with this SDK or feature.",
  CHAIN_ID_MISMATCH: "The privacy transport is configured for a different Starknet chain.",
  TRANSACTION_VERSION_UNSUPPORTED: "The privacy transport requires Invoke Transaction V3.",
  AUTHORIZATION_VERSION_UNSUPPORTED: "The privacy transport requires Outside Execution V2.",
  CANONICAL_CAPABILITY_UNAVAILABLE: "The canonical privacy transport is unavailable because a required capability is missing.",
  CANONICAL_FALLBACK_FORBIDDEN: "The canonical privacy action failed without using the Direct encrypted fallback.",
  ACCOUNT_CUSTODY_MISMATCH: "Direct SDK privacy is restricted to integrator-owned accounts and viewing keys.",
  HELPER_TARGET_NOT_ALLOWED: "The requested helper contract is not allowlisted for canonical privacy invocation.",
  HELPER_SELECTOR_NOT_ALLOWED: "The requested helper selector is not allowlisted for canonical privacy invocation.",
  MULTIPLE_EXTERNAL_INVOKES: "A Privacy Pool transaction can contain only one VEIL external invocation.",
  PAYLOAD_VERSION_UNSUPPORTED: "The encrypted VEIL payload uses an unsupported protocol version.",
  PAYLOAD_MALFORMED: "The encrypted VEIL payload is malformed.",
  PAYLOAD_TOO_LARGE: "The encrypted VEIL payload exceeds the canonical helper limit.",
  UNSHIELD_UNAVAILABLE: "Unshield is not available in the VEIL Idea 01 product scope.",
  USER_LINKAGE_WARNING: "This withdrawal may create a public linkage to your account.",
  ESCROW_ALREADY_CLAIMED: "This private claim has already been redeemed.",
  INVALID_ESCROW_STATE: "The escrow is not in a state that permits this action.",
  DECRYPTION_FAILED: "This encrypted VEIL payload could not be decrypted on this device.",
};

export function privacyErrorMessage(error: unknown): string {
  if (error instanceof VeilPrivacyError) return PRODUCT_MESSAGES[error.code];
  return "The private action failed before completion.";
}

export function asPrivacyError(
  error: unknown,
  fallback: VeilPrivacyErrorCode = "SUBMISSION_FAILED",
): VeilPrivacyError {
  if (error instanceof VeilPrivacyError) return error;

  const message = error instanceof Error ? error.message : "Unknown privacy operation failure";
  const normalized = message.toLowerCase();
  if (normalized.includes("screening") && normalized.includes("reject")) {
    return new VeilPrivacyError("SCREENING_REJECTED", message, { cause: error });
  }
  if (normalized.includes("screening")) {
    return new VeilPrivacyError("SCREENING_UNAVAILABLE", message, { cause: error, retryable: true });
  }
  if (normalized.includes("rate") && normalized.includes("limit")) {
    return new VeilPrivacyError("DISCOVERY_RATE_LIMITED", message, { cause: error, retryable: true });
  }
  if (normalized.includes("nonce")) {
    return new VeilPrivacyError("INVALID_NONCE", message, { cause: error, retryable: true });
  }
  if (normalized.includes("stale") && normalized.includes("proof")) {
    return new VeilPrivacyError("PROOF_STALE", message, { cause: error, retryable: true });
  }
  return new VeilPrivacyError(fallback, message, { cause: error });
}
