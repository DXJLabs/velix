import { decodePrivacyPoolEvent, type RawStarknetEvent, type StarknetAbi } from "./event_decoder";
import { PRIVACY_POOL_EVENT_ABI } from "./privacy_pool_abi";
import { sortTimeline } from "./timeline";
import {
  PrivacyPoolTransactionAnalyzer,
  decodeTransactionCalldata,
  type PrivacyPoolTransactionAnalysis,
  type PrivacyPoolTransactionAnalyzerConfig,
  type RawStarknetTransaction,
} from "./transaction_analyzer";
import {
  type CreateChannelInput,
  type CreateChannelResult,
  type InvokeExternalInput,
  type PrivacyPoolAdapter,
  type PrivacyPoolAdapterActionResult,
  type PrivacyPoolCreateEncryptedNoteInput,
  type PrivacyPoolInvokeExternalCalldataInput,
  type PrivacyPoolOpenChannelInput,
  type PrivacyPoolOpenSubchannelInput,
  type TimelineItem,
  type VeilTransport,
} from "./types";

const WAITING_FOR_SDK_ERROR = "Waiting for official Privacy Pool SDK";
const RESEARCH_ONLY_ERROR = "ResearchPrivacyPoolAdapter is read-only and does not submit Privacy Pool actions.";

// VEIL IMPLEMENTATION NOTE:
// MockPrivacyPoolAdapter is the default fast path for VEIL UI/SDK development.
// It keeps the product moving while the official STRK20 Privacy Pool SDK is private.
// It does not claim real anonymity, note encryption, or transaction submission.
export class MockPrivacyPoolAdapter implements PrivacyPoolAdapter, VeilTransport {
  readonly mode = "mock";
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
    return {
      adapterMode: this.mode,
      action: "OpenChannel",
      calldata: [input.recipientAddress, String(input.index), input.random, input.salt],
      notes: ["Mock only. Real channel creation waits for the official Privacy Pool SDK."],
    };
  }

  async openSubchannel(input: PrivacyPoolOpenSubchannelInput): Promise<PrivacyPoolAdapterActionResult> {
    return {
      adapterMode: this.mode,
      action: "OpenSubchannel",
      calldata: [
        input.recipientAddress,
        input.recipientPublicKey,
        input.channelKey,
        String(input.index),
        input.token,
        input.salt,
      ],
      notes: ["Mock only. No ECDH/channel-key derivation is performed here."],
    };
  }

  async createEncryptedNote(
    input: PrivacyPoolCreateEncryptedNoteInput,
  ): Promise<PrivacyPoolAdapterActionResult> {
    return {
      adapterMode: this.mode,
      action: "CreateEncNote",
      calldata: [
        input.recipientAddress,
        input.recipientPublicKey,
        input.token,
        input.amount,
        String(input.index),
        input.salt,
      ],
      notes: ["Mock only. Encrypted notes are not created by this adapter."],
    };
  }

  async invokeExternal(input: InvokeExternalInput): Promise<TimelineItem> {
    const items = this.#events.get(input.item.channelId) ?? [];
    const eventId = `${items.length + 1}`;
    const storedItem: TimelineItem = {
      ...input.item,
      eventId,
      transactionHash: `mock-${input.item.channelId}-${eventId}`,
      optimistic: false,
    };

    this.#events.set(input.item.channelId, [...items, storedItem]);
    return storedItem;
  }

  async prepareInvokeExternal(
    input: PrivacyPoolInvokeExternalCalldataInput,
  ): Promise<PrivacyPoolAdapterActionResult> {
    return {
      adapterMode: this.mode,
      action: "InvokeExternal",
      calldata: [input.contractAddress, String(input.calldata.length), ...input.calldata],
      notes: ["Mock-only encoded action preview for the helper invoke payload."],
    };
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
// RealPrivacyPoolAdapter is a deliberate placeholder. Once the STRK20 Privacy
// Pool SDK is shared, this class becomes the only place where real transaction
// construction/submission should be implemented.
export class RealPrivacyPoolAdapter implements PrivacyPoolAdapter {
  readonly mode = "real";

  async openChannel(): Promise<PrivacyPoolAdapterActionResult> {
    throw new Error(WAITING_FOR_SDK_ERROR);
  }

  async openSubchannel(): Promise<PrivacyPoolAdapterActionResult> {
    throw new Error(WAITING_FOR_SDK_ERROR);
  }

  async createEncryptedNote(): Promise<PrivacyPoolAdapterActionResult> {
    throw new Error(WAITING_FOR_SDK_ERROR);
  }

  async prepareInvokeExternal(): Promise<PrivacyPoolAdapterActionResult> {
    throw new Error(WAITING_FOR_SDK_ERROR);
  }
}
