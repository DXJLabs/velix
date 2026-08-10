import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  ProvingServiceError,
  createPrivateTransfers,
} from "@starkware-libs/starknet-privacy-sdk";
import type {
  ExecuteResult,
  PrivateTransfersBuilder,
  ProofInvocation,
  ProofInvocationFactoryDetails,
  ProofProviderInterface,
  ProvingBlockId,
} from "@starkware-libs/starknet-privacy-sdk";
import { constants, ec } from "starknet";

import {
  buildCanonicalHelperPayload,
} from "../packages/veil-sdk/dist/privacy/canonical-payload.js";
import {
  decryptApplicationPayload,
  encryptApplicationPayload,
} from "../packages/veil-sdk/dist/privacy/application-encryption.js";
import type {
  VeilApplicationCiphertext,
  VeilApplicationEncryptionContext,
} from "../packages/veil-sdk/dist/privacy/application-encryption.js";
import {
  generateMessageLocator,
} from "../packages/veil-sdk/dist/privacy/message-locator.js";
import {
  computePrivacyPoolChannelKey,
  computePrivacyPoolChannelMarker,
  decryptChannelInfo,
} from "../packages/veil-sdk/dist/privacy_pool_ecdh.js";
import {
  LOCAL_DECRYPT_VERIFIED,
  MESSAGE_EVENT_FOUND,
  MESSAGE_STORAGE_VERIFIED,
  SHIELDED_MESSAGE_PROOF_RESULT,
  SHIELDED_MESSAGE_SUBMISSION_RESULT,
  createOfficialShieldedMessageSubmissionAccount,
  createShieldedMessageChainProvider,
  createShieldedMessageProofSummary,
  createShieldedMessageProvingResourceBounds,
  createShieldedMessageResourceEstimator,
  loadVeilShieldedMessagePocConfig,
  submitShieldedMessage,
  verifyLocalShieldedMessageDecrypt,
  verifyShieldedMessageDeployment,
  verifyShieldedMessageRegisteredIdentity,
} from "./veil-official-shielded-message-poc.ts";
import type {
  PreparedShieldedMessage,
  ProofResourceBounds,
  ShieldedMessageChainProvider,
  ShieldedMessageProofExecutor,
  ShieldedMessageProofExecutorInput,
  ShieldedMessageReplayState,
  ShieldedMessageSubmissionAccount,
  VeilShieldedMessagePocConfig,
  VeilShieldedMessagePocDependencies,
} from "./veil-official-shielded-message-poc.ts";
import {
  AccountPreflightError,
  DEFAULT_ACCOUNT_PREFLIGHT_PATH,
  createAccountPreflightProvider,
  createOfficialProvingProvider,
  createStandardPocSigner,
  preflightVeilPocAccount,
  writeAccountPreflightArtifact,
} from "./veil-official-register-poc.ts";
import {
  collectVeilPocIdentitySensitiveValues,
  parseVeilPocAccountAddress,
  parseVeilPocViewingKey,
} from "./veil-poc-identity.ts";
import {
  VEIL_REPLAY_ANCHOR_AMOUNT,
  VEIL_REPLAY_TOKEN_ADDRESS,
  VeilReplaySnapshotDiscoveryProvider,
  createReplayRegistry,
  discoverDirectionChannel,
  discoverReplayAnchor,
  readOutgoingChannelCount,
} from "./veil-replay-anchor.ts";

export const TWO_PARTY_IDENTITY_VALID =
  "TWO_PARTY_SHIELDED_MESSAGE_IDENTITY_CONFIG_VALID";
export const TWO_PARTY_DRY_RUN_VALID =
  "OFFICIAL_SDK_TWO_PARTY_SHIELDED_MESSAGE_DRY_RUN_VALID";
export const TWO_PARTY_PROOF_RESULT =
  "OFFICIAL_SDK_TWO_PARTY_SHIELDED_MESSAGE_PROOF_GENERATED";
export const TWO_PARTY_SUBMISSION_RESULT =
  "OFFICIAL_SDK_TWO_PARTY_SHIELDED_MESSAGE_SUBMITTED_ONCHAIN";
export const RECIPIENT_CHANNEL_RECOVERED = "RECIPIENT_CHANNEL_RECOVERED";
export const RECIPIENT_DECRYPT_VERIFIED = "RECIPIENT_DECRYPT_VERIFIED";
export const UNRELATED_VIEWING_KEY_REJECTED =
  "UNRELATED_VIEWING_KEY_REJECTED";

export const DEFAULT_TWO_PARTY_SUMMARY_PATH =
  "veil-two-party-shielded-message-summary.json";

const INTERNAL_PLAINTEXT = "VEIL_PRIVATE_MESSAGE_POC_V1";
const TWO_PARTY_ROOM_ID =
  "VEIL_OFFICIAL_TWO_PARTY_SHIELDED_MESSAGE_POC_V1";
const MAX_SAFE_CHANNEL_COUNT = BigInt(Number.MAX_SAFE_INTEGER);

export interface VeilTwoPartyShieldedMessagePocConfig
  extends VeilShieldedMessagePocConfig {
  recipientAccountAddress: bigint;
  recipientViewingKey: bigint;
  twoPartySummaryPath: string;
}

export interface PreparedTwoPartyShieldedMessage
  extends PreparedShieldedMessage {
  recipientAddress: bigint;
  recipientPublicKey: bigint;
  recipientChannelIndex: number;
  channelKey: bigint;
  channelMarker: bigint;
}

export interface RecipientDecryptVerification {
  recipientChannelRecovered: true;
  recipientDecryptVerified: true;
  unrelatedViewingKeyRejected: true;
}

export interface VeilTwoPartyShieldedMessageSummary {
  result: string;
  network: "SN_SEPOLIA";
  helperAddress: string;
  privacyPoolAddress: string;
  senderAddress: string;
  recipientAddress: string;
  provingBlockId: string;
  transactionHash: string | null;
  finalityStatus: string;
  executionStatus: string;
  messageLocator: string;
  payloadCommitment: string;
  ciphertextChunkCount: number;
  recipientChannelIndex: number;
  proofPresent: boolean;
  proofFactsCount: number;
  messageEventFound: boolean;
  storageVerified: boolean;
  senderLocalDecryptVerified: boolean;
  recipientChannelRecovered: boolean;
  recipientDecryptVerified: boolean;
  unrelatedViewingKeyRejected: boolean;
}

export interface VeilTwoPartyShieldedMessageDependencies
  extends VeilShieldedMessagePocDependencies {
  proofExecutor?: ShieldedMessageProofExecutor;
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function feltHex(value: bigint | string): string {
  return `0x${BigInt(value).toString(16)}`;
}

function sameFelt(left: bigint | string, right: bigint | string): boolean {
  return BigInt(left) === BigInt(right);
}

function bigintToFixedBytes(value: bigint, byteLength: number): Uint8Array {
  if (value < 0n) throw new Error("Privacy Pool channel key cannot be negative.");
  const output = new Uint8Array(byteLength);
  let remaining = value;
  for (let index = byteLength - 1; index >= 0; index -= 1) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  if (remaining !== 0n) throw new Error("Privacy Pool channel key is too large.");
  return output;
}

function asPreparedTwoParty(
  prepared: PreparedShieldedMessage,
): PreparedTwoPartyShieldedMessage {
  const candidate = prepared as Partial<PreparedTwoPartyShieldedMessage>;
  if (candidate.recipientAddress === undefined
      || candidate.recipientPublicKey === undefined
      || candidate.recipientChannelIndex === undefined
      || candidate.channelKey === undefined
      || candidate.channelMarker === undefined) {
    throw new Error("Two-party prepared message metadata is missing.");
  }
  return candidate as PreparedTwoPartyShieldedMessage;
}

export function loadVeilTwoPartyShieldedMessagePocConfig(
  env: NodeJS.ProcessEnv = process.env,
): VeilTwoPartyShieldedMessagePocConfig {
  const base = loadVeilShieldedMessagePocConfig(env);
  const recipientAccountAddress = parseVeilPocAccountAddress(requiredEnv(
    env,
    "VEIL_POC_RECIPIENT_ACCOUNT_ADDRESS",
  ));
  const recipientViewingKey = parseVeilPocViewingKey(requiredEnv(
    env,
    "VEIL_POC_RECIPIENT_VIEWING_KEY",
  ));
  if (recipientAccountAddress === base.identity.accountAddress) {
    throw new Error("Two-party PoC requires different sender and recipient accounts.");
  }
  if (recipientViewingKey === base.identity.viewingKey) {
    throw new Error("Two-party PoC requires different sender and recipient viewing keys.");
  }
  return Object.freeze({
    ...base,
    recipientAccountAddress,
    recipientViewingKey,
    twoPartySummaryPath:
      env.VEIL_POC_TWO_PARTY_SUMMARY_PATH?.trim()
      || DEFAULT_TWO_PARTY_SUMMARY_PATH,
  });
}

export async function verifyRegisteredViewingKey(input: {
  provider: ShieldedMessageChainProvider;
  poolAddress: bigint;
  accountAddress: bigint;
  viewingKey: bigint;
  blockIdentifier?: ProvingBlockId;
  label: string;
}): Promise<bigint> {
  const response = await input.provider.callContract({
    contractAddress: feltHex(input.poolAddress),
    entrypoint: "get_public_key",
    calldata: [feltHex(input.accountAddress)],
  }, input.blockIdentifier);
  if (response.length !== 1 || BigInt(response[0]!) === 0n) {
    throw new Error(`${input.label} is not registered in the Privacy Pool.`);
  }
  const expectedPublicKey = BigInt(ec.starkCurve.getStarkKey(
    feltHex(input.viewingKey),
  ));
  if (BigInt(response[0]!) !== expectedPublicKey) {
    throw new Error(`${input.label} is registered with a different viewing key.`);
  }
  return expectedPublicKey;
}

export async function readRecipientChannelCount(input: {
  provider: ShieldedMessageChainProvider;
  poolAddress: bigint;
  recipientAddress: bigint;
  blockIdentifier?: ProvingBlockId;
}): Promise<number> {
  const response = await input.provider.callContract({
    contractAddress: feltHex(input.poolAddress),
    entrypoint: "get_num_of_channels",
    calldata: [feltHex(input.recipientAddress)],
  }, input.blockIdentifier);
  if (response.length !== 1) {
    throw new Error("Privacy Pool returned an invalid recipient channel count.");
  }
  const total = BigInt(response[0]!);
  if (total < 0n || total > MAX_SAFE_CHANNEL_COUNT) {
    throw new Error("Privacy Pool returned an unsafe recipient channel count.");
  }
  return Number(total);
}

export async function prepareTwoPartyShieldedMessage(input: {
  config: VeilTwoPartyShieldedMessagePocConfig;
  recipientPublicKey: bigint;
  recipientChannelIndex: number;
  plaintext?: string;
}): Promise<PreparedTwoPartyShieldedMessage> {
  const plaintext = input.plaintext ?? INTERNAL_PLAINTEXT;
  if (!Number.isSafeInteger(input.recipientChannelIndex)
      || input.recipientChannelIndex < 0) {
    throw new Error("Recipient channel index is invalid.");
  }
  const channelKey = BigInt(computePrivacyPoolChannelKey({
    senderAddress: input.config.identity.accountAddress,
    senderPrivateKey: input.config.identity.viewingKey,
    recipientAddress: input.config.recipientAccountAddress,
    recipientPublicKey: input.recipientPublicKey,
  }));
  const channelMarker = BigInt(computePrivacyPoolChannelMarker({
    channelKey,
    senderAddress: input.config.identity.accountAddress,
    recipientAddress: input.config.recipientAccountAddress,
    recipientPublicKey: input.recipientPublicKey,
  }));
  const sharedSecret = bigintToFixedBytes(channelKey, 32);
  const applicationContext: VeilApplicationEncryptionContext = {
    chainId: constants.StarknetChainId.SN_SEPOLIA,
    poolAddress: feltHex(input.config.poolAddress),
    roomId: TWO_PARTY_ROOM_ID,
    senderId: feltHex(input.config.identity.accountAddress),
    recipientId: feltHex(input.config.recipientAccountAddress),
  };
  const applicationEnvelope = await encryptApplicationPayload({
    domain: "VEIL_MESSAGE_KEY_V1",
    context: applicationContext,
    sharedSecret,
    plaintext: new TextEncoder().encode(plaintext),
  });
  const canonicalEnvelope = {
    version: applicationEnvelope.version,
    algorithm: "A256GCM" as const,
    salt: applicationEnvelope.salt,
    nonce: applicationEnvelope.nonce,
    ciphertext: applicationEnvelope.ciphertext,
  };
  const messageLocator = generateMessageLocator();
  const payload = buildCanonicalHelperPayload({
    operation: "message",
    keyDomain: "VEIL_MESSAGE_KEY_V1",
    envelope: canonicalEnvelope,
    messageLocator,
  });
  if (JSON.stringify(payload.calldata).includes(plaintext)) {
    throw new Error("Plaintext appeared in two-party helper calldata.");
  }
  return Object.freeze({
    messageLocator: payload.messageLocator,
    payloadCommitment: payload.payloadCommitment,
    ciphertextChunks: payload.payloadChunks,
    helperCalldata: payload.calldata,
    applicationEnvelope,
    applicationContext,
    sharedSecret,
    recipientAddress: input.config.recipientAccountAddress,
    recipientPublicKey: input.recipientPublicKey,
    recipientChannelIndex: input.recipientChannelIndex,
    channelKey,
    channelMarker,
  });
}

export async function discoverTwoPartyShieldedMessageReplayState(input: {
  config: VeilTwoPartyShieldedMessagePocConfig;
  provider: ShieldedMessageChainProvider;
  provingBlockId: number;
  recipientPublicKey: bigint;
}): Promise<ShieldedMessageReplayState> {
  const senderPublicKey = BigInt(ec.starkCurve.getStarkKey(
    feltHex(input.config.identity.viewingKey),
  ));
  const direction = await discoverDirectionChannel({
    provider: input.provider,
    poolAddress: input.config.poolAddress,
    senderAddress: input.config.identity.accountAddress,
    senderViewingKey: input.config.identity.viewingKey,
    recipientAddress: input.config.recipientAccountAddress,
    recipientViewingKey: input.config.recipientViewingKey,
    recipientPublicKey: input.recipientPublicKey,
    blockIdentifier: input.provingBlockId,
  });
  const anchor = await discoverReplayAnchor({
    provider: input.provider,
    poolAddress: input.config.poolAddress,
    accountAddress: input.config.identity.accountAddress,
    viewingKey: input.config.identity.viewingKey,
    publicKey: senderPublicKey,
    blockIdentifier: input.provingBlockId,
  });
  const outgoingChannelCount = await readOutgoingChannelCount({
    provider: input.provider,
    poolAddress: input.config.poolAddress,
    senderAddress: input.config.identity.accountAddress,
    senderViewingKey: input.config.identity.viewingKey,
    blockIdentifier: input.provingBlockId,
  });
  const registry = createReplayRegistry({
    senderAddress: input.config.identity.accountAddress,
    senderViewingKey: input.config.identity.viewingKey,
    senderPublicKey,
    recipientAddress: input.config.recipientAccountAddress,
    recipientPublicKey: input.recipientPublicKey,
    direction,
    anchor,
  });
  return {
    anchor,
    direction,
    registry,
    outgoingChannelCount,
    senderPublicKey,
  };
}

function createTwoPartyTransfers(
  input: ShieldedMessageProofExecutorInput,
  provingProvider: ProofProviderInterface,
  replayState: ShieldedMessageReplayState,
) {
  const prepared = asPreparedTwoParty(input.prepared);
  const discoveryProvider = new VeilReplaySnapshotDiscoveryProvider({
    senderAddress: input.config.identity.accountAddress,
    senderViewingKey: input.config.identity.viewingKey,
    senderPublicKey: replayState.senderPublicKey,
    recipientAddress: prepared.recipientAddress,
    recipientPublicKey: prepared.recipientPublicKey,
    direction: replayState.direction,
    anchor: replayState.anchor,
    registry: replayState.registry,
    outgoingChannelCount: replayState.outgoingChannelCount,
    blockIdentifier: input.provingBlockId,
  });
  const transfers = createPrivateTransfers({
    account: {
      address: input.config.identity.accountAddress,
      signer: input.signer,
    },
    viewingKeyProvider: {
      async getViewingKey() {
        return input.config.identity.viewingKey;
      },
    },
    provingProvider,
    discoveryProvider,
    poolContractAddress: input.config.poolAddress,
  });
  let builder: PrivateTransfersBuilder = transfers.build({
    registry: replayState.registry,
    registryConst: true,
  });
  if (!replayState.direction.exists) {
    builder = builder.setup(prepared.recipientAddress);
  }
  if (replayState.anchor.anchorNote) {
    builder = builder
      .with(VEIL_REPLAY_TOKEN_ADDRESS)
      .inputs(replayState.anchor.anchorNote)
      .transfer({
        recipient: input.config.identity.accountAddress,
        amount: replayState.anchor.anchorNote.amount,
      })
      .done();
  } else {
    if (!replayState.anchor.selfChannelExists) {
      builder = builder.setup(input.config.identity.accountAddress);
    }
    const tokenBuilder = builder.with(VEIL_REPLAY_TOKEN_ADDRESS);
    if (!replayState.anchor.tokenSubchannelExists) {
      tokenBuilder.setup(input.config.identity.accountAddress);
    }
    builder = tokenBuilder
      .deposit({ amount: VEIL_REPLAY_ANCHOR_AMOUNT })
      .surplusTo(input.config.identity.accountAddress, false)
      .done();
  }
  builder = builder.invoke(() => ({
    contractAddress: feltHex(input.config.helperAddress),
    calldata: [
      String(prepared.helperCalldata.length),
      ...prepared.helperCalldata,
    ],
  }));
  return { transfers, builder };
}

function createPinnedProofProvider(
  provingProvider: ProofProviderInterface,
  details: ProofInvocationFactoryDetails,
): ProofProviderInterface {
  return {
    async getDefaultDetails() {
      return details;
    },
    prove(invocation, blockIdentifier) {
      return provingProvider.prove(invocation, blockIdentifier);
    },
    invalidateNonceCache() {
      provingProvider.invalidateNonceCache?.();
    },
  };
}

function assertInvocationResourceBounds(
  invocation: ProofInvocation,
  bounds: ProofResourceBounds,
): void {
  for (const resource of ["l1_gas", "l1_data_gas", "l2_gas"] as const) {
    const actual = invocation.resource_bounds[resource];
    if (BigInt(actual.max_amount) !== bounds[resource].max_amount
        || BigInt(actual.max_price_per_unit)
          !== bounds[resource].max_price_per_unit) {
      throw new Error("Final two-party proving resource bounds are inconsistent.");
    }
  }
}

function resourceBoundsFingerprint(bounds: ProofResourceBounds): string {
  return [
    bounds.l1_gas.max_amount,
    bounds.l1_gas.max_price_per_unit,
    bounds.l1_data_gas.max_amount,
    bounds.l1_data_gas.max_price_per_unit,
    bounds.l2_gas.max_amount,
    bounds.l2_gas.max_price_per_unit,
  ].join(":");
}

export async function prepareOfficialTwoPartyShieldedMessageProof(
  input: ShieldedMessageProofExecutorInput,
) {
  input.provingProvider.invalidateNonceCache?.();
  const prepared = asPreparedTwoParty(input.prepared);
  const replayState = input.replayState
    ?? await discoverTwoPartyShieldedMessageReplayState({
      config: input.config as VeilTwoPartyShieldedMessagePocConfig,
      provider: input.provider,
      provingBlockId: input.provingBlockId,
      recipientPublicKey: prepared.recipientPublicKey,
    });
  console.log(
    replayState.direction.exists
      ? "TWO_PARTY_CHANNEL_REUSED"
      : "TWO_PARTY_CHANNEL_OPEN_READY",
  );
  console.log(
    replayState.anchor.anchorNote
      ? "TWO_PARTY_REPLAY_ANCHOR_ROTATION_READY"
      : "TWO_PARTY_REPLAY_ANCHOR_BOOTSTRAP_READY",
  );
  const baseDetails = await input.provingProvider.getDefaultDetails();
  if (baseDetails.nonce === undefined) {
    throw new Error("Official proving provider returned no current pool nonce.");
  }
  if (!baseDetails.resourceBounds) {
    throw new Error("Official proving provider returned no default bounds.");
  }
  const preliminaryProvider = createPinnedProofProvider(
    input.provingProvider,
    baseDetails,
  );
  const preliminary = createTwoPartyTransfers(
    input,
    preliminaryProvider,
    replayState,
  );
  const preliminaryInvocation = await preliminary.builder.createProofInvocation();
  const rawEstimate = await input.resourceEstimator.estimateInvokeV3(
    preliminaryInvocation.invocation,
  );
  const provingResourceBounds = createShieldedMessageProvingResourceBounds(
    rawEstimate,
    baseDetails.resourceBounds,
  );
  const finalDetails: ProofInvocationFactoryDetails = {
    ...baseDetails,
    nonce: baseDetails.nonce,
    tip: 0n,
    resourceBounds: provingResourceBounds,
  };
  const finalProvider = createPinnedProofProvider(
    input.provingProvider,
    finalDetails,
  );
  const finalTransfer = createTwoPartyTransfers(
    input,
    finalProvider,
    replayState,
  );
  const finalInvocation = await finalTransfer.builder.createProofInvocation();
  assertInvocationResourceBounds(
    finalInvocation.invocation,
    provingResourceBounds,
  );
  console.log("TWO_PARTY_SHIELDED_MESSAGE_RESOURCE_ESTIMATE_VALID");
  console.log(`l1_gas.max_amount: ${provingResourceBounds.l1_gas.max_amount}`);
  console.log(
    `l1_data_gas.max_amount: ${provingResourceBounds.l1_data_gas.max_amount}`,
  );
  console.log(`l2_gas.max_amount: ${provingResourceBounds.l2_gas.max_amount}`);
  console.log("SHIELDED_MESSAGE_PROVING_ZERO_FEE_BOUNDS_VALID");
  return {
    finalInvocation,
    finalTransfer,
    provingResourceBounds,
  };
}

export const officialTwoPartyShieldedMessageProofExecutor:
ShieldedMessageProofExecutor = {
  async execute(input) {
    const {
      finalInvocation,
      finalTransfer,
      provingResourceBounds,
    } = await prepareOfficialTwoPartyShieldedMessageProof(input);
    const boundsBeforeProof = resourceBoundsFingerprint(provingResourceBounds);
    const result = await finalTransfer.transfers.executeWithInvocation(
      finalInvocation,
      input.provingBlockId,
    );
    if (resourceBoundsFingerprint(provingResourceBounds) !== boundsBeforeProof) {
      throw new Error("Two-party resource bounds changed after proof generation.");
    }
    assertInvocationResourceBounds(
      finalInvocation.invocation,
      provingResourceBounds,
    );
    return { result, provingResourceBounds };
  },
};

function chooseUnrelatedViewingKey(
  senderViewingKey: bigint,
  recipientViewingKey: bigint,
): bigint {
  for (const candidate of [1n, 2n, 3n, 5n, 7n, 11n]) {
    if (candidate !== senderViewingKey && candidate !== recipientViewingKey) {
      return candidate;
    }
  }
  throw new Error("Unable to choose an unrelated viewing key for negative testing.");
}

export async function verifyRecipientShieldedMessageDecrypt(input: {
  config: VeilTwoPartyShieldedMessagePocConfig;
  provider: ShieldedMessageChainProvider;
  prepared: PreparedTwoPartyShieldedMessage;
  plaintext?: string;
  blockIdentifier?: ProvingBlockId;
}): Promise<RecipientDecryptVerification> {
  const plaintext = input.plaintext ?? INTERNAL_PLAINTEXT;
  const channelCount = await readRecipientChannelCount({
    provider: input.provider,
    poolAddress: input.config.poolAddress,
    recipientAddress: input.config.recipientAccountAddress,
    ...(input.blockIdentifier === undefined
      ? {}
      : { blockIdentifier: input.blockIdentifier }),
  });
  if (channelCount <= input.prepared.recipientChannelIndex) {
    throw new Error("Recipient channel was not appended to the Privacy Pool.");
  }
  const response = await input.provider.callContract({
    contractAddress: feltHex(input.config.poolAddress),
    entrypoint: "get_channel_info",
    calldata: [
      feltHex(input.config.recipientAccountAddress),
      String(input.prepared.recipientChannelIndex),
    ],
  }, input.blockIdentifier);
  if (response.length !== 3) {
    throw new Error("Privacy Pool returned invalid encrypted channel information.");
  }
  const encChannelInfo = {
    ephemeralPubkey: response[0]!,
    encChannelKey: response[1]!,
    encSenderAddr: response[2]!,
  };
  const recovered = decryptChannelInfo({
    recipientPrivateKey: input.config.recipientViewingKey,
    recipientAddress: input.config.recipientAccountAddress,
    recipientPublicKey: input.prepared.recipientPublicKey,
    expectedChannelMarker: input.prepared.channelMarker,
    encChannelInfo,
  });
  if (!sameFelt(recovered.channelKey, input.prepared.channelKey)
      || !sameFelt(
        recovered.senderAddress,
        input.config.identity.accountAddress,
      )) {
    throw new Error("Recipient recovered unexpected two-party channel material.");
  }
  const decrypted = await decryptApplicationPayload({
    domain: "VEIL_MESSAGE_KEY_V1",
    context: input.prepared.applicationContext,
    sharedSecret: bigintToFixedBytes(BigInt(recovered.channelKey), 32),
    envelope: input.prepared.applicationEnvelope,
  });
  if (new TextDecoder().decode(decrypted) !== plaintext) {
    throw new Error("Recipient two-party shielded-message decrypt mismatch.");
  }
  const unrelatedViewingKey = chooseUnrelatedViewingKey(
    input.config.identity.viewingKey,
    input.config.recipientViewingKey,
  );
  let unrelatedRejected = false;
  try {
    decryptChannelInfo({
      recipientPrivateKey: unrelatedViewingKey,
      recipientAddress: input.config.recipientAccountAddress,
      recipientPublicKey: input.prepared.recipientPublicKey,
      expectedChannelMarker: input.prepared.channelMarker,
      encChannelInfo,
    });
  } catch {
    unrelatedRejected = true;
  }
  if (!unrelatedRejected) {
    throw new Error("An unrelated viewing key unexpectedly recovered the channel.");
  }
  return {
    recipientChannelRecovered: true,
    recipientDecryptVerified: true,
    unrelatedViewingKeyRejected: true,
  };
}

function mapTwoPartySummary(input: {
  config: VeilTwoPartyShieldedMessagePocConfig;
  provingBlockId: number;
  prepared: PreparedTwoPartyShieldedMessage;
  result: ExecuteResult;
  baseSummary: ReturnType<typeof createShieldedMessageProofSummary>;
  recipientVerification?: RecipientDecryptVerification;
}): VeilTwoPartyShieldedMessageSummary {
  const base = input.baseSummary;
  return {
    result: input.recipientVerification
      ? TWO_PARTY_SUBMISSION_RESULT
      : TWO_PARTY_PROOF_RESULT,
    network: "SN_SEPOLIA",
    helperAddress: base.helperAddress,
    privacyPoolAddress: base.privacyPoolAddress,
    senderAddress: base.accountAddress,
    recipientAddress: feltHex(input.config.recipientAccountAddress),
    provingBlockId: String(input.provingBlockId),
    transactionHash: base.transactionHash,
    finalityStatus: base.finalityStatus,
    executionStatus: base.executionStatus,
    messageLocator: input.prepared.messageLocator,
    payloadCommitment: input.prepared.payloadCommitment,
    ciphertextChunkCount: input.prepared.ciphertextChunks.length,
    recipientChannelIndex: input.prepared.recipientChannelIndex,
    proofPresent: base.proofPresent,
    proofFactsCount: base.proofFactsCount,
    messageEventFound: base.messageEventFound,
    storageVerified: base.storageVerified,
    senderLocalDecryptVerified: base.localDecryptVerified,
    recipientChannelRecovered:
      input.recipientVerification?.recipientChannelRecovered ?? false,
    recipientDecryptVerified:
      input.recipientVerification?.recipientDecryptVerified ?? false,
    unrelatedViewingKeyRejected:
      input.recipientVerification?.unrelatedViewingKeyRejected ?? false,
  };
}

export function assertTwoPartyShieldedMessageSummarySafe(
  summary: VeilTwoPartyShieldedMessageSummary,
  sensitiveValues: readonly string[] = [],
): void {
  const expectedKeys = [
    "result",
    "network",
    "helperAddress",
    "privacyPoolAddress",
    "senderAddress",
    "recipientAddress",
    "provingBlockId",
    "transactionHash",
    "finalityStatus",
    "executionStatus",
    "messageLocator",
    "payloadCommitment",
    "ciphertextChunkCount",
    "recipientChannelIndex",
    "proofPresent",
    "proofFactsCount",
    "messageEventFound",
    "storageVerified",
    "senderLocalDecryptVerified",
    "recipientChannelRecovered",
    "recipientDecryptVerified",
    "unrelatedViewingKeyRejected",
  ];
  const actualKeys = Object.keys(summary);
  if (actualKeys.length !== expectedKeys.length
      || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error("Two-party summary contains an unexpected field.");
  }
  const forbiddenKeys = [
    "plaintext",
    "ciphertext",
    "privateKey",
    "viewingKey",
    "sharedSecret",
    "channelKey",
    "signature",
    "proof",
    "proofFacts",
    "calldata",
    "rpcUrl",
    "secret",
  ];
  if (forbiddenKeys.some((key) => Object.hasOwn(summary, key))) {
    throw new Error("Two-party summary contains a forbidden field.");
  }
  const serialized = JSON.stringify(summary);
  if (serialized.includes(INTERNAL_PLAINTEXT)
      || sensitiveValues.some((value) => value && serialized.includes(value))) {
    throw new Error("Two-party summary contains sensitive material.");
  }
}

async function writeTwoPartySummary(
  summary: VeilTwoPartyShieldedMessageSummary,
  path: string,
  sensitiveValues: readonly string[],
): Promise<void> {
  assertTwoPartyShieldedMessageSummarySafe(summary, sensitiveValues);
  await writeFile(path, `${JSON.stringify(summary, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function runVeilOfficialTwoPartyShieldedMessagePoc(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: VeilTwoPartyShieldedMessageDependencies = {},
): Promise<VeilTwoPartyShieldedMessageSummary | null> {
  const config = loadVeilTwoPartyShieldedMessagePocConfig(env);
  const sensitiveValues = [
    ...collectVeilPocIdentitySensitiveValues(env, config.identity),
    requiredEnv(env, "VEIL_POC_RECIPIENT_VIEWING_KEY"),
    config.recipientViewingKey.toString(),
    feltHex(config.recipientViewingKey),
    INTERNAL_PLAINTEXT,
  ];
  const signer = createStandardPocSigner(
    config.identity.accountPrivateKey,
  );
  const preflight = await preflightVeilPocAccount({
    provider: dependencies.accountPreflightProvider
      ?? createAccountPreflightProvider(config.rpcUrl),
    accountAddress: config.identity.accountAddress,
    signer,
    sensitiveValues,
  });
  await writeAccountPreflightArtifact(
    preflight.artifact,
    dependencies.accountPreflightPath ?? DEFAULT_ACCOUNT_PREFLIGHT_PATH,
  );
  if (preflight.artifact.verdict !== "SIGNER_PREFLIGHT_VALID"
      || preflight.provingBlockId === undefined) {
    throw new AccountPreflightError(preflight.artifact);
  }
  console.log("SIGNER_PREFLIGHT_VALID");
  const provingBlockId = preflight.provingBlockId;
  const provider = dependencies.chainProvider
    ?? createShieldedMessageChainProvider(config.rpcUrl);
  await verifyShieldedMessageDeployment({ config, provider, provingBlockId });
  await verifyShieldedMessageRegisteredIdentity({
    config,
    provider,
    blockIdentifier: provingBlockId,
  });
  const recipientPublicKey = await verifyRegisteredViewingKey({
    provider,
    poolAddress: config.poolAddress,
    accountAddress: config.recipientAccountAddress,
    viewingKey: config.recipientViewingKey,
    blockIdentifier: provingBlockId,
    label: "VEIL PoC recipient identity",
  });
  const replayState = await discoverTwoPartyShieldedMessageReplayState({
    config,
    provider,
    provingBlockId,
    recipientPublicKey,
  });
  const prepared = await prepareTwoPartyShieldedMessage({
    config,
    recipientPublicKey,
    recipientChannelIndex: replayState.direction.recipientChannelIndex,
  });
  await verifyLocalShieldedMessageDecrypt({ prepared });
  if (!config.generateProof) {
    console.log(TWO_PARTY_IDENTITY_VALID);
    console.log(TWO_PARTY_DRY_RUN_VALID);
    console.log(LOCAL_DECRYPT_VERIFIED);
    return null;
  }
  const provingProvider = (dependencies.createProvingProvider
    ?? createOfficialProvingProvider)({
    proverUrl: config.proverUrl,
    rpcUrl: config.rpcUrl,
    poolAddress: config.poolAddress,
    provingBlockId,
  });
  const resourceEstimator = (dependencies.createResourceEstimator
    ?? createShieldedMessageResourceEstimator)(config.rpcUrl);
  const proofInput: ShieldedMessageProofExecutorInput = {
    config,
    signer,
    provingProvider,
    resourceEstimator,
    provingBlockId,
    prepared,
    provider,
    replayState,
  };
  if (config.resourceEstimateOnly) {
    await prepareOfficialTwoPartyShieldedMessageProof(proofInput);
    console.log(TWO_PARTY_IDENTITY_VALID);
    console.log("TWO_PARTY_SHIELDED_MESSAGE_RESOURCE_PREFLIGHT_VALID");
    return null;
  }
  let submissionAccount: ShieldedMessageSubmissionAccount | undefined;
  if (config.submitOnchain) {
    submissionAccount = (dependencies.createSubmissionAccount
      ?? createOfficialShieldedMessageSubmissionAccount)({
      rpcUrl: config.rpcUrl,
      accountAddress: config.identity.accountAddress,
      accountPrivateKey: config.identity.accountPrivateKey,
    });
  }
  const proofExecution = await (dependencies.proofExecutor
    ?? officialTwoPartyShieldedMessageProofExecutor).execute(proofInput);
  const { result } = proofExecution;
  let baseSummary = createShieldedMessageProofSummary({
    config,
    provingBlockId,
    prepared,
    result,
  });
  let summary = mapTwoPartySummary({
    config,
    provingBlockId,
    prepared,
    result,
    baseSummary,
  });
  console.log(TWO_PARTY_IDENTITY_VALID);
  console.log(TWO_PARTY_PROOF_RESULT);
  console.log("proof_present: true");
  if (config.submitOnchain) {
    if (!submissionAccount) {
      throw new Error("Two-party shielded-message submission account is missing.");
    }
    baseSummary = await submitShieldedMessage({
      config,
      provider,
      account: submissionAccount,
      provingProvider,
      provingBlockId,
      prepared,
      result,
    });
    const recipientVerification = await verifyRecipientShieldedMessageDecrypt({
      config,
      provider,
      prepared,
    });
    summary = mapTwoPartySummary({
      config,
      provingBlockId,
      prepared,
      result,
      baseSummary,
      recipientVerification,
    });
    console.log(TWO_PARTY_SUBMISSION_RESULT);
    console.log(summary.transactionHash);
    console.log(summary.finalityStatus);
    console.log(summary.executionStatus);
    console.log(MESSAGE_EVENT_FOUND);
    console.log(MESSAGE_STORAGE_VERIFIED);
    console.log(LOCAL_DECRYPT_VERIFIED);
    console.log(RECIPIENT_CHANNEL_RECOVERED);
    console.log(RECIPIENT_DECRYPT_VERIFIED);
    console.log(UNRELATED_VIEWING_KEY_REJECTED);
  }
  await writeTwoPartySummary(summary, config.twoPartySummaryPath, [
    ...sensitiveValues,
    result.callAndProof.proof.data,
  ]);
  return summary;
}

function isMainModule(): boolean {
  const invokedPath = process.argv[1];
  return invokedPath !== undefined
    && pathToFileURL(invokedPath).href === import.meta.url;
}

if (isMainModule()) {
  try {
    await runVeilOfficialTwoPartyShieldedMessagePoc();
  } catch (error) {
    if (error instanceof AccountPreflightError) {
      console.error(
        `VEIL two-party account preflight failed closed: ${error.artifact.verdict}`,
      );
    } else if (error instanceof ProvingServiceError) {
      console.error("VEIL two-party shielded-message proving failed closed.");
    } else {
      console.error("VEIL two-party shielded-message PoC failed closed.");
    }
    process.exitCode = 1;
  }
}
