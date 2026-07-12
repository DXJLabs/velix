import { channelIdToFelt } from "../direct_helper_transport";
import { encodeInvokeCalldata } from "../timeline";
import {
  analyzeClientActionBatch,
  buildPrivacyPoolChannelActions,
  buildPrivacyPoolMessageActions,
  invokeExternalAction,
} from "../privacy_pool_actions";
import {
  assertPaymasterAccepted,
  estimateTotalCost,
  PRIVACY_POOL_STRK_FEE_TOKEN_ADDRESS,
  type PrivacyPoolFeeMode,
  type PrivacyPoolTotalCostEstimate,
} from "../privacy_pool_fees";
import { buildStarknetPrivacySdkAction } from "../starknet_privacy_sdk";
import {
  createSpanHelperCall,
  extractBlockNumber,
  extractTransactionHash,
  isAcceptedReceipt,
  toFeltString,
} from "./shared";
import type {
  AvnuPrivacyPoolTransportConfig,
  CreateChannelInput,
  CreateChannelResult,
  FeltLike,
  InvokeExternalInput,
  OpenSubchannelResult,
  PrivacyPoolOpenSubchannelInput,
  StarknetAccountLike,
  StarknetPrivacyMessageAction,
  StarknetPrivacySdkExecutionInput,
  StarknetPrivacyPoolTransportConfig,
  StarknetProviderLike,
  StarknetTransactionReceiptLike,
  TimelineItem,
  VeilTransport,
} from "../types";

export class StarknetPrivacyPoolTransport implements VeilTransport {
  readonly supportedModes = ["strk20-shielded", "shield"] as const;
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

  encodeConversationTag(channelId: string): string {
    return this.#channelIdEncoder(channelId);
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
    if (input.mode !== "shield" && input.mode !== "strk20-shielded") {
      throw new Error(
        "StarknetPrivacyPoolTransport only supports shield messages. Use DirectHelperTransport for unshield mode.",
      );
    }

    const eventIndex = this.#waitForConfirmation
      ? await this.#readTransport.getEventCount(input.item.channelId)
      : undefined;
    const helperCalldata = input.calldata.length
      ? input.calldata.map((felt, index) => toFeltString(felt, `calldata_${index}`))
      : encodeInvokeCalldata(input.item, {
          conversationTag: this.#channelIdEncoder(input.item.channelId),
        });
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
