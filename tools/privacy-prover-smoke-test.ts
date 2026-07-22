import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

import {
  IndexerDiscoveryProvider,
  MAX_VIEWING_KEY,
  ProvingServiceProofProvider,
  createEmptyRegistry,
  createPrivateTransfers,
} from "@starkware-libs/starknet-privacy-sdk";
import { Signer, constants } from "starknet";

const DEFAULT_POOL_ADDRESS =
  "0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5";
const SDK_VERSION = "0.14.3-rc.2";
const PROVER_VERSION = "PRIVACY-0.14.3-RC.2";
const POOL_COMPATIBILITY = "PRIVACY-0.14.3-RC.0";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parsePositiveFelt(value: string, label: string): bigint {
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch (cause) {
    throw new Error(`${label} must be a Starknet felt.`, { cause });
  }
  if (parsed <= 0n || parsed >= (1n << 251n)) {
    throw new Error(`${label} must be a nonzero Starknet felt.`);
  }
  return parsed;
}

function parseProvingBlockId(value: string): "latest" | number {
  if (value === "latest") return "latest";
  if (!/^\d+$/u.test(value)) {
    throw new Error("VEIL_POC_RESOLVED_BLOCK_ID must be latest or a block number.");
  }
  const blockNumber = Number(value);
  if (!Number.isSafeInteger(blockNumber)) {
    throw new Error("VEIL_POC_RESOLVED_BLOCK_ID is outside the safe integer range.");
  }
  return blockNumber;
}

function createEphemeralViewingKey(): bigint {
  const candidate = BigInt(`0x${randomBytes(32).toString("hex")}`)
    % MAX_VIEWING_KEY;
  return candidate === 0n ? 1n : candidate;
}

const rpcUrl = requiredEnv("VEIL_POC_RPC_URL");
const proverUrl = requiredEnv("VEIL_POC_PROVER_URL");
const indexerUrl = requiredEnv("VEIL_POC_INDEXER_URL");
const accountAddress = parsePositiveFelt(
  requiredEnv("VEIL_POC_ACCOUNT_ADDRESS"),
  "VEIL_POC_ACCOUNT_ADDRESS",
);
const accountPrivateKey = requiredEnv("VEIL_POC_ACCOUNT_PRIVATE_KEY");
const poolAddress = parsePositiveFelt(
  process.env.VEIL_POC_PRIVACY_POOL?.trim() || DEFAULT_POOL_ADDRESS,
  "VEIL_POC_PRIVACY_POOL",
);
const provingBlockId = parseProvingBlockId(
  requiredEnv("VEIL_POC_RESOLVED_BLOCK_ID"),
);
const summaryPath = requiredEnv("VEIL_POC_SUMMARY_PATH");

// The official SDK owns transaction construction and calls the real signer.
// No manual signature assembly is permitted on this production proof path.
const signer = new Signer(accountPrivateKey);
const viewingKey = createEphemeralViewingKey();
const provingProvider = new ProvingServiceProofProvider(
  proverUrl,
  constants.StarknetChainId.SN_SEPOLIA,
  {
    nodeUrl: rpcUrl,
    poolAddress,
    blockIdentifier: provingBlockId,
    requestTimeoutMs: 300 * 60 * 1_000,
    retry: { maxRetries: 0 },
  },
);
const discoveryProvider = new IndexerDiscoveryProvider(
  indexerUrl,
  poolAddress,
);
const transfers = createPrivateTransfers({
  account: { address: accountAddress, signer },
  viewingKeyProvider: {
    async getViewingKey() {
      return viewingKey;
    },
  },
  provingProvider,
  discoveryProvider,
  poolContractAddress: poolAddress,
});
const registry = createEmptyRegistry();

const result = await transfers
  .build({ registry, registryConst: true })
  .register()
  .execute({ provingBlockId });

const proof = result.callAndProof.proof;
if (typeof proof.data !== "string" || proof.data.length === 0) {
  throw new Error("Official transaction prover returned an empty proof.");
}
if (!Array.isArray(proof.proofFacts) || proof.proofFacts.length === 0) {
  throw new Error("Official transaction prover returned no proof facts.");
}
if (!Array.isArray(proof.output) || proof.output.length === 0) {
  throw new Error("Official transaction prover returned no L2-to-L1 output.");
}

const summary = {
  result: "OFFICIAL_SDK_REAL_PROOF_GENERATED",
  sdkVersion: SDK_VERSION,
  proverVersion: PROVER_VERSION,
  poolCompatibility: POOL_COMPATIBILITY,
  chainId: "SN_SEPOLIA",
  transactionVersion: "0x3",
  outsideExecutionVersion: "V2",
  signer: "starknet.js Signer via createPrivateTransfers",
  discoveryProvider: "IndexerDiscoveryProvider",
  provingProvider: "ProvingServiceProofProvider",
  proofPresent: true,
  proofLength: proof.data.length,
  proofFactsCount: proof.proofFacts.length,
  l2ToL1OutputCount: proof.output.length,
  warningCount: result.warnings.length,
  registryChannelCount: result.registry.channels.size,
};

await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});

console.log(JSON.stringify(summary));
