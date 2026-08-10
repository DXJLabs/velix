import type {
  CreateChannelInput,
  CreateChannelResult,
  InvokeExternalInput,
  StarknetProviderLike,
  StarknetTransactionReceiptLike,
  TimelineItem,
  VeilMessageMode,
  VeilTransport,
} from "../types";
import {
  Strk20WalletApiClient,
  strk20InvokeAction,
} from "./wallet-api";

export interface Strk20WalletMessageTransportConfig {
  walletApiClient: Strk20WalletApiClient;
  helperAddress: string;
  readTransport: VeilTransport;
  provider?: StarknetProviderLike;
  waitForConfirmation?: boolean;
  /**
   * Ceiling, in milliseconds, on how long to wait for the submitted
   * transaction to confirm before giving up and returning the optimistic
   * pending item instead. Paymaster-relayed hashes can take a while to
   * become visible to an RPC; an unbounded `waitForTransaction` would strand
   * the UI in "sending" with no feedback. Default: 60s.
   */
  confirmationTimeoutMs?: number;
  onTransactionSubmitted?: (transactionHash: string, item: TimelineItem) => void;
}

const DEFAULT_CONFIRMATION_TIMEOUT_MS = 60_000;

/**
 * Wallet-owned STRK20 transport for VEIL private messages.
 *
 * VEIL submits exactly one STRK20 `invoke` action targeting VeilChannelHelper.
 * The wallet owns STRK20 private state, viewing keys, proof generation, fees,
 * user approval, and transaction submission. No token transfer is added here.
 */
export class Strk20WalletMessageTransport implements VeilTransport {
  readonly supportedModes: readonly VeilMessageMode[] = ["strk20-shielded", "shield"];

  readonly #walletApiClient: Strk20WalletApiClient;
  readonly #helperAddress: string;
  readonly #readTransport: VeilTransport;
  readonly #provider: StarknetProviderLike | undefined;
  readonly #waitForConfirmation: boolean;
  readonly #confirmationTimeoutMs: number;
  readonly #onTransactionSubmitted:
    | ((transactionHash: string, item: TimelineItem) => void)
    | undefined;

  constructor(config: Strk20WalletMessageTransportConfig) {
    if (!config.walletApiClient) {
      throw new Error("STRK20 Wallet API client is required.");
    }
    if (!isFelt(config.helperAddress) || BigInt(config.helperAddress) === 0n) {
      throw new Error("A valid VEIL helper address is required.");
    }
    this.#walletApiClient = config.walletApiClient;
    this.#helperAddress = normalizeFelt(config.helperAddress);
    this.#readTransport = config.readTransport;
    this.#provider = config.provider;
    this.#waitForConfirmation = config.waitForConfirmation ?? true;
    this.#confirmationTimeoutMs = config.confirmationTimeoutMs ?? DEFAULT_CONFIRMATION_TIMEOUT_MS;
    this.#onTransactionSubmitted = config.onTransactionSubmitted;
  }

  encodeConversationTag(channelId: string): string | Promise<string> {
    if (!this.#readTransport.encodeConversationTag) {
      throw new Error("The VEIL read transport cannot encode conversation tags.");
    }
    return this.#readTransport.encodeConversationTag(channelId);
  }

  createChannel(input: CreateChannelInput): Promise<CreateChannelResult> {
    if (!this.#readTransport.createChannel) {
      throw new Error("Channel creation is unavailable on the VEIL read transport.");
    }
    return this.#readTransport.createChannel(input);
  }

  async invokeExternal(input: InvokeExternalInput): Promise<TimelineItem> {
    if (!this.supportedModes.includes(input.mode)) {
      throw Object.assign(
        new Error(`Unsupported STRK20 private-message mode: ${input.mode}`),
        { code: "UNSUPPORTED_MESSAGE_MODE" },
      );
    }

    if (normalizeFelt(input.helperAddress) !== this.#helperAddress) {
      throw Object.assign(
        new Error("STRK20 invoke target does not match VeilChannelHelper."),
        { code: "INVALID_HELPER_ADDRESS" },
      );
    }

    if (!input.canonicalMessage) {
      throw Object.assign(
        new Error("Private messaging requires canonical VEIL message metadata."),
        { code: "PAYLOAD_MALFORMED" },
      );
    }

    if (!input.calldata.length) {
      throw Object.assign(
        new Error("VeilChannelHelper calldata cannot be empty."),
        { code: "INVALID_REQUEST_PAYLOAD" },
      );
    }

    // Private messaging is invoke-only. Never add deposit, withdraw, transfer,
    // payment, or OPEN-note actions to this transport. The helper entrypoint
    // accepts a Cairo Span, so the wallet action must include its ABI length
    // prefix just like the direct Starknet transport does.
    const helperCalldata = [String(input.calldata.length), ...input.calldata];
    const transactionHash = await this.#walletApiClient.invoke([
      strk20InvokeAction(this.#helperAddress, helperCalldata),
    ]);

    this.#onTransactionSubmitted?.(transactionHash, input.item);

    const optimistic: TimelineItem = {
      ...input.item,
      mode: "strk20-shielded",
      transactionHash,
      status: "pending",
      optimistic: true,
      timestamp: input.item.timestamp || Date.now(),
    };

    if (!this.#waitForConfirmation || !this.#provider?.waitForTransaction) {
      return optimistic;
    }

    const receipt = await this.#raceConfirmation(transactionHash);
    if (receipt === "timed-out") {
      // The tx was submitted and is real — we simply couldn't confirm it in
      // time. Hand back the pending item rather than stranding the UI or
      // claiming failure; the explorer link is the fallback for the user.
      return optimistic;
    }
    if (!isAcceptedReceipt(receipt)) {
      throw Object.assign(
        new Error("STRK20 private-message transaction reverted or was rejected."),
        { code: "TRANSACTION_REVERTED", transactionHash },
      );
    }

    const blockNumber = receipt.block_number ?? receipt.blockNumber;
    return {
      ...optimistic,
      ...(typeof blockNumber === "number" ? { blockNumber } : {}),
      status: "confirmed",
      optimistic: false,
    };
  }

  async #raceConfirmation(
    transactionHash: string,
  ): Promise<StarknetTransactionReceiptLike | "timed-out"> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<"timed-out">((resolve) => {
      timer = setTimeout(() => resolve("timed-out"), this.#confirmationTimeoutMs);
    });
    try {
      return await Promise.race([
        this.#provider!.waitForTransaction!(transactionHash),
        timeout,
      ]);
    } finally {
      clearTimeout(timer!);
    }
  }

  getEventCount(channelId: string): Promise<number> {
    return this.#readTransport.getEventCount(channelId);
  }

  async getEvent(channelId: string, index: number): Promise<TimelineItem> {
    const item = await this.#readTransport.getEvent(channelId, index);
    return { ...item, mode: "strk20-shielded" };
  }

  async getTimeline(channelId: string): Promise<TimelineItem[]> {
    const items = await this.#readTransport.getTimeline(channelId);
    return items.map((item) => ({ ...item, mode: "strk20-shielded" }));
  }
}

function normalizeFelt(value: string): string {
  if (!isFelt(value)) throw new Error("Value is not a Starknet felt.");
  return `0x${BigInt(value).toString(16)}`;
}

function isFelt(value: string): boolean {
  try {
    const parsed = BigInt(String(value).trim());
    return parsed >= 0n && parsed < (1n << 251n);
  } catch {
    return false;
  }
}

function isAcceptedReceipt(receipt: unknown): boolean {
  if (!receipt || typeof receipt !== "object") return false;
  const value = receipt as Record<string, unknown>;
  const execution = String(value.execution_status ?? "").toUpperCase();
  const finality = String(value.finality_status ?? value.status ?? "").toUpperCase();
  if (execution === "REVERTED" || finality.includes("REJECT")) return false;
  return execution === "SUCCEEDED"
    || finality.includes("ACCEPTED_ON_L2")
    || finality.includes("ACCEPTED_ON_L1")
    || finality === "SUCCEEDED";
}
