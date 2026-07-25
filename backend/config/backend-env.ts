
import {
  VEIL_OFFICIAL_CHAIN_ID,
  VEIL_OFFICIAL_OUTSIDE_EXECUTION_VERSION,
  VEIL_OFFICIAL_POOL_COMPATIBILITY,
  VEIL_OFFICIAL_TRANSACTION_VERSION,
} from "#veil-sdk/official-sdk";
import {
  VEIL_OFFICIAL_PRIVACY_SDK_VERSION,
} from "#veil-sdk/namespace";
import type {
  TransactionProverMode,
} from "#veil-sdk/transaction-prover";

const FELT_LIMIT = 1n << 251n;

const REVIEWED_SEPOLIA_POOL =
  "0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5";

const REVIEWED_SEPOLIA_HELPER =
  "0x052390845931a0c8d4735246d853a1a514c3cbf88cb1714937284814c5e57b23";

export const BACKEND_REVIEWED_POOL_ADDRESSES =
  Object.freeze([
    normalizeNonzeroFelt(
      REVIEWED_SEPOLIA_POOL,
      "reviewedPoolAddress",
    ),
  ]);

export const BACKEND_REVIEWED_HELPER_ADDRESSES =
  Object.freeze([
    normalizeNonzeroFelt(
      REVIEWED_SEPOLIA_HELPER,
      "reviewedHelperAddress",
    ),
  ]);

export interface BackendRpcEnvironment {
  chainId: typeof VEIL_OFFICIAL_CHAIN_ID;
  rpcUrl: string;
  poolAddress: string;
  helperAddress: string;
}

export interface BackendProverEnvironment
  extends BackendRpcEnvironment {
  proverUrl: string;
  proverMode: TransactionProverMode;
  discoveryUrl: string;
  connectionTimeoutMs: number;
  proofGenerationTimeoutMs: number;
  totalOperationTimeoutMs: number;
  healthMaxRetries: number;
  proofMaxRetries: number;
  baseDelayMs: number;
  maximumDelayMs: number;

  experimentalDirectProverAcknowledged:
    true;
}

export const BACKEND_COMPATIBILITY =
  Object.freeze({
    sdkVersion:
      VEIL_OFFICIAL_PRIVACY_SDK_VERSION,

    poolCompatibility:
      VEIL_OFFICIAL_POOL_COMPATIBILITY,

    transactionVersion:
      VEIL_OFFICIAL_TRANSACTION_VERSION,

    outsideExecutionVersion:
      VEIL_OFFICIAL_OUTSIDE_EXECUTION_VERSION,

    helperSelector: "privacy_invoke",
  } as const);

export function loadRpcEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): BackendRpcEnvironment {
  const chainId = normalizeChainId(
    requireServerEnvironment(
      env,
      "STARKNET_CHAIN_ID",
    ),
  );

  const rpcUrl = validateServiceUrl(
    requireServerEnvironment(
      env,
      "STARKNET_RPC_URL",
    ),
    "STARKNET_RPC_URL",
    {
      allowLocalHttp: true,
      requireRootPath: false,
    },
  );

  const poolAddress =
    normalizeNonzeroFelt(
      requireServerEnvironment(
        env,
        "VEIL_PRIVACY_POOL_ADDRESS",
      ),
      "VEIL_PRIVACY_POOL_ADDRESS",
    );

  assertReviewedAddress(
    poolAddress,
    BACKEND_REVIEWED_POOL_ADDRESSES,
    "VEIL_PRIVACY_POOL_NOT_REVIEWED",
    "The configured Privacy Pool is not the reviewed Sepolia deployment.",
  );

  const helperAddress =
    normalizeNonzeroFelt(
      requireServerEnvironment(
        env,
        "VEIL_CHANNEL_HELPER_ADDRESS",
      ),
      "VEIL_CHANNEL_HELPER_ADDRESS",
    );

  assertReviewedAddress(
    helperAddress,
    BACKEND_REVIEWED_HELPER_ADDRESSES,
    "VEIL_HELPER_NOT_REVIEWED",
    "The configured VEIL Helper is not the reviewed Sepolia deployment.",
  );

  return Object.freeze({
    chainId,
    rpcUrl,
    poolAddress,
    helperAddress,
  });
}

export function loadProverEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): BackendProverEnvironment {
  const rpc = loadRpcEnvironment(env);

  const rawProverUrl =
    env.VEIL_PROVER_URL
    ?? env.VEIL_TRANSACTION_PROVER_URL;

  if (!rawProverUrl) {
    throw new BackendEnvironmentError(
      "VEIL_PROVER_URL_MISSING",
      "VEIL_PROVER_URL or VEIL_TRANSACTION_PROVER_URL must be configured.",
    );
  }

  const proverMode =
    normalizeProverMode(
      env.VEIL_PROVER_MODE,
      rawProverUrl,
    );

  const proverUrl =
    validateServiceUrl(
      rawProverUrl,
      "VEIL_PROVER_URL",
      {
        allowLocalHttp:
          proverMode === "local",

        requireRootPath: true,
      },
    );

  const discoveryUrl =
    validateServiceUrl(
      requireServerEnvironment(
        env,
        "VEIL_DISCOVERY_URL",
      ),
      "VEIL_DISCOVERY_URL",
      {
        allowLocalHttp: true,
        requireRootPath: false,
      },
    );

  const experimentalDirectProverAcknowledged =
    requireExperimentalDirectProverAcknowledgement(
      env.VEIL_EXPERIMENTAL_DIRECT_PROVER,
    );

  return Object.freeze({
    ...rpc,

    proverUrl,
    proverMode,
    discoveryUrl,

    experimentalDirectProverAcknowledged,

    connectionTimeoutMs:
      boundedInteger(
        env.VEIL_PROVER_CONNECTION_TIMEOUT_MS,
        100,
        60_000,
        5_000,
      ),

    proofGenerationTimeoutMs:
      boundedInteger(
        env.VEIL_PROVER_JOB_TIMEOUT_MS,
        1_000,
        60 * 60_000,
        15 * 60_000,
      ),

    totalOperationTimeoutMs:
      boundedInteger(
        env.VEIL_PROVER_TOTAL_TIMEOUT_MS,
        1_000,
        2 * 60 * 60_000,
        20 * 60_000,
      ),

    healthMaxRetries:
      boundedInteger(
        env.VEIL_PROVER_HEALTH_RETRIES,
        0,
        3,
        1,
      ),

    proofMaxRetries:
      boundedInteger(
        env.VEIL_PROVER_JOB_RETRIES,
        0,
        3,
        2,
      ),

    baseDelayMs:
      boundedInteger(
        env.VEIL_PROVER_RETRY_BASE_MS,
        0,
        10_000,
        250,
      ),

    maximumDelayMs:
      boundedInteger(
        env.VEIL_PROVER_RETRY_MAX_MS,
        0,
        30_000,
        5_000,
      ),
  });
}

export class BackendEnvironmentError
  extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "BackendEnvironmentError";

    this.code = code;
  }
}

function requireExperimentalDirectProverAcknowledgement(
  value: string | undefined,
): true {
  if (value?.trim().toLowerCase() !== "true") {
    throw new BackendEnvironmentError(
      "VEIL_EXPERIMENTAL_DIRECT_PROVER_DISABLED",
      "The current direct SDK prover boundary is experimental and must be enabled explicitly.",
    );
  }

  return true;
}

function requireServerEnvironment(
  env: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = env[name]?.trim();

  if (!value) {
    throw new BackendEnvironmentError(
      `${name}_MISSING`,
      `${name} must be configured explicitly in the server environment.`,
    );
  }

  return value;
}

function normalizeChainId(
  value: string,
): typeof VEIL_OFFICIAL_CHAIN_ID {
  const normalized =
    value.trim().toUpperCase();

  if (
    normalized
      === VEIL_OFFICIAL_CHAIN_ID
    || normalized
      === "0X534E5F5345504F4C4941"
  ) {
    return VEIL_OFFICIAL_CHAIN_ID;
  }

  throw new BackendEnvironmentError(
    "VEIL_BACKEND_CHAIN_MISMATCH",
    "The VEIL messaging backend is locked to Starknet Sepolia.",
  );
}

function normalizeProverMode(
  value: string | undefined,
  endpoint: string,
): TransactionProverMode {
  const normalized =
    String(value ?? "")
      .trim()
      .toLowerCase();

  if (
    normalized === "local"
    || normalized === "live-unverified"
  ) {
    return normalized;
  }

  if (normalized) {
    throw new BackendEnvironmentError(
      "VEIL_PROVER_MODE_INVALID",
      "VEIL_PROVER_MODE must be local or live-unverified.",
    );
  }

  let parsed: URL;

  try {
    parsed = new URL(endpoint);
  } catch {
    throw new BackendEnvironmentError(
      "VEIL_PROVER_URL_INVALID",
      "The configured prover URL is invalid.",
    );
  }

  return isLoopback(parsed.hostname)
    ? "local"
    : "live-unverified";
}

function validateServiceUrl(
  value: string,
  label: string,
  options: {
    allowLocalHttp: boolean;
    requireRootPath: boolean;
  },
): string {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new BackendEnvironmentError(
      `${label}_INVALID`,
      `${label} must be an absolute URL.`,
    );
  }

  if (
    parsed.username
    || parsed.password
    || parsed.hash
  ) {
    throw new BackendEnvironmentError(
      `${label}_INVALID`,
      `${label} must not contain credentials or a fragment.`,
    );
  }

  const localHttp =
    options.allowLocalHttp
    && parsed.protocol === "http:"
    && isLoopback(parsed.hostname);

  if (
    parsed.protocol !== "https:"
    && !localHttp
  ) {
    throw new BackendEnvironmentError(
      `${label}_INSECURE`,
      `${label} must use HTTPS outside local development.`,
    );
  }

  if (
    options.requireRootPath
    && parsed.pathname !== "/"
  ) {
    throw new BackendEnvironmentError(
      `${label}_INVALID`,
      `${label} must point to the prover JSON-RPC root.`,
    );
  }

  return parsed
    .toString()
    .replace(/\/$/u, "");
}

function normalizeNonzeroFelt(
  value: string,
  label: string,
): string {
  let parsed: bigint;

  try {
    parsed = BigInt(value.trim());
  } catch {
    throw new BackendEnvironmentError(
      `${label}_INVALID`,
      `${label} must be a Starknet felt.`,
    );
  }

  if (
    parsed <= 0n
    || parsed >= FELT_LIMIT
  ) {
    throw new BackendEnvironmentError(
      `${label}_INVALID`,
      `${label} must be a nonzero Starknet felt.`,
    );
  }

  return `0x${parsed.toString(16)}`;
}

function assertReviewedAddress(
  value: string,
  reviewed: readonly string[],
  code: string,
  message: string,
): void {
  if (!reviewed.includes(value)) {
    throw new BackendEnvironmentError(
      code,
      message,
    );
  }
}

function boundedInteger(
  value: string | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (
    value === undefined
    || value === ""
  ) {
    return fallback;
  }

  if (!/^[0-9]+$/u.test(value)) {
    throw new BackendEnvironmentError(
      "VEIL_BACKEND_ENV_INVALID",
      "A backend numeric environment value is invalid.",
    );
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed)
    || parsed < minimum
    || parsed > maximum
  ) {
    throw new BackendEnvironmentError(
      "VEIL_BACKEND_ENV_INVALID",
      "A backend numeric environment value is outside its safe bounds.",
    );
  }

  return parsed;
}

function isLoopback(
  hostname: string,
): boolean {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "[::1]";
}
