import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  MAX_VIEWING_KEY,
  ProvingServiceProofProvider,
  createEmptyRegistry,
  createPrivateTransfers,
} from "@starkware-libs/starknet-privacy-sdk";
import type {
  DiscoveryProviderInterface,
  ExecuteResult,
  PrivateRegistry,
  ProofProviderInterface,
  ProvingBlockId,
} from "@starkware-libs/starknet-privacy-sdk";
import { Signer, constants } from "starknet";
import type { SignerInterface } from "starknet";

export const DEFAULT_POOL_ADDRESS =
  "0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5";
export const ISOLATED_POC_SIGNER_LABEL =
  "standard starknet.js signer for isolated VEIL PoC";
export const REGISTER_PROOF_RESULT = "OFFICIAL_SDK_REGISTER_PROOF_GENERATED";

type DiscoveryMethod =
  | "discoverNotes"
  | "discoverChannels"
  | "discoverRequirement";

export class LocalDiscoveryAccessError extends Error {
  readonly method: DiscoveryMethod;

  constructor(method: DiscoveryMethod) {
    super(`Local fail-closed discovery method called: ${method}`);
    this.name = "LocalDiscoveryAccessError";
    this.method = method;
  }
}

/**
 * Isolated register needs no note or channel discovery. This provider satisfies
 * the official SDK interface without an indexer and fails closed if that
 * assumption ever changes.
 */
export class LocalFailClosedDiscoveryProvider
implements DiscoveryProviderInterface {
  discoveryCalls = 0;
  lastMethod: DiscoveryMethod | undefined;

  private reject(method: DiscoveryMethod): never {
    this.discoveryCalls += 1;
    this.lastMethod = method;
    throw new LocalDiscoveryAccessError(method);
  }

  async discoverNotes(
    ..._args: Parameters<DiscoveryProviderInterface["discoverNotes"]>
  ): ReturnType<DiscoveryProviderInterface["discoverNotes"]> {
    return this.reject("discoverNotes");
  }

  async discoverChannels(
    ..._args: Parameters<DiscoveryProviderInterface["discoverChannels"]>
  ): ReturnType<DiscoveryProviderInterface["discoverChannels"]> {
    return this.reject("discoverChannels");
  }

  async discoverRequirement(
    ..._args: Parameters<DiscoveryProviderInterface["discoverRequirement"]>
  ): ReturnType<DiscoveryProviderInterface["discoverRequirement"]> {
    return this.reject("discoverRequirement");
  }
}

export interface VeilRegisterProofSummary {
  result: string;
  proofPresent: boolean;
  proofLength: number;
  proofFactsCount: number;
  l2ToL1OutputCount: number;
  discoveryCalls: number;
  accountAddress: string;
  provingBlockId: string;
}

export interface RegisterProofExecutionOptions {
  accountAddress: bigint;
  signer: SignerInterface | undefined;
  viewingKey: bigint;
  provingProvider: ProofProviderInterface;
  discoveryProvider: LocalFailClosedDiscoveryProvider;
  registry: PrivateRegistry;
  poolAddress: bigint;
  provingBlockId: ProvingBlockId;
}

export interface VeilOfficialRegisterPocConfig {
  rpcUrl: string;
  proverUrl: string;
  accountAddress: bigint;
  accountPrivateKey: string;
  poolAddress: bigint;
  provingBlockId: ProvingBlockId;
  provingBlockIdLabel: string;
  summaryPath: string;
}

function requiredEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  description = name,
): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${description} is required.`);
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

function parseProvingBlockId(value: string): {
  blockId: ProvingBlockId;
  label: string;
} {
  if (value === "latest") return { blockId: "latest", label: "latest" };
  if (!/^\d+$/u.test(value)) {
    throw new Error("VEIL_POC_BLOCK_ID must be latest or a block number.");
  }
  const blockNumber = Number(value);
  if (!Number.isSafeInteger(blockNumber)) {
    throw new Error("VEIL_POC_BLOCK_ID is outside the safe integer range.");
  }
  return { blockId: blockNumber, label: String(blockNumber) };
}

function createEphemeralViewingKey(): bigint {
  const candidate = BigInt(`0x${randomBytes(32).toString("hex")}`)
    % MAX_VIEWING_KEY;
  return candidate === 0n ? 1n : candidate;
}

export function loadVeilOfficialRegisterPocConfig(
  env: NodeJS.ProcessEnv = process.env,
): VeilOfficialRegisterPocConfig {
  const accountPrivateKey = requiredEnv(
    env,
    "VEIL_POC_ACCOUNT_PRIVATE_KEY",
    `${ISOLATED_POC_SIGNER_LABEL} private key`,
  );
  const proverUrl = requiredEnv(env, "VEIL_POC_PROVER_URL", "Official prover URL");
  const { blockId, label } = parseProvingBlockId(
    env.VEIL_POC_BLOCK_ID?.trim() || "latest",
  );

  return {
    rpcUrl: requiredEnv(env, "STARKNET_SEPOLIA_RPC_URL"),
    proverUrl,
    accountAddress: parsePositiveFelt(
      requiredEnv(env, "VEIL_POC_ACCOUNT_ADDRESS"),
      "VEIL_POC_ACCOUNT_ADDRESS",
    ),
    accountPrivateKey,
    poolAddress: parsePositiveFelt(
      env.VEIL_POC_PRIVACY_POOL?.trim() || DEFAULT_POOL_ADDRESS,
      "VEIL_POC_PRIVACY_POOL",
    ),
    provingBlockId: blockId,
    provingBlockIdLabel: label,
    summaryPath:
      env.VEIL_POC_SUMMARY_PATH?.trim()
      || "veil-register-proof-summary.json",
  };
}

export function createStandardPocSigner(privateKey: string): Signer {
  if (!privateKey.trim()) {
    throw new Error(`${ISOLATED_POC_SIGNER_LABEL} is required.`);
  }
  return new Signer(privateKey);
}

export function createOfficialProvingProvider(config: {
  proverUrl: string;
  rpcUrl: string;
  poolAddress: bigint;
  provingBlockId: ProvingBlockId;
}): ProvingServiceProofProvider {
  if (!config.proverUrl.trim()) throw new Error("Official prover URL is required.");
  return new ProvingServiceProofProvider(
    config.proverUrl,
    constants.StarknetChainId.SN_SEPOLIA,
    {
      nodeUrl: config.rpcUrl,
      poolAddress: config.poolAddress,
      blockIdentifier: config.provingBlockId,
      requestTimeoutMs: 300 * 60 * 1_000,
      retry: { maxRetries: 0 },
    },
  );
}

export async function executeOfficialRegisterProof(
  options: RegisterProofExecutionOptions,
): Promise<ExecuteResult> {
  if (!options.signer || typeof options.signer.signTransaction !== "function") {
    throw new Error(`${ISOLATED_POC_SIGNER_LABEL} is required.`);
  }

  const transfers = createPrivateTransfers({
    account: { address: options.accountAddress, signer: options.signer },
    viewingKeyProvider: {
      async getViewingKey() {
        return options.viewingKey;
      },
    },
    provingProvider: options.provingProvider,
    discoveryProvider: options.discoveryProvider,
    poolContractAddress: options.poolAddress,
    poolMode: "compatibility",
  });

  return transfers
    .build({ registry: options.registry, registryConst: true })
    .register()
    .execute({ provingBlockId: options.provingBlockId });
}

export function createRegisterProofSummary(input: {
  result: ExecuteResult;
  discoveryCalls: number;
  accountAddress: bigint;
  provingBlockId: string;
}): VeilRegisterProofSummary {
  const proof = input.result.callAndProof.proof;
  const proofPresent = typeof proof.data === "string" && proof.data.length > 0;
  const proofFactsCount = Array.isArray(proof.proofFacts)
    ? proof.proofFacts.length
    : 0;

  if (!proofPresent) {
    throw new Error("Official transaction prover returned no proof.");
  }
  if (proofFactsCount < 1) {
    throw new Error("Official transaction prover returned no proof facts.");
  }
  if (input.discoveryCalls !== 0) {
    throw new Error("Register proof unexpectedly invoked discovery.");
  }

  return {
    result: REGISTER_PROOF_RESULT,
    proofPresent,
    proofLength: proof.data.length,
    proofFactsCount,
    l2ToL1OutputCount: Array.isArray(proof.output) ? proof.output.length : 0,
    discoveryCalls: input.discoveryCalls,
    accountAddress: `0x${input.accountAddress.toString(16)}`,
    provingBlockId: input.provingBlockId,
  };
}

export function assertRegisterProofSummarySafe(
  summary: VeilRegisterProofSummary,
  sensitiveValues: readonly string[] = [],
): void {
  const expectedKeys = [
    "result",
    "proofPresent",
    "proofLength",
    "proofFactsCount",
    "l2ToL1OutputCount",
    "discoveryCalls",
    "accountAddress",
    "provingBlockId",
  ];
  const actualKeys = Object.keys(summary);
  if (actualKeys.length !== expectedKeys.length
      || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error("Register proof summary contains an unexpected field.");
  }

  const serialized = JSON.stringify(summary);
  const forbiddenNames = [
    "privateKey",
    "signature",
    "viewingKey",
    "registrySecret",
    "decryptedData",
    "plaintextMessage",
  ];
  if (forbiddenNames.some((name) => serialized.includes(name))) {
    throw new Error("Register proof summary contains a forbidden field.");
  }
  if (sensitiveValues.some((value) => value.length > 0 && serialized.includes(value))) {
    throw new Error("Register proof summary contains sensitive material.");
  }
}

export async function runVeilOfficialRegisterPoc(
  env: NodeJS.ProcessEnv = process.env,
): Promise<VeilRegisterProofSummary> {
  const config = loadVeilOfficialRegisterPocConfig(env);
  const signer = createStandardPocSigner(config.accountPrivateKey);
  const viewingKey = createEphemeralViewingKey();
  const discoveryProvider = new LocalFailClosedDiscoveryProvider();
  const provingProvider = createOfficialProvingProvider(config);
  const result = await executeOfficialRegisterProof({
    accountAddress: config.accountAddress,
    signer,
    viewingKey,
    provingProvider,
    discoveryProvider,
    registry: createEmptyRegistry(),
    poolAddress: config.poolAddress,
    provingBlockId: config.provingBlockId,
  });

  const summary = createRegisterProofSummary({
    result,
    discoveryCalls: discoveryProvider.discoveryCalls,
    accountAddress: config.accountAddress,
    provingBlockId: config.provingBlockIdLabel,
  });
  assertRegisterProofSummarySafe(summary, [
    config.accountPrivateKey,
    viewingKey.toString(),
  ]);
  await writeFile(config.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
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
    const summary = await runVeilOfficialRegisterPoc();
    console.log(JSON.stringify(summary));
  } catch (error) {
    if (error instanceof LocalDiscoveryAccessError) {
      console.error(`VEIL register PoC failed closed; discovery method called: ${error.method}`);
    } else if (error instanceof Error && /required|must be/u.test(error.message)) {
      console.error(`VEIL register PoC configuration failed: ${error.message}`);
    } else {
      const errorName = error instanceof Error ? error.name : "UnknownError";
      console.error(`VEIL official register PoC failed closed: ${errorName}`);
    }
    process.exitCode = 1;
  }
}
