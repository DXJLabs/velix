import { hash } from "starknet";
import {
  OfficialPrivacyTransport,
  type OfficialPrivacyTransportConfig,
  type PrepareOfficialPrivacyTransportInput,
  type PreparedOfficialPrivacyTransport,
} from "./official-transport.js";
import {
  VEIL_OFFICIAL_CHAIN_ID,
  VEIL_OFFICIAL_CHAIN_ID_HEX,
  VEIL_OFFICIAL_OUTSIDE_EXECUTION_VERSION,
  VEIL_OFFICIAL_POOL_COMPATIBILITY,
  VEIL_OFFICIAL_TRANSACTION_VERSION,
} from "./official-sdk.js";
import { VeilPrivacyError, type VeilPrivacyErrorCode } from "./errors.js";
import { VEIL_OFFICIAL_PRIVACY_SDK_VERSION } from "./namespace.js";

export const VEIL_TRANSACTION_PROVER_PIN = Object.freeze({
  implementation: "starknet_transaction_prover",
  imageRepository: "ghcr.io/starkware-libs/starknet-privacy/transaction-prover",
  imageTag: "PRIVACY-0.14.3-RC.2",
  imageDigest: "sha256:a2f71d7139069fa566c4f44bdd66b79cac992c0cbc20ddf0af3a3558c6cabd64",
  sourceRepository: "https://github.com/starkware-libs/sequencer",
  sourceCommit: "e6b6fd2e9932909107833579e5b6efd6c75fa0af",
  rpcSpecVersion: "0.10.3-rc.2",
  rpcSpecRepository: "https://github.com/starkware-libs/starknet-specs",
  rpcSpecCommit: "82376e69dee268c5ddce8333499b7a7dce57095d",
  rpcMethod: "starknet_proveTransaction",
  healthPath: "/health",
  operatingSystem: "linux",
  architectures: Object.freeze(["amd64", "arm64"] as const),
  port: 3_000,
  recommendedResources: Object.freeze({ vcpu: 48, memoryGiB: 96 }),
  sdkVersion: VEIL_OFFICIAL_PRIVACY_SDK_VERSION,
  poolCompatibility: VEIL_OFFICIAL_POOL_COMPATIBILITY,
  transactionVersion: VEIL_OFFICIAL_TRANSACTION_VERSION,
  outsideExecutionVersion: VEIL_OFFICIAL_OUTSIDE_EXECUTION_VERSION,
} as const);

export const VEIL_TRANSACTION_PROVER_IMAGE =
  `${VEIL_TRANSACTION_PROVER_PIN.imageRepository}@${VEIL_TRANSACTION_PROVER_PIN.imageDigest}` as const;

export const VEIL_PROVER_HEALTH_STATUS = Object.freeze({
  PROVER_UNREACHABLE: "PROVER_UNREACHABLE",
  PROVER_RPC_UNSUPPORTED: "PROVER_RPC_UNSUPPORTED",
  PROVER_VERSION_MISMATCH: "PROVER_VERSION_MISMATCH",
  SDK_PROVER_MISMATCH: "SDK_PROVER_MISMATCH",
  POOL_PROVER_MISMATCH: "POOL_PROVER_MISMATCH",
  WRONG_CHAIN: "WRONG_CHAIN",
  PROVER_DEGRADED: "PROVER_DEGRADED",
  PROVER_READY_LOCAL: "PROVER_READY_LOCAL",
  PROVER_READY_UNVERIFIED_LIVE: "PROVER_READY_UNVERIFIED_LIVE",
} as const);

export const VEIL_LOCAL_PROOF_STATUS = Object.freeze({
  LOCAL_PROVER_VERIFIED: "LOCAL_PROVER_VERIFIED",
  PROVER_READY_UNVERIFIED_LIVE: "PROVER_READY_UNVERIFIED_LIVE",
} as const);

export type VeilProverHealthStatus =
  (typeof VEIL_PROVER_HEALTH_STATUS)[keyof typeof VEIL_PROVER_HEALTH_STATUS];
export type VeilLocalProofStatus =
  (typeof VEIL_LOCAL_PROOF_STATUS)[keyof typeof VEIL_LOCAL_PROOF_STATUS];
export type TransactionProverMode = "local" | "live-unverified";

export interface TransactionProverPinConfig {
  implementation: string;
  imageRepository: string;
  imageTag: string;
  imageDigest: string;
  sourceCommit: string;
  rpcSpecVersion: string;
  rpcSpecCommit: string;
}

export interface TransactionProverTimeoutConfig {
  connectionTimeoutMs?: number;
  proofGenerationTimeoutMs?: number;
  totalOperationTimeoutMs?: number;
}

export interface TransactionProverRetryConfig {
  healthMaxRetries?: number;
  proofMaxRetries?: number;
  baseDelayMs?: number;
  maximumDelayMs?: number;
}

export interface TransactionProverLimitConfig {
  maximumRequestBytes?: number;
  maximumResponseBytes?: number;
  maximumProofBytes?: number;
  maximumJsonDepth?: number;
}

export interface TransactionProverLogEvent {
  requestId: string;
  operation: "health" | PrepareOfficialPrivacyTransportInput["operation"];
  sdkVersion: string;
  proverVersion: string;
  chain: string;
  durationMs: number;
  retryCount: number;
  responseStatus: VeilProverHealthStatus | VeilLocalProofStatus;
  mode: TransactionProverMode;
  errorCode?: VeilPrivacyErrorCode;
  proofSizeBytes?: number;
}

export interface TransactionProverConfig {
  endpoint: string;
  mode: TransactionProverMode;
  pin: TransactionProverPinConfig;
  transport: OfficialPrivacyTransportConfig;
  timeouts?: TransactionProverTimeoutConfig;
  retry?: TransactionProverRetryConfig;
  limits?: TransactionProverLimitConfig;
  fetch?: typeof fetch;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  onStatus?: (event: TransactionProverLogEvent) => void;
}

export interface TransactionProverHealthSnapshot {
  status: VeilProverHealthStatus;
  endpoint: string;
  mode: TransactionProverMode;
  processReachable: boolean;
  rpcResponding: boolean;
  rpcSchemaCompatible: boolean;
  proverVersionCompatible: boolean;
  sdkVersionCompatible: boolean;
  poolVersionCompatible: boolean;
  chainCompatible: boolean;
  transactionCompatible: boolean;
  authorizationCompatible: boolean;
  readyToAcceptProofJobs: boolean;
  degraded: boolean;
  localProofVerified: false;
  canonicalPrepared: false;
  liveVerified: false;
  shieldEnabled: false;
  retryCount: number;
  reasons: readonly TransactionProverReason[];
}

export interface TransactionProverReason {
  code: VeilPrivacyErrorCode;
  message: string;
}

export interface ProverResourceBound {
  max_amount: string;
  max_price_per_unit: string;
}

export interface ProverInvokeV3Transaction {
  type: "INVOKE";
  version: "0x3";
  sender_address: string;
  calldata: readonly string[];
  signature: readonly string[];
  nonce: string;
  resource_bounds: {
    l1_gas: ProverResourceBound;
    l2_gas: ProverResourceBound;
    l1_data_gas: ProverResourceBound;
  };
  tip: "0x0";
  paymaster_data: readonly string[];
  account_deployment_data: readonly string[];
  nonce_data_availability_mode: "L1" | "L2";
  fee_data_availability_mode: "L1" | "L2";
}

export type TransactionProverBlockId =
  | "latest"
  | { block_number: number }
  | { block_hash: string };

export interface TransactionProofRequestInput {
  canonical: PrepareOfficialPrivacyTransportInput;
  blockId: TransactionProverBlockId | unknown;
  transaction: ProverInvokeV3Transaction | unknown;
}

export interface TransactionProofResult {
  status: VeilLocalProofStatus;
  requestId: string;
  operation: PrepareOfficialPrivacyTransportInput["operation"];
  requestFingerprint: string;
  proof: string;
  proofFacts: readonly string[];
  l2ToL1Messages: readonly ProverL2ToL1Message[];
  proofSizeBytes: number;
  retryCount: number;
  broadcastEnabled: false;
  canonicalPrepared: false;
  liveVerified: false;
  shieldEnabled: false;
}

export interface ProverL2ToL1Message {
  fromAddress: string;
  toAddress: string;
  payload: readonly string[];
}

export interface ProofBroadcastCandidate {
  requestId: string;
  requestFingerprint: string;
  proof: string;
  proofFacts: readonly string[];
  output: readonly string[];
  broadcastEnabled: false;
  canonicalPrepared: false;
  liveVerified: false;
}

interface NormalizedProofResponse {
  proof: string;
  proofFacts: readonly string[];
  l2ToL1Messages: readonly ProverL2ToL1Message[];
  proofSizeBytes: number;
}

interface RpcAttemptResult<T> {
  value: T;
  retryCount: number;
}

interface StaticCompatibility {
  endpoint: string;
  mode: TransactionProverMode;
  proverVersionCompatible: boolean;
  sdkVersionCompatible: boolean;
  poolVersionCompatible: boolean;
  chainCompatible: boolean;
  transactionCompatible: boolean;
  authorizationCompatible: boolean;
  reasons: readonly TransactionProverReason[];
  status: VeilProverHealthStatus;
}

interface RpcEnvelope {
  jsonrpc: "2.0";
  id: string;
  result: unknown;
}

const DEFAULT_CONNECTION_TIMEOUT_MS = 5_000;
const DEFAULT_PROOF_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 20 * 60_000;
const DEFAULT_MAXIMUM_REQUEST_BYTES = 1_048_576;
const DEFAULT_MAXIMUM_RESPONSE_BYTES = 2_097_152;
const DEFAULT_MAXIMUM_PROOF_BYTES = 1_048_576;
const DEFAULT_MAXIMUM_JSON_DEPTH = 24;
const UPSTREAM_MAXIMUM_REQUEST_BYTES = 5_242_880;
const MAXIMUM_RESPONSE_BYTES = 8_388_608;
const MAXIMUM_RETRIES = 3;
const MAXIMUM_BACKOFF_MS = 30_000;
const JSON_RPC_VERSION = "2.0";
const TRANSIENT_HTTP_STATUSES = new Set([429, 502, 503, 504]);
const TRANSIENT_RPC_CODE = -32_005;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const CANONICAL_HEX = /^0x(?:0|[1-9a-f][0-9a-f]*)$/u;
const COMPILE_ACTIONS_SELECTOR = BigInt(hash.getSelectorFromName("compile_actions"));
const VIRTUAL_SNOS_PROGRAM = 0x5649525455414c5f534e4f53n;
const VIRTUAL_SNOS_OUTPUT = 0x5649525455414c5f534e4f5330n;
const FIXED_CLIENT_ACTION_FIELDS = Object.freeze([1, 4, 6, 6, 5, 2, 3, 4] as const);

export class TransactionProverError extends VeilPrivacyError {
  readonly status: VeilProverHealthStatus;

  constructor(
    code: VeilPrivacyErrorCode,
    message: string,
    status: VeilProverHealthStatus,
    options: { retryable?: boolean; details?: Readonly<Record<string, string | number | boolean>> } = {},
  ) {
    super(code, message, options);
    this.name = "TransactionProverError";
    this.status = status;
  }
}

export class TransactionProverClient {
  readonly #config: TransactionProverConfig;
  readonly #compatibility: StaticCompatibility;
  readonly #fetch: typeof fetch;
  readonly #sleep: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  readonly #now: () => number;
  readonly #connectionTimeoutMs: number;
  readonly #proofGenerationTimeoutMs: number;
  readonly #totalOperationTimeoutMs: number;
  readonly #healthMaxRetries: number;
  readonly #proofMaxRetries: number;
  readonly #baseDelayMs: number;
  readonly #maximumDelayMs: number;
  readonly #maximumRequestBytes: number;
  readonly #maximumResponseBytes: number;
  readonly #maximumProofBytes: number;
  readonly #maximumJsonDepth: number;

  constructor(config: TransactionProverConfig) {
    this.#config = config;
    this.#compatibility = evaluateTransactionProverCompatibility(config);
    this.#fetch = config.fetch ?? globalThis.fetch;
    if (typeof this.#fetch !== "function") {
      throw new TransactionProverError(
        "PROVER_UNREACHABLE",
        "A Fetch-compatible transport is required for the transaction prover boundary.",
        VEIL_PROVER_HEALTH_STATUS.PROVER_UNREACHABLE,
      );
    }
    this.#sleep = config.sleep ?? abortableSleep;
    this.#now = config.now ?? (() => Date.now());
    this.#connectionTimeoutMs = boundedInteger(
      config.timeouts?.connectionTimeoutMs,
      DEFAULT_CONNECTION_TIMEOUT_MS,
      100,
      60_000,
      "connectionTimeoutMs",
    );
    this.#proofGenerationTimeoutMs = boundedInteger(
      config.timeouts?.proofGenerationTimeoutMs,
      DEFAULT_PROOF_TIMEOUT_MS,
      1_000,
      60 * 60_000,
      "proofGenerationTimeoutMs",
    );
    this.#totalOperationTimeoutMs = boundedInteger(
      config.timeouts?.totalOperationTimeoutMs,
      DEFAULT_TOTAL_TIMEOUT_MS,
      1_000,
      2 * 60 * 60_000,
      "totalOperationTimeoutMs",
    );
    this.#healthMaxRetries = boundedInteger(
      config.retry?.healthMaxRetries,
      1,
      0,
      MAXIMUM_RETRIES,
      "healthMaxRetries",
    );
    this.#proofMaxRetries = boundedInteger(
      config.retry?.proofMaxRetries,
      2,
      0,
      MAXIMUM_RETRIES,
      "proofMaxRetries",
    );
    this.#baseDelayMs = boundedInteger(config.retry?.baseDelayMs, 250, 0, 10_000, "baseDelayMs");
    this.#maximumDelayMs = boundedInteger(
      config.retry?.maximumDelayMs,
      5_000,
      0,
      MAXIMUM_BACKOFF_MS,
      "maximumDelayMs",
    );
    this.#maximumRequestBytes = boundedInteger(
      config.limits?.maximumRequestBytes,
      DEFAULT_MAXIMUM_REQUEST_BYTES,
      1_024,
      UPSTREAM_MAXIMUM_REQUEST_BYTES,
      "maximumRequestBytes",
    );
    this.#maximumResponseBytes = boundedInteger(
      config.limits?.maximumResponseBytes,
      DEFAULT_MAXIMUM_RESPONSE_BYTES,
      1_024,
      MAXIMUM_RESPONSE_BYTES,
      "maximumResponseBytes",
    );
    this.#maximumProofBytes = boundedInteger(
      config.limits?.maximumProofBytes,
      DEFAULT_MAXIMUM_PROOF_BYTES,
      1,
      this.#maximumResponseBytes,
      "maximumProofBytes",
    );
    this.#maximumJsonDepth = boundedInteger(
      config.limits?.maximumJsonDepth,
      DEFAULT_MAXIMUM_JSON_DEPTH,
      4,
      64,
      "maximumJsonDepth",
    );
  }

  compatibility(): StaticCompatibility {
    return this.#compatibility;
  }

  async checkHealth(input: { requestId: string; signal?: AbortSignal }): Promise<TransactionProverHealthSnapshot> {
    const requestId = validateRequestId(input.requestId);
    const startedAt = this.#now();
    if (this.#compatibility.reasons.length > 0) {
      const snapshot = this.#healthSnapshot({
        status: this.#compatibility.status,
        retryCount: 0,
        reasons: this.#compatibility.reasons,
      });
      this.#emit({ requestId, operation: "health", startedAt, retryCount: 0, responseStatus: snapshot.status });
      return snapshot;
    }

    let processReachable = false;
    let retryCount = 0;
    try {
      const healthResult = await this.#withRetry(
        this.#healthMaxRetries,
        this.#connectionTimeoutMs,
        input.signal,
        async (attemptTimeoutMs, signal) => {
          const value = await this.#fetchJson(
            new URL(VEIL_TRANSACTION_PROVER_PIN.healthPath, `${this.#compatibility.endpoint}/`).toString(),
            { method: "GET" },
            this.#maximumResponseBytes,
            attemptTimeoutMs,
            signal,
          );
          processReachable = true;
          validateHealthBody(value);
          return value;
        },
      );
      retryCount += healthResult.retryCount;
      processReachable = true;

      const rpcId = `${requestId}-spec`;
      const specResult = await this.#withRetry(
        this.#healthMaxRetries,
        this.#connectionTimeoutMs,
        input.signal,
        (attemptTimeoutMs, signal) => this.#jsonRpc(
          rpcId,
          "starknet_specVersion",
          [],
          this.#maximumResponseBytes,
          attemptTimeoutMs,
          signal,
        ),
      );
      retryCount += specResult.retryCount;
      if (specResult.value.result !== VEIL_TRANSACTION_PROVER_PIN.rpcSpecVersion) {
        throw new TransactionProverError(
          "PROVER_VERSION_MISMATCH",
          "The transaction prover RPC version does not match the reviewed OpenRPC pin.",
          VEIL_PROVER_HEALTH_STATUS.PROVER_VERSION_MISMATCH,
        );
      }

      const status = this.#compatibility.mode === "local"
        ? VEIL_PROVER_HEALTH_STATUS.PROVER_READY_LOCAL
        : VEIL_PROVER_HEALTH_STATUS.PROVER_READY_UNVERIFIED_LIVE;
      const snapshot = this.#healthSnapshot({
        status,
        processReachable: true,
        rpcResponding: true,
        rpcSchemaCompatible: true,
        readyToAcceptProofJobs: true,
        retryCount,
      });
      this.#emit({ requestId, operation: "health", startedAt, retryCount, responseStatus: status });
      return snapshot;
    } catch (cause) {
      const error = asTransactionProverError(cause);
      const snapshot = this.#healthSnapshot({
        status: error.status,
        processReachable,
        rpcResponding: processReachable && error.code !== "PROVER_UNREACHABLE",
        degraded: processReachable,
        retryCount,
        reasons: [reason(error.code, error.message)],
      });
      this.#emit({
        requestId,
        operation: "health",
        startedAt,
        retryCount,
        responseStatus: snapshot.status,
        errorCode: error.code,
      });
      return snapshot;
    }
  }

  async prove(input: TransactionProofRequestInput, signal?: AbortSignal): Promise<TransactionProofResult> {
    const startedAt = this.#now();
    const prepared = await this.#prepareProofRequest(input);
    const requestId = prepared.canonical.requestId;
    const operationTimeout = createTimeoutSignal(this.#totalOperationTimeoutMs, signal);
    let retryCount = 0;
    try {
      const health = await this.checkHealth({ requestId, signal: operationTimeout.signal });
      if (!health.readyToAcceptProofJobs) {
        const first = health.reasons[0] ?? reason("PROVER_UNREACHABLE", "The prover is not ready for proof jobs.");
        throw new TransactionProverError(first.code, first.message, health.status);
      }

      const rpcId = `${requestId}-proof`;
      const proofResult = await this.#withRetry(
        this.#proofMaxRetries,
        this.#proofGenerationTimeoutMs,
        operationTimeout.signal,
        (attemptTimeoutMs, attemptSignal) => this.#jsonRpc(
          rpcId,
          VEIL_TRANSACTION_PROVER_PIN.rpcMethod,
          {
            block_id: prepared.blockId,
            transaction: prepared.transaction,
          },
          this.#maximumResponseBytes,
          attemptTimeoutMs,
          attemptSignal,
        ),
      );
      retryCount = proofResult.retryCount;
      const normalized = validateProofResponse(
        proofResult.value.result,
        prepared.poolAddress,
        this.#maximumProofBytes,
      );
      const status = this.#compatibility.mode === "local"
        ? VEIL_LOCAL_PROOF_STATUS.LOCAL_PROVER_VERIFIED
        : VEIL_LOCAL_PROOF_STATUS.PROVER_READY_UNVERIFIED_LIVE;
      const result = Object.freeze({
        status,
        requestId,
        operation: prepared.canonical.operation,
        requestFingerprint: prepared.requestFingerprint,
        proof: normalized.proof,
        proofFacts: normalized.proofFacts,
        l2ToL1Messages: normalized.l2ToL1Messages,
        proofSizeBytes: normalized.proofSizeBytes,
        retryCount,
        broadcastEnabled: false as const,
        canonicalPrepared: false as const,
        liveVerified: false as const,
        shieldEnabled: false as const,
      });
      this.#emit({
        requestId,
        operation: prepared.canonical.operation,
        startedAt,
        retryCount,
        responseStatus: status,
        proofSizeBytes: result.proofSizeBytes,
      });
      return result;
    } catch (cause) {
      const error = operationTimeout.timedOut()
        ? new TransactionProverError(
          "PROVER_TIMEOUT",
          "The transaction prover operation exceeded its total timeout.",
          VEIL_PROVER_HEALTH_STATUS.PROVER_UNREACHABLE,
        )
        : asTransactionProverError(cause);
      this.#emit({
        requestId,
        operation: prepared.canonical.operation,
        startedAt,
        retryCount,
        responseStatus: error.status,
        errorCode: error.code,
      });
      throw error;
    } finally {
      operationTimeout.cleanup();
    }
  }

  prepareBroadcastCandidate(result: TransactionProofResult): ProofBroadcastCandidate {
    if (result.liveVerified || result.canonicalPrepared || result.broadcastEnabled) {
      throw new TransactionProverError(
        "PROVER_BROADCAST_FORBIDDEN",
        "Phase 4 proof results cannot enable canonical runtime or broadcast.",
        VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
      );
    }
    const poolMessage = result.l2ToL1Messages[0];
    if (!poolMessage) {
      throw new TransactionProverError(
        "PROVER_RESPONSE_INVALID",
        "The proof response does not contain a Pool output message.",
        VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
      );
    }
    return Object.freeze({
      requestId: result.requestId,
      requestFingerprint: result.requestFingerprint,
      proof: result.proof,
      proofFacts: result.proofFacts,
      output: poolMessage.payload,
      broadcastEnabled: false as const,
      canonicalPrepared: false as const,
      liveVerified: false as const,
    });
  }

  async #prepareProofRequest(input: TransactionProofRequestInput): Promise<{
    canonical: ReturnType<OfficialPrivacyTransport["prepare"]>;
    blockId: TransactionProverBlockId;
    transaction: ProverInvokeV3Transaction;
    poolAddress: string;
    requestFingerprint: string;
  }> {
    if (this.#compatibility.reasons.length > 0) {
      const first = this.#compatibility.reasons[0] as TransactionProverReason;
      throw new TransactionProverError(first.code, first.message, this.#compatibility.status);
    }
    const transport = new OfficialPrivacyTransport(withoutTransportLogger(this.#config.transport));
    const canonical = transport.prepare(input.canonical);
    const blockId = validateBlockId(input.blockId);
    const transaction = validateInvokeV3(input.transaction, this.#config.transport.pool.address);
    validateCanonicalTransactionIntent(transaction.calldata, canonical, this.#config.transport.pool.address);
    const body = JSON.stringify({
      jsonrpc: JSON_RPC_VERSION,
      id: `${canonical.requestId}-proof`,
      method: VEIL_TRANSACTION_PROVER_PIN.rpcMethod,
      params: { block_id: blockId, transaction },
    });
    const byteLength = utf8Length(body);
    if (byteLength === 0 || byteLength > this.#maximumRequestBytes) {
      throw new TransactionProverError(
        "PROVER_REQUEST_INVALID",
        "The proof request exceeds the configured request-size boundary.",
        VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
        { details: { byteLength, maximumRequestBytes: this.#maximumRequestBytes } },
      );
    }
    return {
      canonical,
      blockId,
      transaction,
      poolAddress: normalizeFelt(this.#config.transport.pool.address, "poolAddress", false),
      requestFingerprint: await sha256RequestFingerprint(body),
    };
  }

  async #jsonRpc(
    id: string,
    method: string,
    params: unknown,
    maximumResponseBytes: number,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<RpcEnvelope> {
    const body = JSON.stringify({ jsonrpc: JSON_RPC_VERSION, id, method, params });
    const byteLength = utf8Length(body);
    if (byteLength === 0 || byteLength > this.#maximumRequestBytes) {
      throw new TransactionProverError(
        "PROVER_REQUEST_INVALID",
        "The transaction prover JSON-RPC request exceeds the configured limit.",
        VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
      );
    }
    const value = await this.#fetchJson(
      this.#compatibility.endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
      },
      maximumResponseBytes,
      timeoutMs,
      signal,
    );
    return validateRpcEnvelope(value, id);
  }

  async #fetchJson(
    url: string,
    init: RequestInit,
    maximumResponseBytes: number,
    timeoutMs: number,
    externalSignal?: AbortSignal,
  ): Promise<unknown> {
    const timeout = createTimeoutSignal(timeoutMs, externalSignal);
    let responseReceived = false;
    try {
      const response = await this.#fetch(url, { ...init, redirect: "manual", signal: timeout.signal });
      responseReceived = true;

      if (response.status >= 300 && response.status < 400) {
        throw new TransactionProverError(
          "PROVER_REDIRECT_FORBIDDEN",
          "Transaction prover redirects are rejected; configure the final endpoint explicitly.",
          VEIL_PROVER_HEALTH_STATUS.PROVER_RPC_UNSUPPORTED,
        );
      }
      if (!response.ok) {
        const transient = TRANSIENT_HTTP_STATUSES.has(response.status);
        throw new TransactionProverError(
          transient ? "PROVER_DEGRADED" : "PROVER_RESPONSE_INVALID",
          transient
            ? "The transaction prover is temporarily unable to accept requests."
            : "The transaction prover returned a non-success HTTP status.",
          VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
          { retryable: transient, details: { httpStatus: response.status } },
        );
      }

      const declaredLength = parseContentLength(response.headers.get("content-length"));
      if (declaredLength !== undefined && declaredLength > maximumResponseBytes) {
        throw new TransactionProverError(
          "PROVER_RESPONSE_TOO_LARGE",
          "The transaction prover response exceeds the configured size boundary.",
          VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
          { details: { declaredLength, maximumResponseBytes } },
        );
      }
      const text = await readBoundedText(response, maximumResponseBytes);
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        throw new TransactionProverError(
          "PROVER_RESPONSE_INVALID",
          "The transaction prover returned malformed JSON.",
          VEIL_PROVER_HEALTH_STATUS.PROVER_RPC_UNSUPPORTED,
        );
      }
      assertJsonBounds(value, this.#maximumJsonDepth);
      return value;
    } catch (cause) {
      if (cause instanceof TransactionProverError) throw cause;
      if (externalSignal?.aborted) {
        throw new TransactionProverError(
          "PROVER_CANCELLED",
          "The transaction prover operation was cancelled.",
          VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
        );
      }
      if (timeout.timedOut()) {
        throw new TransactionProverError(
          "PROVER_TIMEOUT",
          "The transaction prover request exceeded its attempt timeout.",
          VEIL_PROVER_HEALTH_STATUS.PROVER_UNREACHABLE,
          { retryable: true },
        );
      }
      if (!responseReceived) {
        throw new TransactionProverError(
          "PROVER_UNREACHABLE",
          "The transaction prover endpoint could not be reached.",
          VEIL_PROVER_HEALTH_STATUS.PROVER_UNREACHABLE,
          { retryable: true },
        );
      }
      throw new TransactionProverError(
        "PROVER_RESPONSE_INVALID",
        "The transaction prover response body could not be decoded.",
        VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
      );
    } finally {
      timeout.cleanup();
    }
  }

  async #withRetry<T>(
    maxRetries: number,
    attemptTimeoutMs: number,
    signal: AbortSignal | undefined,
    operation: (timeoutMs: number, signal?: AbortSignal) => Promise<T>,
  ): Promise<RpcAttemptResult<T>> {
    const startedAt = this.#now();
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (signal?.aborted) {
        throw new TransactionProverError(
          "PROVER_CANCELLED",
          "The transaction prover operation was cancelled.",
          VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
        );
      }
      const elapsed = Math.max(0, this.#now() - startedAt);
      const remaining = this.#totalOperationTimeoutMs - elapsed;
      if (remaining <= 0) {
        throw new TransactionProverError(
          "PROVER_TIMEOUT",
          "The transaction prover operation exceeded its total timeout.",
          VEIL_PROVER_HEALTH_STATUS.PROVER_UNREACHABLE,
        );
      }
      try {
        return { value: await operation(Math.min(attemptTimeoutMs, remaining), signal), retryCount: attempt };
      } catch (cause) {
        const error = asTransactionProverError(cause);
        if (attempt >= maxRetries || !error.retryable) throw error;
        const delayMs = Math.min(this.#baseDelayMs * (2 ** attempt), this.#maximumDelayMs, remaining);
        await this.#sleep(delayMs, signal);
      }
    }
    throw new TransactionProverError(
      "PROVER_DEGRADED",
      "The transaction prover retry policy exhausted unexpectedly.",
      VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
    );
  }

  #healthSnapshot(input: {
    status: VeilProverHealthStatus;
    processReachable?: boolean;
    rpcResponding?: boolean;
    rpcSchemaCompatible?: boolean;
    readyToAcceptProofJobs?: boolean;
    degraded?: boolean;
    retryCount: number;
    reasons?: readonly TransactionProverReason[];
  }): TransactionProverHealthSnapshot {
    return Object.freeze({
      status: input.status,
      endpoint: this.#compatibility.endpoint,
      mode: this.#compatibility.mode,
      processReachable: input.processReachable ?? false,
      rpcResponding: input.rpcResponding ?? false,
      rpcSchemaCompatible: input.rpcSchemaCompatible ?? false,
      proverVersionCompatible: this.#compatibility.proverVersionCompatible,
      sdkVersionCompatible: this.#compatibility.sdkVersionCompatible,
      poolVersionCompatible: this.#compatibility.poolVersionCompatible,
      chainCompatible: this.#compatibility.chainCompatible,
      transactionCompatible: this.#compatibility.transactionCompatible,
      authorizationCompatible: this.#compatibility.authorizationCompatible,
      readyToAcceptProofJobs: input.readyToAcceptProofJobs ?? false,
      degraded: input.degraded ?? false,
      localProofVerified: false,
      canonicalPrepared: false,
      liveVerified: false,
      shieldEnabled: false,
      retryCount: input.retryCount,
      reasons: Object.freeze([...(input.reasons ?? [])]),
    });
  }

  #emit(input: {
    requestId: string;
    operation: TransactionProverLogEvent["operation"];
    startedAt: number;
    retryCount: number;
    responseStatus: TransactionProverLogEvent["responseStatus"];
    errorCode?: VeilPrivacyErrorCode;
    proofSizeBytes?: number;
  }): void {
    if (!this.#config.onStatus) return;
    const event: TransactionProverLogEvent = {
      requestId: input.requestId,
      operation: input.operation,
      sdkVersion: VEIL_OFFICIAL_PRIVACY_SDK_VERSION,
      proverVersion: VEIL_TRANSACTION_PROVER_PIN.imageTag,
      chain: VEIL_OFFICIAL_CHAIN_ID,
      durationMs: Math.max(0, this.#now() - input.startedAt),
      retryCount: input.retryCount,
      responseStatus: input.responseStatus,
      mode: this.#compatibility.mode,
    };
    if (input.errorCode !== undefined) event.errorCode = input.errorCode;
    if (input.proofSizeBytes !== undefined) event.proofSizeBytes = input.proofSizeBytes;
    this.#config.onStatus(Object.freeze(event));
  }
}

export function evaluateTransactionProverCompatibility(config: TransactionProverConfig): StaticCompatibility {
  const endpoint = validateProverEndpoint(config.endpoint, config.mode);
  const reasons: TransactionProverReason[] = [];
  const expected = VEIL_TRANSACTION_PROVER_PIN;
  const proverVersionCompatible = config.pin.implementation === expected.implementation
    && config.pin.imageRepository === expected.imageRepository
    && config.pin.imageTag === expected.imageTag
    && config.pin.imageDigest === expected.imageDigest
    && config.pin.sourceCommit === expected.sourceCommit
    && config.pin.rpcSpecVersion === expected.rpcSpecVersion
    && config.pin.rpcSpecCommit === expected.rpcSpecCommit;
  if (!proverVersionCompatible) {
    reasons.push(reason("PROVER_VERSION_MISMATCH", "The transaction prover image, source, or RPC schema pin differs from the reviewed RC.2 stack."));
  }

  const sdkVersionCompatible = config.transport.sdk.installed
    && config.transport.sdk.version === VEIL_OFFICIAL_PRIVACY_SDK_VERSION;
  if (!sdkVersionCompatible) {
    reasons.push(reason("SDK_PROVER_MISMATCH", "The transaction prover boundary requires Privacy SDK 0.14.3-rc.2."));
  }

  if (
    config.transport.route !== "sdk-direct"
    || config.transport.directAccount?.accountCustody !== "integrator-owned"
    || config.transport.directAccount.viewingKeyCustody !== "integrator-managed"
  ) {
    reasons.push(reason(
      "ACCOUNT_CUSTODY_MISMATCH",
      "The direct transaction prover boundary is restricted to integrator-owned accounts and viewing keys.",
    ));
  }

  const poolVersionCompatible = config.transport.pool.compatibility === VEIL_OFFICIAL_POOL_COMPATIBILITY
    && isAllowedPool(config.transport.pool);
  if (!poolVersionCompatible) {
    reasons.push(reason("POOL_PROVER_MISMATCH", "The transaction prover boundary requires an allowlisted PRIVACY-0.14.3-RC.0 Pool."));
  }

  const chainCompatible = isSepoliaChain(config.transport.network.chainId);
  if (!chainCompatible) {
    reasons.push(reason("WRONG_CHAIN", "The transaction prover boundary is locked to Starknet Sepolia."));
  }

  const transactionCompatible = isInvokeV3(config.transport.transactionVersion);
  if (!transactionCompatible) {
    reasons.push(reason("TRANSACTION_VERSION_UNSUPPORTED", "The transaction prover supports Invoke Transaction V3 only."));
  }

  const authorizationCompatible = isOutsideExecutionV2(config.transport.outsideExecutionVersion);
  if (!authorizationCompatible) {
    reasons.push(reason("AUTHORIZATION_VERSION_UNSUPPORTED", "The reviewed authorization boundary requires Outside Execution V2."));
  }

  let status: VeilProverHealthStatus = config.mode === "local"
    ? VEIL_PROVER_HEALTH_STATUS.PROVER_READY_LOCAL
    : VEIL_PROVER_HEALTH_STATUS.PROVER_READY_UNVERIFIED_LIVE;
  const firstCode = reasons[0]?.code;
  if (firstCode === "PROVER_VERSION_MISMATCH") status = VEIL_PROVER_HEALTH_STATUS.PROVER_VERSION_MISMATCH;
  else if (firstCode === "SDK_PROVER_MISMATCH") status = VEIL_PROVER_HEALTH_STATUS.SDK_PROVER_MISMATCH;
  else if (firstCode === "POOL_PROVER_MISMATCH") status = VEIL_PROVER_HEALTH_STATUS.POOL_PROVER_MISMATCH;
  else if (firstCode === "WRONG_CHAIN") status = VEIL_PROVER_HEALTH_STATUS.WRONG_CHAIN;
  else if (reasons.length > 0) status = VEIL_PROVER_HEALTH_STATUS.PROVER_RPC_UNSUPPORTED;

  return Object.freeze({
    endpoint,
    mode: config.mode,
    proverVersionCompatible,
    sdkVersionCompatible,
    poolVersionCompatible,
    chainCompatible,
    transactionCompatible,
    authorizationCompatible,
    reasons: Object.freeze(reasons),
    status,
  });
}

export function validateProverEndpoint(value: string, mode: TransactionProverMode): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TransactionProverError(
      "PROVER_ENDPOINT_MISSING",
      "The transaction prover endpoint must be configured explicitly.",
      VEIL_PROVER_HEALTH_STATUS.PROVER_UNREACHABLE,
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new TransactionProverError(
      "PROVER_ENDPOINT_INVALID",
      "The transaction prover endpoint must be an absolute HTTP(S) URL.",
      VEIL_PROVER_HEALTH_STATUS.PROVER_UNREACHABLE,
    );
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TransactionProverError(
      "PROVER_ENDPOINT_INVALID",
      "The transaction prover endpoint cannot include credentials, query parameters, or fragments.",
      VEIL_PROVER_HEALTH_STATUS.PROVER_UNREACHABLE,
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TransactionProverError(
      "PROVER_ENDPOINT_INVALID",
      "The transaction prover endpoint must use HTTP or HTTPS.",
      VEIL_PROVER_HEALTH_STATUS.PROVER_UNREACHABLE,
    );
  }
  const local = isLoopbackHost(parsed.hostname);
  if (mode === "local" && !local) {
    throw new TransactionProverError(
      "PROVER_ENDPOINT_INVALID",
      "Local prover mode accepts loopback endpoints only.",
      VEIL_PROVER_HEALTH_STATUS.PROVER_UNREACHABLE,
    );
  }
  if (mode === "live-unverified" && (local || isPrivateNetworkLiteral(parsed.hostname))) {
    throw new TransactionProverError(
      "PROVER_ENDPOINT_INVALID",
      "Live-unverified prover mode rejects loopback and private-network literal endpoints.",
      VEIL_PROVER_HEALTH_STATUS.PROVER_UNREACHABLE,
    );
  }
  if (!local && parsed.protocol !== "https:") {
    throw new TransactionProverError(
      "PROVER_ENDPOINT_INSECURE",
      "Non-local transaction prover endpoints must use HTTPS.",
      VEIL_PROVER_HEALTH_STATUS.PROVER_UNREACHABLE,
    );
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    throw new TransactionProverError(
      "PROVER_ENDPOINT_INVALID",
      "The reviewed transaction prover JSON-RPC endpoint must use the root path.",
      VEIL_PROVER_HEALTH_STATUS.PROVER_RPC_UNSUPPORTED,
    );
  }
  parsed.pathname = "";
  return parsed.toString().replace(/\/$/u, "");
}

function withoutTransportLogger(config: OfficialPrivacyTransportConfig): OfficialPrivacyTransportConfig {
  const { onStatus: _onStatus, ...rest } = config;
  void _onStatus;
  return rest;
}

function validateInvokeV3(value: unknown, expectedPool: string | bigint): ProverInvokeV3Transaction {
  const transaction = plainRecord(value, "The proof transaction must be a plain object.");
  assertExactKeys(transaction, [
    "type",
    "version",
    "sender_address",
    "calldata",
    "signature",
    "nonce",
    "resource_bounds",
    "tip",
    "paymaster_data",
    "account_deployment_data",
    "nonce_data_availability_mode",
    "fee_data_availability_mode",
  ], "The proof transaction contains unknown or missing fields.");
  if (transaction.type !== "INVOKE" || transaction.version !== "0x3") {
    throw requestError("The transaction prover accepts Invoke Transaction V3 only.", "TRANSACTION_VERSION_UNSUPPORTED");
  }
  const senderAddress = normalizeFelt(transaction.sender_address, "sender_address", false);
  const poolAddress = normalizeFelt(expectedPool, "poolAddress", false);
  if (senderAddress !== poolAddress) {
    throw requestError("The proof transaction sender must be the reviewed Privacy Pool.", "POOL_PROVER_MISMATCH");
  }
  const calldata = feltArray(transaction.calldata, "calldata", 1, 4_096);
  const signature = feltArray(transaction.signature, "signature", 1, 64);
  const resourceBoundsRecord = plainRecord(transaction.resource_bounds, "resource_bounds must be an object.");
  assertExactKeys(resourceBoundsRecord, ["l1_gas", "l2_gas", "l1_data_gas"], "resource_bounds has an invalid shape.");
  const resourceBounds = {
    l1_gas: validateResourceBound(resourceBoundsRecord.l1_gas, "l1_gas"),
    l2_gas: validateResourceBound(resourceBoundsRecord.l2_gas, "l2_gas"),
    l1_data_gas: validateResourceBound(resourceBoundsRecord.l1_data_gas, "l1_data_gas"),
  };
  if (BigInt(resourceBounds.l2_gas.max_amount) === 0n) {
    throw requestError("l2_gas.max_amount must be nonzero for proof generation.");
  }
  if (
    resourceBounds.l1_gas.max_price_per_unit !== "0x0"
    || resourceBounds.l2_gas.max_price_per_unit !== "0x0"
    || resourceBounds.l1_data_gas.max_price_per_unit !== "0x0"
    || transaction.tip !== "0x0"
  ) {
    throw requestError("Proof generation requires zero gas prices and a zero tip.");
  }
  const nonceDataAvailabilityMode = validateDaMode(transaction.nonce_data_availability_mode, "nonce_data_availability_mode");
  const feeDataAvailabilityMode = validateDaMode(transaction.fee_data_availability_mode, "fee_data_availability_mode");
  return Object.freeze({
    type: "INVOKE",
    version: "0x3",
    sender_address: senderAddress,
    calldata: Object.freeze(calldata),
    signature: Object.freeze(signature),
    nonce: normalizeFelt(transaction.nonce, "nonce", true),
    resource_bounds: Object.freeze({
      l1_gas: Object.freeze(resourceBounds.l1_gas),
      l2_gas: Object.freeze(resourceBounds.l2_gas),
      l1_data_gas: Object.freeze(resourceBounds.l1_data_gas),
    }),
    tip: "0x0",
    paymaster_data: Object.freeze(feltArray(transaction.paymaster_data, "paymaster_data", 0, 256)),
    account_deployment_data: Object.freeze(feltArray(transaction.account_deployment_data, "account_deployment_data", 0, 256)),
    nonce_data_availability_mode: nonceDataAvailabilityMode,
    fee_data_availability_mode: feeDataAvailabilityMode,
  });
}

function validateCanonicalTransactionIntent(
  calldata: readonly string[],
  canonical: PreparedOfficialPrivacyTransport,
  expectedPool: string | bigint,
): void {
  if (calldata.length < 10) throw requestError("The proof invocation calldata is incomplete.");
  const outerCallCount = feltToBoundedCount(calldata[0], "outer call count", 1);
  if (outerCallCount !== 1) {
    throw requestError(
      "The proof invocation must contain exactly one call to Privacy Pool compile_actions.",
      "MULTIPLE_EXTERNAL_INVOKES",
    );
  }
  if (!sameFelt(calldata[1], expectedPool)) {
    throw requestError("The proof invocation targets an unexpected contract.", "HELPER_TARGET_NOT_ALLOWED");
  }
  if (BigInt(calldata[2] as string) !== COMPILE_ACTIONS_SELECTOR) {
    throw requestError("The proof invocation must target Privacy Pool compile_actions.", "HELPER_SELECTOR_NOT_ALLOWED");
  }
  const innerLength = feltToBoundedCount(calldata[3], "compile_actions calldata length", 4_096);
  if (innerLength !== calldata.length - 4) {
    throw requestError("The proof invocation contains malformed compile_actions calldata.");
  }

  const inner = calldata.slice(4);
  normalizeFelt(inner[0], "private account address", false);
  normalizeFelt(inner[1], "integrator-managed viewing material", false);
  const actionCount = feltToBoundedCount(inner[2], "client action count", 256);
  let cursor = 3;
  let applicationInvokes = 0;
  for (let index = 0; index < actionCount; index += 1) {
    if (cursor >= inner.length) throw requestError("The client action list ended unexpectedly.");
    const variant = feltToBoundedCount(inner[cursor], `client action ${index} variant`, 8);
    cursor += 1;
    if (variant === 5) {
      throw requestError("Deposit and Shield proof intents are disabled in Phase 4.", "CANONICAL_CAPABILITY_UNAVAILABLE");
    }
    if (variant === 7) {
      throw requestError("Withdraw and Unshield proof intents are outside the VEIL Idea 01 scope.", "UNSHIELD_UNAVAILABLE");
    }
    if (variant === 8) {
      applicationInvokes += 1;
      if (applicationInvokes > 1) {
        throw requestError("The proof intent contains more than one InvokeExternal action.", "MULTIPLE_EXTERNAL_INVOKES");
      }
      const contractAddress = inner[cursor];
      const invokeCalldataLength = feltToBoundedCount(inner[cursor + 1], "InvokeExternal calldata length", 4_096);
      cursor += 2;
      if (!sameFelt(contractAddress, canonical.helperAddress)) {
        throw requestError("InvokeExternal targets an unreviewed helper contract.", "HELPER_TARGET_NOT_ALLOWED");
      }
      const invokeCalldata = inner.slice(cursor, cursor + invokeCalldataLength);
      if (invokeCalldata.length !== invokeCalldataLength) {
        throw requestError("InvokeExternal calldata ended unexpectedly.");
      }
      if (!sameFeltArray(invokeCalldata, canonical.payload.calldata)) {
        throw requestError("InvokeExternal calldata does not match the validated VEIL payload commitment.");
      }
      cursor += invokeCalldataLength;
      continue;
    }

    const fixedFieldCount = FIXED_CLIENT_ACTION_FIELDS[variant];
    if (fixedFieldCount === undefined || cursor + fixedFieldCount > inner.length) {
      throw requestError("The client action contains malformed calldata.");
    }
    for (let field = 0; field < fixedFieldCount; field += 1) {
      normalizeFelt(inner[cursor + field], `client action ${index} field ${field}`, true);
    }
    cursor += fixedFieldCount;
  }
  if (cursor !== inner.length) throw requestError("The proof intent contains trailing client-action calldata.");
  if (applicationInvokes !== 1) {
    throw requestError("The proof intent must contain exactly one allowlisted InvokeExternal action.");
  }
}

function validateResourceBound(value: unknown, label: string): ProverResourceBound {
  const record = plainRecord(value, `${label} must be an object.`);
  assertExactKeys(record, ["max_amount", "max_price_per_unit"], `${label} has an invalid shape.`);
  const maxAmount = normalizeHexInteger(record.max_amount, `${label}.max_amount`, 64);
  const maxPricePerUnit = normalizeHexInteger(record.max_price_per_unit, `${label}.max_price_per_unit`, 128);
  return { max_amount: maxAmount, max_price_per_unit: maxPricePerUnit };
}

function validateBlockId(value: unknown): TransactionProverBlockId {
  if (value === "latest") return value;
  const record = plainRecord(value, "blockId must be latest, a block number, or a block hash.");
  if (Object.hasOwn(record, "block_number")) {
    assertExactKeys(record, ["block_number"], "blockId contains unknown fields.");
    if (!Number.isSafeInteger(record.block_number) || (record.block_number as number) < 0) {
      throw requestError("block_number must be a non-negative safe integer.");
    }
    return { block_number: record.block_number as number };
  }
  assertExactKeys(record, ["block_hash"], "blockId contains unknown fields.");
  return { block_hash: normalizeFelt(record.block_hash, "block_hash", false) };
}

function validateRpcEnvelope(value: unknown, expectedId: string): RpcEnvelope {
  const envelope = plainRecord(value, "The prover response must be a JSON-RPC object.", "PROVER_RESPONSE_INVALID");
  if (envelope.jsonrpc !== JSON_RPC_VERSION) {
    throw responseError("The prover response uses an unsupported JSON-RPC version.");
  }
  if (envelope.id !== expectedId) {
    throw responseError("The prover response ID does not match the proof request.");
  }
  const hasResult = Object.hasOwn(envelope, "result");
  const hasError = Object.hasOwn(envelope, "error");
  if (hasResult === hasError) {
    throw responseError("The prover response must contain exactly one result or error field.");
  }
  if (hasError) {
    assertExactKeys(envelope, ["jsonrpc", "id", "error"], "The prover error response contains unknown fields.");
    throw parseRpcError(envelope.error);
  }
  assertExactKeys(envelope, ["jsonrpc", "id", "result"], "The prover success response contains unknown fields.");
  return { jsonrpc: "2.0", id: expectedId, result: envelope.result };
}

function parseRpcError(value: unknown): TransactionProverError {
  const error = plainRecord(value, "The prover returned a malformed JSON-RPC error.", "PROVER_RESPONSE_INVALID");
  const keys = Object.keys(error);
  if (keys.some((key) => !["code", "message", "data"].includes(key)) || !keys.includes("code") || !keys.includes("message")) {
    throw responseError("The prover returned a malformed JSON-RPC error.");
  }
  if (!Number.isSafeInteger(error.code) || typeof error.message !== "string") {
    throw responseError("The prover returned a malformed JSON-RPC error.");
  }
  const code = error.code as number;
  if (code === TRANSIENT_RPC_CODE) {
    return new TransactionProverError(
      "PROVER_DEGRADED",
      "The transaction prover is temporarily busy.",
      VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
      { retryable: true, details: { rpcCode: code } },
    );
  }
  if (code === -32_601) {
    return new TransactionProverError(
      "PROVER_RPC_UNSUPPORTED",
      "The transaction prover does not support the required RPC method.",
      VEIL_PROVER_HEALTH_STATUS.PROVER_RPC_UNSUPPORTED,
      { details: { rpcCode: code } },
    );
  }
  if (code === 61) {
    return new TransactionProverError(
      "TRANSACTION_VERSION_UNSUPPORTED",
      "The transaction prover rejected the transaction version.",
      VEIL_PROVER_HEALTH_STATUS.PROVER_RPC_UNSUPPORTED,
      { details: { rpcCode: code } },
    );
  }
  return new TransactionProverError(
    "PROVING_FAILED",
    "The transaction prover rejected the proof request.",
    VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
    { details: { rpcCode: code } },
  );
}

function validateProofResponse(
  value: unknown,
  expectedPoolAddress: string,
  maximumProofBytes: number,
): NormalizedProofResponse {
  const result = plainRecord(value, "The transaction prover result must be an object.", "PROVER_RESPONSE_INVALID");
  const allowedKeys = ["proof", "proof_facts", "l2_to_l1_messages", "additional_data"];
  const keys = Object.keys(result);
  if (
    keys.some((key) => !allowedKeys.includes(key))
    || !keys.includes("proof")
    || !keys.includes("proof_facts")
    || !keys.includes("l2_to_l1_messages")
  ) {
    throw responseError("The transaction prover result contains unknown or missing fields.");
  }
  if (typeof result.proof !== "string" || !result.proof || !BASE64.test(result.proof)) {
    throw responseError("The transaction prover proof must use canonical base64 encoding.");
  }
  const proofSizeBytes = decodedBase64Length(result.proof);
  if (proofSizeBytes === 0 || proofSizeBytes > maximumProofBytes) {
    throw new TransactionProverError(
      "PROVER_RESPONSE_TOO_LARGE",
      "The transaction prover proof exceeds the configured proof-size boundary.",
      VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
      { details: { proofSizeBytes, maximumProofBytes } },
    );
  }
  const proofFacts = feltArray(result.proof_facts, "proof_facts", 1, 256);
  if (!Array.isArray(result.l2_to_l1_messages) || result.l2_to_l1_messages.length !== 1) {
    throw responseError("The transaction prover result must contain exactly one L2-to-L1 Pool message.");
  }
  const l2ToL1Messages = result.l2_to_l1_messages.map((entry) => validateL2ToL1Message(entry));
  if (l2ToL1Messages[0]?.fromAddress !== expectedPoolAddress) {
    throw responseError("The transaction prover output is not associated with the expected Privacy Pool.");
  }
  validateProofFacts(proofFacts, l2ToL1Messages);
  if (Object.hasOwn(result, "additional_data")) validateAdditionalData(result.additional_data);
  return Object.freeze({
    proof: result.proof,
    proofFacts: Object.freeze(proofFacts),
    l2ToL1Messages: Object.freeze(l2ToL1Messages),
    proofSizeBytes,
  });
}

function validateProofFacts(
  proofFacts: readonly string[],
  messages: readonly ProverL2ToL1Message[],
): void {
  if (proofFacts.length < 8) throw responseError("The transaction prover proof facts are incomplete.");
  if (BigInt(proofFacts[1] as string) !== VIRTUAL_SNOS_PROGRAM) {
    throw responseError("The transaction prover proof facts use an unexpected program variant.");
  }
  if (BigInt(proofFacts[3] as string) !== VIRTUAL_SNOS_OUTPUT) {
    throw responseError("The transaction prover proof facts use an unexpected output version.");
  }
  const messageCount = feltToBoundedCount(proofFacts[7], "proof-fact message count", 32, "PROVER_RESPONSE_INVALID");
  if (messageCount !== messages.length || proofFacts.length < 8 + messageCount) {
    throw responseError("The transaction prover proof facts do not match the returned message count.");
  }
  messages.forEach((message, index) => {
    const messageHash = hash.computePoseidonHashOnElements([
      message.fromAddress,
      message.toAddress,
      message.payload.length,
      ...message.payload,
    ]);
    if (!sameFelt(proofFacts[8 + index], messageHash)) {
      throw responseError("The transaction prover proof facts are not associated with the returned Pool message.");
    }
  });
}

function validateL2ToL1Message(value: unknown): ProverL2ToL1Message {
  const message = plainRecord(value, "The prover L2-to-L1 message must be an object.", "PROVER_RESPONSE_INVALID");
  assertExactKeys(message, ["from_address", "to_address", "payload"], "The prover L2-to-L1 message has an invalid shape.");
  return Object.freeze({
    fromAddress: normalizeFelt(message.from_address, "from_address", false, "PROVER_RESPONSE_INVALID"),
    toAddress: normalizeFelt(message.to_address, "to_address", true, "PROVER_RESPONSE_INVALID"),
    payload: Object.freeze(feltArray(message.payload, "payload", 1, 4_096, "PROVER_RESPONSE_INVALID")),
  });
}

function validateAdditionalData(value: unknown): void {
  const additional = plainRecord(value, "additional_data must be an object.", "PROVER_RESPONSE_INVALID");
  assertExactKeys(additional, ["signature"], "additional_data contains unsupported fields.");
  const signature = plainRecord(additional.signature, "additional_data.signature must be an object.", "PROVER_RESPONSE_INVALID");
  assertExactKeys(signature, ["issued_at", "sig_r", "sig_s"], "The screening signature has an invalid shape.");
  if (!Number.isSafeInteger(signature.issued_at) || (signature.issued_at as number) < 0) {
    throw responseError("The screening signature issued_at value is invalid.");
  }
  normalizeFelt(signature.sig_r, "sig_r", false, "PROVER_RESPONSE_INVALID");
  normalizeFelt(signature.sig_s, "sig_s", false, "PROVER_RESPONSE_INVALID");
}

function validateHealthBody(value: unknown): void {
  const health = plainRecord(value, "The transaction prover health response must be an object.", "PROVER_RPC_UNSUPPORTED");
  if (Object.keys(health).length !== 1 || !Object.hasOwn(health, "status")) {
    throw new TransactionProverError(
      "PROVER_RPC_UNSUPPORTED",
      "The transaction prover health response has an unsupported schema.",
      VEIL_PROVER_HEALTH_STATUS.PROVER_RPC_UNSUPPORTED,
    );
  }
  if (health.status !== "ok") {
    throw new TransactionProverError(
      "PROVER_DEGRADED",
      "The transaction prover health endpoint reports a degraded process.",
      VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
      { retryable: true },
    );
  }
}

function validateDaMode(value: unknown, label: string): "L1" | "L2" {
  if (value !== "L1" && value !== "L2") throw requestError(`${label} must be L1 or L2.`);
  return value;
}

function feltArray(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  errorCode: "PROVER_REQUEST_INVALID" | "PROVER_RESPONSE_INVALID" = "PROVER_REQUEST_INVALID",
): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new TransactionProverError(
      errorCode,
      `${label} must contain between ${minimum} and ${maximum} felts.`,
      VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
    );
  }
  return value.map((entry, index) => normalizeFelt(entry, `${label}[${index}]`, true, errorCode));
}

function normalizeFelt(
  value: unknown,
  label: string,
  allowZero: boolean,
  errorCode: "PROVER_REQUEST_INVALID" | "PROVER_RESPONSE_INVALID" = "PROVER_REQUEST_INVALID",
): string {
  if (typeof value === "bigint") value = `0x${value.toString(16)}`;
  if (typeof value !== "string" || !CANONICAL_HEX.test(value)) {
    throw new TransactionProverError(
      errorCode,
      `${label} must be a canonical lowercase Starknet felt.`,
      VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
    );
  }
  const parsed = BigInt(value);
  if ((!allowZero && parsed === 0n) || parsed < 0n || parsed >= (1n << 251n)) {
    throw new TransactionProverError(
      errorCode,
      `${label} is outside the allowed Starknet felt range.`,
      VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
    );
  }
  return `0x${parsed.toString(16)}`;
}

function normalizeHexInteger(value: unknown, label: string, bits: number): string {
  if (typeof value !== "string" || !CANONICAL_HEX.test(value)) throw requestError(`${label} must be canonical hex.`);
  const parsed = BigInt(value);
  if (parsed < 0n || parsed >= (1n << BigInt(bits))) throw requestError(`${label} exceeds its ${bits}-bit bound.`);
  return `0x${parsed.toString(16)}`;
}

function feltToBoundedCount(
  value: unknown,
  label: string,
  maximum: number,
  errorCode: "PROVER_REQUEST_INVALID" | "PROVER_RESPONSE_INVALID" = "PROVER_REQUEST_INVALID",
): number {
  const normalized = normalizeFelt(value, label, true, errorCode);
  const parsed = BigInt(normalized);
  if (parsed > BigInt(maximum)) {
    throw new TransactionProverError(
      errorCode,
      `${label} exceeds the supported bound.`,
      VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
    );
  }
  return Number(parsed);
}

function sameFelt(left: unknown, right: unknown): boolean {
  try {
    if ((typeof left !== "string" && typeof left !== "bigint") || (typeof right !== "string" && typeof right !== "bigint")) {
      return false;
    }
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
}

function sameFeltArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => sameFelt(value, right[index]));
}

function plainRecord(
  value: unknown,
  message: string,
  code: VeilPrivacyErrorCode = "PROVER_REQUEST_INVALID",
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TransactionProverError(code, message, VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TransactionProverError(code, message, VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], message: string): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    const response = message.toLowerCase().includes("response") || message.toLowerCase().includes("prover");
    throw new TransactionProverError(
      response ? "PROVER_RESPONSE_INVALID" : "PROVER_REQUEST_INVALID",
      message,
      VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
    );
  }
}

function assertJsonBounds(value: unknown, maximumDepth: number, depth = 0): void {
  if (depth > maximumDepth) throw responseError("The transaction prover response exceeds the JSON depth limit.");
  if (Array.isArray(value)) {
    if (value.length > 8_192) throw responseError("The transaction prover response contains an oversized JSON array.");
    value.forEach((entry) => assertJsonBounds(entry, maximumDepth, depth + 1));
    return;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length > 128) throw responseError("The transaction prover response contains too many JSON fields.");
    keys.forEach((key) => assertJsonBounds(record[key], maximumDepth, depth + 1));
  }
}

async function readBoundedText(response: Response, maximumBytes: number): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (utf8Length(text) > maximumBytes) throw responseTooLarge(maximumBytes);
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel();
      throw responseTooLarge(maximumBytes);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function responseTooLarge(maximumBytes: number): TransactionProverError {
  return new TransactionProverError(
    "PROVER_RESPONSE_TOO_LARGE",
    "The transaction prover response exceeded the configured byte limit.",
    VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
    { details: { maximumResponseBytes: maximumBytes } },
  );
}

function createTimeoutSignal(timeoutMs: number, externalSignal?: AbortSignal): {
  signal: AbortSignal;
  cleanup: () => void;
  timedOut: () => boolean;
} {
  const controller = new AbortController();
  let didTimeOut = false;
  const onExternalAbort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
  const timer = setTimeout(() => {
    didTimeOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
    timedOut: () => didTimeOut,
  };
}

async function abortableSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) return;
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new TransactionProverError(
        "PROVER_CANCELLED",
        "The transaction prover retry was cancelled.",
        VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
      ));
      return;
    }
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new TransactionProverError(
        "PROVER_CANCELLED",
        "The transaction prover retry was cancelled.",
        VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
      ));
    }, { once: true });
  });
}

async function sha256RequestFingerprint(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw requestError("A Web Crypto SHA-256 implementation is required for proof-intent correlation.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `veil-proof-intent-v1:${hex}`;
}

function decodedBase64Length(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function parseContentLength(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function validateRequestId(value: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,64}$/u.test(value.trim())) {
    throw requestError("requestId must be a bounded opaque identifier.");
  }
  return value.trim();
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new TransactionProverError(
      "PROVER_REQUEST_INVALID",
      `${label} must be an integer between ${minimum} and ${maximum}.`,
      VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
    );
  }
  return resolved;
}

function isAllowedPool(pool: OfficialPrivacyTransportConfig["pool"]): boolean {
  try {
    const address = normalizeFelt(pool.address, "poolAddress", false);
    return pool.compatibleAddresses.some((entry) => normalizeFelt(entry, "compatiblePool", false) === address);
  } catch {
    return false;
  }
}

function isSepoliaChain(value: string): boolean {
  const normalized = String(value).trim().toUpperCase();
  return normalized === VEIL_OFFICIAL_CHAIN_ID || normalized === VEIL_OFFICIAL_CHAIN_ID_HEX.toUpperCase();
}

function isInvokeV3(value: string | number): boolean {
  return value === VEIL_OFFICIAL_TRANSACTION_VERSION || String(value).trim().toLowerCase() === "0x3";
}

function isOutsideExecutionV2(value: string | number): boolean {
  const normalized = String(value).trim().toUpperCase();
  return normalized === VEIL_OFFICIAL_OUTSIDE_EXECUTION_VERSION || normalized === "2";
}

function isLoopbackHost(value: string): boolean {
  const host = value.toLowerCase().replace(/^\[|\]$/gu, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isPrivateNetworkLiteral(value: string): boolean {
  const host = value.toLowerCase().replace(/^\[|\]$/gu, "");
  if (host.includes(":")) return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second = 0] = parts;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

function reason(code: VeilPrivacyErrorCode, message: string): TransactionProverReason {
  return Object.freeze({ code, message });
}

function requestError(
  message: string,
  code: VeilPrivacyErrorCode = "PROVER_REQUEST_INVALID",
): TransactionProverError {
  return new TransactionProverError(code, message, VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED);
}

function responseError(message: string): TransactionProverError {
  return new TransactionProverError(
    "PROVER_RESPONSE_INVALID",
    message,
    VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
  );
}

function asTransactionProverError(value: unknown): TransactionProverError {
  if (value instanceof TransactionProverError) return value;
  if (value instanceof VeilPrivacyError) {
    let status: VeilProverHealthStatus = VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED;
    if (value.code === "SDK_VERSION_MISMATCH") status = VEIL_PROVER_HEALTH_STATUS.SDK_PROVER_MISMATCH;
    else if (value.code === "POOL_VERSION_MISMATCH") status = VEIL_PROVER_HEALTH_STATUS.POOL_PROVER_MISMATCH;
    else if (value.code === "CHAIN_ID_MISMATCH") status = VEIL_PROVER_HEALTH_STATUS.WRONG_CHAIN;
    return new TransactionProverError(value.code, value.message, status, { retryable: value.retryable });
  }
  return new TransactionProverError(
    "PROVER_RESPONSE_INVALID",
    "The transaction prover operation failed with an unclassified response.",
    VEIL_PROVER_HEALTH_STATUS.PROVER_DEGRADED,
  );
}
