import {
  Open,
  WarningCode,
  type ExecuteResult,
  type InvokeOpenNote,
  type InvokeWithdrawal,
  type Note,
  type PrivateRegistry,
  type PrivateTransfersInterface,
  type Warning,
} from "@starkware-libs/starknet-privacy-sdk";
import { assertSpendableBalance, computePrivateBalance, isNoteMature } from "./balances.js";
import { VeilPrivacyError, asPrivacyError } from "./errors.js";
import { normalizeAddressBigint } from "./namespace.js";
import { assertScreeningCapableDeposit, mapSetupRequirement } from "./official-sdk.js";
import {
  buildPrivateEscrowFundingPlan,
  buildPrivateEscrowRefundCalldata,
  buildPrivateEscrowReleaseCalldata,
  normalizePrivateEscrowFelt,
  normalizePrivateEscrowSettlement,
  type PrivateEscrowFundingInput,
  type PrivateEscrowSettlementInput,
} from "./private-escrow-settlement.js";
import {
  serializeProofSubmission,
  submitWithFreshProof,
  type ProofAwareCall,
  type ProofSubmissionDetails,
} from "./proving.js";

export type PrivacyTransactionStage =
  | "checking-registration"
  | "discovering-notes"
  | "checking-recipient"
  | "preparing-channel"
  | "approving-token"
  | "approval-confirmed"
  | "requesting-screening"
  | "generating-proof"
  | "submitting"
  | "confirming"
  | "private-output-maturing";

export interface PrivacyTransactionReceipt {
  transactionHash: string;
  status: "accepted" | "finalized";
  raw: unknown;
}

export interface ProofAwareSubmitter {
  submit(call: ProofAwareCall, details: ProofSubmissionDetails): Promise<string | { transactionHash: string }>;
}

export interface PrivacyChainProvider {
  getCurrentBlock(): Promise<number>;
  waitForTransaction(transactionHash: string): Promise<unknown>;
  isAccepted(receipt: unknown): boolean;
  isFinalized?(receipt: unknown): boolean;
}

export interface ExactApprovalAdapter {
  getAllowance(input: { token: bigint; owner: bigint; spender: bigint }): Promise<bigint>;
  approveExact(input: { token: bigint; owner: bigint; spender: bigint; amount: bigint }): Promise<string>;
}

export interface OfficialPrivacyFlowContext {
  transfers: PrivateTransfersInterface;
  registry: PrivateRegistry;
  screeningCapable: boolean;
}

export interface OfficialPrivacyFlowsConfig {
  context: OfficialPrivacyFlowContext;
  submitter: ProofAwareSubmitter;
  chain: PrivacyChainProvider;
  approval: ExactApprovalAdapter;
  poolAddress: string | bigint;
  accountAddress: string | bigint;
  refreshPrivateState(): Promise<void>;
  onStage?: (stage: PrivacyTransactionStage) => void;
  confirmUserLinkage?: (warnings: readonly Warning[]) => Promise<boolean>;
  maxRetries?: number;
}

export interface PrivateFlowResult {
  executeResult: ExecuteResult;
  receipt: PrivacyTransactionReceipt;
  provingBlockId: number;
  attempt: number;
}

export interface ApprovalResult {
  required: boolean;
  transactionHash?: string;
  receipt?: PrivacyTransactionReceipt;
}

export interface ShieldResult extends PrivateFlowResult {
  approval: ApprovalResult;
}

export interface PrivateTransferInput {
  token: string | bigint;
  recipient: string | bigint;
  amount: bigint;
  autoRegister?: boolean;
}

export interface ShieldInput {
  token: string | bigint;
  amount: bigint;
  autoRegister?: boolean;
}

export interface FundAndPayInput extends PrivateTransferInput {
  depositAmount: bigint;
}

export interface WithdrawInput {
  token: string | bigint;
  recipient: string | bigint;
  amount: bigint;
}

export interface PrivatePaymentMemoInput extends PrivateTransferInput {
  helperAddress: string | bigint;
  encryptedMemoCalldata: readonly (string | bigint)[];
}

export type FundPrivateEscrowCustodyInput = PrivateEscrowFundingInput;

export interface ReleasePrivateEscrowCustodyInput
  extends Omit<PrivateEscrowSettlementInput, "secret"> {
  releaseSecret: string | bigint;
}

export interface RefundPrivateEscrowCustodyInput
  extends Omit<PrivateEscrowSettlementInput, "secret"> {
  refundSecret: string | bigint;
}

export class OfficialPrivacyFlows {
  readonly #context: OfficialPrivacyFlowContext;
  readonly #submitter: ProofAwareSubmitter;
  readonly #chain: PrivacyChainProvider;
  readonly #approval: ExactApprovalAdapter;
  readonly #pool: bigint;
  readonly #account: bigint;
  readonly #refreshPrivateState: () => Promise<void>;
  readonly #onStage: ((stage: PrivacyTransactionStage) => void) | undefined;
  readonly #confirmUserLinkage: ((warnings: readonly Warning[]) => Promise<boolean>) | undefined;
  readonly #maxRetries: number;

  constructor(config: OfficialPrivacyFlowsConfig) {
    this.#context = config.context;
    this.#submitter = config.submitter;
    this.#chain = config.chain;
    this.#approval = config.approval;
    this.#pool = normalizeAddressBigint(config.poolAddress, "poolAddress");
    this.#account = normalizeAddressBigint(config.accountAddress, "accountAddress");
    this.#refreshPrivateState = config.refreshPrivateState;
    this.#onStage = config.onStage;
    this.#confirmUserLinkage = config.confirmUserLinkage;
    this.#maxRetries = config.maxRetries ?? 1;
  }

  async preflightRecipient(token: string | bigint, recipient: string | bigint) {
    this.#stage("checking-recipient");
    try {
      const requirement = await this.#context.transfers.discoverRequirement(recipient, token);
      return mapSetupRequirement(requirement);
    } catch (cause) {
      throw asPrivacyError(cause, "DISCOVERY_FAILED");
    }
  }

  async register(tokenForRegistrationCheck: string | bigint): Promise<PrivateFlowResult | { alreadyRegistered: true }> {
    this.#stage("checking-registration");
    let requirement;
    try {
      requirement = await this.#context.transfers.discoverRequirement(this.#account, tokenForRegistrationCheck);
    } catch (cause) {
      throw asPrivacyError(cause, "DISCOVERY_FAILED");
    }
    if (mapSetupRequirement(requirement) !== "RECIPIENT_NOT_REGISTERED") {
      return { alreadyRegistered: true };
    }
    return this.#executePrivate((provingBlockId) =>
      this.#context.transfers
        .build({ registry: this.#context.registry, registryConst: true })
        .register()
        .execute({ provingBlockId }),
    );
  }

  async shield(input: ShieldInput): Promise<ShieldResult> {
    assertPositiveAmount(input.amount, "amount");
    assertScreeningCapableDeposit(this.#context);
    this.#stage("requesting-screening");
    const approval = await this.#ensureExactApproval(input.token, input.amount);
    const token = normalizeAddressBigint(input.token, "token");
    const result = await this.#executePrivate((provingBlockId) =>
      this.#context.transfers
        .build({
          registry: this.#context.registry,
          registryConst: true,
          autoDiscover: { channels: "refresh" },
          autoSetup: true,
          autoRegister: input.autoRegister ?? true,
        })
        .with(token)
        .deposit({ amount: input.amount })
        .surplusTo(this.#account)
        .execute({ provingBlockId }),
    );
    this.#stage("private-output-maturing");
    return { ...result, approval };
  }

  async transfer(input: PrivateTransferInput): Promise<PrivateFlowResult> {
    assertPositiveAmount(input.amount, "amount");
    const requirement = await this.preflightRecipient(input.token, input.recipient);
    assertRecipientCanReceive(requirement);
    if (requirement !== "READY") this.#stage("preparing-channel");
    const token = normalizeAddressBigint(input.token, "token");
    const recipient = normalizeAddressBigint(input.recipient, "recipient");
    const notes = await this.#selectMatureNotes(token, input.amount);
    const result = await this.#executePrivate((provingBlockId) =>
      this.#context.transfers
        .build({
          registry: this.#context.registry,
          registryConst: true,
          autoDiscover: { channels: "refresh" },
          autoSetup: true,
          autoRegister: input.autoRegister ?? false,
        })
        .with(token)
        .inputs(...notes)
        .transfer({ recipient, amount: input.amount })
        .surplusTo(this.#account)
        .execute({ provingBlockId }),
    );
    this.#stage("private-output-maturing");
    return result;
  }

  async fundAndPay(input: FundAndPayInput): Promise<ShieldResult> {
    assertPositiveAmount(input.amount, "amount");
    assertPositiveAmount(input.depositAmount, "depositAmount");
    if (input.depositAmount < input.amount) {
      throw new VeilPrivacyError(
        "INSUFFICIENT_PUBLIC_BALANCE",
        "Fund and Pay Privately requires depositAmount to cover the private payment amount.",
      );
    }
    assertScreeningCapableDeposit(this.#context);
    const requirement = await this.preflightRecipient(input.token, input.recipient);
    assertRecipientCanReceive(requirement);
    if (requirement !== "READY") this.#stage("preparing-channel");
    this.#stage("requesting-screening");
    const approval = await this.#ensureExactApproval(input.token, input.depositAmount);
    const token = normalizeAddressBigint(input.token, "token");
    const recipient = normalizeAddressBigint(input.recipient, "recipient");
    const result = await this.#executePrivate((provingBlockId) =>
      this.#context.transfers
        .build({
          registry: this.#context.registry,
          registryConst: true,
          autoDiscover: { channels: "refresh" },
          autoSetup: true,
          autoRegister: input.autoRegister ?? true,
        })
        .with(token)
        .deposit({ amount: input.depositAmount })
        .transfer({ recipient, amount: input.amount })
        .surplusTo(this.#account)
        .execute({ provingBlockId }),
    );
    this.#stage("private-output-maturing");
    return { ...result, approval };
  }

  async withdraw(input: WithdrawInput): Promise<PrivateFlowResult> {
    assertPositiveAmount(input.amount, "amount");
    const token = normalizeAddressBigint(input.token, "token");
    const recipient = normalizeAddressBigint(input.recipient, "recipient");
    const notes = await this.#selectMatureNotes(token, input.amount);
    return this.#executePrivate(
      (provingBlockId) =>
        this.#context.transfers
          .build({ registry: this.#context.registry, registryConst: true })
          .with(token)
          .inputs(...notes)
          .withdraw({ recipient, amount: input.amount })
          .surplusTo(this.#account)
          .execute({ provingBlockId }),
      async (warnings) => this.#confirmLinkageWarnings(warnings),
    );
  }

  async fundPrivateEscrowCustody(
    input: FundPrivateEscrowCustodyInput,
  ): Promise<PrivateFlowResult> {
    const plan = buildPrivateEscrowFundingPlan(input);
    const notes = await this.#selectMatureNotes(plan.token, plan.amount);

    return this.#executePrivate(
      (provingBlockId) =>
        this.#context.transfers
          .build({ registry: this.#context.registry, registryConst: true })
          .with(plan.token)
          .inputs(...notes)
          .withdraw({
            recipient: plan.settlementAddress,
            amount: plan.amount,
          })
          .surplusTo(this.#account)
          .done()
          .invoke(({ withdrawals }) => {
            assertExactPrivateEscrowWithdrawal(withdrawals, plan);
            return {
              contractAddress: toContractAddress(plan.settlementAddress),
              calldata: [...plan.calldata],
            };
          })
          .execute({ provingBlockId }),
      async (warnings) => this.#confirmLinkageWarnings(warnings),
    );
  }

  async releasePrivateEscrowCustody(
    input: ReleasePrivateEscrowCustodyInput,
  ): Promise<PrivateFlowResult> {
    const settlement = normalizePrivateEscrowSettlement({
      ...input,
      secret: input.releaseSecret,
    });

    return this.#settlePrivateEscrowCustody(
      settlement,
      (outputNoteId) => buildPrivateEscrowReleaseCalldata({
        custodyCommitment: settlement.custodyCommitment,
        releaseSecret: settlement.secret,
        outputNoteId,
      }),
    );
  }

  async refundPrivateEscrowCustody(
    input: RefundPrivateEscrowCustodyInput,
  ): Promise<PrivateFlowResult> {
    const settlement = normalizePrivateEscrowSettlement({
      ...input,
      secret: input.refundSecret,
    });

    return this.#settlePrivateEscrowCustody(
      settlement,
      (outputNoteId) => buildPrivateEscrowRefundCalldata({
        custodyCommitment: settlement.custodyCommitment,
        refundSecret: settlement.secret,
        outputNoteId,
      }),
    );
  }

  async payWithEncryptedMemo(input: PrivatePaymentMemoInput): Promise<PrivateFlowResult> {
    assertPositiveAmount(input.amount, "amount");
    if (input.encryptedMemoCalldata.length === 0) {
      throw new VeilPrivacyError("DECRYPTION_FAILED", "Encrypted memo calldata cannot be empty.");
    }
    const requirement = await this.preflightRecipient(input.token, input.recipient);
    assertRecipientCanReceive(requirement);
    if (requirement !== "READY") this.#stage("preparing-channel");
    const token = normalizeAddressBigint(input.token, "token");
    const recipient = normalizeAddressBigint(input.recipient, "recipient");
    const helperAddress = normalizeAddressBigint(input.helperAddress, "helperAddress");
    const notes = await this.#selectMatureNotes(token, input.amount);
    const helperCalldata = input.encryptedMemoCalldata.map((value, index) =>
      normalizeFelt(value, `encryptedMemoCalldata[${index}]`),
    );
    const result = await this.#executePrivate((provingBlockId) =>
      this.#context.transfers
        .build({
          registry: this.#context.registry,
          registryConst: true,
          autoDiscover: { channels: "refresh" },
          autoSetup: true,
          autoRegister: input.autoRegister ?? false,
        })
        .with(token)
        .inputs(...notes)
        .transfer({ recipient, amount: input.amount })
        .surplusTo(this.#account)
        .done()
        .invoke(() => ({ contractAddress: `0x${helperAddress.toString(16)}`, calldata: helperCalldata }))
        .execute({ provingBlockId }),
    );
    this.#stage("private-output-maturing");
    return result;
  }

  async #ensureExactApproval(tokenValue: string | bigint, amount: bigint): Promise<ApprovalResult> {
    const token = normalizeAddressBigint(tokenValue, "token");
    let allowance: bigint;
    try {
      allowance = await this.#approval.getAllowance({ token, owner: this.#account, spender: this.#pool });
    } catch (cause) {
      throw asPrivacyError(cause, "APPROVAL_FAILED");
    }
    if (allowance === amount) return { required: false };

    this.#stage("approving-token");
    let transactionHash: string;
    try {
      transactionHash = await this.#approval.approveExact({ token, owner: this.#account, spender: this.#pool, amount });
    } catch (cause) {
      throw asPrivacyError(cause, "APPROVAL_FAILED");
    }
    if (!transactionHash) throw new VeilPrivacyError("APPROVAL_FAILED", "Approval did not return a transaction hash.");
    const receipt = await this.#waitForAccepted(transactionHash, "APPROVAL_NOT_CONFIRMED");
    this.#stage("approval-confirmed");
    return { required: true, transactionHash, receipt };
  }

  async #settlePrivateEscrowCustody(
    settlement: ReturnType<typeof normalizePrivateEscrowSettlement>,
    buildCalldata: (outputNoteId: string | bigint) => readonly bigint[],
  ): Promise<PrivateFlowResult> {
    return this.#executePrivate((provingBlockId) =>
      this.#context.transfers
        .build({
          registry: this.#context.registry,
          registryConst: true,
          autoDiscover: { channels: "refresh" },
          autoSetup: true,
        })
        .with(settlement.token)
        .transfer({
          recipient: settlement.recipient,
          amount: Open,
        })
        .done()
        .invoke(({ openNotes }) => {
          const outputNoteId = exactPrivateEscrowOutputNoteId(
            openNotes,
            settlement.token,
          );
          return {
            contractAddress: toContractAddress(settlement.settlementAddress),
            calldata: [...buildCalldata(outputNoteId)],
          };
        })
        .execute({ provingBlockId }),
    );
  }

  async #selectMatureNotes(token: bigint, amount: bigint): Promise<Note[]> {
    this.#stage("discovering-notes");
    let notes: readonly Note[];
    try {
      const discovered = await this.#context.transfers.discoverNotes({ tokens: [token] });
      notes = discovered.notes.get(token) ?? [];
    } catch (cause) {
      throw asPrivacyError(cause, "DISCOVERY_FAILED");
    }
    const currentBlock = await this.#chain.getCurrentBlock();
    const balance = computePrivateBalance(notes, currentBlock);
    assertSpendableBalance(balance, amount);

    const selected: Note[] = [];
    let selectedAmount = 0n;
    for (const note of notes) {
      if (!isNoteMature(note, currentBlock)) continue;
      selected.push(note);
      selectedAmount += note.amount;
      if (selectedAmount >= amount) break;
    }
    if (selectedAmount < amount) {
      throw new VeilPrivacyError("INSUFFICIENT_PRIVATE_BALANCE", "Mature note selection did not cover the amount.");
    }
    return selected;
  }

  async #executePrivate(
    build: (provingBlockId: number) => Promise<ExecuteResult>,
    beforeSubmit?: (warnings: readonly Warning[]) => Promise<void>,
  ): Promise<PrivateFlowResult> {
    const result = await submitWithFreshProof({
      getCurrentBlock: () => this.#chain.getCurrentBlock(),
      build: async ({ provingBlockId }) => {
        this.#stage("generating-proof");
        return build(provingBlockId);
      },
      submit: async (executeResult) => {
        await beforeSubmit?.(executeResult.warnings);
        const submission = serializeOfficialExecuteResult(executeResult);
        this.#stage("submitting");
        return this.#submitter.submit(submission.call, submission.details);
      },
      wait: async (submitted) => {
        const transactionHash = extractSubmittedHash(submitted);
        return this.#waitForAccepted(transactionHash, "SUBMISSION_FAILED");
      },
      invalidateProofNonceCache: () => this.#context.transfers.invalidateProofNonceCache(),
      refreshPrivateState: this.#refreshPrivateState,
      shouldRetry: (error) => error.code === "INVALID_NONCE" || error.code === "PROOF_STALE",
      maxRetries: this.#maxRetries,
    });
    this.#context.registry = result.build.registry;
    return {
      executeResult: result.build,
      receipt: result.receipt,
      provingBlockId: result.provingBlockId,
      attempt: result.attempt,
    };
  }

  async #confirmLinkageWarnings(warnings: readonly Warning[]): Promise<void> {
    const linkageWarnings = warnings.filter((warning) => warning.code === WarningCode.USER_LINKAGE);
    if (linkageWarnings.length === 0) return;
    if (!this.#confirmUserLinkage || !(await this.#confirmUserLinkage(linkageWarnings))) {
      throw new VeilPrivacyError("USER_LINKAGE_WARNING", "Withdrawal stopped before submission due to linkage warning.");
    }
  }

  async #waitForAccepted(
    transactionHash: string,
    failureCode: "APPROVAL_NOT_CONFIRMED" | "SUBMISSION_FAILED",
  ): Promise<PrivacyTransactionReceipt> {
    this.#stage("confirming");
    let raw: unknown;
    try {
      raw = await this.#chain.waitForTransaction(transactionHash);
    } catch (cause) {
      throw new VeilPrivacyError(failureCode, `Transaction confirmation failed: ${transactionHash}`, { cause });
    }
    if (!this.#chain.isAccepted(raw)) {
      throw new VeilPrivacyError(failureCode, `Transaction was rejected or reverted: ${transactionHash}`);
    }
    return {
      transactionHash,
      status: this.#chain.isFinalized?.(raw) === true ? "finalized" : "accepted",
      raw,
    };
  }

  #stage(stage: PrivacyTransactionStage): void {
    this.#onStage?.(stage);
  }
}

function serializeOfficialExecuteResult(executeResult: ExecuteResult) {
  const calldata = executeResult.callAndProof.call.calldata;
  if (!Array.isArray(calldata)) {
    throw new VeilPrivacyError("SUBMISSION_FAILED", "Official SDK returned non-array apply_actions calldata.");
  }
  return serializeProofSubmission({
    call: {
      contractAddress: String(executeResult.callAndProof.call.contractAddress),
      entrypoint: executeResult.callAndProof.call.entrypoint,
      calldata: calldata.map((value) => String(value)),
    },
    proof: {
      data: executeResult.callAndProof.proof.data,
      proofFacts: executeResult.callAndProof.proof.proofFacts,
    },
  });
}

function assertPositiveAmount(value: bigint, label: string): void {
  if (typeof value !== "bigint" || value <= 0n) {
    throw new VeilPrivacyError("INSUFFICIENT_PRIVATE_BALANCE", `${label} must be a positive bigint in smallest units.`);
  }
}

function assertRecipientCanReceive(requirement: ReturnType<typeof mapSetupRequirement>): void {
  if (requirement === "RECIPIENT_NOT_REGISTERED") {
    throw new VeilPrivacyError("RECIPIENT_NOT_REGISTERED", "Recipient is not registered in this Privacy Pool.");
  }
}

function normalizeFelt(value: string | bigint, label: string): bigint {
  let felt: bigint;
  try {
    felt = typeof value === "bigint" ? value : BigInt(value.trim());
  } catch (cause) {
    throw new VeilPrivacyError("DECRYPTION_FAILED", `${label} is not a valid ciphertext felt.`, { cause });
  }
  if (felt < 0n || felt >= (1n << 251n)) {
    throw new VeilPrivacyError("DECRYPTION_FAILED", `${label} is outside the Starknet felt range.`);
  }
  return felt;
}

function assertExactPrivateEscrowWithdrawal(
  withdrawals: readonly InvokeWithdrawal[],
  expected: {
    settlementAddress: bigint;
    token: bigint;
    amount: bigint;
  },
): void {
  const matches = withdrawals.filter((withdrawal) =>
    withdrawal.recipient === expected.settlementAddress
    && withdrawal.token === expected.token
    && withdrawal.amount === expected.amount,
  );

  if (withdrawals.length !== 1 || matches.length !== 1) {
    throw new VeilPrivacyError(
      "INVALID_ESCROW_STATE",
      "Private escrow funding requires exactly one matching withdrawal.",
    );
  }
}

function exactPrivateEscrowOutputNoteId(
  openNotes: readonly InvokeOpenNote[],
  token: bigint,
): bigint {
  const matches = openNotes.filter((note) => note.token === token);
  if (openNotes.length !== 1 || matches.length !== 1) {
    throw new VeilPrivacyError(
      "INVALID_ESCROW_STATE",
      "Private escrow settlement requires exactly one matching official Open output.",
    );
  }
  return normalizePrivateEscrowFelt(
    String(matches[0]!.noteId),
    "outputNoteId",
  );
}

function toContractAddress(value: bigint): string {
  return `0x${value.toString(16)}`;
}

function extractSubmittedHash(value: string | { transactionHash: string }): string {
  const hash = typeof value === "string" ? value : value.transactionHash;
  if (!hash) throw new VeilPrivacyError("SUBMISSION_FAILED", "Submission returned no transaction hash.");
  return hash;
}
