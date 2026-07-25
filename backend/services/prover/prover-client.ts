
import {
  TransactionProverClient,
  VEIL_TRANSACTION_PROVER_PIN,
  type TransactionProverLogEvent,
} from "#veil-sdk/transaction-prover";
import {
  BACKEND_COMPATIBILITY,
  BACKEND_REVIEWED_HELPER_ADDRESSES,
  BACKEND_REVIEWED_POOL_ADDRESSES,
  loadProverEnvironment,
} from "../../config/backend-env.js";

export interface CreateBackendProverClientOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;

  sleep?: (
    delayMs: number,
    signal?: AbortSignal,
  ) => Promise<void>;

  now?: () => number;

  onStatus?: (
    event: TransactionProverLogEvent,
  ) => void;
}

export function createBackendProverClient(
  options:
    CreateBackendProverClientOptions = {},
): TransactionProverClient {
  const environment =
    loadProverEnvironment(
      options.env,
    );

  /*
   * TransactionProverClient currently validates only the Phase 4
   * direct SDK proof boundary.
   *
   * This route must remain explicitly experimental. It must not be
   * described as production wallet-owned custody, and it must not be
   * enabled without VEIL_EXPERIMENTAL_DIRECT_PROVER=true.
   */
  void environment
    .experimentalDirectProverAcknowledged;

  return new TransactionProverClient({
    endpoint:
      environment.proverUrl,

    mode:
      environment.proverMode,

    pin:
      VEIL_TRANSACTION_PROVER_PIN,

    transport: {
      route:
        "sdk-direct",

      sdk: {
        installed: true,

        version:
          BACKEND_COMPATIBILITY
            .sdkVersion,
      },

      /*
       * These values describe the currently supported SDK prover
       * validation mode. They do not grant the backend authority to
       * store wallet keys, viewing keys, plaintext, or decrypted data.
       */
      directAccount: {
        accountCustody:
          "integrator-owned",

        viewingKeyCustody:
          "integrator-managed",
      },

      network: {
        chainId:
          environment.chainId,
      },

      pool: {
        address:
          environment.poolAddress,

        compatibility:
          BACKEND_COMPATIBILITY
            .poolCompatibility,

        compatibleAddresses:
          BACKEND_REVIEWED_POOL_ADDRESSES,
      },

      transactionVersion:
        BACKEND_COMPATIBILITY
          .transactionVersion,

      outsideExecutionVersion:
        BACKEND_COMPATIBILITY
          .outsideExecutionVersion,

      prover: {
        configured: true,
      },

      discovery: {
        configured: Boolean(
          environment.discoveryUrl,
        ),
      },

      helper: {
        address:
          environment.helperAddress,

        selector:
          BACKEND_COMPATIBILITY
            .helperSelector,

        allowedAddresses:
          BACKEND_REVIEWED_HELPER_ADDRESSES,

        allowedSelectors: [
          BACKEND_COMPATIBILITY
            .helperSelector,
        ],
      },
    },

    timeouts: {
      connectionTimeoutMs:
        environment
          .connectionTimeoutMs,

      proofGenerationTimeoutMs:
        environment
          .proofGenerationTimeoutMs,

      totalOperationTimeoutMs:
        environment
          .totalOperationTimeoutMs,
    },

    retry: {
      healthMaxRetries:
        environment
          .healthMaxRetries,

      proofMaxRetries:
        environment
          .proofMaxRetries,

      baseDelayMs:
        environment
          .baseDelayMs,

      maximumDelayMs:
        environment
          .maximumDelayMs,
    },

    ...(options.fetch === undefined
      ? {}
      : {
          fetch: options.fetch,
        }),

    ...(options.sleep === undefined
      ? {}
      : {
          sleep: options.sleep,
        }),

    ...(options.now === undefined
      ? {}
      : {
          now: options.now,
        }),

    ...(options.onStatus === undefined
      ? {}
      : {
          onStatus: options.onStatus,
        }),
  });
}
