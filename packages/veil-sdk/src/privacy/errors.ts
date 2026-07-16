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
  "PROOF_STALE",
  "INVALID_PROOF_FACTS",
  "PROOF_TOO_LARGE",
  "INVALID_NONCE",
  "PAYMASTER_FAILED",
  "SUBMISSION_FAILED",
  "POOL_VERSION_MISMATCH",
  "MULTIPLE_EXTERNAL_INVOKES",
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
  PROOF_STALE: "The privacy proof is stale and must be rebuilt.",
  INVALID_PROOF_FACTS: "The proving response contained invalid proof facts.",
  PROOF_TOO_LARGE: "The generated proof exceeds the supported transaction size.",
  INVALID_NONCE: "The privacy proof nonce is stale and the action must be rebuilt.",
  PAYMASTER_FAILED: "The optional paymaster could not submit this privacy transaction.",
  SUBMISSION_FAILED: "The privacy transaction could not be submitted.",
  POOL_VERSION_MISMATCH: "The configured Privacy Pool is incompatible with this SDK or feature.",
  MULTIPLE_EXTERNAL_INVOKES: "A Privacy Pool transaction can contain only one VEIL external invocation.",
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
