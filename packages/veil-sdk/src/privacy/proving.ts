import { VeilPrivacyError, asPrivacyError } from "./errors.js";

export const DEFAULT_PROVING_REORG_BUFFER = 10;

export function computeProvingBlockId(
  currentBlock: number,
  reorgBuffer = DEFAULT_PROVING_REORG_BUFFER,
): number {
  if (!Number.isSafeInteger(currentBlock) || currentBlock < 0) {
    throw new Error("currentBlock must be a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(reorgBuffer) || reorgBuffer < 1) {
    throw new Error("reorgBuffer must be a positive safe integer.");
  }
  if (currentBlock < reorgBuffer) {
    throw new VeilPrivacyError("PROVING_FAILED", "The chain is too young for the configured proving buffer.");
  }
  return currentBlock - reorgBuffer;
}

export interface ProofAwareCall {
  contractAddress: string;
  entrypoint: string;
  calldata: readonly (string | bigint)[];
}

export interface ProofSubmissionDetails {
  tip: 0n;
  proofFacts?: readonly (string | bigint)[];
  proof?: string;
}

export interface CallAndProofLike {
  call: ProofAwareCall;
  proof: {
    data: string;
    proofFacts: readonly (string | bigint)[];
  };
}

export function serializeProofSubmission(callAndProof: CallAndProofLike): {
  call: ProofAwareCall;
  details: ProofSubmissionDetails;
} {
  const proofFacts = callAndProof.proof.proofFacts;
  if (!Array.isArray(proofFacts)) {
    throw new VeilPrivacyError("INVALID_PROOF_FACTS", "proofFacts must be an array.");
  }
  for (const fact of proofFacts) {
    if ((typeof fact !== "string" && typeof fact !== "bigint") || String(fact).trim() === "") {
      throw new VeilPrivacyError("INVALID_PROOF_FACTS", "proofFacts contains an invalid felt.");
    }
  }
  if (proofFacts.length === 0) {
    return { call: callAndProof.call, details: { tip: 0n } };
  }
  if (typeof callAndProof.proof.data !== "string" || callAndProof.proof.data.length === 0) {
    throw new VeilPrivacyError("INVALID_PROOF_FACTS", "A non-empty proof is required when proof facts are present.");
  }
  return {
    call: callAndProof.call,
    details: { tip: 0n, proofFacts: [...proofFacts], proof: callAndProof.proof.data },
  };
}

export interface FreshProofRetryDependencies<TBuild, TSubmitted, TReceipt> {
  getCurrentBlock(): Promise<number>;
  build(input: { provingBlockId: number; attempt: number }): Promise<TBuild>;
  submit(build: TBuild): Promise<TSubmitted>;
  wait(submitted: TSubmitted): Promise<TReceipt>;
  invalidateProofNonceCache(): void;
  refreshPrivateState(): Promise<void>;
  shouldRetry(error: VeilPrivacyError): boolean;
  maxRetries?: number;
  reorgBuffer?: number;
}

export interface FreshProofResult<TBuild, TSubmitted, TReceipt> {
  build: TBuild;
  submitted: TSubmitted;
  receipt: TReceipt;
  attempt: number;
  provingBlockId: number;
}

export async function submitWithFreshProof<TBuild, TSubmitted, TReceipt>(
  dependencies: FreshProofRetryDependencies<TBuild, TSubmitted, TReceipt>,
): Promise<FreshProofResult<TBuild, TSubmitted, TReceipt>> {
  const maxRetries = dependencies.maxRetries ?? 1;
  if (!Number.isSafeInteger(maxRetries) || maxRetries < 0) throw new Error("maxRetries must be non-negative.");

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const provingBlockId = computeProvingBlockId(
      await dependencies.getCurrentBlock(),
      dependencies.reorgBuffer ?? DEFAULT_PROVING_REORG_BUFFER,
    );
    try {
      // A new build is mandatory on every loop; a failed callAndProof is never submitted again.
      const build = await dependencies.build({ provingBlockId, attempt });
      const submitted = await dependencies.submit(build);
      const receipt = await dependencies.wait(submitted);
      return { build, submitted, receipt, attempt, provingBlockId };
    } catch (cause) {
      const error = asPrivacyError(cause);
      if (attempt >= maxRetries || !dependencies.shouldRetry(error)) throw error;
      dependencies.invalidateProofNonceCache();
      await dependencies.refreshPrivateState();
    }
  }

  throw new VeilPrivacyError("SUBMISSION_FAILED", "Fresh-proof retry exhausted unexpectedly.");
}
