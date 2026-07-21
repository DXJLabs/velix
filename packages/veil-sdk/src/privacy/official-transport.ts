import {
  buildCanonicalHelperPayload,
  type BuildCanonicalHelperPayloadInput,
  type CanonicalHelperPayload,
  type VeilCanonicalOperation,
} from "./canonical-payload.js";
import {
  VeilPrivacyError,
  type VeilPrivacyErrorCode,
} from "./errors.js";
import {
  createMessageLocatorResolver,
  type MessageLocatorResolver,
} from "./message-locator.js";
import {
  VEIL_OFFICIAL_CHAIN_ID,
  VEIL_OFFICIAL_CHAIN_ID_HEX,
  VEIL_OFFICIAL_OUTSIDE_EXECUTION_VERSION,
  VEIL_OFFICIAL_POOL_COMPATIBILITY,
  VEIL_OFFICIAL_TRANSACTION_VERSION,
} from "./official-sdk.js";
import { VEIL_OFFICIAL_PRIVACY_SDK_VERSION } from "./namespace.js";
import { VEIL_STRK20_WALLET_API_VERSION } from "./wallet-api.js";

export const VEIL_PRIVACY_TRANSPORT_STATUS = Object.freeze({
  DIRECT_ENCRYPTED_LEGACY: "DIRECT_ENCRYPTED_LEGACY",
  CANONICAL_PREPARED: "CANONICAL_PREPARED",
  CANONICAL_UNAVAILABLE: "CANONICAL_UNAVAILABLE",
  CANONICAL_FAILED: "CANONICAL_FAILED",
  CANONICAL_SUBMITTED: "CANONICAL_SUBMITTED",
  CANONICAL_ACCEPTED: "CANONICAL_ACCEPTED",
} as const);

export const VEIL_DIRECT_ENCRYPTED_LABEL = "Direct encrypted" as const;
export const VEIL_CANONICAL_HELPER_SELECTOR = "privacy_invoke" as const;

export type VeilPrivacyTransportStatus =
  (typeof VEIL_PRIVACY_TRANSPORT_STATUS)[keyof typeof VEIL_PRIVACY_TRANSPORT_STATUS];
export type OfficialPrivacyTransportRoute = "wallet-api" | "sdk-direct";

export interface OfficialPrivacyTransportConfig {
  route: OfficialPrivacyTransportRoute;
  sdk: { installed: boolean; version: string };
  wallet?: { supported: boolean; apiVersion?: string };
  directAccount?: {
    accountCustody: "integrator-owned" | "user-wallet";
    viewingKeyCustody: "integrator-managed" | "wallet-managed";
  };
  network: { chainId: string };
  pool: {
    address: string | bigint;
    compatibility: string;
    compatibleAddresses: readonly (string | bigint)[];
  };
  transactionVersion: string | number;
  outsideExecutionVersion: string | number;
  prover: { configured: boolean };
  discovery: { configured: boolean };
  helper: {
    address: string | bigint;
    selector: string;
    allowedAddresses: readonly (string | bigint)[];
    allowedSelectors: readonly string[];
  };
  messageLocatorResolver?: MessageLocatorResolver;
  onStatus?: (event: OfficialPrivacyTransportLogEvent) => void;
  now?: () => number;
}

export interface OfficialPrivacyTransportReason {
  code: VeilPrivacyErrorCode;
  message: string;
}

export interface OfficialPrivacyTransportSnapshot {
  route: OfficialPrivacyTransportRoute;
  status: typeof VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_PREPARED
    | typeof VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_UNAVAILABLE;
  sdkInstalled: boolean;
  sdkCompatible: boolean;
  walletCapable: boolean;
  poolCompatible: boolean;
  transactionCompatible: boolean;
  authorizationCompatible: boolean;
  proverConfigured: boolean;
  discoveryConfigured: boolean;
  helperAllowed: boolean;
  prepared: boolean;
  liveVerified: false;
  reasons: readonly OfficialPrivacyTransportReason[];
}

export interface CanonicalApplicationInvoke {
  contractAddress: string | bigint;
  selector: string;
}

export interface PrepareOfficialPrivacyTransportInput extends BuildCanonicalHelperPayloadInput {
  /**
   * Stable logical identity supplied by the upstream message builder.
   *
   * This is not requestId. Multiple proof requests may belong to the same
   * logical message.
   */
  messageReference: string;
  requestId: string;
  applicationInvokes: readonly CanonicalApplicationInvoke[];
}

export interface PreparedOfficialPrivacyTransport {
  requestId: string;
  route: OfficialPrivacyTransportRoute;
  operation: VeilCanonicalOperation;
  status: typeof VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_PREPARED;
  helperAddress: string;
  helperSelector: typeof VEIL_CANONICAL_HELPER_SELECTOR;
  payload: CanonicalHelperPayload;
  liveVerified: false;
}

export interface OfficialPrivacyTransportSubmission {
  requestId: string;
  route: OfficialPrivacyTransportRoute;
  operation: VeilCanonicalOperation;
  status: typeof VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_SUBMITTED
    | typeof VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_ACCEPTED;
  transactionHash: string;
  liveVerified: false;
}

export interface OfficialPrivacyTransportSubmitter {
  submit(prepared: PreparedOfficialPrivacyTransport): Promise<{
    transactionHash: string;
    accepted?: boolean;
  }>;
}

export interface OfficialPrivacyTransportLogEvent {
  requestId: string;
  operation: VeilCanonicalOperation;
  version: 1;
  chain: string;
  durationMs: number;
  status: VeilPrivacyTransportStatus;
  errorCode?: VeilPrivacyErrorCode;
  transactionHash?: string;
}

export class OfficialPrivacyTransportError extends VeilPrivacyError {
  readonly status: typeof VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_UNAVAILABLE
    | typeof VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_FAILED;

  constructor(
    code: VeilPrivacyErrorCode,
    message: string,
    status: OfficialPrivacyTransportError["status"],
  ) {
    super(code, message);
    this.name = "OfficialPrivacyTransportError";
    this.status = status;
  }
}

export class OfficialPrivacyTransport {
  readonly #config: OfficialPrivacyTransportConfig;
  readonly #snapshot: OfficialPrivacyTransportSnapshot;
  readonly #messageLocatorResolver: MessageLocatorResolver;
  readonly #now: () => number;

  constructor(config: OfficialPrivacyTransportConfig) {
    this.#config = config;
    this.#snapshot = evaluateOfficialPrivacyTransport(config);
    this.#messageLocatorResolver =
      config.messageLocatorResolver ?? createMessageLocatorResolver();
    this.#now = config.now ?? (() => Date.now());
  }

  snapshot(): OfficialPrivacyTransportSnapshot {
    return this.#snapshot;
  }

  prepare(input: PrepareOfficialPrivacyTransportInput): PreparedOfficialPrivacyTransport {
    if (!this.#snapshot.prepared) {
      const reason = this.#snapshot.reasons[0] ?? {
        code: "CANONICAL_CAPABILITY_UNAVAILABLE" as const,
        message: "Canonical privacy transport requirements are incomplete.",
      };
      throw new OfficialPrivacyTransportError(
        reason.code,
        reason.message,
        VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_UNAVAILABLE,
      );
    }
    const requestId = validateRequestId(input.requestId);
    const applicationInvoke = validateSingleApplicationInvoke(input.applicationInvokes, this.#config.helper);

    /*
     * Invoke V3 already contains locator-bound helper calldata before reaching
     * this transport. This layer validates and registers the upstream locator;
     * it must not generate the first locator for the transaction.
     */
    if (input.messageLocator === undefined || input.messageLocator === null) {
      throw new OfficialPrivacyTransportError(
        "PAYLOAD_MALFORMED",
        "messageLocator must be resolved before the canonical transaction is constructed.",
        VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_FAILED,
      );
    }

    const messageLocator = this.#messageLocatorResolver.resolve({
      messageId: input.messageReference,
      explicitLocator: input.messageLocator,
    });

    const payload = buildCanonicalHelperPayload({
      operation: input.operation,
      keyDomain: input.keyDomain,
      envelope: input.envelope,
      messageLocator,
      claimedCommitment: input.claimedCommitment,
    });
    const prepared = Object.freeze({
      requestId,
      route: this.#config.route,
      operation: payload.operation,
      status: VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_PREPARED,
      helperAddress: applicationInvoke.contractAddress,
      helperSelector: VEIL_CANONICAL_HELPER_SELECTOR,
      payload,
      liveVerified: false as const,
    });
    this.#emit({
      requestId,
      operation: payload.operation,
      startedAt: this.#now(),
      status: prepared.status,
    });
    return prepared;
  }

  async submit(
    input: PrepareOfficialPrivacyTransportInput,
    submitter: OfficialPrivacyTransportSubmitter,
  ): Promise<OfficialPrivacyTransportSubmission> {
    const startedAt = this.#now();
    let prepared: PreparedOfficialPrivacyTransport;
    try {
      prepared = this.prepare(input);
      const result = await submitter.submit(prepared);
      const transactionHash = normalizeNonzeroFelt(result.transactionHash, "transactionHash");
      const status = result.accepted === true
        ? VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_ACCEPTED
        : VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_SUBMITTED;
      const submission = Object.freeze({
        requestId: prepared.requestId,
        route: prepared.route,
        operation: prepared.operation,
        status,
        transactionHash,
        liveVerified: false as const,
      });
      this.#emit({
        requestId: prepared.requestId,
        operation: prepared.operation,
        startedAt,
        status,
        transactionHash,
      });
      return submission;
    } catch (cause) {
      const operation = safeOperation(input.operation);
      const requestId = safeRequestId(input.requestId);
      const errorCode = cause instanceof VeilPrivacyError ? cause.code : "SUBMISSION_FAILED";
      this.#emit({
        requestId,
        operation,
        startedAt,
        status: VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_FAILED,
        errorCode,
      });
      if (cause instanceof OfficialPrivacyTransportError) throw cause;
      throw new OfficialPrivacyTransportError(
        errorCode,
        "Canonical privacy submission failed; Direct encrypted fallback was not invoked.",
        VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_FAILED,
      );
    }
  }

  #emit(input: {
    requestId: string;
    operation: VeilCanonicalOperation;
    startedAt: number;
    status: VeilPrivacyTransportStatus;
    errorCode?: VeilPrivacyErrorCode;
    transactionHash?: string;
  }): void {
    if (!this.#config.onStatus) return;
    const event: OfficialPrivacyTransportLogEvent = {
      requestId: input.requestId,
      operation: input.operation,
      version: 1,
      chain: VEIL_OFFICIAL_CHAIN_ID,
      durationMs: Math.max(0, this.#now() - input.startedAt),
      status: input.status,
    };
    if (input.errorCode !== undefined) event.errorCode = input.errorCode;
    if (input.transactionHash !== undefined) event.transactionHash = input.transactionHash;
    this.#config.onStatus(Object.freeze(event));
  }
}

export function evaluateOfficialPrivacyTransport(
  config: OfficialPrivacyTransportConfig,
): OfficialPrivacyTransportSnapshot {
  const reasons: OfficialPrivacyTransportReason[] = [];
  const sdkCompatible = config.sdk.installed && config.sdk.version === VEIL_OFFICIAL_PRIVACY_SDK_VERSION;
  if (!config.sdk.installed) {
    reasons.push(reason("CANONICAL_CAPABILITY_UNAVAILABLE", "The official Privacy SDK is not installed."));
  } else if (!sdkCompatible) {
    reasons.push(reason("SDK_VERSION_MISMATCH", `Official Privacy SDK ${VEIL_OFFICIAL_PRIVACY_SDK_VERSION} is required.`));
  }

  if (!isSepoliaChain(config.network.chainId)) {
    reasons.push(reason("CHAIN_ID_MISMATCH", "Canonical privacy transport is locked to Starknet Sepolia."));
  }

  const poolCompatible = isPoolCompatible(config.pool);
  if (!poolCompatible) {
    reasons.push(reason("POOL_VERSION_MISMATCH", "The configured Privacy Pool is not compatible with the reviewed official transport."));
  }

  const transactionCompatible = isInvokeV3(config.transactionVersion);
  if (!transactionCompatible) {
    reasons.push(reason("TRANSACTION_VERSION_UNSUPPORTED", "Canonical privacy transport requires Invoke Transaction V3."));
  }

  const authorizationCompatible = isOutsideExecutionV2(config.outsideExecutionVersion);
  if (!authorizationCompatible) {
    reasons.push(reason("AUTHORIZATION_VERSION_UNSUPPORTED", "Canonical privacy transport requires Outside Execution V2."));
  }

  if (!config.prover.configured) {
    reasons.push(reason("CANONICAL_CAPABILITY_UNAVAILABLE", "A reviewed proving boundary is not configured."));
  }
  if (!config.discovery.configured) {
    reasons.push(reason("CANONICAL_CAPABILITY_UNAVAILABLE", "A reviewed discovery boundary is not configured."));
  }

  const helperAllowed = isAllowedHelper(config.helper);
  if (!helperAllowed) {
    reasons.push(reason("HELPER_TARGET_NOT_ALLOWED", "The configured canonical helper target or selector is not allowlisted."));
  }

  const walletCapable = config.route === "wallet-api"
    ? config.wallet?.supported === true && isCompatibleWalletApi(config.wallet.apiVersion)
    : false;
  if (config.route === "wallet-api" && !walletCapable) {
    reasons.push(reason("PRIVACY_WALLET_UNSUPPORTED", "The connected wallet does not expose the pinned STRK20 Wallet API capability."));
  }
  if (config.route === "sdk-direct") {
    const custody = config.directAccount;
    if (custody?.accountCustody !== "integrator-owned" || custody.viewingKeyCustody !== "integrator-managed") {
      reasons.push(reason("ACCOUNT_CUSTODY_MISMATCH", "Direct SDK transport is restricted to integrator-owned accounts and viewing keys."));
    }
  }

  const prepared = reasons.length === 0;
  return Object.freeze({
    route: config.route,
    status: prepared
      ? VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_PREPARED
      : VEIL_PRIVACY_TRANSPORT_STATUS.CANONICAL_UNAVAILABLE,
    sdkInstalled: config.sdk.installed,
    sdkCompatible,
    walletCapable,
    poolCompatible,
    transactionCompatible,
    authorizationCompatible,
    proverConfigured: config.prover.configured,
    discoveryConfigured: config.discovery.configured,
    helperAllowed,
    prepared,
    liveVerified: false,
    reasons: Object.freeze(reasons),
  });
}

function validateSingleApplicationInvoke(
  invokes: readonly CanonicalApplicationInvoke[],
  helper: OfficialPrivacyTransportConfig["helper"],
): { contractAddress: string; selector: typeof VEIL_CANONICAL_HELPER_SELECTOR } {
  if (invokes.length !== 1) {
    throw new VeilPrivacyError(
      "MULTIPLE_EXTERNAL_INVOKES",
      "Canonical VEIL payload submission requires exactly one application invoke.",
    );
  }
  const invoke = invokes[0] as CanonicalApplicationInvoke;
  const contractAddress = normalizeNonzeroFelt(invoke.contractAddress, "helperAddress");
  const allowedAddresses = helper.allowedAddresses.map((value) => normalizeNonzeroFelt(value, "allowedHelperAddress"));
  if (contractAddress !== normalizeNonzeroFelt(helper.address, "configuredHelperAddress") || !allowedAddresses.includes(contractAddress)) {
    throw new VeilPrivacyError("HELPER_TARGET_NOT_ALLOWED", "Canonical application invoke target is not allowlisted.");
  }
  if (
    invoke.selector !== VEIL_CANONICAL_HELPER_SELECTOR
    || helper.selector !== VEIL_CANONICAL_HELPER_SELECTOR
    || !helper.allowedSelectors.includes(invoke.selector)
  ) {
    throw new VeilPrivacyError("HELPER_SELECTOR_NOT_ALLOWED", "Canonical application invoke selector is not allowlisted.");
  }
  return { contractAddress, selector: VEIL_CANONICAL_HELPER_SELECTOR };
}

function isAllowedHelper(helper: OfficialPrivacyTransportConfig["helper"]): boolean {
  try {
    const address = normalizeNonzeroFelt(helper.address, "helperAddress");
    return helper.allowedAddresses.some((value) => normalizeNonzeroFelt(value, "allowedHelperAddress") === address)
      && helper.selector === VEIL_CANONICAL_HELPER_SELECTOR
      && helper.allowedSelectors.includes(VEIL_CANONICAL_HELPER_SELECTOR);
  } catch {
    return false;
  }
}

function isPoolCompatible(pool: OfficialPrivacyTransportConfig["pool"]): boolean {
  if (pool.compatibility !== VEIL_OFFICIAL_POOL_COMPATIBILITY) return false;
  try {
    const address = normalizeNonzeroFelt(pool.address, "poolAddress");
    return pool.compatibleAddresses.some((value) => normalizeNonzeroFelt(value, "compatiblePoolAddress") === address);
  } catch {
    return false;
  }
}

function isCompatibleWalletApi(version: string | undefined): boolean {
  if (!version || !/^\d+\.\d+(?:\.\d+)?$/u.test(version)) return false;
  const current = version.split(".").map(Number);
  const required = VEIL_STRK20_WALLET_API_VERSION.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (current[index] ?? 0) - (required[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

function isSepoliaChain(value: string): boolean {
  const normalized = value.trim().toUpperCase();
  return normalized === VEIL_OFFICIAL_CHAIN_ID || normalized === VEIL_OFFICIAL_CHAIN_ID_HEX.toUpperCase();
}

function isInvokeV3(value: string | number): boolean {
  return value === VEIL_OFFICIAL_TRANSACTION_VERSION || String(value).trim().toLowerCase() === "0x3";
}

function isOutsideExecutionV2(value: string | number): boolean {
  const normalized = String(value).trim().toUpperCase();
  return normalized === VEIL_OFFICIAL_OUTSIDE_EXECUTION_VERSION || normalized === "2";
}

function normalizeNonzeroFelt(value: string | bigint, label: string): string {
  let parsed: bigint;
  try {
    parsed = typeof value === "bigint" ? value : BigInt(value.trim());
  } catch (cause) {
    throw new VeilPrivacyError("PAYLOAD_MALFORMED", `${label} must be a Starknet felt.`, { cause });
  }
  if (parsed <= 0n || parsed >= (1n << 251n)) {
    throw new VeilPrivacyError("PAYLOAD_MALFORMED", `${label} must be a nonzero Starknet felt.`);
  }
  return `0x${parsed.toString(16)}`;
}

function validateRequestId(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(normalized)) {
    throw new VeilPrivacyError("PAYLOAD_MALFORMED", "requestId must be a bounded opaque identifier.");
  }
  return normalized;
}

function safeRequestId(value: string): string {
  try {
    return validateRequestId(value);
  } catch {
    return "invalid-request";
  }
}

function safeOperation(value: string): VeilCanonicalOperation {
  return Object.hasOwn({
    message: true,
    payment_memo: true,
    offer: true,
    counter_offer: true,
    offer_decision: true,
    escrow_coordination: true,
    settlement_evidence: true,
  }, value) ? value as VeilCanonicalOperation : "message";
}

function reason(code: VeilPrivacyErrorCode, message: string): OfficialPrivacyTransportReason {
  return Object.freeze({ code, message });
}
