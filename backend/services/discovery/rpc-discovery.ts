const FELT_MODULUS = 2n ** 251n + 17n * 2n ** 192n + 1n;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface RpcDiscoveryConfig {
  rpcUrl: string;
  timeoutMs?: number;
  maximumResponseBytes?: number;
  fetch?: typeof fetch;
}

export interface StarknetTransactionStatus {
  transactionHash: string;
  finalityStatus: string;
  executionStatus: string;
  blockNumber: number | null;
  blockHash: string | null;
  revertReason: string | null;
}

export interface StarknetEventPage {
  events: readonly unknown[];
  continuationToken: string | null;
}

export class RpcDiscoveryError extends Error {
  readonly code: string;
  readonly upstreamCode?: number;

  constructor(code: string, message: string, upstreamCode?: number) {
    super(message);
    this.name = "RpcDiscoveryError";
    this.code = code;
    if (upstreamCode !== undefined) this.upstreamCode = upstreamCode;
  }
}

export class RpcDiscoveryClient {
  readonly #rpcUrl: string;
  readonly #timeoutMs: number;
  readonly #maximumResponseBytes: number;
  readonly #fetch: typeof fetch;
  #requestSequence = 0;

  constructor(config: RpcDiscoveryConfig) {
    this.#rpcUrl = validateRpcUrl(config.rpcUrl);
    this.#timeoutMs = boundedInteger(config.timeoutMs, 100, 60_000, DEFAULT_TIMEOUT_MS, "timeoutMs");
    this.#maximumResponseBytes = boundedInteger(
      config.maximumResponseBytes,
      1_024,
      8 * 1024 * 1024,
      DEFAULT_MAX_RESPONSE_BYTES,
      "maximumResponseBytes",
    );
    this.#fetch = config.fetch ?? globalThis.fetch;
    if (typeof this.#fetch !== "function") throw new RpcDiscoveryError("RPC_FETCH_MISSING", "Fetch is unavailable.");
  }

  async chainId(signal?: AbortSignal): Promise<string> {
    return normalizeFelt(await this.request("starknet_chainId", [], signal), "chainId");
  }

  async blockNumber(signal?: AbortSignal): Promise<number> {
    const result = await this.request("starknet_blockNumber", [], signal);
    if (!Number.isSafeInteger(result) || Number(result) < 0) throw invalidResponse();
    return Number(result);
  }

  async transactionStatus(transactionHash: string, signal?: AbortSignal): Promise<StarknetTransactionStatus> {
    const normalizedHash = toHexFelt(transactionHash, "transactionHash");
    const result = await this.request("starknet_getTransactionReceipt", [normalizedHash], signal);
    if (!isPlainRecord(result)) throw invalidResponse();

    const returnedHash = result.transaction_hash === undefined
      ? normalizedHash
      : toHexFelt(result.transaction_hash, "receipt.transaction_hash");
    if (returnedHash !== normalizedHash) throw invalidResponse();

    return Object.freeze({
      transactionHash: normalizedHash,
      finalityStatus: boundedStatus(result.finality_status, "UNKNOWN"),
      executionStatus: boundedStatus(result.execution_status, "UNKNOWN"),
      blockNumber: Number.isSafeInteger(result.block_number) && Number(result.block_number) >= 0
        ? Number(result.block_number)
        : null,
      blockHash: result.block_hash === undefined ? null : toHexFelt(result.block_hash, "receipt.block_hash"),
      revertReason: boundedOptionalString(result.revert_reason, 2_048),
    });
  }

  async getEvents(
    filter: {
      fromBlock: number;
      toBlock: number;
      address: string;
      keys: readonly (readonly string[])[];
      chunkSize: number;
      continuationToken?: string;
    },
    signal?: AbortSignal,
  ): Promise<StarknetEventPage> {
    if (!Number.isSafeInteger(filter.fromBlock) || filter.fromBlock < 0) throw new TypeError("fromBlock is invalid.");
    if (!Number.isSafeInteger(filter.toBlock) || filter.toBlock < filter.fromBlock) throw new TypeError("toBlock is invalid.");
    if (!Number.isSafeInteger(filter.chunkSize) || filter.chunkSize < 1 || filter.chunkSize > 1_000) {
      throw new TypeError("chunkSize is invalid.");
    }
    const keys = filter.keys.map((group) => group.map((value) => toHexFelt(value, "event key")));
    const result = await this.request("starknet_getEvents", [{
      from_block: { block_number: filter.fromBlock },
      to_block: { block_number: filter.toBlock },
      address: toHexFelt(filter.address, "event address"),
      keys,
      chunk_size: filter.chunkSize,
      ...(filter.continuationToken === undefined ? {} : { continuation_token: filter.continuationToken }),
    }], signal);
    if (!isPlainRecord(result) || !Array.isArray(result.events)) throw invalidResponse();
    const token = result.continuation_token;
    if (token !== undefined && (typeof token !== "string" || token.length > 2_048)) throw invalidResponse();
    return Object.freeze({
      events: Object.freeze([...result.events]),
      continuationToken: typeof token === "string" && token ? token : null,
    });
  }

  async callContract(
    input: { contractAddress: string; entrypointSelector: string; calldata: readonly string[]; blockNumber: number },
    signal?: AbortSignal,
  ): Promise<readonly string[]> {
    const result = await this.request("starknet_call", [{
      contract_address: toHexFelt(input.contractAddress, "contractAddress"),
      entry_point_selector: toHexFelt(input.entrypointSelector, "entrypointSelector"),
      calldata: input.calldata.map((value) => toHexFelt(value, "calldata")),
    }, { block_number: input.blockNumber }], signal);
    if (!Array.isArray(result) || result.length > 256) throw invalidResponse();
    return Object.freeze(result.map((value) => toHexFelt(value, "call result")));
  }

  async request(method: string, params: unknown, externalSignal?: AbortSignal): Promise<unknown> {
    if (!/^starknet_[A-Za-z0-9]+$/u.test(method)) throw new TypeError("Unsupported Starknet RPC method name.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    const abort = () => controller.abort();
    externalSignal?.addEventListener("abort", abort, { once: true });
    this.#requestSequence += 1;
    const id = `veil-backend-${this.#requestSequence}`;

    try {
      const response = await this.#fetch(this.#rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        throw new RpcDiscoveryError("RPC_REDIRECT_FORBIDDEN", "Starknet RPC redirects are forbidden.");
      }
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (Number.isFinite(declaredLength) && declaredLength > this.#maximumResponseBytes) throw responseTooLarge();
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > this.#maximumResponseBytes) throw responseTooLarge();

      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw invalidResponse();
      }
      if (!response.ok || !isPlainRecord(payload)) throw invalidResponse();
      if (payload.id !== id || payload.jsonrpc !== "2.0") throw invalidResponse();
      if (isPlainRecord(payload.error)) {
        const upstreamCode = typeof payload.error.code === "number" ? payload.error.code : undefined;
        throw new RpcDiscoveryError("RPC_REJECTED", "The Starknet RPC rejected the request.", upstreamCode);
      }
      if (!("result" in payload)) throw invalidResponse();
      return payload.result;
    } catch (error) {
      if (error instanceof RpcDiscoveryError) throw error;
      if (externalSignal?.aborted) throw new RpcDiscoveryError("RPC_CANCELLED", "The Starknet RPC request was cancelled.");
      if (controller.signal.aborted) throw new RpcDiscoveryError("RPC_TIMEOUT", "The Starknet RPC request timed out.");
      throw new RpcDiscoveryError("RPC_UNAVAILABLE", "The Starknet RPC is unavailable.");
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abort);
    }
  }
}

export function normalizeFelt(value: unknown, label = "felt"): string {
  let parsed: bigint;
  try {
    if (typeof value === "bigint") parsed = value;
    else if (typeof value === "number" && Number.isSafeInteger(value)) parsed = BigInt(value);
    else if (typeof value === "string" && /^(?:0x[0-9a-fA-F]+|[0-9]+)$/u.test(value.trim())) parsed = BigInt(value.trim());
    else throw new Error("invalid felt");
  } catch {
    throw new TypeError(`${label} must be a canonical Starknet felt.`);
  }
  if (parsed < 0n || parsed >= FELT_MODULUS) throw new TypeError(`${label} is outside the Starknet field.`);
  return parsed.toString();
}

export function toHexFelt(value: unknown, label = "felt"): string {
  return `0x${BigInt(normalizeFelt(value, label)).toString(16)}`;
}

function validateRpcUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new RpcDiscoveryError("RPC_URL_INVALID", "The Starknet RPC URL is invalid.");
  }
  const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
  if ((parsed.protocol !== "https:" && !(loopback && parsed.protocol === "http:")) || parsed.username || parsed.password) {
    throw new RpcDiscoveryError("RPC_URL_INSECURE", "The Starknet RPC must use HTTPS outside local development.");
  }
  parsed.hash = "";
  return parsed.toString();
}

function boundedInteger(value: number | undefined, minimum: number, maximum: number, fallback: number, label: string): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) throw new TypeError(`${label} is invalid.`);
  return result;
}

function boundedStatus(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[A-Z0-9_]{1,64}$/u.test(value) ? value : fallback;
}

function boundedOptionalString(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length <= maximum ? value : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidResponse(): RpcDiscoveryError {
  return new RpcDiscoveryError("RPC_RESPONSE_INVALID", "The Starknet RPC returned an invalid response.");
}

function responseTooLarge(): RpcDiscoveryError {
  return new RpcDiscoveryError("RPC_RESPONSE_TOO_LARGE", "The Starknet RPC response exceeded the configured limit.");
}
