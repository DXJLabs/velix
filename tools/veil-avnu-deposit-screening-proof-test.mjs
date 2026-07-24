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
  Contract,
  RpcProvider as ProofRpcProvider,
} from "starknet-proof";

import {
  createShieldedMessageChainProvider,
  createShieldedMessageProvingResourceBounds,
  createShieldedMessageResourceEstimator,
} from "./veil-official-shielded-message-poc.ts";
import {
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
  loadVeilPocIdentityConfig,
} from "./veil-poc-identity.ts";

const STRK =
  0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938dn;
const DEFAULT_DEPOSIT_AMOUNT = 2_000_000_000_000_000_000n;

const SUMMARY_PATH =
  process.env.VEIL_AVNU_DEPOSIT_SUMMARY_PATH ??
  "veil-avnu-deposit-screening-proof-summary.json";
const ERROR_PATH =
  process.env.VEIL_AVNU_DEPOSIT_ERROR_PATH ??
  "veil-avnu-deposit-screening-proof-error.json";

let stage = "CONFIG";

function feltHex(value) {
  return `0x${BigInt(value).toString(16)}`;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parsePositiveBigInt(value, label) {
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new Error(`${label} must be greater than zero.`);
  return parsed;
}

function parseUint256(response, label) {
  if (!Array.isArray(response) || response.length !== 2) {
    throw new Error(`${label} returned invalid Uint256 data.`);
  }
  return BigInt(response[0]) + (BigInt(response[1]) << 128n);
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

async function writeSafeError(error, sensitiveValues) {
  const baseError = extractBaseError(error);
  const rawMessage =
    baseError && typeof baseError === "object" && typeof baseError.message === "string"
      ? baseError.message
      : error instanceof Error
        ? error.message
        : String(error);
  const rawData =
    baseError && typeof baseError === "object" && "data" in baseError
      ? baseError.data
      : error && typeof error === "object" && "data" in error
        ? error.data
        : null;
  const code =
    baseError && typeof baseError === "object" && typeof baseError.code === "number"
      ? baseError.code
      : error && typeof error === "object" && typeof error.code === "number"
        ? error.code
        : null;

  const diagnostic = {
    result: "VEIL_AVNU_DEPOSIT_SCREENING_PROOF_FAILED",
    stage,
    name: error instanceof Error ? error.name : "UnknownError",
    code,
    message: sanitizeProvingDiagnosticText(rawMessage, sensitiveValues),
    data: sanitizeProvingDiagnosticData(rawData, 0, sensitiveValues),
  };

  await writeFile(ERROR_PATH, `${JSON.stringify(diagnostic, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  console.error(
    "VEIL_AVNU_DEPOSIT_SCREENING_PROOF_FAILED",
    JSON.stringify(diagnostic),
  );
}

async function main() {
  const identity = loadVeilPocIdentityConfig(process.env);
  const rpcUrl = requiredEnv("STARKNET_SEPOLIA_RPC_URL");
  const proverUrl = requiredEnv("VEIL_POC_PROVER_URL");
  const poolAddress = parsePositiveBigInt(
    requiredEnv("VEIL_POC_PRIVACY_POOL"),
    "VEIL_POC_PRIVACY_POOL",
  );
  const depositAmount = parsePositiveBigInt(
    process.env.VEIL_AVNU_DEPOSIT_AMOUNT_RAW ?? DEFAULT_DEPOSIT_AMOUNT.toString(),
    "VEIL_AVNU_DEPOSIT_AMOUNT_RAW",
  );

  const sensitiveValues = collectVeilPocIdentitySensitiveValues(
    process.env,
    identity,
  );

  stage = "ACCOUNT_PREFLIGHT";
  const signer = createStandardPocSigner(identity.accountPrivateKey);
  const preflight = await preflightVeilPocAccount({
    provider: createAccountPreflightProvider(rpcUrl),
    accountAddress: identity.accountAddress,
    signer,
    sensitiveValues,
  });

  await writeAccountPreflightArtifact(
    preflight.artifact,
    process.env.VEIL_POC_ACCOUNT_PREFLIGHT_PATH ??
      "veil-avnu-deposit-preflight.json",
  );

  if (
    preflight.artifact.verdict !== "SIGNER_PREFLIGHT_VALID" ||
    preflight.provingBlockId === undefined
  ) {
    throw new AccountPreflightError(preflight.artifact);
  }

  const provingBlockId = preflight.provingBlockId;
  console.log("AVNU_DEPOSIT_SIGNER_PREFLIGHT_VALID");

  stage = "POOL_IDENTITY_PREFLIGHT";
  const chainProvider = createShieldedMessageChainProvider(rpcUrl);

  await verifyRegisteredViewingKey({
    provider: chainProvider,
    poolAddress,
    accountAddress: identity.accountAddress,
    viewingKey: identity.viewingKey,
    blockIdentifier: provingBlockId,
    label: "deposit sender",
  });

  console.log("AVNU_DEPOSIT_IDENTITY_READY");

  stage = "PUBLIC_STRK_PREFLIGHT";
  const publicBalance = parseUint256(
    await chainProvider.callContract(
      {
        contractAddress: feltHex(STRK),
        entrypoint: "balance_of",
        calldata: [feltHex(identity.accountAddress)],
      },
      provingBlockId,
    ),
    "STRK balance_of",
  );
  const allowance = parseUint256(
    await chainProvider.callContract(
      {
        contractAddress: feltHex(STRK),
        entrypoint: "allowance",
        calldata: [feltHex(identity.accountAddress), feltHex(poolAddress)],
      },
      provingBlockId,
    ),
    "STRK allowance",
  );

  const balanceSufficient = publicBalance >= depositAmount;
  const allowanceSufficient = allowance >= depositAmount;
  console.log(`AVNU_DEPOSIT_PUBLIC_BALANCE_SUFFICIENT=${balanceSufficient}`);
  console.log(`AVNU_DEPOSIT_ALLOWANCE_SUFFICIENT=${allowanceSufficient}`);

  stage = "DISCOVERY_SETUP";
  const proofRpcProvider = new ProofRpcProvider({ nodeUrl: rpcUrl });
  const poolContract = new Contract({
    abi: PrivacyPoolABI,
    address: feltHex(poolAddress),
    providerOrAccount: proofRpcProvider,
  }).typedv2(PrivacyPoolABI);
  const discoveryProvider = new ContractDiscoveryProvider(poolContract);

  stage = "BUILD_PROOF_INVOCATION";
  const provingProvider = createOfficialProvingProvider({
    proverUrl,
    rpcUrl,
    poolAddress,
    provingBlockId,
  });

  function createDepositTransfers(selectedProvingProvider) {
    const transfers = createPrivateTransfers({
      account: {
        address: identity.accountAddress,
        signer,
      },
      viewingKeyProvider: {
        async getViewingKey() {
          return identity.viewingKey;
        },
      },
      provingProvider: selectedProvingProvider,
      discoveryProvider,
      poolContractAddress: poolAddress,
      poolMode: "screening",
    });

    const builder = transfers
      .build({
        autoDiscover: {
          notes: "refresh",
          channels: "refresh",
        },
        autoSetup: true,
        provingBlockId: { block_number: provingBlockId },
      })
      .with(STRK)
      .deposit({ amount: depositAmount })
      .surplusTo(identity.accountAddress, false)
      .done();

    return { transfers, builder };
  }

  provingProvider.invalidateNonceCache?.();
  const baseDetails = await provingProvider.getDefaultDetails();
  if (baseDetails.nonce === undefined || !baseDetails.resourceBounds) {
    throw new Error(
      "Official proving provider returned incomplete default details.",
    );
  }

  const preliminary = createDepositTransfers(
    createPinnedProofProvider(provingProvider, baseDetails),
  );
  const preliminaryInvocation =
    await preliminary.builder.createProofInvocation();

  stage = "RESOURCE_ESTIMATE";
  const estimator = createShieldedMessageResourceEstimator(rpcUrl);
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
  const finalTransfer = createDepositTransfers(
    createPinnedProofProvider(provingProvider, finalDetails),
  );
  const finalInvocation = await finalTransfer.builder.createProofInvocation();
  assertInvocationBounds(finalInvocation.invocation, provingBounds);
  console.log("AVNU_DEPOSIT_RESOURCE_ESTIMATE_VALID");

  stage = "PROVE_DEPOSIT";
  const result = await finalTransfer.transfers.executeWithInvocation(
    finalInvocation,
    provingBlockId,
  );
  const proof = result.callAndProof.proof;
  const proofPresent = typeof proof.data === "string" && proof.data.length > 0;
  const proofFactsCount = Array.isArray(proof.proofFacts)
    ? proof.proofFacts.length
    : 0;

  if (!proofPresent || proofFactsCount === 0) {
    throw new Error(
      "Official prover returned no usable deposit proof or proof facts.",
    );
  }

  console.log("AVNU_DEPOSIT_PROOF_GENERATED");

  stage = "SCREENING_ATTESTATION_CHECK";
  const signaturePresent = proof.additionalData?.signature !== undefined;
  const call = result.callAndProof.call;

  if (
    BigInt(call.contractAddress) !== poolAddress ||
    call.entrypoint !== "apply_actions"
  ) {
    throw new Error(
      "Generated deposit call does not target AVNU Privacy Pool apply_actions.",
    );
  }

  const calldata = Array.isArray(call.calldata) ? call.calldata : [];
  const attestationVariant = signaturePresent ? "SOME" : "NONE";

  if (signaturePresent) {
    const suffix = calldata.slice(-4);
    if (suffix.length !== 4 || BigInt(suffix[0]) !== 0n) {
      throw new Error(
        "Deposit proof contains screening data but apply_actions is missing Option::Some.",
      );
    }
  } else {
    const last = calldata.at(-1);
    if (last === undefined || BigInt(last) !== 1n) {
      throw new Error(
        "Deposit proof without screening data is missing Option::None.",
      );
    }
  }

  const summary = {
    result: signaturePresent
      ? "VEIL_AVNU_DEPOSIT_SCREENING_PROOF_READY"
      : "VEIL_AVNU_DEPOSIT_SCREENING_SIGNATURE_MISSING",
    network: "SN_SEPOLIA",
    privacyPoolAddress: feltHex(poolAddress),
    accountAddress: feltHex(identity.accountAddress),
    depositToken: feltHex(STRK),
    depositAmountRaw: depositAmount.toString(),
    provingBlockId: String(provingBlockId),
    publicBalanceSufficient: balanceSufficient,
    allowanceSufficient,
    proofPresent,
    proofLength: proof.data.length,
    proofFactsCount,
    screeningSignaturePresent: signaturePresent,
    applyActionsAttestationVariant: attestationVariant,
    transactionHash: null,
    submissionStatus: "NOT_SUBMITTED",
  };

  await writeFile(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  console.log(`AVNU_DEPOSIT_SCREENING_SIGNATURE_PRESENT=${signaturePresent}`);
  console.log(`AVNU_DEPOSIT_APPLY_ACTIONS_ATTESTATION=${attestationVariant}`);
  console.log(JSON.stringify(summary));

  if (!signaturePresent) {
    throw new Error(
      "Official prover generated the deposit proof without a screening signature.",
    );
  }

  console.log("VEIL_AVNU_DEPOSIT_SCREENING_PROOF_READY");
}

try {
  await main();
} catch (error) {
  const sensitiveValues = [
    process.env.VEIL_POC_ACCOUNT_PRIVATE_KEY ?? "",
    process.env.VEIL_POC_VIEWING_KEY ?? "",
  ].filter(Boolean);

  await writeSafeError(error, sensitiveValues);

  if (error instanceof ProvingServiceError) {
    console.error("AVNU_DEPOSIT_PROVER_ERROR");
  }

  process.exitCode = 1;
}
