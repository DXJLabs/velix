import { ec, hash, shortString } from "starknet";
import type { FeltLike } from "./types";

const FIELD = ec.starkCurve.CURVE.Fp.ORDER;
const CURVE_ORDER = ec.starkCurve.CURVE.n;
const HALF_ORDER = CURVE_ORDER / 2n;
const BASE_POINT = ec.starkCurve.ProjectivePoint.BASE;
const POINT = ec.starkCurve.ProjectivePoint;
const { Fp } = ec.starkCurve.CURVE;
const CURVE_A = ec.starkCurve.CURVE.a;
const CURVE_B = ec.starkCurve.CURVE.b;

export const STARK_FIELD_PRIME = FIELD.toString();
export const STARK_CURVE_ORDER = CURVE_ORDER.toString();
export const STARK_CURVE_HALF_ORDER = HALF_ORDER.toString();

export function generatePrivacyScalar(): string {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Secure random generation requires Web Crypto.");
  }
  const bytes = new Uint8Array(32);
  for (;;) {
    globalThis.crypto.getRandomValues(bytes);
    const candidate = BigInt(`0x${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`);
    if (candidate > 0n && candidate < HALF_ORDER) return candidate.toString();
  }
}

export const PRIVACY_POOL_CHANNEL_MARKER_TAG = shortString.encodeShortString("CHANNEL_MARKER_TAG:V1");
export const PRIVACY_POOL_CHANNEL_KEY_TAG = shortString.encodeShortString("CHANNEL_KEY_TAG:V1");
export const PRIVACY_POOL_SUBCHANNEL_MARKER_TAG = shortString.encodeShortString("SUBCHANNEL_MARKER_TAG:V1");
export const PRIVACY_POOL_SUBCHANNEL_ID_TAG = shortString.encodeShortString("SUBCHANNEL_ID_TAG:V1");
export const PRIVACY_POOL_ENC_CHANNEL_KEY_TAG = shortString.encodeShortString("ENC_CHANNEL_KEY_TAG:V1");
export const PRIVACY_POOL_ENC_SENDER_ADDR_TAG = shortString.encodeShortString("ENC_SENDER_ADDR_TAG:V1");

export interface StarkEphemeralKeyPair {
  ephemeralSecret: string;
  ephemeralPublicKey: string;
}

export interface SenderSharedXResult {
  ephemeralPublicKey: string;
  sharedX: string;
}

export interface EncChannelInfo {
  ephemeralPubkey: string;
  encChannelKey: string;
  encSenderAddr: string;
}

export interface EncryptChannelInfoInput {
  ephemeralSecret: FeltLike;
  recipientPublicKey: FeltLike;
  channelKey: FeltLike;
  senderAddress: FeltLike;
}

export interface DecryptChannelInfoInput {
  recipientPrivateKey: FeltLike;
  encChannelInfo: EncChannelInfo;
  recipientAddress?: FeltLike;
  recipientPublicKey?: FeltLike;
  /** @deprecated Channel markers are keyed by recipient public key in the Privacy Pool reference. */
  channelIndex?: FeltLike;
  expectedChannelMarker?: FeltLike;
}

export interface DecryptedChannelInfo {
  channelKey: string;
  senderAddress: string;
}

export interface ComputeChannelKeyInput {
  senderAddress: FeltLike;
  senderPrivateKey: FeltLike;
  recipientAddress: FeltLike;
  recipientPublicKey: FeltLike;
}

export interface ComputeChannelMarkerInput {
  channelKey: FeltLike;
  senderAddress: FeltLike;
  recipientAddress: FeltLike;
  recipientPublicKey: FeltLike;
}

export interface ComputeSubchannelMarkerInput {
  channelKey: FeltLike;
  recipientAddress: FeltLike;
  recipientPublicKey: FeltLike;
  token: FeltLike;
}

export interface DeriveMessageKeyInput {
  channelKey: FeltLike | Uint8Array | ArrayBuffer;
  channelId: string;
  info?: string;
  salt?: FeltLike | Uint8Array | ArrayBuffer;
}

function felt(value: FeltLike, label: string): bigint {
  if (typeof value === "bigint") return validateFelt(value, label);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer.`);
    return validateFelt(BigInt(value), label);
  }
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} cannot be empty.`);
  return validateFelt(BigInt(trimmed), label);
}

function validateFelt(value: bigint, label: string): bigint {
  if (value < 0n) throw new Error(`${label} must be non-negative.`);
  if (value >= FIELD) throw new Error(`${label} must be less than the Stark field prime.`);
  return value;
}

function canonicalPrivateScalar(value: FeltLike, label: string): bigint {
  const scalar = felt(value, label);
  if (scalar === 0n) throw new Error(`${label} must be non-zero.`);
  if (scalar >= HALF_ORDER) {
    throw new Error(`${label} must be canonical and less than half the Stark curve order.`);
  }
  return scalar;
}

function ephemeralScalar(value: FeltLike, label: string): bigint {
  const scalar = felt(value, label);
  if (scalar === 0n) throw new Error(`${label} must be non-zero.`);
  if (scalar >= CURVE_ORDER) throw new Error(`${label} must be less than the Stark curve order.`);
  return scalar;
}

function publicKeyX(value: FeltLike, label: string): bigint {
  const x = felt(value, label);
  if (x === 0n) throw new Error(`${label} must be non-zero.`);
  return x;
}

function decimal(value: bigint): string {
  return value.toString();
}

function poseidon(values: readonly bigint[]): string {
  return decimal(BigInt(hash.computePoseidonHashOnElements(values.map(decimal))));
}

function feltAdd(left: bigint, right: bigint): bigint {
  return (left + right) % FIELD;
}

function feltSub(left: bigint, right: bigint): bigint {
  return (left - right + FIELD) % FIELD;
}

function tag(value: string): bigint {
  return BigInt(value);
}

function pointFromX(x: bigint, label: string) {
  const rhs = Fp.add(Fp.add(Fp.mul(Fp.sqr(x), x), Fp.mul(CURVE_A, x)), CURVE_B);
  let y: bigint;
  try {
    y = Fp.sqrt(rhs);
  } catch {
    throw new Error(`${label} is not a valid Stark curve x-coordinate.`);
  }
  const point = POINT.fromAffine({ x, y });
  try {
    point.assertValidity();
  } catch {
    throw new Error(`${label} is not a valid Stark curve point.`);
  }
  return point;
}

function xCoordinate(point: ReturnType<typeof POINT.fromAffine>, label: string): string {
  if (point.equals(POINT.ZERO)) throw new Error(`${label} cannot be the identity point.`);
  const { x } = point.toAffine();
  if (x === 0n) throw new Error(`${label} produced a zero x-coordinate.`);
  return decimal(x);
}

function randomBytes(length: number): Uint8Array {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Stark ECDH scalar generation requires cryptographically secure random bytes.");
  }
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) + BigInt(byte);
  return value;
}

export function derivePrivacyPublicKey(privateScalar: FeltLike): string {
  const scalar = canonicalPrivateScalar(privateScalar, "privateScalar");
  return xCoordinate(BASE_POINT.multiply(scalar), "derivePrivacyPublicKey");
}

export function generateEphemeralKeyPair(): StarkEphemeralKeyPair {
  for (let attempt = 0; attempt < 1024; attempt += 1) {
    const candidate = bytesToBigInt(randomBytes(32));
    if (candidate > 0n && candidate < CURVE_ORDER) {
      const ephemeralSecret = decimal(candidate);
      return {
        ephemeralSecret,
        ephemeralPublicKey: xCoordinate(BASE_POINT.multiply(candidate), "generateEphemeralKeyPair"),
      };
    }
  }
  throw new Error("Unable to generate a valid Stark ECDH ephemeral scalar.");
}

export function deriveSenderSharedX(ephemeralSecret: FeltLike, recipientPublicKey: FeltLike): SenderSharedXResult {
  const scalar = ephemeralScalar(ephemeralSecret, "ephemeralSecret");
  const recipientPoint = pointFromX(publicKeyX(recipientPublicKey, "recipientPublicKey"), "recipientPublicKey");
  const sharedX = xCoordinate(recipientPoint.multiply(scalar), "deriveSenderSharedX");
  return {
    ephemeralPublicKey: xCoordinate(BASE_POINT.multiply(scalar), "deriveSenderSharedX.ephemeralPublicKey"),
    sharedX,
  };
}

export function deriveReceiverSharedX(recipientPrivateKey: FeltLike, ephemeralPublicKey: FeltLike): string {
  const scalar = canonicalPrivateScalar(recipientPrivateKey, "recipientPrivateKey");
  const ephemeralPoint = pointFromX(publicKeyX(ephemeralPublicKey, "ephemeralPublicKey"), "ephemeralPublicKey");
  return xCoordinate(ephemeralPoint.multiply(scalar), "deriveReceiverSharedX");
}

export function computePrivacyPoolChannelKey(input: ComputeChannelKeyInput): string {
  return poseidon([
    tag(PRIVACY_POOL_CHANNEL_KEY_TAG),
    felt(input.senderAddress, "senderAddress"),
    canonicalPrivateScalar(input.senderPrivateKey, "senderPrivateKey"),
    felt(input.recipientAddress, "recipientAddress"),
    publicKeyX(input.recipientPublicKey, "recipientPublicKey"),
  ]);
}

export function computePrivacyPoolChannelMarker(input: ComputeChannelMarkerInput): string {
  return poseidon([
    tag(PRIVACY_POOL_CHANNEL_MARKER_TAG),
    felt(input.channelKey, "channelKey"),
    felt(input.senderAddress, "senderAddress"),
    felt(input.recipientAddress, "recipientAddress"),
    publicKeyX(input.recipientPublicKey, "recipientPublicKey"),
  ]);
}

export function computePrivacyPoolSubchannelId(channelKey: FeltLike, index: FeltLike): string {
  return poseidon([tag(PRIVACY_POOL_SUBCHANNEL_ID_TAG), felt(channelKey, "channelKey"), felt(index, "index"), 0n]);
}

export function computePrivacyPoolSubchannelMarker(input: ComputeSubchannelMarkerInput): string {
  return poseidon([
    tag(PRIVACY_POOL_SUBCHANNEL_MARKER_TAG),
    felt(input.channelKey, "channelKey"),
    felt(input.recipientAddress, "recipientAddress"),
    publicKeyX(input.recipientPublicKey, "recipientPublicKey"),
    felt(input.token, "token"),
  ]);
}

export function computeEncChannelKeyMask(sharedX: FeltLike): string {
  return poseidon([tag(PRIVACY_POOL_ENC_CHANNEL_KEY_TAG), felt(sharedX, "sharedX")]);
}

export function computeEncSenderAddrMask(sharedX: FeltLike): string {
  return poseidon([tag(PRIVACY_POOL_ENC_SENDER_ADDR_TAG), felt(sharedX, "sharedX")]);
}

export function encryptChannelInfo(input: EncryptChannelInfoInput): EncChannelInfo {
  const { ephemeralPublicKey, sharedX } = deriveSenderSharedX(input.ephemeralSecret, input.recipientPublicKey);
  return {
    ephemeralPubkey: ephemeralPublicKey,
    encChannelKey: decimal(
      feltAdd(felt(computeEncChannelKeyMask(sharedX), "encChannelKeyMask"), felt(input.channelKey, "channelKey")),
    ),
    encSenderAddr: decimal(
      feltAdd(felt(computeEncSenderAddrMask(sharedX), "encSenderAddrMask"), felt(input.senderAddress, "senderAddress")),
    ),
  };
}

export function decryptChannelInfo(input: DecryptChannelInfoInput): DecryptedChannelInfo {
  const sharedX = deriveReceiverSharedX(input.recipientPrivateKey, input.encChannelInfo.ephemeralPubkey);
  const channelKey = decimal(
    feltSub(
      felt(input.encChannelInfo.encChannelKey, "encChannelInfo.encChannelKey"),
      felt(computeEncChannelKeyMask(sharedX), "encChannelKeyMask"),
    ),
  );
  const senderAddress = decimal(
    feltSub(
      felt(input.encChannelInfo.encSenderAddr, "encChannelInfo.encSenderAddr"),
      felt(computeEncSenderAddrMask(sharedX), "encSenderAddrMask"),
    ),
  );

  if (input.expectedChannelMarker !== undefined) {
    if (input.recipientAddress === undefined) {
      throw new Error("Channel marker validation requires recipientAddress.");
    }
    const recipientPublicKey = input.recipientPublicKey ?? derivePrivacyPublicKey(input.recipientPrivateKey);
    const marker = computePrivacyPoolChannelMarker({
      channelKey,
      senderAddress,
      recipientAddress: input.recipientAddress,
      recipientPublicKey,
    });
    if (BigInt(marker) !== felt(input.expectedChannelMarker, "expectedChannelMarker")) {
      throw new Error("EncChannelInfo failed channel marker validation.");
    }
  }

  return { channelKey, senderAddress };
}

export async function deriveMessageKey(input: DeriveMessageKeyInput): Promise<CryptoKey> {
  const { deriveSharedSecret } = await import("./ecdh");
  return deriveSharedSecret({
    channelKey: input.channelKey,
    channelId: input.channelId,
    info: input.info ?? "veil:privacy-pool-message:v1",
    ...(input.salt !== undefined ? { salt: input.salt } : {}),
  });
}
