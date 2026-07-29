import type {
  ExecuteResult,
  ProofProviderInterface,
} from "@starkware-libs/starknet-privacy-sdk";
import type { BigNumberish } from "starknet";
import { derivePrivacyPublicKey } from "../privacy_pool_ecdh.js";
import { VeilPrivacyError, asPrivacyError } from "./errors.js";
import type { PrivacyNamespace } from "./namespace.js";
import { normalizeAddress } from "./namespace.js";
import {
  serializeProofSubmission,
  type CallAndProofLike,
  type ProofAwareCall,
  type ProofSubmissionDetails,
} from "./proving.js";
import type { EncryptedViewingKeyVault } from "./viewing-key-vault.js";

export interface ReadyRegistrationSubmissionAccount {
  address: BigNumberish;
  execute(
    call: ProofAwareCall,
    details: ProofSubmissionDetails,
  ): Promise<{ transaction_hash: string }>;
}

export interface RegistrationSubmissionReceipt {
  finality_status?: string;
  execution_status?: string;
  isSuccess?(): boolean;
  isReverted?(): boolean;
}

export interface RegistrationSubmissionProvider {
  waitForTransaction(
    transactionHash: string,
    options?: unknown,
  ): Promise<RegistrationSubmissionReceipt>;
  callContract(
    call: {
      contractAddress: string;
      entrypoint: string;
      calldata: readonly (string | bigint)[];
    },
    blockIdentifier?: unknown,
  ): Promise<unknown>;
}

export interface SubmitOfficialRegistrationInput {
  account: ReadyRegistrationSubmissionAccount;
  provider: RegistrationSubmissionProvider;
  result: ExecuteResult;
  provingProvider: ProofProviderInterface;
  namespace: PrivacyNamespace;
  viewingKeyVault: EncryptedViewingKeyVault;
  poolAddress: string | bigint;
}

export interface OfficialRegistrationSubmissionResult {
  transactionHash: string;
  finalityStatus: string;
  executionStatus: string;
  accountAddress: string;
  poolAddress: string;
  proofPresent: boolean;
  proofFactsCount: number;
  registrationVerified: true;
}

export async function submitOfficialRegistration(
  input: SubmitOfficialRegistrationInput,
): Promise<OfficialRegistrationSubmissionResult> {
  const accountAddress = normalizeAddress(
    typeof input.account.address === "bigint"
      ? input.account.address
      : String(input.account.address),
    "accountAddress",
  );
  const poolAddress = normalizeAddress(input.poolAddress, "poolAddress");

  if (accountAddress !== input.namespace.accountAddress) {
    throw new VeilPrivacyError(
      "ACCOUNT_CUSTODY_MISMATCH",
      "Ready Wallet account does not match the active encrypted privacy namespace.",
    );
  }
  if (poolAddress !== input.namespace.poolAddress) {
    throw new VeilPrivacyError(
      "POOL_VERSION_MISMATCH",
      "Registration submission Pool does not match the encrypted privacy namespace.",
    );
  }
  if (typeof input.account.execute !== "function") {
    throw new VeilPrivacyError(
      "PRIVACY_WALLET_UNSUPPORTED",
      "Ready Wallet account does not expose execute() for proof submission.",
    );
  }

  const callAndProof = input.result.callAndProof as unknown as CallAndProofLike;
  const serialized = serializeProofSubmission(callAndProof);
  if (
    typeof serialized.details.proof !== "string"
    || serialized.details.proof.length === 0
    || !Array.isArray(serialized.details.proofFacts)
    || serialized.details.proofFacts.length === 0
  ) {
    throw new VeilPrivacyError(
      "PROVING_FAILED",
      "Registration submission requires proof data and proof facts.",
    );
  }

  try {
    const transaction = await input.account.execute(
      serialized.call,
      serialized.details,
    );
    const transactionHash = requiredTransactionHash(
      transaction?.transaction_hash,
    );

    const receipt = await input.provider.waitForTransaction(transactionHash);
    assertSuccessfulRegistrationReceipt(receipt);

    const viewingKey = await input.viewingKeyVault
      .createProvider(input.namespace)
      .getViewingKey();
    const expectedPublicKey = BigInt(derivePrivacyPublicKey(viewingKey));

    const response = await input.provider.callContract(
      {
        contractAddress: poolAddress,
        entrypoint: "get_public_key",
        calldata: [accountAddress],
      },
      "latest",
    );
    const registeredPublicKey = readSingleFelt(response);

    if (
      registeredPublicKey === 0n
      || registeredPublicKey !== expectedPublicKey
    ) {
      throw new VeilPrivacyError(
        "SENDER_NOT_REGISTERED",
        "Privacy Pool registration could not be verified against this device viewing key.",
      );
    }

    return {
      transactionHash,
      finalityStatus: receipt.finality_status ?? "ACCEPTED",
      executionStatus: receipt.execution_status ?? "SUCCEEDED",
      accountAddress,
      poolAddress,
      proofPresent: true,
      proofFactsCount: serialized.details.proofFacts.length,
      registrationVerified: true,
    };
  } catch (cause) {
    invalidateProofNonceCache(input.provingProvider);
    throw asRegistrationSubmissionError(cause);
  }
}

export function assertSuccessfulRegistrationReceipt(
  receipt: RegistrationSubmissionReceipt,
): void {
  const reverted = receipt.isReverted?.() === true
    || receipt.execution_status === "REVERTED";
  const explicitFailure = receipt.isSuccess?.() === false;
  const executionStatus = receipt.execution_status;
  const executionSucceeded = executionStatus === undefined
    || executionStatus === "SUCCEEDED";
  const finalityStatus = receipt.finality_status;
  const finalityAccepted = finalityStatus === undefined
    || finalityStatus === "ACCEPTED_ON_L2"
    || finalityStatus === "ACCEPTED_ON_L1";

  if (
    reverted
    || explicitFailure
    || !executionSucceeded
    || !finalityAccepted
  ) {
    throw new VeilPrivacyError(
      "SUBMISSION_FAILED",
      "Registration transaction was not accepted and successful.",
    );
  }
}

function requiredTransactionHash(value: unknown): string {
  if (
    typeof value !== "string"
    || !/^0x[0-9a-f]+$/iu.test(value)
  ) {
    throw new VeilPrivacyError(
      "SUBMISSION_FAILED",
      "Ready Wallet returned no valid transaction hash.",
    );
  }
  return value.toLowerCase();
}

function readSingleFelt(response: unknown): bigint {
  let values: readonly unknown[] | undefined;

  if (Array.isArray(response)) {
    values = response;
  } else if (
    typeof response === "object"
    && response !== null
    && "result" in response
  ) {
    const result = (response as { result?: unknown }).result;
    if (Array.isArray(result)) values = result;
  }

  if (!values || values.length !== 1) {
    throw new VeilPrivacyError(
      "SUBMISSION_FAILED",
      "Privacy Pool get_public_key returned an invalid response.",
    );
  }

  const value = values[0];
  if (
    typeof value !== "string"
    && typeof value !== "number"
    && typeof value !== "bigint"
  ) {
    throw new VeilPrivacyError(
      "SUBMISSION_FAILED",
      "Privacy Pool get_public_key returned an invalid felt.",
    );
  }

  try {
    return BigInt(value);
  } catch (cause) {
    throw new VeilPrivacyError(
      "SUBMISSION_FAILED",
      "Privacy Pool get_public_key returned an invalid felt.",
      { cause },
    );
  }
}

function invalidateProofNonceCache(
  provingProvider: ProofProviderInterface,
): void {
  try {
    provingProvider.invalidateNonceCache?.();
  } catch {
    // Preserve the original submission or verification failure.
  }
}

function asRegistrationSubmissionError(cause: unknown): VeilPrivacyError {
  if (cause instanceof VeilPrivacyError) return cause;
  const error = asPrivacyError(cause);
  return new VeilPrivacyError(
    error.code === "PROVING_FAILED"
      ? "PROVING_FAILED"
      : "SUBMISSION_FAILED",
    "Official registration submission failed.",
    {
      cause,
      retryable: error.retryable,
    },
  );
}
