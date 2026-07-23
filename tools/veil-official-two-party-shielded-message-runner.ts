import { unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  createObservedShieldedMessageProofExecutor,
  createSafeShieldedMessageErrorDiagnostic,
  createShieldedMessageRunnerState,
  updateShieldedMessageRunnerStageFromLog,
  writeSafeShieldedMessageErrorDiagnostic,
} from "./veil-official-shielded-message-runner.ts";
import {
  officialTwoPartyShieldedMessageProofExecutor,
  runVeilOfficialTwoPartyShieldedMessagePoc,
} from "./veil-official-two-party-shielded-message-poc.ts";
import type {
  VeilTwoPartyShieldedMessageDependencies,
} from "./veil-official-two-party-shielded-message-poc.ts";
import type {
  SafeShieldedMessageErrorDiagnostic,
} from "./veil-official-shielded-message-runner.ts";

export const DEFAULT_TWO_PARTY_ERROR_PATH =
  "veil-two-party-shielded-message-error.json";

export interface TwoPartyRunnerDependencies {
  runPoc?: typeof runVeilOfficialTwoPartyShieldedMessagePoc;
  pocDependencies?: VeilTwoPartyShieldedMessageDependencies;
}

function collectSensitiveValues(env: NodeJS.ProcessEnv): string[] {
  return [
    env.VEIL_POC_ACCOUNT_PRIVATE_KEY,
    env.VEIL_POC_VIEWING_KEY,
    env.VEIL_POC_RECIPIENT_VIEWING_KEY,
    env.STARKNET_SEPOLIA_RPC_URL,
    "VEIL_PRIVATE_MESSAGE_POC_V1",
  ].filter((value): value is string => Boolean(value?.trim()));
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

export async function runTwoPartyShieldedMessageCli(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: TwoPartyRunnerDependencies = {},
): Promise<SafeShieldedMessageErrorDiagnostic | null> {
  const state = createShieldedMessageRunnerState();
  const sensitiveValues = collectSensitiveValues(env);
  const errorPath = env.VEIL_POC_TWO_PARTY_ERROR_PATH?.trim()
    || DEFAULT_TWO_PARTY_ERROR_PATH;
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
    const baseDependencies = dependencies.pocDependencies ?? {};
    const baseExecutor = baseDependencies.proofExecutor
      ?? officialTwoPartyShieldedMessageProofExecutor;
    const proofExecutor = createObservedShieldedMessageProofExecutor(
      state,
      baseExecutor,
    );
    await (dependencies.runPoc ?? runVeilOfficialTwoPartyShieldedMessagePoc)(
      env,
      {
        ...baseDependencies,
        proofExecutor,
      },
    );
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
  const diagnostic = await runTwoPartyShieldedMessageCli();
  if (diagnostic) {
    const code = diagnostic.code === null ? "" : ` code=${diagnostic.code}`;
    console.error(
      `VEIL two-party shielded-message PoC failed at ${diagnostic.stage}.`,
    );
    console.error(`${diagnostic.name}${code}: ${diagnostic.message}`);
    process.exitCode = 1;
  }
}
