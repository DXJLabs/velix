import {
  TransactionProverClient,
  VEIL_TRANSACTION_PROVER_PIN,
  type TransactionProverLogEvent,
} from "#veil-sdk/transaction-prover";
import {
  BACKEND_COMPATIBILITY,
  loadProverEnvironment,
} from "../../config/backend-env.js";

export interface CreateBackendProverClientOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  onStatus?: (event: TransactionProverLogEvent) => void;
}

export function createBackendProverClient(
  options: CreateBackendProverClientOptions = {},
): TransactionProverClient {
  const environment = loadProverEnvironment(options.env);

  return new TransactionProverClient({
    endpoint: environment.proverUrl,
    mode: environment.proverMode,
    pin: VEIL_TRANSACTION_PROVER_PIN,
    transport: {
      route: "sdk-direct",
      sdk: { installed: true, version: BACKEND_COMPATIBILITY.sdkVersion },
      directAccount: {
        accountCustody: "integrator-owned",
        viewingKeyCustody: "integrator-managed",
      },
      network: { chainId: environment.chainId },
      pool: {
        address: environment.poolAddress,
        compatibility: BACKEND_COMPATIBILITY.poolCompatibility,
        compatibleAddresses: [environment.poolAddress],
      },
      transactionVersion: BACKEND_COMPATIBILITY.transactionVersion,
      outsideExecutionVersion: BACKEND_COMPATIBILITY.outsideExecutionVersion,
      prover: { configured: true },
      discovery: { configured: Boolean(environment.discoveryUrl) },
      helper: {
        address: environment.helperAddress,
        selector: BACKEND_COMPATIBILITY.helperSelector,
        allowedAddresses: [environment.helperAddress],
        allowedSelectors: [BACKEND_COMPATIBILITY.helperSelector],
      },
    },
    timeouts: {
      connectionTimeoutMs: environment.connectionTimeoutMs,
      proofGenerationTimeoutMs: environment.proofGenerationTimeoutMs,
      totalOperationTimeoutMs: environment.totalOperationTimeoutMs,
    },
    retry: {
      healthMaxRetries: environment.healthMaxRetries,
      proofMaxRetries: environment.proofMaxRetries,
      baseDelayMs: environment.baseDelayMs,
      maximumDelayMs: environment.maximumDelayMs,
    },
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.onStatus === undefined ? {} : { onStatus: options.onStatus }),
  });
}
