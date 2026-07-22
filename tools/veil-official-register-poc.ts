import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  MAX_VIEWING_KEY,
  ProvingServiceError,
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
import {
  RpcError,
  RpcProvider,
  Signer,
  constants,
  num,
} from "starknet";
import type {
  BigNumberish,
  Call,
  Signature,
  SignerInterface,
} from "starknet";

export const DEFAULT_POOL_ADDRESS =
  "0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5";
export const ISOLATED_POC_SIGNER_LABEL =
  "standard starknet.js signer for isolated VEIL PoC";
export const REGISTER_PROOF_RESULT = "OFFICIAL_SDK_REGISTER_PROOF_GENERATED";
export const DEFAULT_PROVING_ERROR_PATH = "veil-proving-error.json";
export const DEFAULT_ACCOUNT_PREFLIGHT_PATH = "veil-account-preflight.json";

const REDACTED = "[REDACTED]";
const REDACTED_URL = "[REDACTED_URL]";
const TRUNCATED = "[TRUNCATED]";
const MAX_DIAGNOSTIC_DEPTH = 4;
const MAX_DIAGNOSTIC_ARRAY_ITEMS = 20;
const MAX_DIAGNOSTIC_OBJECT_ENTRIES = 40;
const MAX_DIAGNOSTIC_STRING_LENGTH = 2_048;

export type SafeDiagnosticValue =
  | null
  | boolean
  | number
  | string
  | SafeDiagnosticValue[]
  | { [key: string]: SafeDiagnosticValue };

export interface SafeProvingServiceErrorDiagnostic {
  name: string;
  code: number;
  message: string;
  data: SafeDiagnosticValue;
}

export type AccountPreflightVerdict =
  | "ACCOUNT_NOT_DEPLOYED"
  | "PRIVATE_KEY_OWNER_MISMATCH"
  | "STANDARD_SIGNER_INCOMPATIBLE"
  | "SIGNER_PREFLIGHT_VALID"
  | "ACCOUNT_PREFLIGHT_UNSUPPORTED";

export type AccountSignatureValidation =
  | "VALID"
  | "INVALID"
  | "NOT_RUN"
  | "UNSUPPORTED";

export interface VeilAccountPreflightArtifact {
  accountAddress: string;
  blockId: string;
  nonce: string;
  classHash: string;
  accountType: string;
  ownerMatch: boolean;
  signatureValidation: AccountSignatureValidation;
  verdict: AccountPreflightVerdict;
}

export interface AccountPreflightResult {
  artifact: VeilAccountPreflightArtifact;
  provingBlockId: ProvingBlockId | undefined;
}

export interface AccountPreflightProvider {
  getBlock(blockIdentifier: ProvingBlockId): Promise<unknown>;
  getNonceForAddress(
    contractAddress: BigNumberish,
    blockIdentifier?: ProvingBlockId,
  ): Promise<string>;
  getClassHashAt(
    contractAddress: BigNumberish,
    blockIdentifier?: ProvingBlockId,
  ): Promise<string>;
  getClass(
    classHash: BigNumberish,
    blockIdentifier?: ProvingBlockId,
  ): Promise<unknown>;
  callContract(call: Call, blockIdentifier?: ProvingBlockId): Promise<string[]>;
}

export class AccountPreflightError extends Error {
  readonly artifact: VeilAccountPreflightArtifact;

  constructor(artifact: VeilAccountPreflightArtifact) {
    super(`VEIL account preflight failed closed: ${artifact.verdict}`);
    this.name = "AccountPreflightError";
    this.artifact = artifact;
  }
}

export class StandardPocSigner extends Signer {
  async signPreflightChallenge(challengeHash: string): Promise<Signature> {
    return this.signRaw(challengeHash);
  }
}

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

export interface VeilOfficialRegisterPocDependencies {
  accountPreflightProvider?: AccountPreflightProvider;
  accountPreflightPath?: string;
  createProvingProvider?: typeof createOfficialProvingProvider;
}

function isSensitiveDiagnosticKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/giu, "").toLowerCase();
  const sensitiveFragments = [
    "accesskey",
    "apikey",
    "authorization",
    "calldata",
    "invocation",
    "password",
    "payload",
    "privatekey",
    "registry",
    "registrysecret",
    "rpcurl",
    "secret",
    "signature",
    "signedtransaction",
    "token",
    "transaction",
    "transactionpayload",
    "viewingkey",
  ];
  return normalized === "key"
    || normalized.endsWith("key")
    || sensitiveFragments.some((fragment) => normalized.includes(fragment));
}

export function sanitizeProvingDiagnosticText(value: string): string {
  const sanitized = value
    .replace(/\b(?:https?|wss?):\/\/[^\s"'<>]+/giu, REDACTED_URL)
    .replace(/\b(?:bearer|basic)\s+[a-z0-9._~+/=-]+/giu, REDACTED)
    .replace(
      /\b(?:calldata|invocation|payload|registry|signed[_ -]?transaction|transaction(?:[_ -]?payload)?)\b["']?\s*[:=][\s\S]*/giu,
      REDACTED,
    )
    .replace(
      /\b(?:api[_ -]?key|authorization|password|private[_ -]?key|registry(?:[_ -]?secret)?|secret|signature|token|viewing[_ -]?key)\b["']?\s*[:=]\s*["']?[^\s,;}\]]+/giu,
      REDACTED,
    )
    .replace(/\b0x[0-9a-f]{32,}\b/giu, REDACTED)
    .replace(/\b[0-9a-f]{40,}\b/giu, REDACTED)
    .replace(/\b[0-9]{40,}\b/gu, REDACTED);

  return sanitized.length > MAX_DIAGNOSTIC_STRING_LENGTH
    ? `${sanitized.slice(0, MAX_DIAGNOSTIC_STRING_LENGTH)}${TRUNCATED}`
    : sanitized;
}

function parseJsonDiagnosticString(value: string): unknown {
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

export function sanitizeProvingDiagnosticData(
  value: unknown,
  depth = 0,
): SafeDiagnosticValue {
  if (depth > MAX_DIAGNOSTIC_DEPTH) return TRUNCATED;
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const parsed = parseJsonDiagnosticString(value);
    return parsed === value
      ? sanitizeProvingDiagnosticText(value)
      : sanitizeProvingDiagnosticData(parsed, depth + 1);
  }
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") {
    return sanitizeProvingDiagnosticText(value.toString());
  }
  if (value instanceof Uint8Array) return REDACTED;
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_DIAGNOSTIC_ARRAY_ITEMS)
      .map((item) => sanitizeProvingDiagnosticData(item, depth + 1));
    if (value.length > MAX_DIAGNOSTIC_ARRAY_ITEMS) items.push(TRUNCATED);
    return items;
  }
  if (typeof value === "object") {
    const safe: Record<string, SafeDiagnosticValue> = {};
    const entries = Object.entries(value).slice(0, MAX_DIAGNOSTIC_OBJECT_ENTRIES);
    let redacted = false;
    for (const [key, entryValue] of entries) {
      if (isSensitiveDiagnosticKey(key)) {
        redacted = true;
        continue;
      }
      safe[sanitizeProvingDiagnosticText(key)] = sanitizeProvingDiagnosticData(
        entryValue,
        depth + 1,
      );
    }
    if (redacted) safe.redacted = true;
    if (Object.keys(value).length > MAX_DIAGNOSTIC_OBJECT_ENTRIES) {
      safe.truncated = true;
    }
    return safe;
  }
  return sanitizeProvingDiagnosticText(String(value));
}

export function formatSafeProvingServiceError(
  error: ProvingServiceError,
): SafeProvingServiceErrorDiagnostic {
  const dataSuffix = error.data ? `: ${error.data}` : "";
  const rpcMessage = dataSuffix && error.message.endsWith(dataSuffix)
    ? error.message.slice(0, -dataSuffix.length)
    : error.message;

  return {
    name: sanitizeProvingDiagnosticText(error.name),
    code: error.code,
    message: sanitizeProvingDiagnosticText(rpcMessage),
    data: sanitizeProvingDiagnosticData(error.data),
  };
}

export async function writeSafeProvingServiceError(
  error: ProvingServiceError,
  outputPath = DEFAULT_PROVING_ERROR_PATH,
): Promise<SafeProvingServiceErrorDiagnostic> {
  const diagnostic = formatSafeProvingServiceError(error);
  await writeFile(outputPath, `${JSON.stringify(diagnostic, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return diagnostic;
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

export function createStandardPocSigner(privateKey: string): StandardPocSigner {
  if (!privateKey.trim()) {
    throw new Error(`${ISOLATED_POC_SIGNER_LABEL} is required.`);
  }
  return new StandardPocSigner(privateKey);
}

interface AuditedAbiFunction {
  name: string;
  inputs: unknown[];
  outputs: unknown[];
}

const OWNER_PUBLIC_KEY_GETTERS = [
  "get_public_key",
  "getPublicKey",
  "get_owner_public_key",
  "getOwnerPublicKey",
  "public_key",
] as const;

const SIGNATURE_VALIDATION_FUNCTIONS = [
  "is_valid_signature",
  "isValidSignature",
] as const;

function normalizeFeltHex(value: BigNumberish): string {
  return `0x${BigInt(value).toString(16)}`;
}

function configuredBlockIdLabel(blockId: ProvingBlockId): string {
  if (typeof blockId === "string") return blockId;
  if (typeof blockId === "number" || typeof blockId === "bigint") {
    return String(blockId);
  }
  return "unsupported";
}

function emptyAccountPreflightArtifact(input: {
  accountAddress: bigint;
  blockId: string;
}): VeilAccountPreflightArtifact {
  return {
    accountAddress: normalizeFeltHex(input.accountAddress),
    blockId: input.blockId,
    nonce: "",
    classHash: "",
    accountType: "UNKNOWN_STARK_ACCOUNT",
    ownerMatch: false,
    signatureValidation: "NOT_RUN",
    verdict: "ACCOUNT_PREFLIGHT_UNSUPPORTED",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readAbi(value: unknown): unknown[] | undefined {
  if (!isRecord(value)) return undefined;
  const { abi } = value;
  if (Array.isArray(abi)) return abi;
  if (typeof abi !== "string") return undefined;
  try {
    const parsed = JSON.parse(abi) as unknown;
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function auditAbiFunctions(abi: unknown[]): AuditedAbiFunction[] {
  const functions: AuditedAbiFunction[] = [];
  for (const entry of abi) {
    if (!isRecord(entry)) continue;
    if (entry.type === "interface" && Array.isArray(entry.items)) {
      functions.push(...auditAbiFunctions(entry.items));
      continue;
    }
    if (entry.type !== "function" || typeof entry.name !== "string") continue;
    if (!Array.isArray(entry.inputs) || !Array.isArray(entry.outputs)) continue;
    functions.push({
      name: entry.name,
      inputs: entry.inputs,
      outputs: entry.outputs,
    });
  }
  return functions;
}

function findOwnerPublicKeyGetter(
  functions: readonly AuditedAbiFunction[],
): AuditedAbiFunction | undefined {
  for (const name of OWNER_PUBLIC_KEY_GETTERS) {
    const getter = functions.find((entry) => entry.name === name
      && entry.inputs.length === 0
      && entry.outputs.length === 1);
    if (getter) return getter;
  }
  return undefined;
}

function findSignatureValidationFunction(
  functions: readonly AuditedAbiFunction[],
): AuditedAbiFunction | undefined {
  for (const name of SIGNATURE_VALIDATION_FUNCTIONS) {
    const signatureFunction = functions.find((entry) => entry.name === name
      && entry.inputs.length >= 2
      && entry.inputs.length <= 3);
    if (signatureFunction) return signatureFunction;
  }
  return undefined;
}

function isContractNotFoundError(error: unknown): boolean {
  if (error instanceof RpcError) return error.isType("CONTRACT_NOT_FOUND");
  return isRecord(error) && error.code === 20;
}

function isSignatureRejectionError(error: unknown): boolean {
  if (error instanceof RpcError) {
    return error.isType("CONTRACT_ERROR")
      || error.isType("TRANSACTION_EXECUTION_ERROR")
      || error.isType("VALIDATION_FAILURE")
      || error.isType("INVALID_SIGNATURE");
  }
  if (!isRecord(error) || typeof error.code !== "number") return false;
  return [40, 41, 55, 153].includes(error.code);
}

function createNonTransactionChallengeHash(): string {
  let challenge = 0n;
  while (challenge === 0n) {
    challenge = BigInt(`0x${randomBytes(31).toString("hex")}`);
  }
  return normalizeFeltHex(challenge);
}

function signatureToFelts(signature: Signature): string[] {
  if (Array.isArray(signature)) return signature.map((value) => num.toHex(value));
  const starkSignature = signature as unknown as { r: BigNumberish; s: BigNumberish };
  return [num.toHex(starkSignature.r), num.toHex(starkSignature.s)];
}

function createPreflightArtifact(
  base: VeilAccountPreflightArtifact,
  changes: Partial<VeilAccountPreflightArtifact>,
): VeilAccountPreflightArtifact {
  return {
    accountAddress: changes.accountAddress ?? base.accountAddress,
    blockId: changes.blockId ?? base.blockId,
    nonce: changes.nonce ?? base.nonce,
    classHash: changes.classHash ?? base.classHash,
    accountType: changes.accountType ?? base.accountType,
    ownerMatch: changes.ownerMatch ?? base.ownerMatch,
    signatureValidation:
      changes.signatureValidation ?? base.signatureValidation,
    verdict: changes.verdict ?? base.verdict,
  };
}

export function assertAccountPreflightArtifactSafe(
  artifact: VeilAccountPreflightArtifact,
  sensitiveValues: readonly string[] = [],
): void {
  const expectedKeys = [
    "accountAddress",
    "blockId",
    "nonce",
    "classHash",
    "accountType",
    "ownerMatch",
    "signatureValidation",
    "verdict",
  ];
  const actualKeys = Object.keys(artifact);
  if (actualKeys.length !== expectedKeys.length
      || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error("Account preflight artifact contains an unexpected field.");
  }

  const forbiddenKeys = [
    "ownerPublicKey",
    "privateKey",
    "publicKey",
    "signature",
    "challengeHash",
    "transactionPayload",
    "rpcUrl",
    "apiKey",
  ];
  if (forbiddenKeys.some((key) => Object.hasOwn(artifact, key))) {
    throw new Error("Account preflight artifact contains a forbidden field.");
  }

  const serialized = JSON.stringify(artifact);
  if (sensitiveValues.some((value) => value.length > 0 && serialized.includes(value))) {
    throw new Error("Account preflight artifact contains sensitive material.");
  }
}

export async function writeAccountPreflightArtifact(
  artifact: VeilAccountPreflightArtifact,
  outputPath = DEFAULT_ACCOUNT_PREFLIGHT_PATH,
): Promise<void> {
  assertAccountPreflightArtifactSafe(artifact);
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function resolveActualProvingBlockId(
  provider: AccountPreflightProvider,
  configuredBlockId: ProvingBlockId,
): Promise<string> {
  const block = await provider.getBlock(configuredBlockId);
  if (!isRecord(block) || typeof block.block_hash !== "string") {
    throw new Error("RPC did not return an actual block hash for preflight.");
  }
  return normalizeFeltHex(block.block_hash);
}

export async function preflightVeilPocAccount(input: {
  provider: AccountPreflightProvider;
  accountAddress: bigint;
  signer: StandardPocSigner;
  configuredBlockId: ProvingBlockId;
  sensitiveValues?: readonly string[];
}): Promise<AccountPreflightResult> {
  const sensitiveValues = [...(input.sensitiveValues ?? [])];
  let artifact = emptyAccountPreflightArtifact({
    accountAddress: input.accountAddress,
    blockId: configuredBlockIdLabel(input.configuredBlockId),
  });
  let actualBlockId: string;
  try {
    actualBlockId = await resolveActualProvingBlockId(
      input.provider,
      input.configuredBlockId,
    );
    artifact = createPreflightArtifact(artifact, { blockId: actualBlockId });
  } catch {
    assertAccountPreflightArtifactSafe(artifact, sensitiveValues);
    return { artifact, provingBlockId: undefined };
  }

  let classHash: string;
  try {
    classHash = normalizeFeltHex(await input.provider.getClassHashAt(
      input.accountAddress,
      actualBlockId,
    ));
    artifact = createPreflightArtifact(artifact, { classHash });
  } catch (error) {
    if (isContractNotFoundError(error)) {
      artifact = createPreflightArtifact(artifact, {
        accountType: "UNDEPLOYED_STARK_ACCOUNT",
        verdict: "ACCOUNT_NOT_DEPLOYED",
      });
    }
    assertAccountPreflightArtifactSafe(artifact, sensitiveValues);
    return { artifact, provingBlockId: actualBlockId };
  }

  try {
    const nonce = normalizeFeltHex(await input.provider.getNonceForAddress(
      input.accountAddress,
      actualBlockId,
    ));
    artifact = createPreflightArtifact(artifact, { nonce });
  } catch (error) {
    if (isContractNotFoundError(error)) {
      artifact = createPreflightArtifact(artifact, {
        accountType: "UNDEPLOYED_STARK_ACCOUNT",
        verdict: "ACCOUNT_NOT_DEPLOYED",
      });
    }
    assertAccountPreflightArtifactSafe(artifact, sensitiveValues);
    return { artifact, provingBlockId: actualBlockId };
  }

  let functions: AuditedAbiFunction[];
  try {
    const accountClass = await input.provider.getClass(classHash, actualBlockId);
    const abi = readAbi(accountClass);
    if (!abi) throw new Error("Account class has no auditable ABI.");
    functions = auditAbiFunctions(abi);
  } catch {
    artifact = createPreflightArtifact(artifact, {
      signatureValidation: "UNSUPPORTED",
    });
    assertAccountPreflightArtifactSafe(artifact, sensitiveValues);
    return { artifact, provingBlockId: actualBlockId };
  }

  let publicKey: string;
  try {
    publicKey = normalizeFeltHex(await input.signer.getPubKey());
    sensitiveValues.push(publicKey);
  } catch {
    assertAccountPreflightArtifactSafe(artifact, sensitiveValues);
    return { artifact, provingBlockId: actualBlockId };
  }

  const ownerGetter = findOwnerPublicKeyGetter(functions);
  if (ownerGetter) {
    artifact = createPreflightArtifact(artifact, {
      accountType: "SINGLE_OWNER_STARK_ACCOUNT",
    });
    try {
      const ownerResponse = await input.provider.callContract({
        contractAddress: artifact.accountAddress,
        entrypoint: ownerGetter.name,
        calldata: [],
      }, actualBlockId);
      if (ownerResponse.length !== 1) {
        artifact = createPreflightArtifact(artifact, {
          signatureValidation: "UNSUPPORTED",
        });
      } else if (BigInt(ownerResponse[0]!) !== BigInt(publicKey)) {
        artifact = createPreflightArtifact(artifact, {
          ownerMatch: false,
          verdict: "PRIVATE_KEY_OWNER_MISMATCH",
        });
      } else {
        artifact = createPreflightArtifact(artifact, {
          ownerMatch: true,
          signatureValidation: "VALID",
          verdict: "SIGNER_PREFLIGHT_VALID",
        });
      }
    } catch {
      artifact = createPreflightArtifact(artifact, {
        signatureValidation: "UNSUPPORTED",
      });
    }
    assertAccountPreflightArtifactSafe(artifact, sensitiveValues);
    return { artifact, provingBlockId: actualBlockId };
  }

  const signatureFunction = findSignatureValidationFunction(functions);
  if (!signatureFunction) {
    artifact = createPreflightArtifact(artifact, {
      signatureValidation: "UNSUPPORTED",
    });
    assertAccountPreflightArtifactSafe(artifact, sensitiveValues);
    return { artifact, provingBlockId: actualBlockId };
  }

  artifact = createPreflightArtifact(artifact, {
    accountType: "SRC6_STARK_ACCOUNT",
  });
  const challengeHash = createNonTransactionChallengeHash();
  sensitiveValues.push(challengeHash);
  try {
    const signature = await input.signer.signPreflightChallenge(challengeHash);
    const signatureFelts = signatureToFelts(signature);
    sensitiveValues.push(...signatureFelts);
    const signatureResponse = await input.provider.callContract({
      contractAddress: artifact.accountAddress,
      entrypoint: signatureFunction.name,
      calldata: [challengeHash, num.toHex(signatureFelts.length), ...signatureFelts],
    }, actualBlockId);
    const valid = signatureFunction.outputs.length === 0
      ? signatureResponse.length === 0
      : signatureResponse.length > 0 && BigInt(signatureResponse[0]!) !== 0n;
    artifact = createPreflightArtifact(artifact, valid ? {
      ownerMatch: true,
      signatureValidation: "VALID",
      verdict: "SIGNER_PREFLIGHT_VALID",
    } : {
      signatureValidation: "INVALID",
      verdict: "STANDARD_SIGNER_INCOMPATIBLE",
    });
  } catch (error) {
    artifact = createPreflightArtifact(artifact, isSignatureRejectionError(error) ? {
      signatureValidation: "INVALID",
      verdict: "STANDARD_SIGNER_INCOMPATIBLE",
    } : {
      signatureValidation: "UNSUPPORTED",
      verdict: "ACCOUNT_PREFLIGHT_UNSUPPORTED",
    });
  }
  assertAccountPreflightArtifactSafe(artifact, sensitiveValues);
  return { artifact, provingBlockId: actualBlockId };
}

export function createAccountPreflightProvider(rpcUrl: string): AccountPreflightProvider {
  return new RpcProvider({ nodeUrl: rpcUrl }) as unknown as AccountPreflightProvider;
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
  dependencies: VeilOfficialRegisterPocDependencies = {},
): Promise<VeilRegisterProofSummary> {
  const config = loadVeilOfficialRegisterPocConfig(env);
  const signer = createStandardPocSigner(config.accountPrivateKey);
  const preflight = await preflightVeilPocAccount({
    provider: dependencies.accountPreflightProvider
      ?? createAccountPreflightProvider(config.rpcUrl),
    accountAddress: config.accountAddress,
    signer,
    configuredBlockId: config.provingBlockId,
    sensitiveValues: [config.accountPrivateKey],
  });
  await writeAccountPreflightArtifact(
    preflight.artifact,
    dependencies.accountPreflightPath ?? DEFAULT_ACCOUNT_PREFLIGHT_PATH,
  );
  if (preflight.artifact.verdict !== "SIGNER_PREFLIGHT_VALID"
      || preflight.provingBlockId === undefined) {
    throw new AccountPreflightError(preflight.artifact);
  }

  const viewingKey = createEphemeralViewingKey();
  const discoveryProvider = new LocalFailClosedDiscoveryProvider();
  const provingBlockId = preflight.provingBlockId;
  const provingProviderFactory = dependencies.createProvingProvider
    ?? createOfficialProvingProvider;
  const provingProvider = provingProviderFactory({
    proverUrl: config.proverUrl,
    rpcUrl: config.rpcUrl,
    poolAddress: config.poolAddress,
    provingBlockId,
  });
  const result = await executeOfficialRegisterProof({
    accountAddress: config.accountAddress,
    signer,
    viewingKey,
    provingProvider,
    discoveryProvider,
    registry: createEmptyRegistry(),
    poolAddress: config.poolAddress,
    provingBlockId,
  });

  const summary = createRegisterProofSummary({
    result,
    discoveryCalls: discoveryProvider.discoveryCalls,
    accountAddress: config.accountAddress,
    provingBlockId: preflight.artifact.blockId,
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
    if (error instanceof AccountPreflightError) {
      console.error(`VEIL account preflight failed closed: ${error.artifact.verdict}`);
    } else if (error instanceof ProvingServiceError) {
      const errorPath = process.env.VEIL_POC_ERROR_PATH?.trim()
        || DEFAULT_PROVING_ERROR_PATH;
      const diagnostic = await writeSafeProvingServiceError(error, errorPath);
      console.error(JSON.stringify(diagnostic));
    } else if (error instanceof LocalDiscoveryAccessError) {
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
