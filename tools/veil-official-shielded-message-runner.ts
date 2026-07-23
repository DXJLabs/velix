import { unlink, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { ProvingServiceError } from "@starkware-libs/starknet-privacy-sdk";
import type {
  ProofProviderInterface,
} from "@starkware-libs/starknet-privacy-sdk";

import {
  officialShieldedMessageProofExecutor,
  runVeilOfficialShieldedMessagePoc,
} from "./veil-official-shielded-message-poc.ts";
import type {
  ShieldedMessageProofExecutor,
  ShieldedMessageProofExecutorInput,
} from "./veil-official-shielded-message-poc.ts";
import {
  sanitizeProvingDiagnosticText,
} from "./veil-official-register-poc.ts";
import type {
  SafeDiagnosticValue,
} from "./veil-official-register-poc.ts";

export const DEFAULT_SHIELDED_MESSAGE_ERROR_PATH =
  "veil-shielded-message-error.json";

const INTERNAL_PLAINTEXT = "VEIL_PRIVATE_MESSAGE_POC_V1";
const REDACTED = "[REDACTED]";
const TRUNCATED = "[TRUNCATED]";
const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_ENTRIES = 40;
const MAX_SAFE_STRING_LENGTH = 1_024;
const LONG_ENCODED_VALUE = /[a-z0-9+/]{128,}={0,2}/giu;

const SENSITIVE_DIAGNOSTIC_KEY =
  /(api|authorization|calldata|cipher|invocation|key|password|payload|private|proof|registry|rpc|secret|shared|signature|token|transaction|viewing)/iu;

export type ShieldedMessageRunnerStage =
  | "INITIALIZING"
  | "PREFLIGHT_VALID"
  | "PROVING_INVOCATION_PREPARED"
  | "PROVER_REQUEST_SENT"
  | "PROVER_RESPONSE_RECEIVED"
  | "PROOF_RESULT_VALIDATING"
  | "PROOF_RESULT_VALID"
  | "SUBMISSION_ESTIMATING"
  | "SUBMISSION_SENDING"
  | "WAITING_FOR_RECEIPT"
  | "ONCHAIN_VERIFYING";

export interface ShieldedMessageRunnerState {
  stage: ShieldedMessageRunnerStage;
}

export interface SafeShieldedMessageErrorDiagnostic {
  stage: ShieldedMessageRunnerStage;
  name: string;
  message: string;
  code: number | null;
  data: SafeDiagnosticValue;
  cause: SafeDiagnosticValue;
}

export interface ShieldedMessageRunnerDependencies {
  proofExecutor?: ShieldedMessageProofExecutor;
  runPoc?: typeof runVeilOfficialShieldedMessagePoc;
}

export function createShieldedMessageRunnerState(): ShieldedMessageRunnerState {
  return { stage: "INITIALIZING" };
}

function collectSensitiveValues(env: NodeJS.ProcessEnv): string[] {
  return [
    env.VEIL_POC_ACCOUNT_PRIVATE_KEY,
    env.VEIL_POC_VIEWING_KEY,
    env.STARKNET_SEPOLIA_RPC_URL,
    INTERNAL_PLAINTEXT,
  ].filter((value): value is string => Boolean(value?.trim()));
}

function sanitizeDiagnosticTextValue(
  value: string,
  sensitiveValues: readonly string[],
): string {
  const sanitized = sanitizeProvingDiagnosticText(value, sensitiveValues)
    .replace(LONG_ENCODED_VALUE, REDACTED);
  return sanitized.length > MAX_SAFE_STRING_LENGTH
    ? `${sanitized.slice(0, MAX_SAFE_STRING_LENGTH)}${TRUNCATED}`
    : sanitized;
}

function parseJsonValue(value: string): unknown {
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function sanitizeDiagnosticValue(
  value: unknown,
  sensitiveValues: readonly string[],
  depth = 0,
): SafeDiagnosticValue {
  if (depth > MAX_DEPTH) return TRUNCATED;
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") {
    const parsed = parseJsonValue(value);
    if (parsed !== value) {
      return sanitizeDiagnosticValue(parsed, sensitiveValues, depth + 1);
    }
    return sanitizeDiagnosticTextValue(value, sensitiveValues);
  }
  if (value instanceof Uint8Array) return REDACTED;
  if (value instanceof Error) {
    return {
      name: sanitizeDiagnosticTextValue(value.name, sensitiveValues),
      message: sanitizeDiagnosticTextValue(value.message, sensitiveValues),
      cause: sanitizeDiagnosticValue(value.cause, sensitiveValues, depth + 1),
    };
  }
  if (Array.isArray(value)) {
    const output = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((entry) => sanitizeDiagnosticValue(
        entry,
        sensitiveValues,
        depth + 1,
      ));
    if (value.length > MAX_ARRAY_ITEMS) output.push(TRUNCATED);
    return output;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const output: Record<string, SafeDiagnosticValue> = {};
    const entries = Object.entries(record).slice(0, MAX_OBJECT_ENTRIES);
    for (const [key, entryValue] of entries) {
      const safeKey = sanitizeProvingDiagnosticText(key, sensitiveValues);
      output[safeKey] = SENSITIVE_DIAGNOSTIC_KEY.test(key)
        ? REDACTED
        : sanitizeDiagnosticValue(entryValue, sensitiveValues, depth + 1);
    }
    if (Object.keys(record).length > MAX_OBJECT_ENTRIES) {
      output.truncated = true;
    }
    return output;
  }
  return sanitizeProvingDiagnosticText(String(value), sensitiveValues);
}

function readNumericCode(error: unknown): number | null {
  if (error instanceof ProvingServiceError) return error.code;
  if (typeof error !== "object" || error === null) return null;
  const errorRecord = error as Record<string, unknown>;
  const directCode = errorRecord.code;
  if (typeof directCode === "number" && Number.isFinite(directCode)) {
    return directCode;
  }
  const baseError = typeof errorRecord.baseError === "object"
      && errorRecord.baseError !== null
    ? errorRecord.baseError as Record<string, unknown>
    : undefined;
  const baseCode = baseError?.code;
  return typeof baseCode === "number" && Number.isFinite(baseCode)
    ? baseCode
    : null;
}

export function createSafeShieldedMessageErrorDiagnostic(input: {
  error: unknown;
  stage: ShieldedMessageRunnerStage;
  sensitiveValues?: readonly string[];
}): SafeShieldedMessageErrorDiagnostic {
  const sensitiveValues = input.sensitiveValues ?? [];
  const errorRecord = typeof input.error === "object" && input.error !== null
    ? input.error as Record<string, unknown>
    : undefined;
  const baseError = typeof errorRecord?.baseError === "object"
      && errorRecord.baseError !== null
    ? errorRecord.baseError as Record<string, unknown>
    : undefined;
  const name = input.error instanceof Error
    ? input.error.name
    : typeof errorRecord?.name === "string"
      ? errorRecord.name
      : "UnknownError";
  const message = typeof baseError?.message === "string"
    ? baseError.message
    : input.error instanceof Error
      ? input.error.message
      : typeof errorRecord?.message === "string"
        ? errorRecord.message
        : String(input.error);
  const data = baseError?.data ?? errorRecord?.data;
  const cause = input.error instanceof Error
    ? input.error.cause
    : errorRecord?.cause;

  return {
    stage: input.stage,
    name: sanitizeDiagnosticTextValue(name, sensitiveValues),
    message: sanitizeDiagnosticTextValue(message, sensitiveValues),
    code: readNumericCode(input.error),
    data: sanitizeDiagnosticValue(data, sensitiveValues),
    cause: sanitizeDiagnosticValue(cause, sensitiveValues),
  };
}

export async function writeSafeShieldedMessageErrorDiagnostic(
  diagnostic: SafeShieldedMessageErrorDiagnostic,
  outputPath = DEFAULT_SHIELDED_MESSAGE_ERROR_PATH,
): Promise<void> {
  await writeFile(outputPath, `${JSON.stringify(diagnostic, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function updateShieldedMessageRunnerStageFromLog(
  state: ShieldedMessageRunnerState,
  line: string,
  submitOnchain: boolean,
): void {
  if (line.includes("SIGNER_PREFLIGHT_VALID")) {
    state.stage = "PREFLIGHT_VALID";
  } else if (line.includes("SHIELDED_MESSAGE_PROVING_ZERO_FEE_BOUNDS_VALID")) {
    state.stage = "PROVING_INVOCATION_PREPARED";
  } else if (line.includes("OFFICIAL_SDK_SHIELDED_MESSAGE_PROOF_GENERATED")) {
    state.stage = submitOnchain ? "SUBMISSION_ESTIMATING" : "PROOF_RESULT_VALID";
  } else if (line.includes("SHIELDED_MESSAGE_SUBMISSION_RESOURCE_ESTIMATE_VALID")) {
    state.stage = "SUBMISSION_SENDING";
  } else if (line.includes("SHIELDED_MESSAGE_TRANSACTION_SUBMITTED")) {
    state.stage = "WAITING_FOR_RECEIPT";
  } else if (line.includes("ACCEPTED_ON_L2")) {
    state.stage = "ONCHAIN_VERIFYING";
  }
}

export function createObservedShieldedMessageProofExecutor(
  state: ShieldedMessageRunnerState,
  baseExecutor: ShieldedMessageProofExecutor = officialShieldedMessageProofExecutor,
): ShieldedMessageProofExecutor {
  return {
    async execute(
      input: ShieldedMessageProofExecutorInput,
    ) {
      const observedProvider = new Proxy(input.provingProvider, {
        get(target, property, receiver) {
          if (property === "prove") {
            return async (
              ...args: Parameters<ProofProviderInterface["prove"]>
            ) => {
              state.stage = "PROVER_REQUEST_SENT";
              const proof = await target.prove(...args);
              state.stage = "PROVER_RESPONSE_RECEIVED";
              console.log("SHIELDED_MESSAGE_PROVER_RESPONSE_RECEIVED");
              return proof;
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as ProofProviderInterface;

      const execution = await baseExecutor.execute({
        ...input,
        provingProvider: observedProvider,
      });
      state.stage = "PROOF_RESULT_VALIDATING";
      return execution;
    },
  };
}

async function removeStaleErrorArtifact(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (typeof error !== "object" || error === null
        || (error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

export async function runShieldedMessageCli(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: ShieldedMessageRunnerDependencies = {},
): Promise<SafeShieldedMessageErrorDiagnostic | null> {
  const state = createShieldedMessageRunnerState();
  const sensitiveValues = collectSensitiveValues(env);
  const errorPath = env.VEIL_POC_SHIELDED_MESSAGE_ERROR_PATH?.trim()
    || DEFAULT_SHIELDED_MESSAGE_ERROR_PATH;
  const submitOnchain = env.VEIL_POC_SUBMIT_ONCHAIN?.trim().toLowerCase()
    === "true";
  const originalConsoleLog = console.log;
  console.log = (...values: unknown[]) => {
    const line = values.map((value) => String(value)).join(" ");
    updateShieldedMessageRunnerStageFromLog(state, line, submitOnchain);
    originalConsoleLog(...values);
  };

  try {
    await removeStaleErrorArtifact(errorPath);
    const proofExecutor = createObservedShieldedMessageProofExecutor(
      state,
      dependencies.proofExecutor ?? officialShieldedMessageProofExecutor,
    );
    await (dependencies.runPoc ?? runVeilOfficialShieldedMessagePoc)(env, {
      proofExecutor,
    });
    return null;
  } catch (error) {
    const diagnostic = createSafeShieldedMessageErrorDiagnostic({
      error,
      stage: state.stage,
      sensitiveValues,
    });
    await writeSafeShieldedMessageErrorDiagnostic(diagnostic, errorPath);
    return diagnostic;
  } finally {
    console.log = originalConsoleLog;
  }
}

function isMainModule(): boolean {
  const invokedPath = process.argv[1];
  return invokedPath !== undefined
    && pathToFileURL(invokedPath).href === import.meta.url;
}

if (isMainModule()) {
  const diagnostic = await runShieldedMessageCli();
  if (diagnostic) {
    const code = diagnostic.code === null ? "" : ` code=${diagnostic.code}`;
    console.error(`VEIL shielded-message PoC failed at ${diagnostic.stage}.`);
    console.error(`${diagnostic.name}${code}: ${diagnostic.message}`);
    process.exitCode = 1;
  }
}
