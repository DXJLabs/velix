import { decodePrivacyPoolEvent, type RawStarknetEvent, type StarknetAbi } from "./event_decoder";
import { PRIVACY_POOL_EVENT_ABI, PRIVACY_POOL_SOURCE_CONSTRAINTS } from "./privacy_pool_abi";
import { sortTimeline } from "./timeline";
import { channelIdToFelt } from "./direct_helper_transport";
import {
  analyzeClientActionBatch,
  buildPrivacyPoolChannelActions,
  buildPrivacyPoolMessageActions,
  createEncNoteAction,
  invokeExternalAction,
  type PrivacyPoolClientAction,
} from "./privacy_pool_actions";
import {
  assertPaymasterAccepted,
  estimateTotalCost,
  PRIVACY_POOL_STRK_FEE_TOKEN_ADDRESS,
  type PrivacyPoolFeeMode,
  type PrivacyPoolTotalCostEstimate,
} from "./privacy_pool_fees";
import { buildStarknetPrivacySdkAction } from "./starknet_privacy_sdk";
import {
  PrivacyPoolTransactionAnalyzer,
  decodeTransactionCalldata,
  type PrivacyPoolTransactionAnalysis,
  type PrivacyPoolTransactionAnalyzerConfig,
  type RawStarknetTransaction,
} from "./transaction_analyzer";
import {
  type AvnuPrivacyPoolTransportConfig,
  type CreateChannelInput,
  type CreateChannelResult,
  type FeltLike,
  type InvokeExternalInput,
  type OpenSubchannelResult,
  type PrivacyPoolAdapter,
  type PrivacyPoolAdapterActionResult,
  type PrivacyPoolCreateEncryptedNoteInput,
  type PrivacyPoolInvokeExternalCalldataInput,
  type PrivacyPoolOpenChannelInput,
  type PrivacyPoolOpenSubchannelInput,
  type StarknetAccountLike,
  type StarknetContractCall,
  type StarknetPrivacyMessageAction,
  type StarknetPrivacySdkExecutionInput,
  type StarknetPrivacyPoolTransportConfig,
  type StarknetProviderLike,
  type StarknetTransactionReceiptLike,
  type TimelineItem,
  type VeilTransport,
} from "./types";

const RESEARCH_ONLY_ERROR = "ResearchPrivacyPoolAdapter is read-only and does not submit Privacy Pool actions.";

function createPreparedActionResult(
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

function toFeltString(value: FeltLike, label: string): string {
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

function extractTransactionHash(result: Awaited<ReturnType<StarknetAccountLike["execute"]>>): string | undefined {
  if (typeof result === "string") {
    return result;
  }

  if ("hash" in result && typeof result.hash === "string") {
    return result.hash;
  }

  return result.transaction_hash ?? result.transactionHash;
}

function extractBlockNumber(receipt: StarknetTransactionReceiptLike): number | undefined {
  return receipt.block_number ?? receipt.blockNumber;
}

function isAcceptedReceipt(receipt: StarknetTransactionReceiptLike): boolean {
  const status = receipt.status ?? receipt.finality_status;
  const executionStatus = receipt.execution_status;
  if (executionStatus === "REVERTED" || status === "REJECTED" || status === "REVERTED") {
    return false;
  }

  return status === "ACCEPTED_ON_L2" || status === "ACCEPTED_ON_L1" || extractBlockNumber(receipt) !== undefined;
}

function createSpanHelperCall(contractAddress: string, calldata: readonly string[]): StarknetContractCall {
  return {
    contractAddress,
    entrypoint: "privacy_invoke",
    calldata: [String(calldata.length), ...calldata],
  };
}

// VEIL IMPLEMENTATION NOTE:
// MockPrivacyPoolAdapter is an explicit local-only fast path for VEIL UI/SDK development.
// Production clients must pass allowMock: true before this can become a default.
// It does not claim real anonymity, note encryption, or transaction submission.
export class MockPrivacyPoolAdapter implements PrivacyPoolAdapter, VeilTransport {
  readonly mode = "mock";
  readonly supportedModes = ["shield", "unshield"] as const;
  readonly #channels = new Map<string, CreateChannelResult>();
  readonly #events = new Map<string, TimelineItem[]>();
  readonly #now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.#now = now;
  }

  async createChannel(input: CreateChannelInput): Promise<CreateChannelResult> {
    const channelId = input.channelId ?? `${this.#channels.size + 1}`;
    const result: CreateChannelResult = {
      channelId,
      createdAt: this.#now(),
    };
    if (input.title) {
      result.title = input.title;
    }

    this.#channels.set(channelId, result);
    if (!this.#events.has(channelId)) {
      this.#events.set(channelId, []);
    }

    return result;
  }

  async openChannel(input: PrivacyPoolOpenChannelInput): Promise<PrivacyPoolAdapterActionResult> {
    const clientActions = buildPrivacyPoolChannelActions({
      openChannel: {
        recipientAddress: input.recipientAddress,
        index: input.index,
        random: input.random,
        salt: input.salt,
      },
    });
    return createPreparedActionResult(this.mode, "OpenChannel", clientActions, [
      "Mock only. Encoded ClientAction preview uses the official Privacy Pool action shape.",
    ]);
  }

  async openSubchannel(input: PrivacyPoolOpenSubchannelInput): Promise<PrivacyPoolAdapterActionResult> {
    const clientActions = buildPrivacyPoolChannelActions({
      openSubchannel: {
        recipientAddress: input.recipientAddress,
        recipientPublicKey: input.recipientPublicKey,
        channelKey: input.channelKey,
        index: input.index,
        token: input.token,
        salt: input.salt,
      },
    });
    return createPreparedActionResult(this.mode, "OpenSubchannel", clientActions, [
      "Mock only. No ECDH/channel-key derivation is performed here.",
    ]);
  }

  async createEncryptedNote(
    input: PrivacyPoolCreateEncryptedNoteInput,
  ): Promise<PrivacyPoolAdapterActionResult> {
    const clientActions = [
      createEncNoteAction({
        recipientAddress: input.recipientAddress,
        recipientPublicKey: input.recipientPublicKey,
        token: input.token,
        amount: input.amount,
        index: input.index,
        salt: input.salt,
      }),
    ];
    return createPreparedActionResult(this.mode, "CreateEncNote", clientActions, [
      "Mock only. Encrypted notes are not created by this adapter.",
    ]);
  }

  async invokeExternal(input: InvokeExternalInput): Promise<TimelineItem> {
    const items = this.#events.get(input.item.channelId) ?? [];
    const eventId = `${items.length + 1}`;
    const storedItem: TimelineItem = {
      ...input.item,
      eventId,
      transactionHash: `mock-${input.item.channelId}-${eventId}`,
      mode: input.mode,
      status: "confirmed",
      optimistic: false,
    };

    this.#events.set(input.item.channelId, [...items, storedItem]);
    return storedItem;
  }

  async prepareInvokeExternal(
    input: PrivacyPoolInvokeExternalCalldataInput,
  ): Promise<PrivacyPoolAdapterActionResult> {
    const clientActions = [
      invokeExternalAction({
        contractAddress: input.contractAddress,
        calldata: input.calldata,
      }),
    ];
    return createPreparedActionResult(this.mode, "InvokeExternal", clientActions, [
      "Mock-only encoded action preview for the helper invoke payload.",
      "InvokeExternal alone does not provide Privacy Pool replay protection.",
    ]);
  }

  async getEventCount(channelId: string): Promise<number> {
    return this.#events.get(channelId)?.length ?? 0;
  }

  async getEvent(channelId: string, index: number): Promise<TimelineItem> {
    const item = this.#events.get(channelId)?.[index];
    if (!item) {
      throw new Error(`Timeline event ${index} not found for channel ${channelId}`);
    }
    return item;
  }

  async getTimeline(channelId: string): Promise<TimelineItem[]> {
    return sortTimeline(this.#events.get(channelId) ?? []);
  }
}

export class StarknetPrivacyPoolTransport implements VeilTransport {
  readonly supportedModes = ["shield"] as const;
  readonly #privacyPoolAddress: string;
  readonly #helperAddress: string;
  readonly #privacySdk: StarknetPrivacyPoolTransportConfig["privacySdk"];
  readonly #actionBuilder: StarknetPrivacyPoolTransportConfig["actionBuilder"];
  readonly #paymaster: StarknetPrivacyPoolTransportConfig["paymaster"];
  readonly #provider: StarknetProviderLike | undefined;
  readonly #readTransport: VeilTransport;
  readonly #now: () => number;
  readonly #channelIdEncoder: (channelId: string) => string;
  readonly #waitForConfirmation: boolean;
  readonly #confirmationTimeoutMs: number;
  readonly #confirmationPollMs: number;
  readonly #feeMode: PrivacyPoolFeeMode;
  readonly #feeTokenAddress: FeltLike;
  readonly #privateFeeBalance: FeltLike | undefined;
  readonly #feeEstimator: StarknetPrivacyPoolTransportConfig["feeEstimator"];
  readonly #gasEstimate: FeltLike | undefined;

  constructor(config: StarknetPrivacyPoolTransportConfig) {
    this.#privacyPoolAddress = config.privacyPoolAddress;
    this.#helperAddress = config.helperAddress;
    this.#privacySdk = config.privacySdk;
    this.#actionBuilder = config.actionBuilder;
    this.#paymaster = config.paymaster;
    this.#provider = config.provider;
    this.#readTransport = config.readTransport;
    this.#now = config.now ?? (() => Date.now());
    this.#channelIdEncoder = config.channelIdEncoder ?? channelIdToFelt;
    this.#waitForConfirmation = config.waitForConfirmation ?? true;
    this.#confirmationTimeoutMs = config.confirmationTimeoutMs ?? 120_000;
    this.#confirmationPollMs = config.confirmationPollMs ?? 2_500;
    this.#feeMode = config.feeMode ?? "sponsored";
    this.#feeTokenAddress = config.feeTokenAddress ?? PRIVACY_POOL_STRK_FEE_TOKEN_ADDRESS;
    this.#privateFeeBalance = config.privateFeeBalance;
    this.#feeEstimator = config.feeEstimator;
    this.#gasEstimate = config.gasEstimate;
  }

  async createChannel(input: CreateChannelInput = {}): Promise<CreateChannelResult> {
    if (!input.privacyPool) {
      throw new Error("Shield channel creation requires Privacy Pool SetViewingKey/OpenChannel/OpenSubchannel input.");
    }

    const channelId = input.channelId ?? "1";
    const clientActions = buildPrivacyPoolChannelActions(input.privacyPool);
    const actionBatch = analyzeClientActionBatch(clientActions);
    const feeEstimate = await this.#estimateFees();
    const actionInput = {
      kind: "channel" as const,
      privacyPoolAddress: this.#privacyPoolAddress,
      channelId,
      ...(input.title ? { title: input.title } : {}),
      ...(input.participants?.length ? { participants: input.participants } : {}),
      clientActions,
      encodedClientActions: actionBatch.encodedClientActions,
      actionBatch,
      feeMode: this.#feeMode,
      feeTokenAddress: feeEstimate.poolFee.feeTokenAddress,
      feeEstimate,
    };
    const action = await this.#buildPrivacyAction(
      actionInput,
      () => this.#actionBuilder?.buildVeilChannelAction?.(actionInput),
      "Shield channel creation requires a Starknet Privacy SDK integration.",
    );
    const transactionHash = await this.#submitPrivacyAction(action);
    const receipt = this.#waitForConfirmation ? await this.#waitForReceipt(transactionHash) : undefined;

    const result: CreateChannelResult = {
      channelId,
      createdAt: this.#now(),
      status: receipt ? "confirmed" : "pending",
      optimistic: !receipt,
      transactionHash,
      privacyPoolClientActions: clientActions,
      encodedPrivacyPoolClientActions: actionBatch.encodedClientActions,
    };
    if (input.title) result.title = input.title;
    if (input.participants?.length) result.participants = input.participants;
    return result;
  }

  async openSubchannel(input: PrivacyPoolOpenSubchannelInput & { channelId?: string }): Promise<OpenSubchannelResult> {
    const channelId = input.channelId ?? "1";
    const clientActions = buildPrivacyPoolChannelActions({
      openSubchannel: {
        recipientAddress: input.recipientAddress,
        recipientPublicKey: input.recipientPublicKey,
        channelKey: input.channelKey,
        index: input.index,
        token: input.token,
        salt: input.salt,
      },
    });
    const actionBatch = analyzeClientActionBatch(clientActions);
    const feeEstimate = await this.#estimateFees();
    const actionInput = {
      kind: "subchannel" as const,
      privacyPoolAddress: this.#privacyPoolAddress,
      channelId,
      clientActions,
      encodedClientActions: actionBatch.encodedClientActions,
      actionBatch,
      feeMode: this.#feeMode,
      feeTokenAddress: feeEstimate.poolFee.feeTokenAddress,
      feeEstimate,
    };
    const action = await this.#buildPrivacyAction(
      actionInput,
      () => this.#actionBuilder?.buildVeilChannelAction?.(actionInput),
      "Shield subchannel creation requires a Starknet Privacy SDK integration.",
    );
    const transactionHash = await this.#submitPrivacyAction(action);
    const receipt = this.#waitForConfirmation ? await this.#waitForReceipt(transactionHash) : undefined;

    return {
      channelId,
      openedAt: this.#now(),
      status: receipt ? "confirmed" : "pending",
      optimistic: !receipt,
      transactionHash,
      privacyPoolClientActions: clientActions,
      encodedPrivacyPoolClientActions: actionBatch.encodedClientActions,
    };
  }

  async invokeExternal(input: InvokeExternalInput): Promise<TimelineItem> {
    if (input.mode !== "shield") {
      throw new Error(
        "StarknetPrivacyPoolTransport only supports shield messages. Use DirectHelperTransport for unshield mode.",
      );
    }

    const eventIndex = this.#waitForConfirmation
      ? await this.#readTransport.getEventCount(input.item.channelId)
      : undefined;
    const helperCalldata = [
      this.#channelIdEncoder(input.item.channelId),
      toFeltString(input.item.eventType, "event_type"),
      toFeltString(input.item.encryptedPayload, "encrypted_payload"),
      toFeltString(input.item.payloadHash, "payload_hash"),
      ...(input.item.payloadChunks?.length
        ? [
            String(input.item.payloadChunks.length),
            ...input.item.payloadChunks.map((chunk) => toFeltString(chunk, "payload_chunk")),
          ]
        : []),
    ];
    const helperCall = createSpanHelperCall(input.helperAddress || this.#helperAddress, helperCalldata);
    const clientActions = [
      ...buildPrivacyPoolMessageActions(input.privacyPool),
      invokeExternalAction({
        contractAddress: input.helperAddress || this.#helperAddress,
        calldata: helperCalldata,
      }),
    ];
    const actionBatch = analyzeClientActionBatch(clientActions);
    if (!actionBatch.hasReplayProtection) {
      throw new Error(
        "Shield messages require a Privacy Pool replay-protection action such as CreateEncNote, CreateOpenNote, UseNote, OpenSubchannel, OpenChannel, or SetViewingKey before InvokeExternal.",
      );
    }
    const feeEstimate = await this.#estimateFees();
    const actionInput = {
      kind: "message" as const,
      privacyPoolAddress: input.privacyPoolAddress || this.#privacyPoolAddress,
      helperAddress: input.helperAddress || this.#helperAddress,
      helperCall,
      helperCalldata,
      clientActions,
      encodedClientActions: actionBatch.encodedClientActions,
      actionBatch,
      feeMode: this.#feeMode,
      feeTokenAddress: feeEstimate.poolFee.feeTokenAddress,
      feeEstimate,
      item: input.item,
    };
    const executionInput = input.session ? { ...actionInput, session: input.session } : actionInput;
    const action = await this.#buildPrivacyAction(
      executionInput,
      () => this.#actionBuilder?.buildVeilMessageAction(executionInput),
      "Shield messages require a Starknet Privacy SDK integration.",
    );
    const transactionHash = await this.#submitPrivacyAction(action);
    if (this.#waitForConfirmation) {
      if (eventIndex === undefined) {
        throw new Error("Shield confirmation mode could not determine the helper event index.");
      }
      const receipt = await this.#waitForReceipt(transactionHash);
      const blockNumber = extractBlockNumber(receipt);
      const confirmedItem = await this.#waitForTimelineEvent(input.item.channelId, eventIndex);
      const returnedItem: TimelineItem = {
        ...confirmedItem,
        transactionHash,
        mode: input.mode,
        status: "confirmed",
        optimistic: false,
      };
      if (blockNumber !== undefined && returnedItem.blockNumber === undefined) {
        returnedItem.blockNumber = blockNumber;
      }
      return returnedItem;
    }

    return {
      ...input.item,
      transactionHash,
      status: "pending",
      optimistic: true,
    };
  }

  async getEventCount(channelId: string): Promise<number> {
    return this.#readTransport.getEventCount(channelId);
  }

  async getEvent(channelId: string, index: number): Promise<TimelineItem> {
    return this.#readTransport.getEvent(channelId, index);
  }

  async getTimeline(channelId: string): Promise<TimelineItem[]> {
    return this.#readTransport.getTimeline(channelId);
  }

  async #submitPrivacyAction(action: StarknetPrivacyMessageAction): Promise<string> {
    if (!action.execute && !action.transaction) {
      throw new Error(
        "Starknet Privacy SDK action builder did not return an executable privacy transaction. Shield mode requires Privacy Pool proof construction before AVNU Paymaster execution.",
      );
    }

    const result = action.execute
      ? await action.execute()
      : await this.#executePaymasterTransaction(action.transaction);
    const transactionHash = extractTransactionHash(result);
    if (!transactionHash) {
      throw new Error("Privacy Pool submission did not return a transaction hash.");
    }
    return transactionHash;
  }

  async #buildPrivacyAction(
    input: StarknetPrivacySdkExecutionInput,
    legacyBuilder: () => Promise<StarknetPrivacyMessageAction | undefined> | undefined,
    missingMessage: string,
  ): Promise<StarknetPrivacyMessageAction> {
    if (this.#privacySdk) {
      return buildStarknetPrivacySdkAction(this.#privacySdk, input);
    }

    const action = await legacyBuilder();
    if (action) {
      return action;
    }

    throw new Error(missingMessage);
  }

  async #estimateFees(): Promise<PrivacyPoolTotalCostEstimate> {
    if (!this.#provider) {
      throw new Error("Shield mode requires a Starknet provider for Privacy Pool fee discovery.");
    }

    const feeInput: Parameters<typeof estimateTotalCost>[0] = {
      provider: this.#provider,
      privacyPoolAddress: this.#privacyPoolAddress,
      feeMode: this.#feeMode,
      feeTokenAddress: this.#feeTokenAddress,
    };
    if (this.#privateFeeBalance !== undefined) feeInput.privateBalance = this.#privateFeeBalance;
    if (this.#feeEstimator) feeInput.feeEstimator = this.#feeEstimator;
    if (this.#gasEstimate !== undefined) feeInput.gasEstimate = this.#gasEstimate;
    return estimateTotalCost(feeInput);
  }

  async #waitForReceipt(transactionHash: string): Promise<StarknetTransactionReceiptLike> {
    if (!this.#provider) {
      throw new Error("Shield confirmation mode requires a Starknet provider.");
    }

    if (this.#provider.waitForTransaction) {
      const receipt = await this.#provider.waitForTransaction(transactionHash);
      if (!isAcceptedReceipt(receipt)) {
        throw new Error(`Starknet Privacy Pool transaction was not accepted: ${transactionHash}`);
      }
      return receipt;
    }

    if (!this.#provider.getTransactionReceipt) {
      throw new Error("Starknet provider cannot wait for Shield transaction confirmation.");
    }

    const deadline = Date.now() + this.#confirmationTimeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const receipt = await this.#provider.getTransactionReceipt(transactionHash);
        if (isAcceptedReceipt(receipt)) {
          return receipt;
        }
      } catch (error) {
        lastError = error;
      }

      await new Promise((resolve) => setTimeout(resolve, this.#confirmationPollMs));
    }

    throw new Error(
      `Timed out waiting for Starknet Privacy Pool transaction confirmation: ${transactionHash}${
        lastError instanceof Error ? ` (${lastError.message})` : ""
      }`,
    );
  }

  async #waitForTimelineEvent(channelId: string, eventIndex: number): Promise<TimelineItem> {
    const deadline = Date.now() + this.#confirmationTimeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        return await this.#readTransport.getEvent(channelId, eventIndex);
      } catch (error) {
        lastError = error;
      }

      await new Promise((resolve) => setTimeout(resolve, this.#confirmationPollMs));
    }

    throw new Error(
      `Timed out waiting for VEIL helper event ${eventIndex} on channel ${channelId}${
        lastError instanceof Error ? ` (${lastError.message})` : ""
      }`,
    );
  }

  async #executePaymasterTransaction(transaction: unknown): Promise<Awaited<ReturnType<StarknetAccountLike["execute"]>>> {
    if (!this.#paymaster) {
      throw new Error(
        "Shield mode requires an AVNU Paymaster executor or action.execute() supplied by the Starknet Privacy SDK integration.",
      );
    }

    try {
      return await this.#paymaster.executeTransaction(transaction);
    } catch (error) {
      assertPaymasterAccepted(error);
    }
  }
}

/** @deprecated Use StarknetPrivacyPoolTransport. AVNU is only the paymaster/forwarder layer. */
export class AvnuPrivacyPoolTransport extends StarknetPrivacyPoolTransport {
  constructor(config: AvnuPrivacyPoolTransportConfig) {
    super(config);
  }
}

export interface ResearchPrivacyPoolAdapterConfig {
  rpcUrl?: string;
  privacyPoolAddress?: string;
  helperAddress?: string;
  abi?: StarknetAbi;
}

// VEIL IMPLEMENTATION NOTE:
// ResearchPrivacyPoolAdapter is intentionally read-only. It decodes transactions,
// calldata, and events using the STRK20 Privacy Pool ABI supplied by the team.
// This is the bridge for learning the real flow before the private SDK is available.
export class ResearchPrivacyPoolAdapter implements PrivacyPoolAdapter {
  readonly mode = "research";
  readonly analyzer: PrivacyPoolTransactionAnalyzer;
  readonly abi: StarknetAbi;

  constructor(config: ResearchPrivacyPoolAdapterConfig = {}) {
    this.abi = config.abi ?? PRIVACY_POOL_EVENT_ABI;
    const analyzerConfig: PrivacyPoolTransactionAnalyzerConfig = {
      abi: this.abi,
    };
    if (config.rpcUrl) analyzerConfig.rpcUrl = config.rpcUrl;
    if (config.privacyPoolAddress) analyzerConfig.privacyPoolAddress = config.privacyPoolAddress;
    if (config.helperAddress) analyzerConfig.helperAddress = config.helperAddress;
    this.analyzer = new PrivacyPoolTransactionAnalyzer(analyzerConfig);
  }

  async analyzeTransaction(transactionHash: string): Promise<PrivacyPoolTransactionAnalysis> {
    return this.analyzer.analyzeTransaction({ transactionHash });
  }

  decodeTransaction(transaction: RawStarknetTransaction) {
    return decodeTransactionCalldata(transaction);
  }

  decodeEvents(events: readonly RawStarknetEvent[]) {
    return events.map((event) => decodePrivacyPoolEvent(event, { abi: this.abi }));
  }

  decodeInvokeExternalPayload(calldata: readonly string[]): PrivacyPoolAdapterActionResult {
    return {
      adapterMode: this.mode,
      action: "InvokeExternal",
      calldata,
      notes: [
        calldata.length >= 4
          ? "Looks like VEIL helper invoke calldata: channel_id, event_type, encrypted_payload, payload_hash."
          : "Not enough felts to identify a VEIL helper invoke payload.",
        PRIVACY_POOL_SOURCE_CONSTRAINTS.standaloneInvokeExternalLikelyReverts
          ? "Source-derived warning: InvokeExternal must be paired with a WriteOnce-producing privacy action for replay protection."
          : "InvokeExternal replay-protection requirement unknown.",
      ],
    };
  }

  async openChannel(): Promise<PrivacyPoolAdapterActionResult> {
    throw new Error(RESEARCH_ONLY_ERROR);
  }

  async openSubchannel(): Promise<PrivacyPoolAdapterActionResult> {
    throw new Error(RESEARCH_ONLY_ERROR);
  }

  async createEncryptedNote(): Promise<PrivacyPoolAdapterActionResult> {
    throw new Error(RESEARCH_ONLY_ERROR);
  }

  async prepareInvokeExternal(): Promise<PrivacyPoolAdapterActionResult> {
    throw new Error(RESEARCH_ONLY_ERROR);
  }
}

// VEIL IMPLEMENTATION NOTE:
// RealPrivacyPoolAdapter is a deliberate placeholder. Once the Starknet Privacy
// SDK is wired, this class becomes the only place where protocol action/proof
// construction should be implemented. AVNU remains only the paymaster path.
export class RealPrivacyPoolAdapter implements PrivacyPoolAdapter {
  readonly mode = "real";

  async openChannel(input: PrivacyPoolOpenChannelInput): Promise<PrivacyPoolAdapterActionResult> {
    return createPreparedActionResult(
      this.mode,
      "OpenChannel",
      buildPrivacyPoolChannelActions({
        openChannel: {
          recipientAddress: input.recipientAddress,
          index: input.index,
          random: input.random,
          salt: input.salt,
        },
      }),
      ["Prepared official Privacy Pool OpenChannel ClientAction. Submission still requires Starknet Privacy SDK proof generation."],
    );
  }

  async openSubchannel(input: PrivacyPoolOpenSubchannelInput): Promise<PrivacyPoolAdapterActionResult> {
    return createPreparedActionResult(
      this.mode,
      "OpenSubchannel",
      buildPrivacyPoolChannelActions({
        openSubchannel: {
          recipientAddress: input.recipientAddress,
          recipientPublicKey: input.recipientPublicKey,
          channelKey: input.channelKey,
          index: input.index,
          token: input.token,
          salt: input.salt,
        },
      }),
      ["Prepared official Privacy Pool OpenSubchannel ClientAction. Submission still requires Starknet Privacy SDK proof generation."],
    );
  }

  async createEncryptedNote(input: PrivacyPoolCreateEncryptedNoteInput): Promise<PrivacyPoolAdapterActionResult> {
    return createPreparedActionResult(
      this.mode,
      "CreateEncNote",
      [
        createEncNoteAction({
          recipientAddress: input.recipientAddress,
          recipientPublicKey: input.recipientPublicKey,
          token: input.token,
          amount: input.amount,
          index: input.index,
          salt: input.salt,
        }),
      ],
      ["Prepared official Privacy Pool CreateEncNote ClientAction. Submission still requires Starknet Privacy SDK proof generation."],
    );
  }

  async prepareInvokeExternal(input: PrivacyPoolInvokeExternalCalldataInput): Promise<PrivacyPoolAdapterActionResult> {
    return createPreparedActionResult(
      this.mode,
      "InvokeExternal",
      [
        invokeExternalAction({
          contractAddress: input.contractAddress,
          calldata: input.calldata,
        }),
      ],
      [
        "Prepared official Privacy Pool InvokeExternal ClientAction.",
        "InvokeExternal alone does not provide replay protection; combine it with a WriteOnce-producing action in the Starknet Privacy SDK proof flow.",
      ],
    );
  }
}
