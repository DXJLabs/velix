import { VeilClient } from "../client";
import { PrivacyPoolChannelEncryptionAdapter } from "../ecdh";
import type {
  InvokeExternalInput,
  TimelineItem,
  VeilTransport,
} from "../types";

const INVITE_CODE_PATTERN = /^[a-z0-9]{6,32}$/i;
const INVITE_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const ROOM_ID_PATTERN = /^room-[a-f0-9]{32}$/i;
const ADDRESS_PATTERN = /^0x[0-9a-f]{1,64}$/i;
const LOCATOR_BOUND = (1n << 251n) - 1n;
const textEncoder = new TextEncoder();

export interface InviteAcceptanceInput {
  client: VeilClient;
  inviteCode: string;
  inviteSecret: string;
  roomId: string;
  receiverAddress?: string;
  now?: () => number;
}

export interface DeriveInviteAcceptanceMaterialInput {
  inviteCode: string;
  inviteSecret: string;
  roomId: string;
}

export interface InviteAcceptanceMaterial {
  channelKey: Uint8Array;
  messageLocator: string;
  messageReference: string;
}

export function generateInviteSecret(): string {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Invite secret generation requires Web Crypto.");
  }
  return bytesToBase64Url(
    globalThis.crypto.getRandomValues(new Uint8Array(32)),
  );
}

export async function deriveInviteAcceptanceMaterial(
  input: DeriveInviteAcceptanceMaterialInput,
): Promise<InviteAcceptanceMaterial> {
  const inviteCode = normalizeInviteCode(input.inviteCode);
  const roomId = normalizeRoomId(input.roomId);
  const inviteSecret = normalizeInviteSecret(input.inviteSecret);

  const channelKey = new Uint8Array(
    await requireSubtle().digest(
      "SHA-256",
      toArrayBuffer(
        concatBytes(
        textEncoder.encode(
          `veil:invite-handshake-key:v2|${inviteCode}|${roomId}|`,
        ),
        inviteSecret,
        ),
      ),
    ),
  );

  const locatorDigest = new Uint8Array(
    await requireSubtle().digest(
      "SHA-256",
      toArrayBuffer(
        concatBytes(
        textEncoder.encode(
          `veil:invite-acceptance-locator:v2|${inviteCode}|${roomId}|`,
        ),
        inviteSecret,
        ),
      ),
    ),
  );
  const locatorValue = (bytesToBigInt(locatorDigest) % LOCATOR_BOUND) + 1n;
  const messageLocator = `0x${locatorValue.toString(16)}`;

  return Object.freeze({
    channelKey,
    messageLocator,
    messageReference: `veil-invite-acceptance:${messageLocator}`,
  });
}

/**
 * Submit one encrypted invite acceptance through the wallet-owned STRK20
 * transport.
 *
 * The capability secret is carried in the URL fragment, never in query
 * parameters or Helper calldata. The wrapper below deliberately replaces only
 * conversation-tag derivation so the active transport cannot fall back to the
 * legacy recipient-key registry.
 */
export async function submitInviteAcceptance(
  input: InviteAcceptanceInput,
): Promise<TimelineItem> {
  if (!(input.client instanceof VeilClient)) {
    throw new Error("A connected VEIL client is required.");
  }

  const inviteCode = normalizeInviteCode(input.inviteCode);
  const roomId = normalizeRoomId(input.roomId);
  const receiverAddress = normalizeOptionalAddress(input.receiverAddress);
  const now = input.now ?? (() => Date.now());
  const material = await deriveInviteAcceptanceMaterial({
    inviteCode,
    inviteSecret: input.inviteSecret,
    roomId,
  });

  const encryption = new PrivacyPoolChannelEncryptionAdapter({
    channelKey: material.channelKey,
    channelId: roomId,
    info: "veil:invite-acceptance:v2",
    keyId: `veil-invite-acceptance:${material.messageLocator}`,
    now,
  });

  const acceptanceClient = new VeilClient({
    privacyPoolAddress: input.client.privacyPoolAddress,
    helperAddress: input.client.helperAddress,
    rpcUrl: input.client.rpcUrl,
    encryption,
    transport: createInviteAcceptanceTransport(
      input.client.transport,
      material.messageLocator,
    ),
    allowMock: false,
    now,
  });

  const encryptedAcceptance = JSON.stringify({
    version: 2,
    kind: "invite_acceptance",
    roomId,
    inviteCodeHash: await digestHex(
      `veil:invite-code-hash:v2|${inviteCode}`,
    ),
    ...(receiverAddress ? { receiverAddress } : {}),
    acceptedAt: now(),
  });

  return acceptanceClient.sendShieldedMessage({
    channelId: roomId,
    sender: "system",
    message: encryptedAcceptance,
    messageReference: material.messageReference,
    messageLocator: material.messageLocator,
  });
}

function createInviteAcceptanceTransport(
  transport: VeilTransport,
  conversationTag: string,
): VeilTransport {
  const wrapped: VeilTransport = {
    ...(transport.supportedModes
      ? { supportedModes: transport.supportedModes }
      : {}),
    encodeConversationTag: async () => conversationTag,
    invokeExternal: (
      input: InvokeExternalInput,
    ) => transport.invokeExternal(input),
    getEventCount: (
      channelId: string,
    ) => transport.getEventCount(channelId),
    getEvent: (
      channelId: string,
      index: number,
    ) => transport.getEvent(channelId, index),
    getTimeline: (
      channelId: string,
    ) => transport.getTimeline(channelId),
  };

  if (transport.createChannel) {
    wrapped.createChannel = (input) => transport.createChannel!(input);
  }
  return wrapped;
}

function normalizeInviteCode(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!INVITE_CODE_PATTERN.test(normalized)) {
    throw new Error("Invite code is invalid.");
  }
  return normalized;
}

function normalizeRoomId(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!ROOM_ID_PATTERN.test(normalized)) {
    throw new Error("Invite room ID is invalid.");
  }
  return normalized;
}

function normalizeInviteSecret(value: string): Uint8Array {
  const normalized = String(value || "").trim();
  if (!INVITE_SECRET_PATTERN.test(normalized)) {
    throw new Error("Invite capability secret is invalid.");
  }
  const decoded = base64UrlToBytes(normalized);
  if (decoded.byteLength !== 32) {
    throw new Error("Invite capability secret must contain 256 bits.");
  }
  return decoded;
}

function normalizeOptionalAddress(value: string | undefined): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (!ADDRESS_PATTERN.test(normalized)) {
    throw new Error("Receiver address is invalid.");
  }
  const parsed = BigInt(normalized);
  if (parsed <= 0n || parsed >= (1n << 251n)) {
    throw new Error("Receiver address is outside the Starknet address range.");
  }
  return `0x${parsed.toString(16)}`;
}

function requireSubtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Invite acceptance requires Web Crypto.");
  }
  return globalThis.crypto.subtle;
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const joined = new Uint8Array(left.byteLength + right.byteLength);
  joined.set(left, 0);
  joined.set(right, left.byteLength);
  return joined;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const binary = [...bytes]
    .map((byte) => String.fromCharCode(byte))
    .join("");
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(
    binary,
    (character) => character.charCodeAt(0),
  );
}

async function digestHex(value: string): Promise<string> {
  const digest = new Uint8Array(
    await requireSubtle().digest(
      "SHA-256",
      textEncoder.encode(value),
    ),
  );
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
