import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  AddressMap,
  ProvingServiceError,
  createPrivateTransfers,
} from "@starkware-libs/starknet-privacy-sdk";
import type {
  Channel,
  DiscoveryProviderInterface,
  ExecuteResult,
  ProofProviderInterface,
  ProvingBlockId,
} from "@starkware-libs/starknet-privacy-sdk";
import {
  RpcProvider,
  constants,
  ec,
  hash,
} from "starknet";
import type { Call, SignerInterface } from "starknet";
import {
  TransactionExecutionStatus,
  TransactionFinalityStatus,
} from "starknet-proof";

import {
  buildCanonicalHelperPayload,
} from "../packages/veil-sdk/dist/privacy/canonical-payload.js";
import {
  decryptApplicationPayload,
  encryptApplicationPayload,
} from "../packages/veil-sdk/dist/privacy/application-encryption.js";
import type {
  VeilApplicationEncryptionContext,
  VeilApplicationCiphertext,
} from "../packages/veil-sdk/dist/privacy/application-encryption.js";
import {
  generateMessageLocator,
} from "../packages/veil-sdk/dist/privacy/message-locator.js";
import {
  computePrivacyPoolChannelKey,
} from "../packages/veil-sdk/dist/privacy_pool_ecdh.js";
import {
  AccountPreflightError,
  DEFAULT_ACCOUNT_PREFLIGHT_PATH,
  DEFAULT_POOL_ADDRESS,
  createAccountPreflightProvider,
  createOfficialProvingProvider,
  createOfficialRegisterSubmissionAccount,
  createStandardPocSigner,
  preflightVeilPocAccount,
  writeAccountPreflightArtifact,
} from "./veil-official-register-poc.ts";
import type {
  AccountPreflightProvider,
  RegisterSubmissionAccount,
} from "./veil-official-register-poc.ts";
import {
  collectVeilPocIdentitySensitiveValues,
  loadVeilPocIdentityConfig,
} from "./veil-poc-identity.ts";
import type { VeilPocIdentityConfig } from "./veil-poc-identity.ts";

export const SHIELDED_MESSAGE_IDENTITY_VALID =
  "SHIELDED_MESSAGE_IDENTITY_CONFIG_VALID";
export const SHIELDED_MESSAGE_DRY_RUN_VALID =
  "OFFICIAL_SDK_SHIELDED_MESSAGE_DRY_RUN_VALID";
export const SHIELDED_MESSAGE_PROOF_RESULT =
  "OFFICIAL_SDK_SHIELDED_MESSAGE_PROOF_GENERATED";
export const SHIELDED_MESSAGE_SUBMISSION_RESULT =
  "OFFICIAL_SDK_SHIELDED_MESSAGE_SUBMITTED_ONCHAIN";
export const MESSAGE_EVENT_FOUND = "MESSAGE_EVENT_FOUND";
export const MESSAGE_STORAGE_VERIFIED = "MESSAGE_STORAGE_VERIFIED";
export const LOCAL_DECRYPT_VERIFIED = "LOCAL_DECRYPT_VERIFIED";

export const SEPOLIA_HELPER_ADDRESS =
  "0x69ba6f9f8651ef29d3227114c0b839d76671b8f66620840933f76996cec1359";
export const SEPOLIA_HELPER_CLASS_HASH =
  "0x2a7b116fd1e7954b019fe02d91fdfb67166a80597bd6f7699bf07374032ee37";
export const DEFAULT_SHIELDED_MESSAGE_SUMMARY_PATH =
  "veil-shielded-message-summary.json";

const INTERNAL_PLAINTEXT = "VEIL_PRIVATE_MESSAGE_POC_V1";
const MESSAGE_CHANNEL_ID = "VEIL_OFFICIAL_SHIELDED_MESSAGE_POC_V1";
const MESSAGE_EVENT_SELECTOR = hash.getSelectorFromName("MessageCommitted");

export interface VeilShieldedMessagePocConfig {
  identity: VeilPocIdentityConfig;
  rpcUrl: string;
  proverUrl: string;
  poolAddress: bigint;
  helperAddress: bigint;
  helperClassHash: bigint;
  generateProof: boolean;
  submitOnchain: boolean;
  summaryPath: string;
}

export interface ShieldedMessageIdentityContext {
  accountAddress: bigint;
  accountPrivateKey: string;
  viewingKey: bigint;
  encryptionViewingKey: bigint;
  decryptionViewingKey: bigint;
}

export interface ShieldedMessageChainProvider {
  getClassHashAt(
    contractAddress: string,
    blockIdentifier?: ProvingBlockId,
  ): Promise<string>;
  callContract(call: Call, blockIdentifier?: ProvingBlockId): Promise<string[]>;
  getTransactionReceipt(transactionHash: string): Promise<unknown>;
}

export interface ShieldedMessageIdentityProvider {
  callContract(call: Call, blockIdentifier?: ProvingBlockId): Promise<string[]>;
}

export interface PreparedShieldedMessage {
  messageLocator: string;
  payloadCommitment: string;
  ciphertextChunks: readonly string[];
  helperCalldata: readonly string[];
  applicationEnvelope: VeilApplicationCiphertext;
  applicationContext: VeilApplicationEncryptionContext;
  sharedSecret: Uint8Array;
}

export interface ShieldedMessageProofExecutorInput {
  config: VeilShieldedMessagePocConfig;
  signer: SignerInterface;
  provingProvider: ProofProviderInterface;
  provingBlockId: number;
  prepared: PreparedShieldedMessage;
  provider: ShieldedMessageChainProvider;
}

export interface ShieldedMessageProofExecutor {
  execute(input: ShieldedMessageProofExecutorInput): Promise<ExecuteResult>;
}

export interface VeilShieldedMessageSummary {
  result: string;
  network: "SN_SEPOLIA";
  helperAddress: string;
  privacyPoolAddress: string;
  accountAddress: string;
  provingBlockId: string;
  transactionHash: string | null;
  finalityStatus: string;
  executionStatus: string;
  messageLocator: string;
  payloadCommitment: string;
  ciphertextChunkCount: number;
  proofPresent: boolean;
  proofFactsCount: number;
  messageEventFound: boolean;
  storageVerified: boolean;
  localDecryptVerified: boolean;
}

export interface VeilShieldedMessagePocDependencies {
  accountPreflightProvider?: AccountPreflightProvider;
  chainProvider?: ShieldedMessageChainProvider;
  proofExecutor?: ShieldedMessageProofExecutor;
  createProvingProvider?: typeof createOfficialProvingProvider;
  createSubmissionAccount?: (config: {
    rpcUrl: string;
    accountAddress: bigint;
    accountPrivateKey: string;
  }) => RegisterSubmissionAccount;
  accountPreflightPath?: string;
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parseBooleanEnv(value: string | undefined, label: string): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${label} must be true or false.`);
}

function parsePositiveFelt(value: string, label: string): bigint {
  let parsed: bigint;
  try {
    parsed = BigInt(value.trim());
  } catch (cause) {
    throw new Error(`${label} must be a Starknet felt.`, { cause });
  }
  if (parsed <= 0n || parsed >= (1n << 251n)) {
    throw new Error(`${label} must be a nonzero Starknet felt.`);
  }
  return parsed;
}

function feltHex(value: bigint | string): string {
  return `0x${BigInt(value).toString(16)}`;
}

function sameFelt(left: bigint | string, right: bigint | string): boolean {
  return BigInt(left) === BigInt(right);
}

function sameFeltArray(
  left: readonly (bigint | string)[],
  right: readonly (bigint | string)[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => sameFelt(value, right[index]!));
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

export function loadVeilShieldedMessagePocConfig(
  env: NodeJS.ProcessEnv = process.env,
): VeilShieldedMessagePocConfig {
  const generateProof = parseBooleanEnv(
    env.VEIL_POC_GENERATE_PROOF,
    "VEIL_POC_GENERATE_PROOF",
  );
  const submitOnchain = parseBooleanEnv(
    env.VEIL_POC_SUBMIT_ONCHAIN,
    "VEIL_POC_SUBMIT_ONCHAIN",
  );
  if (submitOnchain && !generateProof) {
    throw new Error("submit_onchain=true requires generate_proof=true.");
  }
  return Object.freeze({
    identity: loadVeilPocIdentityConfig(env),
    rpcUrl: requiredEnv(env, "STARKNET_SEPOLIA_RPC_URL"),
    proverUrl: generateProof
      ? requiredEnv(env, "VEIL_POC_PROVER_URL")
      : (env.VEIL_POC_PROVER_URL?.trim() || "http://127.0.0.1:3000"),
    poolAddress: parsePositiveFelt(
      env.VEIL_POC_PRIVACY_POOL?.trim() || DEFAULT_POOL_ADDRESS,
      "VEIL_POC_PRIVACY_POOL",
    ),
    helperAddress: parsePositiveFelt(
      env.VEIL_POC_HELPER_ADDRESS?.trim() || SEPOLIA_HELPER_ADDRESS,
      "VEIL_POC_HELPER_ADDRESS",
    ),
    helperClassHash: parsePositiveFelt(
      env.VEIL_POC_HELPER_CLASS_HASH?.trim() || SEPOLIA_HELPER_CLASS_HASH,
      "VEIL_POC_HELPER_CLASS_HASH",
    ),
    generateProof,
    submitOnchain,
    summaryPath: env.VEIL_POC_SHIELDED_MESSAGE_SUMMARY_PATH?.trim()
      || DEFAULT_SHIELDED_MESSAGE_SUMMARY_PATH,
  });
}

export function createShieldedMessageIdentityContext(
  config: VeilShieldedMessagePocConfig,
): ShieldedMessageIdentityContext {
  const { accountAddress, accountPrivateKey, viewingKey } = config.identity;
  return Object.freeze({
    accountAddress,
    accountPrivateKey,
    viewingKey,
    encryptionViewingKey: viewingKey,
    decryptionViewingKey: viewingKey,
  });
}

export function createShieldedMessageChainProvider(
  rpcUrl: string,
): ShieldedMessageChainProvider {
  return new RpcProvider({ nodeUrl: rpcUrl }) as unknown as ShieldedMessageChainProvider;
}

export function createShieldedMessageIdentityProvider(
  rpcUrl: string,
): ShieldedMessageIdentityProvider {
  return createShieldedMessageChainProvider(rpcUrl);
}

export async function verifyShieldedMessageRegisteredIdentity(input: {
  config: VeilShieldedMessagePocConfig;
  provider: ShieldedMessageIdentityProvider;
  blockIdentifier?: ProvingBlockId;
}): Promise<void> {
  const context = createShieldedMessageIdentityContext(input.config);
  const response = await input.provider.callContract({
    contractAddress: feltHex(input.config.poolAddress),
    entrypoint: "get_public_key",
    calldata: [feltHex(context.accountAddress)],
  }, input.blockIdentifier);
  if (response.length !== 1 || BigInt(response[0]!) === 0n) {
    throw new Error("VEIL PoC identity is not registered in the Privacy Pool.");
  }
  const expectedPublicKey = BigInt(ec.starkCurve.getStarkKey(
    feltHex(context.viewingKey),
  ));
  if (BigInt(response[0]!) !== expectedPublicKey) {
    throw new Error("VEIL PoC identity is not registered with the configured viewing key.");
  }
}

export async function verifyShieldedMessageDeployment(input: {
  config: VeilShieldedMessagePocConfig;
  provider: ShieldedMessageChainProvider;
  provingBlockId: number;
}): Promise<void> {
  const helperAddress = feltHex(input.config.helperAddress);
  const actualClassHash = await input.provider.getClassHashAt(
    helperAddress,
    input.provingBlockId,
  );
  if (!sameFelt(actualClassHash, input.config.helperClassHash)) {
    throw new Error("VeilChannelHelper deployed class hash mismatch.");
  }
  const poolResponse = await input.provider.callContract({
    contractAddress: helperAddress,
    entrypoint: "get_privacy_pool",
    calldata: [],
  }, input.provingBlockId);
  if (poolResponse.length !== 1
      || !sameFelt(poolResponse[0]!, input.config.poolAddress)) {
    throw new Error("VeilChannelHelper Privacy Pool address mismatch.");
  }
}

export async function prepareShieldedMessage(input: {
  config: VeilShieldedMessagePocConfig;
  plaintext?: string;
}): Promise<PreparedShieldedMessage> {
  const plaintext = input.plaintext ?? INTERNAL_PLAINTEXT;
  const context = createShieldedMessageIdentityContext(input.config);
  const recipientPublicKey = ec.starkCurve.getStarkKey(feltHex(context.viewingKey));
  const channelKey = computePrivacyPoolChannelKey({
    senderAddress: context.accountAddress,
    senderPrivateKey: context.viewingKey,
    recipientAddress: context.accountAddress,
    recipientPublicKey,
  });
  const sharedSecret = bigintToFixedBytes(BigInt(channelKey), 32);
  const applicationContext = {
    chainId: constants.StarknetChainId.SN_SEPOLIA,
    poolAddress: feltHex(input.config.poolAddress),
    roomId: MESSAGE_CHANNEL_ID,
    senderId: feltHex(context.accountAddress),
    recipientId: feltHex(context.accountAddress),
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
  const serializedCalldata = JSON.stringify(payload.calldata);
  if (serializedCalldata.includes(plaintext)) {
    throw new Error("Plaintext appeared in helper calldata.");
  }
  return Object.freeze({
    messageLocator: payload.messageLocator,
    payloadCommitment: payload.payloadCommitment,
    ciphertextChunks: payload.payloadChunks,
    helperCalldata: payload.calldata,
    applicationEnvelope,
    applicationContext,
    sharedSecret,
  });
}

class SelfChannelDiscoveryProvider implements DiscoveryProviderInterface {
  readonly #provider: ShieldedMessageChainProvider;
  readonly #poolAddress: string;
  readonly #accountAddress: bigint;
  readonly #viewingKey: bigint;
  readonly #provingBlockId: number;

  constructor(input: {
    provider: ShieldedMessageChainProvider;
    poolAddress: bigint;
    accountAddress: bigint;
    viewingKey: bigint;
    provingBlockId: number;
  }) {
    this.#provider = input.provider;
    this.#poolAddress = feltHex(input.poolAddress);
    this.#accountAddress = input.accountAddress;
    this.#viewingKey = input.viewingKey;
    this.#provingBlockId = input.provingBlockId;
  }

  async discoverNotes(
    ..._args: Parameters<DiscoveryProviderInterface["discoverNotes"]>
  ): ReturnType<DiscoveryProviderInterface["discoverNotes"]> {
    throw new Error("Shielded-message PoC must not discover notes.");
  }

  async discoverRequirement(
    ..._args: Parameters<DiscoveryProviderInterface["discoverRequirement"]>
  ): ReturnType<DiscoveryProviderInterface["discoverRequirement"]> {
    throw new Error("Shielded-message PoC must not discover setup requirements.");
  }

  async discoverChannels(
    address: bigint,
    viewingKey: bigint,
    recipients: Parameters<DiscoveryProviderInterface["discoverChannels"]>[2],
    params?: Parameters<DiscoveryProviderInterface["discoverChannels"]>[3],
  ): ReturnType<DiscoveryProviderInterface["discoverChannels"]> {
    if (address !== this.#accountAddress || viewingKey !== this.#viewingKey) {
      throw new Error("Shielded-message discovery identity mismatch.");
    }
    if (params?.blockIdentifier !== undefined
        && Number(params.blockIdentifier) !== this.#provingBlockId) {
      throw new Error("Shielded-message discovery block mismatch.");
    }
    const countResponse = await this.#provider.callContract({
      contractAddress: this.#poolAddress,
      entrypoint: "get_num_of_channels",
      calldata: [feltHex(this.#accountAddress)],
    }, this.#provingBlockId);
    if (countResponse.length !== 1) {
      throw new Error("Privacy Pool returned an invalid channel count.");
    }
    const total = Number(BigInt(countResponse[0]!));
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new Error("Privacy Pool returned an unsafe channel count.");
    }
    if (recipients === "total-only") {
      return { timestamp: this.#provingBlockId, total };
    }
    if (recipients === "all" || recipients.length !== 1
        || recipients[0] !== this.#accountAddress) {
      throw new Error("Shielded-message PoC supports only self-recipient discovery.");
    }
    const keyResponse = await this.#provider.callContract({
      contractAddress: this.#poolAddress,
      entrypoint: "get_public_key",
      calldata: [feltHex(this.#accountAddress)],
    }, this.#provingBlockId);
    if (keyResponse.length !== 1 || BigInt(keyResponse[0]!) === 0n) {
      throw new Error("Privacy Pool returned no self-recipient public key.");
    }
    const channels = new AddressMap<Channel>();
    channels.set(this.#accountAddress, {
      publicKey: BigInt(keyResponse[0]!),
      key: undefined,
      tokens: new AddressMap(),
    } as unknown as Channel);
    return { timestamp: this.#provingBlockId, channels, total };
  }
}

export const officialShieldedMessageProofExecutor: ShieldedMessageProofExecutor = {
  async execute(input) {
    const context = createShieldedMessageIdentityContext(input.config);
    const discoveryProvider = new SelfChannelDiscoveryProvider({
      provider: input.provider,
      poolAddress: input.config.poolAddress,
      accountAddress: context.accountAddress,
      viewingKey: context.viewingKey,
      provingBlockId: input.provingBlockId,
    });
    const transfers = createPrivateTransfers({
      account: { address: context.accountAddress, signer: input.signer },
      viewingKeyProvider: {
        async getViewingKey() {
          return context.viewingKey;
        },
      },
      provingProvider: input.provingProvider,
      discoveryProvider,
      poolContractAddress: input.config.poolAddress,
      poolMode: "compatibility",
    });
    return transfers
      .build()
      .setup(context.accountAddress)
      .invoke(() => ({
        contractAddress: feltHex(input.config.helperAddress),
        calldata: [...input.prepared.helperCalldata],
      }))
      .execute({ provingBlockId: input.provingBlockId });
  },
};

export function createShieldedMessageProofSummary(input: {
  config: VeilShieldedMessagePocConfig;
  provingBlockId: number;
  prepared: PreparedShieldedMessage;
  result: ExecuteResult;
}): VeilShieldedMessageSummary {
  const { proof } = input.result.callAndProof;
  const proofPresent = typeof proof.data === "string" && proof.data.length > 0;
  const proofFactsCount = Array.isArray(proof.proofFacts)
    ? proof.proofFacts.length
    : 0;
  if (!proofPresent) {
    throw new Error("Official shielded-message proof is missing.");
  }
  return {
    result: SHIELDED_MESSAGE_PROOF_RESULT,
    network: "SN_SEPOLIA",
    helperAddress: feltHex(input.config.helperAddress),
    privacyPoolAddress: feltHex(input.config.poolAddress),
    accountAddress: feltHex(input.config.identity.accountAddress),
    provingBlockId: String(input.provingBlockId),
    transactionHash: null,
    finalityStatus: "NOT_SUBMITTED",
    executionStatus: "NOT_SUBMITTED",
    messageLocator: input.prepared.messageLocator,
    payloadCommitment: input.prepared.payloadCommitment,
    ciphertextChunkCount: input.prepared.ciphertextChunks.length,
    proofPresent,
    proofFactsCount,
    messageEventFound: false,
    storageVerified: false,
    localDecryptVerified: true,
  };
}

function receiptRecord(receipt: unknown): Record<string, unknown> {
  if (typeof receipt !== "object" || receipt === null) {
    throw new Error("Shielded-message receipt is invalid.");
  }
  return receipt as Record<string, unknown>;
}

export function assertMessageCommittedEvent(input: {
  receipt: unknown;
  helperAddress: bigint;
  messageLocator: string;
  payloadCommitment: string;
}): void {
  const events = receiptRecord(input.receipt).events;
  if (!Array.isArray(events)) {
    throw new Error("Shielded-message receipt contains no events.");
  }
  const found = events.some((event) => {
    if (typeof event !== "object" || event === null) return false;
    const record = event as Record<string, unknown>;
    const keys = Array.isArray(record.keys) ? record.keys : [];
    const data = Array.isArray(record.data) ? record.data : [];
    try {
      return sameFelt(String(record.from_address ?? "0"), input.helperAddress)
        && keys.length >= 2
        && sameFelt(String(keys[0]), MESSAGE_EVENT_SELECTOR)
        && sameFelt(String(keys[1]), input.messageLocator)
        && data.length >= 1
        && sameFelt(String(data[0]), input.payloadCommitment);
    } catch {
      return false;
    }
  });
  if (!found) throw new Error("MessageCommitted event was not found.");
}

export async function verifyShieldedMessageStorage(input: {
  provider: ShieldedMessageChainProvider;
  helperAddress: bigint;
  prepared: PreparedShieldedMessage;
  blockIdentifier?: ProvingBlockId;
}): Promise<void> {
  const contractAddress = feltHex(input.helperAddress);
  const exists = await input.provider.callContract({
    contractAddress,
    entrypoint: "message_exists",
    calldata: [input.prepared.messageLocator],
  }, input.blockIdentifier);
  if (exists.length !== 1 || BigInt(exists[0]!) === 0n) {
    throw new Error("Shielded message locator was not stored.");
  }
  const record = await input.provider.callContract({
    contractAddress,
    entrypoint: "get_message",
    calldata: [input.prepared.messageLocator],
  }, input.blockIdentifier);
  if (record.length < 4
      || !sameFeltArray(record.slice(0, 4), input.prepared.helperCalldata.slice(0, 4))) {
    throw new Error("Stored shielded-message record mismatch.");
  }
  const chunks: string[] = [];
  for (let index = 0; index < input.prepared.ciphertextChunks.length; index += 1) {
    const response = await input.provider.callContract({
      contractAddress,
      entrypoint: "get_payload_chunk",
      calldata: [input.prepared.messageLocator, String(index)],
    }, input.blockIdentifier);
    if (response.length !== 1) {
      throw new Error("Stored shielded-message chunk is missing.");
    }
    chunks.push(response[0]!);
  }
  if (!sameFeltArray(chunks, input.prepared.ciphertextChunks)) {
    throw new Error("Stored shielded-message ciphertext chunk mismatch.");
  }
}

export async function verifyLocalShieldedMessageDecrypt(input: {
  prepared: PreparedShieldedMessage;
  plaintext?: string;
}): Promise<void> {
  const plaintext = input.plaintext ?? INTERNAL_PLAINTEXT;
  const decrypted = await decryptApplicationPayload({
    domain: "VEIL_MESSAGE_KEY_V1",
    context: input.prepared.applicationContext,
    sharedSecret: input.prepared.sharedSecret,
    envelope: input.prepared.applicationEnvelope,
  });
  if (new TextDecoder().decode(decrypted) !== plaintext) {
    throw new Error("Local shielded-message decrypt mismatch.");
  }
}

export function assertShieldedMessageSummarySafe(
  summary: VeilShieldedMessageSummary,
  sensitiveValues: readonly string[] = [],
): void {
  const expectedKeys = [
    "result",
    "network",
    "helperAddress",
    "privacyPoolAddress",
    "accountAddress",
    "provingBlockId",
    "transactionHash",
    "finalityStatus",
    "executionStatus",
    "messageLocator",
    "payloadCommitment",
    "ciphertextChunkCount",
    "proofPresent",
    "proofFactsCount",
    "messageEventFound",
    "storageVerified",
    "localDecryptVerified",
  ];
  const actualKeys = Object.keys(summary);
  if (actualKeys.length !== expectedKeys.length
      || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error("Shielded-message summary contains an unexpected field.");
  }
  const forbiddenKeys = [
    "plaintext",
    "ciphertext",
    "privateKey",
    "viewingKey",
    "encryptionKey",
    "signature",
    "proof",
    "proofFacts",
    "calldata",
    "rpcUrl",
    "secret",
  ];
  if (forbiddenKeys.some((key) => Object.hasOwn(summary, key))) {
    throw new Error("Shielded-message summary contains a forbidden field.");
  }
  const serialized = JSON.stringify(summary);
  if (serialized.includes(INTERNAL_PLAINTEXT)
      || sensitiveValues.some((value) => value && serialized.includes(value))) {
    throw new Error("Shielded-message summary contains sensitive material.");
  }
}

async function writeShieldedMessageSummary(
  summary: VeilShieldedMessageSummary,
  path: string,
  sensitiveValues: readonly string[],
): Promise<void> {
  assertShieldedMessageSummarySafe(summary, sensitiveValues);
  await writeFile(path, `${JSON.stringify(summary, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function invalidateProofNonceCache(provingProvider: ProofProviderInterface): void {
  try {
    provingProvider.invalidateNonceCache?.();
  } catch {
    // Preserve the original submission failure.
  }
}

export async function submitShieldedMessage(input: {
  config: VeilShieldedMessagePocConfig;
  provider: ShieldedMessageChainProvider;
  account: RegisterSubmissionAccount;
  provingProvider: ProofProviderInterface;
  provingBlockId: number;
  prepared: PreparedShieldedMessage;
  result: ExecuteResult;
}): Promise<VeilShieldedMessageSummary> {
  const proofSummary = createShieldedMessageProofSummary(input);
  const { call, proof } = input.result.callAndProof;
  const proofFacts = Array.isArray(proof.proofFacts) ? proof.proofFacts : [];
  const executionDetails = {
    tip: 0n,
    ...(proofFacts.length > 0
      ? { proof: proof.data, proofFacts }
      : {}),
  };
  try {
    const transaction = await input.account.execute(call as never, executionDetails);
    if (!transaction.transaction_hash) {
      throw new Error("Shielded-message submission returned no transaction hash.");
    }
    const waited = await input.account.waitForTransaction(
      transaction.transaction_hash,
      {
        successStates: [TransactionFinalityStatus.ACCEPTED_ON_L2],
        errorStates: [TransactionExecutionStatus.REVERTED],
      },
    );
    if (waited.isReverted()
        || !waited.isSuccess()
        || waited.finality_status !== TransactionFinalityStatus.ACCEPTED_ON_L2
        || waited.execution_status !== TransactionExecutionStatus.SUCCEEDED) {
      throw new Error("Shielded-message transaction was not accepted and successful on L2.");
    }
    const receipt = await input.provider.getTransactionReceipt(
      transaction.transaction_hash,
    );
    assertMessageCommittedEvent({
      receipt,
      helperAddress: input.config.helperAddress,
      messageLocator: input.prepared.messageLocator,
      payloadCommitment: input.prepared.payloadCommitment,
    });
    const receiptBlock = receiptRecord(receipt).block_number;
    const verificationBlock = typeof receiptBlock === "number"
      ? receiptBlock
      : undefined;
    await verifyShieldedMessageStorage({
      provider: input.provider,
      helperAddress: input.config.helperAddress,
      prepared: input.prepared,
      ...(verificationBlock === undefined
        ? {}
        : { blockIdentifier: verificationBlock }),
    });
    await verifyLocalShieldedMessageDecrypt({ prepared: input.prepared });
    return {
      ...proofSummary,
      result: SHIELDED_MESSAGE_SUBMISSION_RESULT,
      transactionHash: transaction.transaction_hash,
      finalityStatus: waited.finality_status,
      executionStatus: waited.execution_status,
      messageEventFound: true,
      storageVerified: true,
      localDecryptVerified: true,
    };
  } catch (error) {
    invalidateProofNonceCache(input.provingProvider);
    throw error;
  }
}

export async function runVeilOfficialShieldedMessagePoc(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: VeilShieldedMessagePocDependencies = {},
): Promise<VeilShieldedMessageSummary | null> {
  const config = loadVeilShieldedMessagePocConfig(env);
  const sensitiveValues = [
    ...collectVeilPocIdentitySensitiveValues(env, config.identity),
    INTERNAL_PLAINTEXT,
  ];
  const signer = createStandardPocSigner(config.identity.accountPrivateKey);
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
  const prepared = await prepareShieldedMessage({ config });
  await verifyLocalShieldedMessageDecrypt({ prepared });
  if (!config.generateProof) {
    console.log(SHIELDED_MESSAGE_IDENTITY_VALID);
    console.log(SHIELDED_MESSAGE_DRY_RUN_VALID);
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
  const result = await (dependencies.proofExecutor
    ?? officialShieldedMessageProofExecutor).execute({
    config,
    signer,
    provingProvider,
    provingBlockId,
    prepared,
    provider,
  });
  let summary = createShieldedMessageProofSummary({
    config,
    provingBlockId,
    prepared,
    result,
  });
  console.log(SHIELDED_MESSAGE_IDENTITY_VALID);
  console.log(SHIELDED_MESSAGE_PROOF_RESULT);
  console.log("proof_present: true");
  if (config.submitOnchain) {
    const account = (dependencies.createSubmissionAccount
      ?? createOfficialRegisterSubmissionAccount)({
      rpcUrl: config.rpcUrl,
      accountAddress: config.identity.accountAddress,
      accountPrivateKey: config.identity.accountPrivateKey,
    });
    summary = await submitShieldedMessage({
      config,
      provider,
      account,
      provingProvider,
      provingBlockId,
      prepared,
      result,
    });
    console.log(SHIELDED_MESSAGE_SUBMISSION_RESULT);
    console.log(summary.transactionHash);
    console.log(summary.finalityStatus);
    console.log(summary.executionStatus);
    console.log(MESSAGE_EVENT_FOUND);
    console.log(MESSAGE_STORAGE_VERIFIED);
    console.log(LOCAL_DECRYPT_VERIFIED);
  }
  await writeShieldedMessageSummary(summary, config.summaryPath, [
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
    await runVeilOfficialShieldedMessagePoc();
  } catch (error) {
    if (error instanceof AccountPreflightError) {
      console.error(`VEIL account preflight failed closed: ${error.artifact.verdict}`);
    } else if (error instanceof ProvingServiceError) {
      console.error("VEIL shielded-message proving failed closed.");
    } else {
      console.error("VEIL shielded-message PoC failed closed.");
    }
    process.exitCode = 1;
  }
}
