import { sortTimeline } from "../timeline";
import {
  buildPrivacyPoolChannelActions,
  createEncNoteAction,
  invokeExternalAction,
} from "../privacy_pool_actions";
import { createPreparedActionResult } from "./shared";
import type {
  CreateChannelInput,
  CreateChannelResult,
  InvokeExternalInput,
  PrivacyPoolAdapter,
  PrivacyPoolAdapterActionResult,
  PrivacyPoolCreateEncryptedNoteInput,
  PrivacyPoolInvokeExternalCalldataInput,
  PrivacyPoolOpenChannelInput,
  PrivacyPoolOpenSubchannelInput,
  TimelineItem,
  VeilTransport,
} from "../types";

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
