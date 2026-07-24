import {
  VEIL_PRIVACY_ERROR_CODES,
  type VeilPrivacyErrorCode,
} from "#veil-sdk/errors";
import { BackendEnvironmentError } from "../../config/backend-env.js";

export interface PublicProofError {
  status: number;
  code: string;
  why: string;
  howToFix: string;
  retryable: boolean;
}

const CLIENT_REQUEST_CODES = new Set<VeilPrivacyErrorCode>([
  "PROVER_REQUEST_INVALID",
  "TRANSACTION_VERSION_UNSUPPORTED",
  "AUTHORIZATION_VERSION_UNSUPPORTED",
  "HELPER_TARGET_NOT_ALLOWED",
  "HELPER_SELECTOR_NOT_ALLOWED",
  "MULTIPLE_EXTERNAL_INVOKES",
  "PAYLOAD_VERSION_UNSUPPORTED",
  "PAYLOAD_MALFORMED",
  "PAYLOAD_TOO_LARGE",
  "UNSHIELD_UNAVAILABLE",
]);

export function normalizeProofError(error: unknown): PublicProofError {
  if (error instanceof BackendEnvironmentError) {
    return {
      status: 503,
      code: error.code,
      why: "The VEIL messaging backend is not configured for this operation.",
      howToFix: "Correct the server-only RPC, discovery, helper, Pool, and prover environment settings.",
      retryable: false,
    };
  }

  if (isVeilProofError(error)) {
    const status = error.code === "PROVER_TIMEOUT"
      ? 504
      : CLIENT_REQUEST_CODES.has(error.code)
        ? 400
        : error.code === "PROVER_CANCELLED"
          ? 499
          : 503;
    return {
      status,
      code: error.code,
      why: publicReason(error.code),
      howToFix: publicFix(error.code),
      retryable: error.retryable,
    };
  }

  return {
    status: 500,
    code: "VEIL_BACKEND_UNEXPECTED",
    why: "The VEIL messaging backend could not complete the proof operation.",
    howToFix: "Retry once using the returned requestId, then inspect sanitized backend health logs.",
    retryable: false,
  };
}

function publicReason(code: VeilPrivacyErrorCode): string {
  if (CLIENT_REQUEST_CODES.has(code)) {
    return "The canonical message proof request failed strict validation.";
  }
  if (code === "PROVER_TIMEOUT") return "The transaction prover exceeded its configured timeout.";
  if (code === "PROVER_UNREACHABLE") return "The transaction prover is unreachable.";
  if (code === "PROVER_VERSION_MISMATCH" || code === "SDK_PROVER_MISMATCH" || code === "POOL_PROVER_MISMATCH") {
    return "The prover, Privacy SDK, or Privacy Pool compatibility pin does not match.";
  }
  return "The transaction prover could not accept or complete this request.";
}

function publicFix(code: VeilPrivacyErrorCode): string {
  if (CLIENT_REQUEST_CODES.has(code)) {
    return "Rebuild the canonical Invoke V3 request with one allowlisted privacy_invoke action and no plaintext or private-key fields.";
  }
  if (code === "PROVER_TIMEOUT" || code === "PROVER_UNREACHABLE") {
    return "Check the pinned prover service health and retry the same logical message once.";
  }
  return "Verify the pinned SDK, prover image, Pool compatibility, Sepolia chain, and helper allowlist before retrying.";
}

interface VeilProofErrorLike {
  code: VeilPrivacyErrorCode;
  retryable: boolean;
}

const VEIL_PRIVACY_ERROR_CODE_SET = new Set<string>(VEIL_PRIVACY_ERROR_CODES);

function isVeilProofError(error: unknown): error is VeilProofErrorLike {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as Record<string, unknown>;
  return typeof candidate.code === "string"
    && VEIL_PRIVACY_ERROR_CODE_SET.has(candidate.code)
    && typeof candidate.retryable === "boolean";
}
