import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  ProvingServiceError,
  createPrivateTransfers,
} from "@starkware-libs/starknet-privacy-sdk";
import type {
  ExecuteResult,
  PrivateRegistry,
  PrivateTransfersBuilder,
  ProofInvocation,
  ProofInvocationFactoryDetails,
  ProofProviderInterface,
} from "@starkware-libs/starknet-privacy-sdk";
import {
  TransactionExecutionStatus,
  TransactionFinalityStatus,
} from "starknet-proof";

import {
  LOCAL_DECRYPT_VERIFIED,
  MESSAGE_EVENT_FOUND,
  MESSAGE_STORAGE_VERIFIED,
  createOfficialShieldedMessageSubmissionAccount,
  createShieldedMessageChainProvider,
  createShieldedMessageProofSummary,
  createShieldedMessageProvingResourceBounds,
  createShieldedMessageResourceEstimator,
  submitShieldedMessage,
  verifyLocalShieldedMessageDecrypt,
  verifyShieldedMessageDeployment,
} from "./veil-official-shielded-message-poc.ts";
import type {
  PreparedShieldedMessage,
  ProofResourceBounds,
  ShieldedMessageChainProvider,
  ShieldedMessageProofExecutorInput,
  ShieldedMessageResourceEstimator,
  ShieldedMessageSubmissionAccount,
} from "./veil-official-shielded-message-poc.ts";
import {
  RECIPIENT_CHANNEL_RECOVERED,
  RECIPIENT_DECRYPT_VERIFIED,
  TWO_PARTY_DRY_RUN_VALID,
  TWO_PARTY_IDENTITY_VALID,
  TWO_PARTY_PROOF_RESULT,
  TWO_PARTY_SUBMISSION_RESULT,
  UNRELATED_VIEWING_KEY_REJECTED,
  assertTwoPartyShieldedMessageSummarySafe,
  loadVeilTwoPartyShieldedMessagePocConfig,
  prepareTwoPartyShieldedMessage,
  verifyRecipientShieldedMessageDecrypt,
  verifyRegisteredViewingKey,
} from "./veil-official-two-party-shielded-message-poc.ts";
import type {
  PreparedTwoPartyShieldedMessage,
  RecipientDecryptVerification,
  VeilTwoPartyShieldedMessagePocConfig,
  VeilTwoPartyShieldedMessageSummary,
} from "./veil-official-two-party-shielded-message-poc.ts";
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
import type {
  VeilDirectionChannelState,
  VeilReplayAnchorState,
} from "./veil-replay-anchor.ts";

export const REPLAY_CHANNEL_REUSED = "TWO_PARTY_CHANNEL_REUSED";
export const REPLAY_CHANNEL_OPENED = "TWO_PARTY_CHANNEL_OPENED";
export const REPLAY_ANCHOR_BOOTSTRAPPED = "REPLAY_ANCHOR_BOOTSTRAPPED";
export const REPLAY_ANCHOR_ROTATED = "REPLAY_ANCHOR_ROTATED";
export const REPLAY_ALLOWANCE_READY = "REPLAY_ANCHOR_ALLOWANCE_READY";
export const REPLAY_STATE_PINNED = "REPLAY_STATE_PINNED_TO_PROVING_BLOCK";
export const REPLAY_SUMMARY_PATH =
  "veil-two-party-shielded-repeat-summary.json";

interface RepeatBuildState {
  direction: VeilDirectionChannelState;
  anchor: VeilReplayAnchorState;
  registry: PrivateRegistry;
  outgoingChannelCount: number;
  senderPublicKey: bigint;
  recipientPublicKey: bigint;
}

function feltHex(value: bigint | string): string {
  return `0x${BigInt(value).toString(16)}`;
}

function asPreparedTwoParty(
  prepared: PreparedShieldedMessage,
): PreparedTwoPartyShieldedMessage {
  return prepared as PreparedTwoPartyShieldedMessage;
}

function sameOptionalFelt(
  left: bigint | string | undefined,
  right: bigint | string | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return BigInt(left) === BigInt(right);
}

function assertPinnedReplayState(input: {
  provingDirection: VeilDirectionChannelState;
  latestDirection: VeilDirectionChannelState;
  provingAnchor: VeilReplayAnchorState;
  latestAnchor: VeilReplayAnchorState;
  provingOutgoingChannelCount: number;
  latestOutgoingChannelCount: number;
}): void {
  if (input.provingDirection.exists !== input.latestDirection.exists
      || input.provingDirection.recipientChannelIndex
        !== input.latestDirection.recipientChannelIndex
      || input.provingDirection.channelKey !== input.latestDirection.channelKey
      || input.provingDirection.channelMarker !== input.latestDirection.channelMarker) {
    throw new Error(
      "Existing sender-recipient channel is not yet stable at the proving block; wait for more Sepolia blocks.",
    );
  }
  if (input.provingAnchor.selfChannelExists
        !== input.latestAnchor.selfChannelExists
      || input.provingAnchor.tokenSubchannelExists
        !== input.latestAnchor.tokenSubchannelExists
      || input.provingAnchor.tokenIndex !== input.latestAnchor.tokenIndex
      || input.provingAnchor.nextNoteNonce !== input.latestAnchor.nextNoteNonce
      || !sameOptionalFelt(
        input.provingAnchor.anchorNote?.id,
        input.latestAnchor.anchorNote?.id,
      )) {
    throw new Error(
      "Replay-anchor state is newer than the proving block; wait for more Sepolia blocks before the next message.",
    );
  }
  if (input.provingOutgoingChannelCount !== input.latestOutgoingChannelCount) {
    throw new Error(
      "Outgoing-channel count is newer than the proving block; wait for more Sepolia blocks.",
    );
  }
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
      throw new Error("Final replay-message proving resource bounds are inconsistent.");
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

function createRepeatTransfers(input: {
  proofInput: ShieldedMessageProofExecutorInput;
  provingProvider: ProofProviderInterface;
  state: RepeatBuildState;
}) {
  const config = input.proofInput.config as VeilTwoPartyShieldedMessagePocConfig;
  const prepared = asPreparedTwoParty(input.proofInput.prepared);
  const discoveryProvider = new VeilReplaySnapshotDiscoveryProvider({
    senderAddress: config.identity.accountAddress,
    senderViewingKey: config.identity.viewingKey,
    senderPublicKey: input.state.senderPublicKey,
    recipientAddress: config.recipientAccountAddress,
    recipientPublicKey: input.state.recipientPublicKey,
    direction: input.state.direction,
    anchor: input.state.anchor,
    registry: input.state.registry,
    outgoingChannelCount: input.state.outgoingChannelCount,
    blockIdentifier: input.proofInput.provingBlockId,
  });
  const transfers = createPrivateTransfers({
    account: {
      address: config.identity.accountAddress,
      signer: input.proofInput.signer,
    },
    viewingKeyProvider: {
      async getViewingKey() {
        return config.identity.viewingKey;
      },
    },
    provingProvider: input.provingProvider,
    discoveryProvider,
    poolContractAddress: config.poolAddress,
    poolMode: "compatibility",
  });
  let builder: PrivateTransfersBuilder = transfers.build({
    registry: input.state.registry,
    registryConst: true,
  });
  if (!input.state.direction.exists) {
    builder = builder.setup(config.recipientAccountAddress);
  }
  if (input.state.anchor.anchorNote) {
    builder = builder
      .with(VEIL_REPLAY_TOKEN_ADDRESS)
      .inputs(input.state.anchor.anchorNote)
      .transfer({
        recipient: config.identity.accountAddress,
        amount: input.state.anchor.anchorNote.amount,
      })
      .done();
  } else {
    if (!input.state.anchor.selfChannelExists) {
      builder = builder.setup(config.identity.accountAddress);
    }
    const tokenBuilder = builder.with(VEIL_REPLAY_TOKEN_ADDRESS);
    if (!input.state.anchor.tokenSubchannelExists) {
      tokenBuilder.setup(config.identity.accountAddress);
    }
    builder = tokenBuilder
      .deposit({ amount: VEIL_REPLAY_ANCHOR_AMOUNT })
      .surplusTo(config.identity.accountAddress, false)
      .done();
  }
  builder = builder.invoke(() => ({
    contractAddress: feltHex(config.helperAddress),
    calldata: [
      String(prepared.helperCalldata.length),
      ...prepared.helperCalldata,
    ],
  }));
  return { transfers, builder };
}

async function prepareRepeatProof(input: {
  proofInput: ShieldedMessageProofExecutorInput;
  state: RepeatBuildState;
}) {
  input.proofInput.provingProvider.invalidateNonceCache?.();
  const baseDetails = await input.proofInput.provingProvider.getDefaultDetails();
  if (baseDetails.nonce === undefined) {
    throw new Error("Official proving provider returned no current pool nonce.");
  }
  if (!baseDetails.resourceBounds) {
    throw new Error("Official proving provider returned no default bounds.");
  }
  const preliminaryProvider = createPinnedProofProvider(
    input.proofInput.provingProvider,
    baseDetails,
  );
  const preliminary = createRepeatTransfers({
    proofInput: input.proofInput,
    provingProvider: preliminaryProvider,
    state: input.state,
  });
  const preliminaryInvocation = await preliminary.builder.createProofInvocation();
  const rawEstimate = await input.proofInput.resourceEstimator.estimateInvokeV3(
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
    input.proofInput.provingProvider,
    finalDetails,
  );
  const finalTransfer = createRepeatTransfers({
    proofInput: input.proofInput,
    provingProvider: finalProvider,
    state: input.state,
  });
  const finalInvocation = await finalTransfer.builder.createProofInvocation();
  assertInvocationResourceBounds(
    finalInvocation.invocation,
    provingResourceBounds,
  );
  console.log("TWO_PARTY_REPEAT_RESOURCE_ESTIMATE_VALID");
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

async function executeRepeatProof(input: {
  proofInput: ShieldedMessageProofExecutorInput;
  state: RepeatBuildState;
}): Promise<ExecuteResult> {
  const {
    finalInvocation,
    finalTransfer,
    provingResourceBounds,
  } = await prepareRepeatProof(input);
  const before = resourceBoundsFingerprint(provingResourceBounds);
  const result = await finalTransfer.transfers.executeWithInvocation(
    finalInvocation,
    input.proofInput.provingBlockId,
  );
  if (before !== resourceBoundsFingerprint(provingResourceBounds)) {
    throw new Error("Replay-message resource bounds changed after proof generation.");
  }
  assertInvocationResourceBounds(finalInvocation.invocation, provingResourceBounds);
  return result;
}

function parseUint256(response: readonly string[], label: string): bigint {
  if (response.length !== 2) {
    throw new Error(`${label} returned invalid Uint256 data.`);
  }
  return BigInt(response[0]!) + (BigInt(response[1]!) << 128n);
}

async function ensureReplayAnchorAllowance(input: {
  provider: ShieldedMessageChainProvider;
  account: ShieldedMessageSubmissionAccount;
  ownerAddress: bigint;
  poolAddress: bigint;
}): Promise<void> {
  const token = feltHex(VEIL_REPLAY_TOKEN_ADDRESS);
  const owner = feltHex(input.ownerAddress);
  const pool = feltHex(input.poolAddress);
  const balance = parseUint256(await input.provider.callContract({
    contractAddress: token,
    entrypoint: "balance_of",
    calldata: [owner],
  }), "STRK balance_of");
  if (balance < VEIL_REPLAY_ANCHOR_AMOUNT) {
    throw new Error("Sender needs at least 1 FRI of public STRK to bootstrap replay protection.");
  }
  const allowance = parseUint256(await input.provider.callContract({
    contractAddress: token,
    entrypoint: "allowance",
    calldata: [owner, pool],
  }), "STRK allowance");
  if (allowance >= VEIL_REPLAY_ANCHOR_AMOUNT) {
    console.log(REPLAY_ALLOWANCE_READY);
    return;
  }
  const transaction = await input.account.execute({
    contractAddress: token,
    entrypoint: "approve",
    calldata: [pool, VEIL_REPLAY_ANCHOR_AMOUNT.toString(), "0"],
  } as never, {});
  if (!transaction.transaction_hash) {
    throw new Error("Replay-anchor STRK approval returned no transaction hash.");
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
      || waited.execution_status !== TransactionExecutionStatus.SUCCEEDED) {
    throw new Error("Replay-anchor STRK approval failed.");
  }
  console.log(REPLAY_ALLOWANCE_READY);
}

function mapRepeatSummary(input: {
  config: VeilTwoPartyShieldedMessagePocConfig;
  provingBlockId: number;
  prepared: PreparedTwoPartyShieldedMessage;
  base: ReturnType<typeof createShieldedMessageProofSummary>;
  recipientVerification?: RecipientDecryptVerification;
}): VeilTwoPartyShieldedMessageSummary {
  return {
    result: input.recipientVerification
      ? TWO_PARTY_SUBMISSION_RESULT
      : TWO_PARTY_PROOF_RESULT,
    network: "SN_SEPOLIA",
    helperAddress: input.base.helperAddress,
    privacyPoolAddress: input.base.privacyPoolAddress,
    senderAddress: input.base.accountAddress,
    recipientAddress: feltHex(input.config.recipientAccountAddress),
    provingBlockId: String(input.provingBlockId),
    transactionHash: input.base.transactionHash,
    finalityStatus: input.base.finalityStatus,
    executionStatus: input.base.executionStatus,
    messageLocator: input.prepared.messageLocator,
    payloadCommitment: input.prepared.payloadCommitment,
    ciphertextChunkCount: input.prepared.ciphertextChunks.length,
    recipientChannelIndex: input.prepared.recipientChannelIndex,
    proofPresent: input.base.proofPresent,
    proofFactsCount: input.base.proofFactsCount,
    messageEventFound: input.base.messageEventFound,
    storageVerified: input.base.storageVerified,
    senderLocalDecryptVerified: input.base.localDecryptVerified,
    recipientChannelRecovered:
      input.recipientVerification?.recipientChannelRecovered ?? false,
    recipientDecryptVerified:
      input.recipientVerification?.recipientDecryptVerified ?? false,
    unrelatedViewingKeyRejected:
      input.recipientVerification?.unrelatedViewingKeyRejected ?? false,
  };
}

async function writeRepeatSummary(input: {
  summary: VeilTwoPartyShieldedMessageSummary;
  path: string;
  sensitiveValues: readonly string[];
}): Promise<void> {
  assertTwoPartyShieldedMessageSummarySafe(
    input.summary,
    input.sensitiveValues,
  );
  await writeFile(input.path, `${JSON.stringify(input.summary, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function runVeilOfficialTwoPartyShieldedRepeatPoc(
  env: NodeJS.ProcessEnv = process.env,
): Promise<VeilTwoPartyShieldedMessageSummary | null> {
  const config = loadVeilTwoPartyShieldedMessagePocConfig(env);
  const summaryPath = env.VEIL_POC_TWO_PARTY_SUMMARY_PATH?.trim()
    || REPLAY_SUMMARY_PATH;
  const sensitiveValues = [
    ...collectVeilPocIdentitySensitiveValues(env, config.identity),
    config.recipientViewingKey.toString(),
  ];
  const signer = createStandardPocSigner(config.identity.accountPrivateKey);
  const preflight = await preflightVeilPocAccount({
    provider: createAccountPreflightProvider(config.rpcUrl),
    accountAddress: config.identity.accountAddress,
    signer,
    sensitiveValues,
  });
  await writeAccountPreflightArtifact(
    preflight.artifact,
    env.VEIL_POC_ACCOUNT_PREFLIGHT_PATH?.trim()
      || DEFAULT_ACCOUNT_PREFLIGHT_PATH,
  );
  if (preflight.artifact.verdict !== "SIGNER_PREFLIGHT_VALID"
      || preflight.provingBlockId === undefined) {
    throw new AccountPreflightError(preflight.artifact);
  }
  console.log("SIGNER_PREFLIGHT_VALID");
  const provingBlockId = preflight.provingBlockId;
  const provider = createShieldedMessageChainProvider(config.rpcUrl);
  await verifyShieldedMessageDeployment({ config, provider, provingBlockId });
  const senderPublicKey = await verifyRegisteredViewingKey({
    provider,
    poolAddress: config.poolAddress,
    accountAddress: config.identity.accountAddress,
    viewingKey: config.identity.viewingKey,
    blockIdentifier: provingBlockId,
    label: "sender",
  });
  const recipientPublicKey = await verifyRegisteredViewingKey({
    provider,
    poolAddress: config.poolAddress,
    accountAddress: config.recipientAccountAddress,
    viewingKey: config.recipientViewingKey,
    blockIdentifier: provingBlockId,
    label: "recipient",
  });
  const direction = await discoverDirectionChannel({
    provider,
    poolAddress: config.poolAddress,
    senderAddress: config.identity.accountAddress,
    senderViewingKey: config.identity.viewingKey,
    recipientAddress: config.recipientAccountAddress,
    recipientViewingKey: config.recipientViewingKey,
    recipientPublicKey,
    blockIdentifier: provingBlockId,
  });
  const anchor = await discoverReplayAnchor({
    provider,
    poolAddress: config.poolAddress,
    accountAddress: config.identity.accountAddress,
    viewingKey: config.identity.viewingKey,
    publicKey: senderPublicKey,
    blockIdentifier: provingBlockId,
  });
  const outgoingChannelCount = await readOutgoingChannelCount({
    provider,
    poolAddress: config.poolAddress,
    senderAddress: config.identity.accountAddress,
    senderViewingKey: config.identity.viewingKey,
    blockIdentifier: provingBlockId,
  });
  const latestDirection = await discoverDirectionChannel({
    provider,
    poolAddress: config.poolAddress,
    senderAddress: config.identity.accountAddress,
    senderViewingKey: config.identity.viewingKey,
    recipientAddress: config.recipientAccountAddress,
    recipientViewingKey: config.recipientViewingKey,
    recipientPublicKey,
    blockIdentifier: "latest",
  });
  const latestAnchor = await discoverReplayAnchor({
    provider,
    poolAddress: config.poolAddress,
    accountAddress: config.identity.accountAddress,
    viewingKey: config.identity.viewingKey,
    publicKey: senderPublicKey,
    blockIdentifier: "latest",
  });
  const latestOutgoingChannelCount = await readOutgoingChannelCount({
    provider,
    poolAddress: config.poolAddress,
    senderAddress: config.identity.accountAddress,
    senderViewingKey: config.identity.viewingKey,
    blockIdentifier: "latest",
  });
  assertPinnedReplayState({
    provingDirection: direction,
    latestDirection,
    provingAnchor: anchor,
    latestAnchor,
    provingOutgoingChannelCount: outgoingChannelCount,
    latestOutgoingChannelCount,
  });
  console.log(REPLAY_STATE_PINNED);
  const registry = createReplayRegistry({
    senderAddress: config.identity.accountAddress,
    senderViewingKey: config.identity.viewingKey,
    senderPublicKey,
    recipientAddress: config.recipientAccountAddress,
    recipientPublicKey,
    direction,
    anchor,
  });
  const state: RepeatBuildState = {
    direction,
    anchor,
    registry,
    outgoingChannelCount,
    senderPublicKey,
    recipientPublicKey,
  };
  const prepared = await prepareTwoPartyShieldedMessage({
    config,
    recipientPublicKey,
    recipientChannelIndex: direction.recipientChannelIndex,
  });
  await verifyLocalShieldedMessageDecrypt({ prepared });
  console.log(direction.exists ? REPLAY_CHANNEL_REUSED : REPLAY_CHANNEL_OPENED);
  console.log(anchor.anchorNote
    ? REPLAY_ANCHOR_ROTATED
    : REPLAY_ANCHOR_BOOTSTRAPPED);
  if (!config.generateProof) {
    console.log(TWO_PARTY_IDENTITY_VALID);
    console.log(TWO_PARTY_DRY_RUN_VALID);
    console.log(LOCAL_DECRYPT_VERIFIED);
    return null;
  }
  const provingProvider = createOfficialProvingProvider({
    proverUrl: config.proverUrl,
    rpcUrl: config.rpcUrl,
    poolAddress: config.poolAddress,
    provingBlockId,
  });
  const resourceEstimator: ShieldedMessageResourceEstimator =
    createShieldedMessageResourceEstimator(config.rpcUrl);
  const proofInput: ShieldedMessageProofExecutorInput = {
    config,
    signer,
    provingProvider,
    resourceEstimator,
    provingBlockId,
    prepared,
    provider,
  };
  if (config.resourceEstimateOnly) {
    await prepareRepeatProof({ proofInput, state });
    console.log(TWO_PARTY_IDENTITY_VALID);
    console.log("TWO_PARTY_REPEAT_RESOURCE_PREFLIGHT_VALID");
    return null;
  }
  let submissionAccount: ShieldedMessageSubmissionAccount | undefined;
  if (config.submitOnchain) {
    submissionAccount = createOfficialShieldedMessageSubmissionAccount({
      rpcUrl: config.rpcUrl,
      accountAddress: config.identity.accountAddress,
      accountPrivateKey: config.identity.accountPrivateKey,
    });
    if (!anchor.anchorNote) {
      await ensureReplayAnchorAllowance({
        provider,
        account: submissionAccount,
        ownerAddress: config.identity.accountAddress,
        poolAddress: config.poolAddress,
      });
    }
  }
  const result = await executeRepeatProof({ proofInput, state });
  let baseSummary = createShieldedMessageProofSummary({
    config,
    provingBlockId,
    prepared,
    result,
  });
  let recipientVerification: RecipientDecryptVerification | undefined;
  console.log(TWO_PARTY_IDENTITY_VALID);
  console.log(TWO_PARTY_PROOF_RESULT);
  console.log("proof_present: true");
  if (config.submitOnchain) {
    if (!submissionAccount) {
      throw new Error("Replay-message submission account is missing.");
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
    recipientVerification = await verifyRecipientShieldedMessageDecrypt({
      config,
      provider,
      prepared,
    });
  }
  const summary = mapRepeatSummary({
    config,
    provingBlockId,
    prepared,
    base: baseSummary,
    ...(recipientVerification === undefined
      ? {}
      : { recipientVerification }),
  });
  if (config.submitOnchain) {
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
  await writeRepeatSummary({
    summary,
    path: summaryPath,
    sensitiveValues: [
      ...sensitiveValues,
      result.callAndProof.proof.data,
    ],
  });
  return summary;
}

function isMainModule(): boolean {
  const invokedPath = process.argv[1];
  return invokedPath !== undefined
    && pathToFileURL(invokedPath).href === import.meta.url;
}

if (isMainModule()) {
  try {
    await runVeilOfficialTwoPartyShieldedRepeatPoc();
  } catch (error) {
    if (error instanceof AccountPreflightError) {
      console.error(`VEIL account preflight failed closed: ${error.artifact.verdict}`);
    } else if (error instanceof ProvingServiceError) {
      console.error("VEIL repeated shielded-message proving failed closed.");
    } else {
      console.error("VEIL repeated shielded-message PoC failed closed.");
      console.error(error instanceof Error ? error.message : String(error));
    }
    process.exitCode = 1;
  }
}
