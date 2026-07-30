import { VeilClient } from "../client";
import { PrivacyPoolChannelEncryptionAdapter } from "../ecdh";
import type { TimelineItem } from "../types";

const INVITE_CODE_PATTERN = /^[a-z0-9]{6,32}$/i;
const ROOM_ID_PATTERN = /^room-[a-f0-9]{32}$/i;
const ADDRESS_PATTERN = /^0x[0-9a-f]{1,64}$/i;
const LOCATOR_BOUND = (1n << 251n) - 1n;
const textEncoder = new TextEncoder();

export interface InviteAcceptanceInput {
  client: VeilClient;
  inviteCode: string;
  roomId: string;
  receiverAddress?: string;
  now?: () => number;
}

export interface InviteAcceptanceMaterial {
  channelKey: Uint8Array;
  messageLocator: string;
  messageReference: string;
}

export async function deriveInviteAcceptanceMaterial(
  inviteCode: string,
  roomId: string,
): Promise<InviteAcceptanceMaterial> {
  const normalizedInviteCode = normalizeInviteCode(inviteCode);
  const normalizedRoomId = normalizeRoomId(roomId);

  const channelKey = new Uint8Array(
    await requireSubtle().digest(
      "SHA-256",
      textEncoder.encode(
        `veil:invite-handshake-key:v1|${normalizedInviteCode}|${normalizedRoomId}`,
      ),
    ),
  );

  const locatorDigest = new Uint8Array(
    await requireSubtle().digest(
      "SHA-256",
      textEncoder.encode(
        `veil:invite-acceptance-locator:v1|${normalizedInviteCode}|${normalizedRoomId}`,
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
 * Submit one encrypted invite-acceptance envelope through the active
 * wallet-owned STRK20 transport.
 *
 * The invite code and receiver address remain inside AES-GCM ciphertext.
 * The wallet submits exactly one InvokeExternal action to VeilChannelHelper.
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
  const material = await deriveInviteAcceptanceMaterial(inviteCode, roomId);

  const encryption = new PrivacyPoolChannelEncryptionAdapter({
    channelKey: material.channelKey,
    channelId: roomId,
    info: "veil:invite-acceptance:v1",
    keyId: `veil-invite-acceptance:${material.messageLocator}`,
    now,
  });

  const acceptanceClient = new VeilClient({
    privacyPoolAddress: input.client.privacyPoolAddress,
    helperAddress: input.client.helperAddress,
    rpcUrl: input.client.rpcUrl,
    encryption,
    transport: input.client.transport,
    allowMock: false,
    now,
  });

  const encryptedAcceptance = JSON.stringify({
    version: 1,
    kind: "invite_acceptance",
    roomId,
    inviteCodeHash: await digestHex(
      `veil:invite-code-hash:v1|${inviteCode}`,
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

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

async function digestHex(value: string): Promise<string> {
  const digest = new Uint8Array(
    await requireSubtle().digest("SHA-256", textEncoder.encode(value)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
