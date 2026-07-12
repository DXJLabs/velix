import { ChannelEncryptionAdapter } from "./channel-encryption";
import { deriveMessageKey, deriveReceiverSharedX } from "./privacy_pool_ecdh";
import type { EncryptionAdapter, EncryptionContext, TimelineItem, VeilTimelinePayload } from "./types";
import type { EncryptionPublicKeyRegistryService, ResolvedEncryptionPublicKey } from "./encryption-key-registry";
import { identityError, type VeilEncryptionIdentityService } from "./encryption-identity";

export interface DirectEncryptionPeerContext {
  localAccountAddress: string;
  recipientAccountAddress: string;
  channelId: string;
  chainId: string;
  helperAddress: string;
}

export class DirectEcdhEncryptionAdapter implements EncryptionAdapter {
  readonly #identity: VeilEncryptionIdentityService;
  readonly #registry: EncryptionPublicKeyRegistryService;
  readonly #resolveContext: (channelId: string) => Promise<DirectEncryptionPeerContext> | DirectEncryptionPeerContext;
  constructor(input: {
    identity: VeilEncryptionIdentityService;
    registry: EncryptionPublicKeyRegistryService;
    resolveContext: (channelId: string) => Promise<DirectEncryptionPeerContext> | DirectEncryptionPeerContext;
  }) { this.#identity = input.identity; this.#registry = input.registry; this.#resolveContext = input.resolveContext; }

  async encryptPayload(payload: VeilTimelinePayload, context?: EncryptionContext) {
    if (!context) throw identityError("CHANNEL_KEY_DERIVATION_FAILED", "Encryption context is missing.");
    const peer = await this.#resolveContext(context.channelId);
    const local = await this.#identity.getOrCreateIdentity();
    const registered = await this.#registry.resolveOptional(peer.localAccountAddress);
    if (!registered || registered.publicKey !== local.publicKey) {
      throw identityError("ENCRYPTION_IDENTITY_REGISTRATION_REQUIRED", "Set up encryption identity before sending messages.");
    }
    const recipient = await this.#registry.resolveRecipientPublicKey(peer.recipientAccountAddress);
    const keyId = keyMetadata(peer, { accountAddress: peer.localAccountAddress, ...local }, recipient);
    const key = await this.#deriveKey(local.version, recipient.publicKey, peer);
    return new ChannelEncryptionAdapter({ channelKey: key, keyId }).encryptPayload(payload, context);
  }

  async decryptPayload(item: TimelineItem, context?: EncryptionContext) {
    if (!context) throw identityError("CHANNEL_KEY_DERIVATION_FAILED", "Encryption context is missing.");
    const peer = await this.#resolveContext(context.channelId);
    const metadata = parseKeyMetadata(item.payloadChunks);
    if (!metadata) throw identityError("CHANNEL_KEY_DERIVATION_FAILED", "Encrypted message key metadata is missing.");
    const localAddress = canonicalAddress(peer.localAccountAddress);
    const local = metadata.participants.find((participant) => participant.accountAddress === localAddress);
    const remote = metadata.participants.find((participant) => participant.accountAddress !== localAddress);
    if (!local || !remote) throw identityError("CHANNEL_KEY_DERIVATION_FAILED", "Encrypted message participant metadata is invalid.");
    const key = await this.#deriveKey(local.version, remote.publicKey, peer);
    return new ChannelEncryptionAdapter({ channelKey: key }).decryptPayload(item, context);
  }

  async #deriveKey(localVersion: number, remotePublicKey: string, peer: DirectEncryptionPeerContext) {
    return this.#identity.withPrivateScalar(localVersion, async (privateScalar) => {
      try {
        const sharedX = deriveReceiverSharedX(privateScalar, remotePublicKey);
        return deriveMessageKey({
          channelKey: sharedX,
          channelId: canonicalKdfContext(peer),
          info: "veil:encrypted-direct:channel-key:v1",
        });
      } catch {
        throw identityError("CHANNEL_KEY_DERIVATION_FAILED", "Encrypted channel key derivation failed.");
      }
    });
  }
}

function canonicalAddress(address: string): string { return `0x${BigInt(address).toString(16)}`; }
export function canonicalKdfContext(input: DirectEncryptionPeerContext): string {
  const participants = [canonicalAddress(input.localAccountAddress), canonicalAddress(input.recipientAccountAddress)].sort();
  return ["veil:encrypted-direct:v1", input.chainId.toUpperCase(), canonicalAddress(input.helperAddress), ...participants, input.channelId].join("|");
}
function keyMetadata(peer: DirectEncryptionPeerContext, local: ResolvedEncryptionPublicKey, remote: ResolvedEncryptionPublicKey): string {
  const participants = [local, remote]
    .map((value) => ({ accountAddress: canonicalAddress(value.accountAddress), publicKey: value.publicKey, version: value.version }))
    .sort((a, b) => a.accountAddress.localeCompare(b.accountAddress));
  return `veil-direct-key:${btoa(JSON.stringify({ version: 1, participants, context: canonicalKdfContext(peer) }))}`;
}
function parseKeyMetadata(chunks: readonly string[] | undefined): { participants: ResolvedEncryptionPublicKey[] } | null {
  if (!chunks?.length) return null;
  try {
    // Avoid importing payload helpers into the browser adapter's public API.
    const bytes = chunks.flatMap((chunk) => {
      let hex = BigInt(chunk).toString(16); if (hex.length % 2) hex = `0${hex}`;
      return hex.match(/.{2}/g)?.map((value) => Number.parseInt(value, 16)) ?? [];
    });
    const envelope = JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes)));
    if (typeof envelope.keyId !== "string" || !envelope.keyId.startsWith("veil-direct-key:")) return null;
    return JSON.parse(atob(envelope.keyId.slice("veil-direct-key:".length)));
  } catch { return null; }
}
