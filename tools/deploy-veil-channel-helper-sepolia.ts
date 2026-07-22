import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  Account,
  RpcError,
  RpcProvider,
  TransactionExecutionStatus,
  TransactionFinalityStatus,
  constants,
  hash,
  json,
} from "starknet";
import type {
  CompiledContract,
  CompiledSierraCasm,
  waitForTransactionOptions,
} from "starknet";

export const VEIL_CHANNEL_HELPER_CONTRACT_NAME = "VeilChannelHelper";
export const VEIL_CHANNEL_HELPER_DEPLOYMENT_RESULT =
  "VEIL_CHANNEL_HELPER_DEPLOYED_ON_SEPOLIA";
export const VEIL_CHANNEL_HELPER_ARTIFACT_RESULT =
  "VEIL_CHANNEL_HELPER_ARTIFACTS_VALID";
export const VEIL_CHANNEL_HELPER_NETWORK = "SN_SEPOLIA";
export const DEFAULT_VEIL_CHANNEL_HELPER_MANIFEST_PATH =
  "target/dev/veilc.starknet_artifacts.json";
export const DEFAULT_VEIL_CHANNEL_HELPER_SUMMARY_PATH =
  "veil-channel-helper-deployment-summary.json";
export const SEPOLIA_PRIVACY_POOL_ADDRESS =
  "0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5";

interface ArtifactManifestEntry {
  contract_name: string;
  artifacts: {
    sierra: string;
    casm: string;
  };
}

interface ArtifactManifest {
  contracts: ArtifactManifestEntry[];
}

export interface VeilChannelHelperArtifacts {
  sierra: CompiledContract;
  casm: CompiledSierraCasm;
  classHash: string;
  compiledClassHash: string;
}

export interface VeilChannelHelperArtifactValidation {
  result: string;
  contractName: string;
  classHash: string;
  compiledClassHash: string;
}

export interface VeilChannelHelperDeploymentSummary {
  result: string;
  network: string;
  contractName: string;
  classHash: string;
  contractAddress: string;
  declareTransactionHash: string | null;
  deployTransactionHash: string;
  finalityStatus: string;
  executionStatus: string;
  deployerAddress: string;
  blockNumber: number;
}

export interface DeploymentReceipt {
  finality_status?: string;
  execution_status?: string;
  block_number?: number;
  isSuccess(): boolean;
  isReverted(): boolean;
}

export interface VeilChannelHelperDeploymentAccount {
  getChainId(): Promise<string>;
  getClassByHash(classHash: string): Promise<unknown>;
  declare(payload: {
    contract: CompiledContract;
    casm: CompiledSierraCasm;
    classHash: string;
    compiledClassHash: string;
  }): Promise<{ transaction_hash: string; class_hash: string }>;
  deploy(payload: {
    classHash: string;
    constructorCalldata: string[];
    unique: boolean;
  }): Promise<{ transaction_hash: string; contract_address: string[] }>;
  waitForTransaction(
    transactionHash: string,
    options?: waitForTransactionOptions,
  ): Promise<DeploymentReceipt>;
  getClassHashAt(contractAddress: string, blockIdentifier?: number): Promise<string>;
}

export interface VeilChannelHelperDeploymentConfig {
  deployContract: boolean;
  artifactManifestPath: string;
  summaryPath: string;
  rpcUrl?: string;
  accountAddress?: string;
  accountPrivateKey?: string;
}

export interface VeilChannelHelperDeploymentDependencies {
  loadArtifacts?: typeof loadVeilChannelHelperArtifacts;
  createAccount?: typeof createVeilChannelHelperDeploymentAccount;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseBoolean(value: string | undefined, label: string): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${label} must be true or false.`);
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalizePositiveFelt(value: string, label: string): string {
  let felt: bigint;
  try {
    felt = BigInt(value);
  } catch (cause) {
    throw new Error(`${label} must be a Starknet felt.`, { cause });
  }
  if (felt <= 0n || felt >= (1n << 251n)) {
    throw new Error(`${label} must be a nonzero Starknet felt.`);
  }
  return `0x${felt.toString(16)}`;
}

function resolveArtifactPath(artifactDirectory: string, artifactPath: string): string {
  if (!artifactPath.trim() || isAbsolute(artifactPath)) {
    throw new Error("Contract artifact path must be relative.");
  }
  const resolvedPath = resolve(artifactDirectory, artifactPath);
  const relativePath = relative(artifactDirectory, resolvedPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("Contract artifact path escapes its build directory.");
  }
  return resolvedPath;
}

function readArtifactManifest(value: unknown): ArtifactManifest {
  if (!isRecord(value) || !Array.isArray(value.contracts)) {
    throw new Error("Scarb Starknet artifact manifest is invalid.");
  }
  const contracts: ArtifactManifestEntry[] = [];
  for (const contract of value.contracts) {
    if (!isRecord(contract)
        || typeof contract.contract_name !== "string"
        || !isRecord(contract.artifacts)
        || typeof contract.artifacts.sierra !== "string"
        || typeof contract.artifacts.casm !== "string") {
      throw new Error("Scarb Starknet artifact entry is invalid.");
    }
    contracts.push({
      contract_name: contract.contract_name,
      artifacts: {
        sierra: contract.artifacts.sierra,
        casm: contract.artifacts.casm,
      },
    });
  }
  return { contracts };
}

function assertExpectedConstructor(sierra: CompiledContract): void {
  if (!isRecord(sierra) || !Array.isArray(sierra.abi)) {
    throw new Error("VeilChannelHelper Sierra artifact has no ABI.");
  }
  const constructors = sierra.abi.filter((entry) => isRecord(entry)
    && entry.type === "constructor");
  if (constructors.length !== 1) {
    throw new Error("VeilChannelHelper must have exactly one constructor.");
  }
  const constructor = constructors[0];
  if (!isRecord(constructor)
      || !Array.isArray(constructor.inputs)
      || constructor.inputs.length !== 1
      || !isRecord(constructor.inputs[0])
      || constructor.inputs[0].name !== "privacy_pool"
      || constructor.inputs[0].type
        !== "core::starknet::contract_address::ContractAddress") {
    throw new Error("VeilChannelHelper constructor ABI is not supported.");
  }
}

export async function loadVeilChannelHelperArtifacts(
  manifestPath = DEFAULT_VEIL_CHANNEL_HELPER_MANIFEST_PATH,
): Promise<VeilChannelHelperArtifacts> {
  const absoluteManifestPath = resolve(manifestPath);
  const manifest = readArtifactManifest(json.parse(
    await readFile(absoluteManifestPath, "utf8"),
  ));
  const matches = manifest.contracts.filter(
    (contract) => contract.contract_name === VEIL_CHANNEL_HELPER_CONTRACT_NAME,
  );
  if (matches.length !== 1) {
    throw new Error("Scarb manifest must contain exactly one VeilChannelHelper.");
  }

  const artifactDirectory = dirname(absoluteManifestPath);
  const contract = matches[0]!;
  const sierra = json.parse(await readFile(
    resolveArtifactPath(artifactDirectory, contract.artifacts.sierra),
    "utf8",
  )) as CompiledContract;
  const casm = json.parse(await readFile(
    resolveArtifactPath(artifactDirectory, contract.artifacts.casm),
    "utf8",
  )) as CompiledSierraCasm;
  assertExpectedConstructor(sierra);

  return {
    sierra,
    casm,
    classHash: normalizePositiveFelt(
      hash.computeContractClassHash(sierra),
      "VeilChannelHelper class hash",
    ),
    compiledClassHash: normalizePositiveFelt(
      hash.computeCompiledClassHash(casm),
      "VeilChannelHelper compiled class hash",
    ),
  };
}

export function createArtifactValidation(
  artifacts: VeilChannelHelperArtifacts,
): VeilChannelHelperArtifactValidation {
  return {
    result: VEIL_CHANNEL_HELPER_ARTIFACT_RESULT,
    contractName: VEIL_CHANNEL_HELPER_CONTRACT_NAME,
    classHash: artifacts.classHash,
    compiledClassHash: artifacts.compiledClassHash,
  };
}

export function loadVeilChannelHelperDeploymentConfig(
  env: NodeJS.ProcessEnv = process.env,
): VeilChannelHelperDeploymentConfig {
  const deployContract = parseBoolean(
    env.VEIL_DEPLOY_CONTRACT,
    "VEIL_DEPLOY_CONTRACT",
  );
  const common = {
    deployContract,
    artifactManifestPath:
      env.VEIL_CHANNEL_HELPER_ARTIFACT_MANIFEST?.trim()
      || DEFAULT_VEIL_CHANNEL_HELPER_MANIFEST_PATH,
    summaryPath:
      env.VEIL_CHANNEL_HELPER_DEPLOYMENT_SUMMARY_PATH?.trim()
      || DEFAULT_VEIL_CHANNEL_HELPER_SUMMARY_PATH,
  };
  if (!deployContract) return common;

  return {
    ...common,
    rpcUrl: requiredEnv(env, "STARKNET_SEPOLIA_RPC_URL"),
    accountAddress: normalizePositiveFelt(
      requiredEnv(env, "VEIL_POC_ACCOUNT_ADDRESS"),
      "VEIL_POC_ACCOUNT_ADDRESS",
    ),
    accountPrivateKey: requiredEnv(env, "VEIL_POC_ACCOUNT_PRIVATE_KEY"),
  };
}

export function createVeilChannelHelperDeploymentAccount(config: {
  rpcUrl: string;
  accountAddress: string;
  accountPrivateKey: string;
}): VeilChannelHelperDeploymentAccount {
  const provider = new RpcProvider({ nodeUrl: config.rpcUrl });
  return new Account({
    provider,
    address: config.accountAddress,
    signer: config.accountPrivateKey,
  }) as unknown as VeilChannelHelperDeploymentAccount;
}

function isClassHashNotFound(error: unknown): boolean {
  if (error instanceof RpcError) return error.isType("CLASS_HASH_NOT_FOUND");
  return isRecord(error) && error.code === 28;
}

function isClassAlreadyDeclared(error: unknown): boolean {
  if (error instanceof RpcError) return error.isType("CLASS_ALREADY_DECLARED");
  return isRecord(error) && error.code === 51;
}

function assertSuccessfulL2Receipt(
  receipt: DeploymentReceipt,
  transactionLabel: string,
): asserts receipt is DeploymentReceipt & {
  finality_status: typeof TransactionFinalityStatus.ACCEPTED_ON_L2;
  execution_status: typeof TransactionExecutionStatus.SUCCEEDED;
} {
  if (receipt.isReverted()
      || !receipt.isSuccess()
      || receipt.finality_status !== TransactionFinalityStatus.ACCEPTED_ON_L2
      || receipt.execution_status !== TransactionExecutionStatus.SUCCEEDED) {
    throw new Error(`${transactionLabel} was not accepted and successful on L2.`);
  }
}

async function waitForSuccessfulL2Receipt(
  account: VeilChannelHelperDeploymentAccount,
  transactionHash: string,
  transactionLabel: string,
): Promise<DeploymentReceipt & {
  finality_status: typeof TransactionFinalityStatus.ACCEPTED_ON_L2;
  execution_status: typeof TransactionExecutionStatus.SUCCEEDED;
}> {
  const receipt = await account.waitForTransaction(transactionHash, {
    successStates: [TransactionFinalityStatus.ACCEPTED_ON_L2],
    errorStates: [TransactionExecutionStatus.REVERTED],
  });
  assertSuccessfulL2Receipt(receipt, transactionLabel);
  return receipt;
}

async function declareVeilChannelHelper(
  account: VeilChannelHelperDeploymentAccount,
  artifacts: VeilChannelHelperArtifacts,
): Promise<string | null> {
  try {
    await account.getClassByHash(artifacts.classHash);
    return null;
  } catch (error) {
    if (!isClassHashNotFound(error)) throw error;
  }

  try {
    const declaration = await account.declare({
      contract: artifacts.sierra,
      casm: artifacts.casm,
      classHash: artifacts.classHash,
      compiledClassHash: artifacts.compiledClassHash,
    });
    if (normalizePositiveFelt(declaration.class_hash, "Declared class hash")
        !== artifacts.classHash) {
      throw new Error("Declared class hash does not match the local artifact.");
    }
    const transactionHash = normalizePositiveFelt(
      declaration.transaction_hash,
      "Declare transaction hash",
    );
    await waitForSuccessfulL2Receipt(account, transactionHash, "Declare transaction");
    return transactionHash;
  } catch (error) {
    if (!isClassAlreadyDeclared(error)) throw error;
    await account.getClassByHash(artifacts.classHash);
    return null;
  }
}

export async function deployVeilChannelHelper(input: {
  account: VeilChannelHelperDeploymentAccount;
  artifacts: VeilChannelHelperArtifacts;
  deployerAddress: string;
}): Promise<VeilChannelHelperDeploymentSummary> {
  if (await input.account.getChainId() !== constants.StarknetChainId.SN_SEPOLIA) {
    throw new Error("Deployment RPC is not Starknet Sepolia.");
  }

  const deployerAddress = normalizePositiveFelt(
    input.deployerAddress,
    "Deployer address",
  );
  const declareTransactionHash = await declareVeilChannelHelper(
    input.account,
    input.artifacts,
  );
  const deployment = await input.account.deploy({
    classHash: input.artifacts.classHash,
    constructorCalldata: [SEPOLIA_PRIVACY_POOL_ADDRESS],
    unique: true,
  });
  if (deployment.contract_address.length !== 1) {
    throw new Error("VeilChannelHelper deployment returned an invalid address count.");
  }
  const deployTransactionHash = normalizePositiveFelt(
    deployment.transaction_hash,
    "Deploy transaction hash",
  );
  const contractAddress = normalizePositiveFelt(
    deployment.contract_address[0]!,
    "Deployed contract address",
  );
  const receipt = await waitForSuccessfulL2Receipt(
    input.account,
    deployTransactionHash,
    "Deploy transaction",
  );
  if (!Number.isSafeInteger(receipt.block_number) || receipt.block_number! < 0) {
    throw new Error("Deploy receipt has no valid block number.");
  }

  const deployedClassHash = normalizePositiveFelt(
    await input.account.getClassHashAt(contractAddress, receipt.block_number),
    "Deployed class hash",
  );
  if (deployedClassHash !== input.artifacts.classHash) {
    throw new Error("Deployed class hash does not match the declared artifact.");
  }

  return {
    result: VEIL_CHANNEL_HELPER_DEPLOYMENT_RESULT,
    network: VEIL_CHANNEL_HELPER_NETWORK,
    contractName: VEIL_CHANNEL_HELPER_CONTRACT_NAME,
    classHash: input.artifacts.classHash,
    contractAddress,
    declareTransactionHash,
    deployTransactionHash,
    finalityStatus: receipt.finality_status,
    executionStatus: receipt.execution_status,
    deployerAddress,
    blockNumber: receipt.block_number!,
  };
}

export function assertDeploymentSummarySafe(
  summary: VeilChannelHelperDeploymentSummary,
  sensitiveValues: readonly string[] = [],
): void {
  const expectedKeys = [
    "result",
    "network",
    "contractName",
    "classHash",
    "contractAddress",
    "declareTransactionHash",
    "deployTransactionHash",
    "finalityStatus",
    "executionStatus",
    "deployerAddress",
    "blockNumber",
  ];
  const actualKeys = Object.keys(summary);
  if (actualKeys.length !== expectedKeys.length
      || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error("Deployment summary contains an unexpected field.");
  }
  if (summary.result !== VEIL_CHANNEL_HELPER_DEPLOYMENT_RESULT
      || summary.network !== VEIL_CHANNEL_HELPER_NETWORK
      || summary.contractName !== VEIL_CHANNEL_HELPER_CONTRACT_NAME
      || summary.finalityStatus !== TransactionFinalityStatus.ACCEPTED_ON_L2
      || summary.executionStatus !== TransactionExecutionStatus.SUCCEEDED) {
    throw new Error("Deployment summary contains an invalid verdict.");
  }
  normalizePositiveFelt(summary.classHash, "Summary class hash");
  normalizePositiveFelt(summary.contractAddress, "Summary contract address");
  normalizePositiveFelt(summary.deployTransactionHash, "Summary deploy transaction hash");
  normalizePositiveFelt(summary.deployerAddress, "Summary deployer address");
  if (summary.declareTransactionHash !== null) {
    normalizePositiveFelt(
      summary.declareTransactionHash,
      "Summary declare transaction hash",
    );
  }
  if (!Number.isSafeInteger(summary.blockNumber) || summary.blockNumber < 0) {
    throw new Error("Deployment summary contains an invalid block number.");
  }

  const forbiddenKeys = [
    "privateKey",
    "signature",
    "calldata",
    "viewingKey",
    "environment",
    "rpcUrl",
    "apiKey",
    "secret",
  ];
  if (forbiddenKeys.some((key) => Object.hasOwn(summary, key))) {
    throw new Error("Deployment summary contains a forbidden field.");
  }
  const serialized = JSON.stringify(summary);
  if (sensitiveValues.some((value) => value.length > 0 && serialized.includes(value))) {
    throw new Error("Deployment summary contains sensitive material.");
  }
}

export async function writeDeploymentSummary(
  summary: VeilChannelHelperDeploymentSummary,
  outputPath = DEFAULT_VEIL_CHANNEL_HELPER_SUMMARY_PATH,
  sensitiveValues: readonly string[] = [],
): Promise<void> {
  assertDeploymentSummarySafe(summary, sensitiveValues);
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function runVeilChannelHelperDeployment(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: VeilChannelHelperDeploymentDependencies = {},
): Promise<VeilChannelHelperArtifactValidation | VeilChannelHelperDeploymentSummary> {
  const config = loadVeilChannelHelperDeploymentConfig(env);
  const artifacts = await (dependencies.loadArtifacts
    ?? loadVeilChannelHelperArtifacts)(config.artifactManifestPath);
  if (!config.deployContract) return createArtifactValidation(artifacts);

  const rpcUrl = config.rpcUrl!;
  const accountAddress = config.accountAddress!;
  const accountPrivateKey = config.accountPrivateKey!;
  const account = (dependencies.createAccount
    ?? createVeilChannelHelperDeploymentAccount)({
    rpcUrl,
    accountAddress,
    accountPrivateKey,
  });
  const summary = await deployVeilChannelHelper({
    account,
    artifacts,
    deployerAddress: accountAddress,
  });
  await writeDeploymentSummary(summary, config.summaryPath, [
    accountPrivateKey,
    rpcUrl,
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
    const result = await runVeilChannelHelperDeployment();
    console.log(JSON.stringify(result));
  } catch {
    console.error("VEIL Channel Helper deployment failed closed.");
    process.exitCode = 1;
  }
}
