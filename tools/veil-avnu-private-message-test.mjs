import { writeFile } from "node:fs/promises";

import {
  ProvingServiceError,
  createPrivateTransfers,
} from "@starkware-libs/starknet-privacy-sdk";
import {
  ContractDiscoveryProvider,
} from "@starkware-libs/starknet-privacy-sdk/testing";
import {
  PrivacyPoolABI,
} from "@starkware-libs/starknet-privacy-sdk/abi";
import {
  buildPrivateSwapFee,
  submitPrivateSwap,
  SEPOLIA_PAYMASTER_BASE_URL,
} from "@avnu/avnu-sdk";
import {
  Contract,
  RpcProvider as ProofRpcProvider,
  TransactionExecutionStatus,
  TransactionFinalityStatus,
} from "starknet-proof";

import {
  assertMessageCommittedEvent,
  createShieldedMessageChainProvider,
  createShieldedMessageProvingResourceBounds,
  createShieldedMessageResourceEstimator,
  verifyLocalShieldedMessageDecrypt,
  verifyShieldedMessageDeployment,
  verifyShieldedMessageStorage,
} from "./veil-official-shielded-message-poc.ts";
import {
  loadVeilTwoPartyShieldedMessagePocConfig,
  prepareTwoPartyShieldedMessage,
  verifyRecipientShieldedMessageDecrypt,
  verifyRegisteredViewingKey,
} from "./veil-official-two-party-shielded-message-poc.ts";
import {
  AccountPreflightError,
  createAccountPreflightProvider,
  createOfficialProvingProvider,
  createStandardPocSigner,
  preflightVeilPocAccount,
  sanitizeProvingDiagnosticData,
  sanitizeProvingDiagnosticText,
  writeAccountPreflightArtifact,
} from "./veil-official-register-poc.ts";
import {
  collectVeilPocIdentitySensitiveValues,
} from "./veil-poc-identity.ts";
import {
  discoverDirectionChannel,
} from "./veil-replay-anchor.ts";

const STRK =
  0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938dn;

const SUMMARY_PATH =
  process.env.VEIL_AVNU_MESSAGE_SUMMARY_PATH ??
  "veil-avnu-private-message-summary.json";

const ERROR_PATH =
  process.env.VEIL_AVNU_MESSAGE_ERROR_PATH ??
  "veil-avnu-private-message-error.json";

let stage = "CONFIG";

function feltHex(value) {
  return `0x${BigInt(value).toString(16)}`;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function createPinnedProofProvider(provingProvider, details) {
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

function assertInvocationBounds(invocation, bounds) {
  for (const resource of ["l1_gas", "l1_data_gas", "l2_gas"]) {
    const actual = invocation.resource_bounds[resource];
    if (
      BigInt(actual.max_amount) !== BigInt(bounds[resource].max_amount) ||
      BigInt(actual.max_price_per_unit) !==
        BigInt(bounds[resource].max_price_per_unit)
    ) {
      throw new Error(`Final ${resource} proving bounds are inconsistent.`);
    }
  }
}

function extractBaseError(error) {
  return error && typeof error === "object" && "baseError" in error
    ? error.baseError
    : null;
}

function errorCode(error) {
  const baseError = extractBaseError(error);
  if (
    baseError &&
    typeof baseError === "object" &&
    typeof baseError.code === "number"
  ) {
    return baseError.code;
  }
  if (error && typeof error === "object" && typeof error.code === "number") {
    return error.code;
  }
  return null;
}

function errorMessage(error) {
  const baseError = extractBaseError(error);
  if (
    baseError &&
    typeof baseError === "object" &&
    typeof baseError.message === "string"
  ) {
    return baseError.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function errorData(error) {
  const baseError = extractBaseError(error);
  if (baseError && typeof baseError === "object" && "data" in baseError) {
    return baseError.data;
  }
  if (error && typeof error === "object" && "data" in error) {
    return error.data;
  }
  return null;
}

async function writeSafeError(error, sensitiveValues) {
  const diagnostic = {
    result: "VEIL_AVNU_PRIVATE_MESSAGE_FAILED",
    stage,
    name: error instanceof Error ? error.name : "UnknownError",
    code: errorCode(error),
    message: sanitizeProvingDiagnosticText(
      errorMessage(error),
      sensitiveValues,
    ),
    data: sanitizeProvingDiagnosticData(
      errorData(error),
      0,
      sensitiveValues,
    ),
  };

  await writeFile(ERROR_PATH, `${JSON.stringify(diagnostic, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  console.error(
    "VEIL_AVNU_PRIVATE_MESSAGE_FAILED",
    JSON.stringify(diagnostic),
  );
}

async function main() {
  const apiKey = requiredEnv("AVNU_PAYMASTER_API_KEY");
  const direction = requiredEnv("DIRECTION");

  const config = loadVeilTwoPartyShieldedMessagePocConfig({
    ...process.env,
    VEIL_POC_GENERATE_PROOF: "true",
    VEIL_POC_SUBMIT_ONCHAIN: "false",
    VEIL_POC_RESOURCE_ESTIMATE_ONLY: "false",
  });

  const sensitiveValues = [
    ...collectVeilPocIdentitySensitiveValues(process.env, config.identity),
    config.recipientViewingKey.toString(),
    apiKey,
  ].filter(Boolean);

  stage = "ACCOUNT_PREFLIGHT";

  const signer = createStandardPocSigner(config.identity.accountPrivateKey);
  const accountPreflight = await preflightVeilPocAccount({
    provider: createAccountPreflightProvider(config.rpcUrl),
    accountAddress: config.identity.accountAddress,
    signer,
    sensitiveValues,
  });

  await writeAccountPreflightArtifact(
    accountPreflight.artifact,
    process.env.VEIL_POC_ACCOUNT_PREFLIGHT_PATH ??
      "veil-avnu-message-preflight.json",
  );

  if (
    accountPreflight.artifact.verdict !== "SIGNER_PREFLIGHT_VALID" ||
    accountPreflight.provingBlockId === undefined
  ) {
    throw new AccountPreflightError(accountPreflight.artifact);
  }

  const provingBlockId = accountPreflight.provingBlockId;
  console.log("AVNU_MESSAGE_SIGNER_PREFLIGHT_VALID");

  stage = "POOL_AND_HELPER_PREFLIGHT";

  const chainProvider = createShieldedMessageChainProvider(config.rpcUrl);

  await verifyShieldedMessageDeployment({
    config,
    provider: chainProvider,
    provingBlockId,
  });

  await verifyRegisteredViewingKey({
    provider: chainProvider,
    poolAddress: config.poolAddress,
    accountAddress: config.identity.accountAddress,
    viewingKey: config.identity.viewingKey,
    blockIdentifier: provingBlockId,
    label: "sender",
  });

  const recipientPublicKey = await verifyRegisteredViewingKey({
    provider: chainProvider,
    poolAddress: config.poolAddress,
    accountAddress: config.recipientAccountAddress,
    viewingKey: config.recipientViewingKey,
    blockIdentifier: provingBlockId,
    label: "recipient",
  });

  console.log("AVNU_MESSAGE_IDENTITIES_READY");

  stage = "CHANNEL_DISCOVERY";

  const directionState = await discoverDirectionChannel({
    provider: chainProvider,
    poolAddress: config.poolAddress,
    senderAddress: config.identity.accountAddress,
    senderViewingKey: config.identity.viewingKey,
    recipientAddress: config.recipientAccountAddress,
    recipientViewingKey: config.recipientViewingKey,
    recipientPublicKey,
    blockIdentifier: provingBlockId,
  });

  const prepared = await prepareTwoPartyShieldedMessage({
    config,
    recipientPublicKey,
    recipientChannelIndex: directionState.recipientChannelIndex,
  });

  await verifyLocalShieldedMessageDecrypt({ prepared });

  console.log(
    directionState.exists
      ? "AVNU_MESSAGE_CHANNEL_WILL_BE_REUSED"
      : "AVNU_MESSAGE_CHANNEL_WILL_BE_OPENED",
  );
  console.log("AVNU_MESSAGE_LOCAL_DECRYPT_VALID");

  stage = "AVNU_FEE_QUOTE";

  const feeMode = {
    poolFeeToken: feltHex(STRK),
    tip: "normal",
  };

  const fee = await buildPrivateSwapFee(
    {
      poolAddress: feltHex(config.poolAddress),
      feeMode,
      paymasterApiKey: apiKey,
    },
    {
      paymasterBaseUrl: SEPOLIA_PAYMASTER_BASE_URL,
    },
  );

  if (BigInt(fee.token) !== STRK || fee.amount <= 0n) {
    throw new Error("AVNU returned an invalid private STRK fee.");
  }

  console.log("AVNU_PRIVATE_MESSAGE_FEE_READY");
  console.log(`fee_amount_raw=${fee.amount.toString()}`);

  stage = "PRIVATE_NOTE_DISCOVERY";

  const proofRpcProvider = new ProofRpcProvider({
    nodeUrl: config.rpcUrl,
  });

  const poolContract = new Contract({
    abi: PrivacyPoolABI,
    address: feltHex(config.poolAddress),
    providerOrAccount: proofRpcProvider,
  }).typedv2(PrivacyPoolABI);

  const discoveryProvider = new ContractDiscoveryProvider(poolContract);

  const discovered = await discoveryProvider.discoverNotes(
    config.identity.accountAddress,
    config.identity.viewingKey,
    {
      tokens: [STRK],
      blockIdentifier: { block_number: provingBlockId },
    },
  );

  const privateStrkNotes = discovered.notes.get(STRK) ?? [];
  const availablePrivateStrk = privateStrkNotes.reduce(
    (sum, note) => sum + BigInt(note.amount),
    0n,
  );
  const canPayFee = availablePrivateStrk >= fee.amount;

  console.log(
    `AVNU_PRIVATE_STRK_NOTE_FOUND=${privateStrkNotes.length > 0}`,
  );
  console.log(`AVNU_PRIVATE_STRK_CAN_PAY_FEE=${canPayFee}`);

  if (!canPayFee) {
    console.error("AVNU_PRIVATE_STRK_FEE_BALANCE_MISSING");
    throw new Error(
      "No sufficient unspent private STRK note is available for the current AVNU fee.",
    );
  }

  stage = "BUILD_PROOF_INVOCATION";

  const provingProvider = createOfficialProvingProvider({
    proverUrl: config.proverUrl,
    rpcUrl: config.rpcUrl,
    poolAddress: config.poolAddress,
    provingBlockId,
  });

  function createMessageTransfers(selectedProvingProvider) {
    const transfers = createPrivateTransfers({
      account: {
        address: config.identity.accountAddress,
        signer,
      },
      viewingKeyProvider: {
        async getViewingKey() {
          return config.identity.viewingKey;
        },
      },
      provingProvider: selectedProvingProvider,
      discoveryProvider,
      poolContractAddress: config.poolAddress,
      poolMode: "screening",
    });

    let builder = transfers.build({
      autoDiscover: {
        notes: "refresh",
        channels: "refresh",
      },
      autoSelectNotes: "naive",
      autoSetup: true,
      provingBlockId: { block_number: provingBlockId },
    });

    if (!directionState.exists) {
      builder = builder.setup(config.recipientAccountAddress);
    }

    builder = builder
      .with(STRK)
      .withdraw({
        recipient: BigInt(fee.recipient),
        amount: fee.amount,
      })
      .surplusTo(config.identity.accountAddress, false)
      .done();

    builder = builder.invoke(() => ({
      contractAddress: feltHex(config.helperAddress),
      calldata: [
        String(prepared.helperCalldata.length),
        ...prepared.helperCalldata,
      ],
    }));

    return { transfers, builder };
  }

  provingProvider.invalidateNonceCache?.();
  const baseDetails = await provingProvider.getDefaultDetails();

  if (baseDetails.nonce === undefined || !baseDetails.resourceBounds) {
    throw new Error(
      "Official proving provider returned incomplete default details.",
    );
  }

  const preliminary = createMessageTransfers(
    createPinnedProofProvider(provingProvider, baseDetails),
  );
  const preliminaryInvocation =
    await preliminary.builder.createProofInvocation();

  stage = "RESOURCE_ESTIMATE";

  const estimator = createShieldedMessageResourceEstimator(config.rpcUrl);
  const rawEstimate = await estimator.estimateInvokeV3(
    preliminaryInvocation.invocation,
  );
  const provingBounds = createShieldedMessageProvingResourceBounds(
    rawEstimate,
    baseDetails.resourceBounds,
  );

  const finalDetails = {
    ...baseDetails,
    nonce: baseDetails.nonce,
    tip: 0n,
    resourceBounds: provingBounds,
  };

  const finalTransfer = createMessageTransfers(
    createPinnedProofProvider(provingProvider, finalDetails),
  );
  const finalInvocation = await finalTransfer.builder.createProofInvocation();

  assertInvocationBounds(finalInvocation.invocation, provingBounds);
  console.log("AVNU_PRIVATE_MESSAGE_RESOURCE_ESTIMATE_VALID");

  stage = "PROVE";

  const result = await finalTransfer.transfers.executeWithInvocation(
    finalInvocation,
    provingBlockId,
  );

  const proof = result.callAndProof.proof;
  if (
    typeof proof.data !== "string" ||
    proof.data.length === 0 ||
    !Array.isArray(proof.proofFacts) ||
    proof.proofFacts.length === 0
  ) {
    throw new Error("Official prover returned no usable proof or proof facts.");
  }

  const call = result.callAndProof.call;
  if (
    BigInt(call.contractAddress) !== config.poolAddress ||
    call.entrypoint !== "apply_actions"
  ) {
    throw new Error(
      "Generated call does not target AVNU Privacy Pool apply_actions.",
    );
  }

  const lastCalldata = call.calldata?.[call.calldata.length - 1];
  if (lastCalldata === undefined || BigInt(lastCalldata) !== 1n) {
    throw new Error(
      "Screening-capable apply_actions call is missing Option::None suffix.",
    );
  }

  console.log("AVNU_PRIVATE_MESSAGE_PROOF_GENERATED");
  console.log(`proof_facts_count=${proof.proofFacts.length}`);

  stage = "AVNU_SUBMIT";

  const submission = await submitPrivateSwap(
    {
      callAndProof: result.callAndProof,
      feeMode,
      paymasterApiKey: apiKey,
    },
    {
      paymasterBaseUrl: SEPOLIA_PAYMASTER_BASE_URL,
    },
  );

  if (!submission.transactionHash) {
    throw new Error("AVNU returned no transaction hash.");
  }

  console.log("AVNU_PRIVATE_MESSAGE_TRANSACTION_SUBMITTED");
  console.log(submission.transactionHash);

  stage = "WAIT_FOR_RECEIPT";

  const waited = await proofRpcProvider.waitForTransaction(
    submission.transactionHash,
    {
      successStates: [TransactionFinalityStatus.ACCEPTED_ON_L2],
      errorStates: [TransactionExecutionStatus.REVERTED],
    },
  );

  if (
    waited.isReverted() ||
    !waited.isSuccess() ||
    waited.finality_status !== TransactionFinalityStatus.ACCEPTED_ON_L2 ||
    waited.execution_status !== TransactionExecutionStatus.SUCCEEDED
  ) {
    throw new Error(
      "AVNU private-message transaction was not accepted and successful on L2.",
    );
  }

  stage = "VERIFY_MESSAGE";

  const receipt = await chainProvider.getTransactionReceipt(
    submission.transactionHash,
  );

  assertMessageCommittedEvent({
    receipt,
    helperAddress: config.helperAddress,
    messageLocator: prepared.messageLocator,
    payloadCommitment: prepared.payloadCommitment,
  });

  await verifyShieldedMessageStorage({
    provider: chainProvider,
    helperAddress: config.helperAddress,
    prepared,
  });

  const recipientVerification =
    await verifyRecipientShieldedMessageDecrypt({
      config,
      provider: chainProvider,
      prepared,
    });

  if (
    !recipientVerification.recipientChannelRecovered ||
    !recipientVerification.recipientDecryptVerified ||
    !recipientVerification.unrelatedViewingKeyRejected
  ) {
    throw new Error("Recipient-side private-message verification failed.");
  }

  const summary = {
    result: "VEIL_AVNU_PRIVATE_MESSAGE_SUBMITTED_ONCHAIN",
    direction,
    network: "SN_SEPOLIA",
    privacyPoolAddress: feltHex(config.poolAddress),
    helperAddress: feltHex(config.helperAddress),
    senderAddress: feltHex(config.identity.accountAddress),
    recipientAddress: feltHex(config.recipientAccountAddress),
    feeToken: feltHex(STRK),
    feeAmountRaw: fee.amount.toString(),
    provingBlockId: String(provingBlockId),
    transactionHash: submission.transactionHash,
    finalityStatus: waited.finality_status,
    executionStatus: waited.execution_status,
    proofPresent: true,
    proofFactsCount: proof.proofFacts.length,
    messageEventFound: true,
    storageVerified: true,
    senderLocalDecryptVerified: true,
    recipientChannelRecovered: true,
    recipientDecryptVerified: true,
    unrelatedViewingKeyRejected: true,
  };

  await writeFile(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  console.log("VEIL_AVNU_PRIVATE_MESSAGE_E2E_OK");
  console.log(JSON.stringify(summary));
}

try {
  await main();
} catch (error) {
  const sensitiveValues = [
    process.env.VEIL_POC_ACCOUNT_PRIVATE_KEY ?? "",
    process.env.VEIL_POC_VIEWING_KEY ?? "",
    process.env.VEIL_POC_RECIPIENT_VIEWING_KEY ?? "",
    process.env.AVNU_PAYMASTER_API_KEY ?? "",
  ].filter(Boolean);

  await writeSafeError(error, sensitiveValues);

  if (error instanceof ProvingServiceError) {
    console.error("AVNU_PRIVATE_MESSAGE_PROVER_ERROR");
  }

  process.exitCode = 1;
}
