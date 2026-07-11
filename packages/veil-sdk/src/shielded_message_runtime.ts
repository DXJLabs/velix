import {
  createDefaultEncryptedPayloadStore,
  type EncryptedPayloadStore,
} from "./encrypted-payload-store";
import {
  decryptMessage,
  encryptMessage,
} from "./ecdh";
import {
  computePrivacyPoolChannelKey,
  computePrivacyPoolChannelMarker,
  decryptChannelInfo,
  deriveMessageKey,
  derivePrivacyPublicKey,
  encryptChannelInfo,
  generateEphemeralKeyPair,
  type EncChannelInfo,
} from "./privacy_pool_ecdh";
import type { BuildPrivacyPoolMessageActionsInput } from "./privacy_pool_actions";
import type {
  EncryptedPayload,
  EncryptionAdapter,
  EncryptionContext,
  FeltLike,
  ShieldedChannelBootstrapMetadata,
  TimelineItem,
  VeilTimelinePayload,
} from "./types";

export type PrivacyPoolChannelLifecycle = "new" | "existing";

export interface PrivacyPoolChannelBootstrapMaterial {
  senderAddress: FeltLike;
  senderPrivacyScalar: FeltLike;
  recipientAddress: FeltLike;
  recipientPublicKey: FeltLike;
  channelLifecycle?: PrivacyPoolChannelLifecycle;
  channelIndex?: FeltLike;
  channelSalt?: FeltLike;
  channelKey?: FeltLike;
  channelMarker?: FeltLike;
  replayProtection?: BuildPrivacyPoolMessageActionsInput;
  ephemeralSecret?: FeltLike;
  senderPublicKey?: FeltLike;
  messageKeyInfo?: string;
  messageKeySalt?: FeltLike | Uint8Array | ArrayBuffer;
}

export interface PrivacyPoolChannelRecoveryMaterial {
  recipientPrivateKey: FeltLike;
  recipientAddress: FeltLike;
  recipientPublicKey?: FeltLike;
  channelIndex?: FeltLike;
  expectedChannelMarker: FeltLike;
  encChannelInfo: EncChannelInfo;
  channelId?: string;
  messageKeyInfo?: string;
  messageKeySalt?: FeltLike | Uint8Array | ArrayBuffer;
}

export interface ResolvePrivacyPoolChannelBootstrapInput {
  payload: VeilTimelinePayload;
  context: EncryptionContext;
}

export interface ResolvePrivacyPoolChannelRecoveryInput {
  item: TimelineItem;
  context: EncryptionContext;
}

export interface PrivacyPoolChannelBootstrapEncryptionAdapterConfig {
  resolveBootstrapMaterial: (
    input: ResolvePrivacyPoolChannelBootstrapInput,
  ) => PrivacyPoolChannelBootstrapMaterial | Promise<PrivacyPoolChannelBootstrapMaterial>;
  resolveRecoveryMaterial?: (
    input: ResolvePrivacyPoolChannelRecoveryInput,
  ) => PrivacyPoolChannelRecoveryMaterial | Promise<PrivacyPoolChannelRecoveryMaterial>;
  payloadStore?: EncryptedPayloadStore;
  keyId?: string;
  now?: () => number;
}

const PRIVACY_POOL_MESSAGE_ACTION_KEYS = [
  "setViewingKey",
  "openChannel",
  "openSubchannel",
  "deposit",
  "useNote",
  "createEncNote",
  "createOpenNote",
  "withdraw",
] as const;

export class PrivacyPoolChannelBootstrapEncryptionAdapter implements EncryptionAdapter {
  readonly #resolveBootstrapMaterial: PrivacyPoolChannelBootstrapEncryptionAdapterConfig["resolveBootstrapMaterial"];
  readonly #resolveRecoveryMaterial: PrivacyPoolChannelBootstrapEncryptionAdapterConfig["resolveRecoveryMaterial"];
  readonly #payloadStore: EncryptedPayloadStore;
  readonly #keyId: string | undefined;
  readonly #now: (() => number) | undefined;

  constructor(config: PrivacyPoolChannelBootstrapEncryptionAdapterConfig) {
    this.#resolveBootstrapMaterial = config.resolveBootstrapMaterial;
    this.#resolveRecoveryMaterial = config.resolveRecoveryMaterial;
    this.#payloadStore = config.payloadStore ?? createDefaultEncryptedPayloadStore();
    this.#keyId = config.keyId;
    this.#now = config.now;
  }

  async encryptPayload(payload: VeilTimelinePayload, context?: EncryptionContext): Promise<EncryptedPayload> {
    const requiredContext = requireEncryptionContext(context, "Shielded message encryption");
    const material = await this.#resolveBootstrapMaterial({ payload, context: requiredContext });
    const lifecycle = material.channelLifecycle ?? "new";
    const senderPublicKey = derivePrivacyPublicKey(material.senderPrivacyScalar);
    assertMatchingFelt(material.senderPublicKey, senderPublicKey, "senderPublicKey");

    const channelKey = computePrivacyPoolChannelKey({
      senderAddress: material.senderAddress,
      senderPrivateKey: material.senderPrivacyScalar,
      recipientAddress: material.recipientAddress,
      recipientPublicKey: material.recipientPublicKey,
    });
    assertMatchingFelt(material.channelKey, channelKey, "channelKey");
    const channelMarker = computePrivacyPoolChannelMarker({
      channelKey,
      senderAddress: material.senderAddress,
      recipientAddress: material.recipientAddress,
      recipientPublicKey: material.recipientPublicKey,
    });
    assertMatchingFelt(material.channelMarker, channelMarker, "channelMarker");
    const lifecycleResult = createLifecycleResult({
      lifecycle,
      channelKey,
      channelMarker,
      senderAddress: material.senderAddress,
      senderPublicKey,
      recipientAddress: material.recipientAddress,
      recipientPublicKey: material.recipientPublicKey,
      channelIndex: material.channelIndex,
      channelSalt: material.channelSalt,
      ephemeralSecret: material.ephemeralSecret,
      replayProtection: material.replayProtection,
    });
    const messageKey = await deriveMessageKey({
      channelKey,
      channelId: requiredContext.channelId,
      ...(material.messageKeyInfo !== undefined ? { info: material.messageKeyInfo } : {}),
      ...(material.messageKeySalt !== undefined ? { salt: material.messageKeySalt } : {}),
    });
    const encrypted = await encryptMessage({
      payload,
      key: messageKey,
      context: requiredContext,
      payloadStore: this.#payloadStore,
      ...(this.#keyId !== undefined ? { keyId: this.#keyId } : {}),
      ...(this.#now !== undefined ? { now: this.#now } : {}),
    });

    return {
      ...encrypted,
      privacyPool: lifecycleResult.privacyPool,
      ...(lifecycleResult.channelBootstrap ? { channelBootstrap: lifecycleResult.channelBootstrap } : {}),
    };
  }

  async decryptPayload(item: TimelineItem, context?: EncryptionContext): Promise<VeilTimelinePayload | null> {
    if (!this.#resolveRecoveryMaterial) {
      throw new Error("Shielded message decryption requires Privacy Pool channel recovery material.");
    }
    const requiredContext = requireEncryptionContext(context, "Shielded message decryption");
    const material = await this.#resolveRecoveryMaterial({ item, context: requiredContext });
    const decryptedChannel = decryptChannelInfo({
      recipientPrivateKey: material.recipientPrivateKey,
      encChannelInfo: material.encChannelInfo,
      recipientAddress: material.recipientAddress,
      ...(material.recipientPublicKey !== undefined ? { recipientPublicKey: material.recipientPublicKey } : {}),
      expectedChannelMarker: material.expectedChannelMarker,
    });
    const messageKey = await deriveMessageKey({
      channelKey: decryptedChannel.channelKey,
      channelId: material.channelId ?? requiredContext.channelId,
      ...(material.messageKeyInfo !== undefined ? { info: material.messageKeyInfo } : {}),
      ...(material.messageKeySalt !== undefined ? { salt: material.messageKeySalt } : {}),
    });
    return decryptMessage({
      item,
      key: messageKey,
      context: requiredContext,
      payloadStore: this.#payloadStore,
    });
  }
}

export function assertShieldedChannelBootstrapMetadata(
  metadata: ShieldedChannelBootstrapMetadata | undefined,
): ShieldedChannelBootstrapMetadata {
  if (!metadata) {
    throw new Error("Shielded message is missing Privacy Pool channel bootstrap metadata.");
  }
  return metadata;
}

function requireEncryptionContext(context: EncryptionContext | undefined, operation: string): EncryptionContext {
  if (!context?.channelId) {
    throw new Error(`${operation} requires a channelId context.`);
  }
  return context;
}

function feltString(value: FeltLike, label: string): string {
  if (typeof value === "bigint") return validateFelt(value, label).toString();
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer.`);
    return validateFelt(BigInt(value), label).toString();
  }
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} cannot be empty.`);
  return validateFelt(BigInt(trimmed), label).toString();
}

function validateFelt(value: bigint, label: string): bigint {
  if (value < 0n) throw new Error(`${label} must be non-negative.`);
  return value;
}

function assertMatchingFelt(expected: FeltLike | undefined, actual: FeltLike, label: string): void {
  if (expected === undefined) return;
  if (BigInt(feltString(expected, `${label}.expected`)) !== BigInt(feltString(actual, `${label}.actual`))) {
    throw new Error(`${label} does not match the Privacy Pool reference derivation.`);
  }
}

interface CreateLifecycleResultInput {
  lifecycle: PrivacyPoolChannelLifecycle;
  channelKey: string;
  channelMarker: string;
  senderAddress: FeltLike;
  senderPublicKey: string;
  recipientAddress: FeltLike;
  recipientPublicKey: FeltLike;
  channelIndex: FeltLike | undefined;
  channelSalt: FeltLike | undefined;
  ephemeralSecret: FeltLike | undefined;
  replayProtection: BuildPrivacyPoolMessageActionsInput | undefined;
}

function createLifecycleResult(input: CreateLifecycleResultInput): {
  privacyPool: BuildPrivacyPoolMessageActionsInput;
  channelBootstrap?: ShieldedChannelBootstrapMetadata;
} {
  if (input.lifecycle === "existing") {
    const privacyPool = input.replayProtection;
    if (!privacyPool || !hasReplayProtectionAction(privacyPool)) {
      throw new Error(
        "Existing Privacy Pool channels require an explicit replay-protection ClientAction before InvokeExternal.",
      );
    }
    if (privacyPool.openChannel) {
      throw new Error("Existing Privacy Pool channels must not include OpenChannel replay protection.");
    }
    return { privacyPool };
  }

  if (input.replayProtection?.openChannel) {
    throw new Error("New Privacy Pool channel bootstrap owns the OpenChannel action.");
  }
  const channelIndex = requireFelt(input.channelIndex, "channelIndex");
  const channelSalt = requireFelt(input.channelSalt, "channelSalt");
  const ephemeralSecret = input.ephemeralSecret ?? generateEphemeralKeyPair().ephemeralSecret;
  const encChannelInfo = encryptChannelInfo({
    ephemeralSecret,
    recipientPublicKey: input.recipientPublicKey,
    channelKey: input.channelKey,
    senderAddress: input.senderAddress,
  });
  const openChannel = {
    recipientAddress: feltString(input.recipientAddress, "recipientAddress"),
    index: feltString(channelIndex, "channelIndex"),
    random: feltString(ephemeralSecret, "ephemeralSecret"),
    salt: feltString(channelSalt, "channelSalt"),
  };
  const privacyPool = mergePrivacyPoolInputs({ openChannel }, input.replayProtection);
  return {
    privacyPool,
    channelBootstrap: {
      senderAddress: feltString(input.senderAddress, "senderAddress"),
      senderPublicKey: input.senderPublicKey,
      recipientAddress: feltString(input.recipientAddress, "recipientAddress"),
      recipientPublicKey: feltString(input.recipientPublicKey, "recipientPublicKey"),
      channelIndex: feltString(channelIndex, "channelIndex"),
      channelMarker: input.channelMarker,
      encChannelInfo,
    },
  };
}

function requireFelt(value: FeltLike | undefined, label: string): FeltLike {
  if (value === undefined) {
    throw new Error(`New Privacy Pool channel bootstrap requires ${label}.`);
  }
  return value;
}

function hasReplayProtectionAction(input: BuildPrivacyPoolMessageActionsInput): boolean {
  return Boolean(
    input.setViewingKey ||
      input.openChannel ||
      input.openSubchannel ||
      input.useNote ||
      input.createEncNote ||
      input.createOpenNote,
  );
}

function mergePrivacyPoolInputs(
  generated: BuildPrivacyPoolMessageActionsInput,
  supplied: BuildPrivacyPoolMessageActionsInput | undefined,
): BuildPrivacyPoolMessageActionsInput {
  if (!supplied) return generated;
  const merged: Record<string, unknown> = { ...generated };
  for (const key of PRIVACY_POOL_MESSAGE_ACTION_KEYS) {
    const value = supplied[key];
    if (value === undefined) continue;
    if (merged[key] !== undefined) {
      throw new Error(`Privacy Pool action ${key} was supplied by both channel lifecycle and caller input.`);
    }
    merged[key] = value;
  }
  return merged as BuildPrivacyPoolMessageActionsInput;
}
