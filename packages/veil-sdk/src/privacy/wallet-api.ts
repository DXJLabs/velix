import { VeilPrivacyError } from "./errors.js";

export const VEIL_STRK20_WALLET_API_VERSION = "0.10.3" as const;
export const VEIL_STRK20_WALLET_API_SOURCE_COMMIT = "778270f6091ec14a822c2108f397a48020d3b22a" as const;

export interface StarknetWalletRequestTransport {
  request(input: { type: string; params?: Record<string, unknown> }): Promise<unknown>;
}

export interface Strk20WalletCapabilities {
  supported: boolean;
  apiVersion?: string;
  registration: false;
  balances: boolean;
  shield: false;
  privateTransfer: boolean;
  withdraw: boolean;
  customInvoke: boolean;
  walletProofManagement: boolean;
  screeningCapableDeposit: false;
}

export type Strk20WalletAction =
  | { type: "deposit"; token: string; amount: string }
  | { type: "withdraw"; token: string; amount: string; recipient: string }
  | { type: "transfer"; token: string; amount: string | "OPEN"; recipient: string }
  | { type: "invoke"; contract: string; calldata: readonly string[] };

export interface Strk20WalletBalance {
  token: string;
  balance: bigint;
}

export interface Strk20PreparedInvoke {
  call: { contractAddress: string; entrypoint: string; calldata: readonly string[] };
  proof: { data: string; output: readonly string[]; proofFacts: readonly string[] };
  simulated: boolean;
}

export interface Strk20WalletApiConfig {
  wallet: StarknetWalletRequestTransport;
  allowedInvokeContracts: readonly (string | bigint)[];
  apiVersion?: string;
}

export async function detectStrk20WalletCapabilities(
  wallet: Partial<StarknetWalletRequestTransport> | null | undefined,
): Promise<Strk20WalletCapabilities> {
  const unsupported: Strk20WalletCapabilities = {
    supported: false,
    registration: false,
    balances: false,
    shield: false,
    privateTransfer: false,
    withdraw: false,
    customInvoke: false,
    walletProofManagement: false,
    screeningCapableDeposit: false,
  };
  if (!wallet || typeof wallet.request !== "function") return unsupported;
  try {
    const result = await wallet.request({ type: "wallet_supportedWalletApi" });
    if (!Array.isArray(result)) return unsupported;
    const versions = result.filter((value): value is string => typeof value === "string" && isSemver(value));
    const apiVersion = versions.sort(compareSemver).at(-1);
    if (!apiVersion || compareSemver(apiVersion, VEIL_STRK20_WALLET_API_VERSION) < 0) {
      return apiVersion ? { ...unsupported, apiVersion } : unsupported;
    }
    // v0.10.3 specifies these STRK20 methods. Registration and screening are not
    // advertised capabilities in that schema, so both remain false/fail-closed.
    return {
      supported: true,
      apiVersion,
      registration: false,
      balances: true,
      shield: false,
      privateTransfer: true,
      withdraw: true,
      customInvoke: true,
      walletProofManagement: true,
      screeningCapableDeposit: false,
    };
  } catch {
    return unsupported;
  }
}

export class Strk20WalletApiClient {
  readonly #wallet: StarknetWalletRequestTransport;
  readonly #allowedInvokeContracts: ReadonlySet<string>;
  readonly #apiVersion: string;

  constructor(config: Strk20WalletApiConfig) {
    this.#wallet = config.wallet;
    this.#allowedInvokeContracts = new Set(config.allowedInvokeContracts.map((value) => address(value, "allowedInvokeContract")));
    this.#apiVersion = config.apiVersion ?? VEIL_STRK20_WALLET_API_VERSION;
    if (!isSemver(this.#apiVersion)) throw new Error("Wallet API version must be semver.");
  }

  async balances(tokens: readonly (string | bigint)[]): Promise<Strk20WalletBalance[]> {
    const normalizedTokens = tokens.map((token) => address(token, "token"));
    try {
      const result = await this.#wallet.request({
        type: "wallet_strk20Balances",
        params: { tokens: normalizedTokens, api_version: this.#apiVersion },
      });
      if (!Array.isArray(result)) throw new Error("Wallet returned a non-array STRK20 balance result.");
      return result.map((entry, index) => normalizeBalance(entry, normalizedTokens[index]));
    } catch (cause) {
      throw mapWalletApiError(cause, "DISCOVERY_FAILED");
    }
  }

  async invoke(actions: readonly Strk20WalletAction[]): Promise<string> {
    const normalized = this.#validateActions(actions);
    try {
      const result = await this.#wallet.request({
        type: "wallet_strk20InvokeTransaction",
        params: { actions: normalized, api_version: this.#apiVersion },
      });
      if (!isRecord(result) || typeof result.transaction_hash !== "string" || !isFelt(result.transaction_hash)) {
        throw new Error("Wallet returned an invalid STRK20 transaction hash.");
      }
      return result.transaction_hash;
    } catch (cause) {
      throw mapWalletApiError(cause, "SUBMISSION_FAILED");
    }
  }

  async prepare(actions: readonly Strk20WalletAction[], simulate = false): Promise<Strk20PreparedInvoke> {
    const normalized = this.#validateActions(actions);
    try {
      const result = await this.#wallet.request({
        type: "wallet_strk20PrepareInvoke",
        params: { actions: normalized, simulate, api_version: this.#apiVersion },
      });
      return normalizePreparedInvoke(result, simulate);
    } catch (cause) {
      throw mapWalletApiError(cause, "PROVING_FAILED");
    }
  }

  #validateActions(actions: readonly Strk20WalletAction[]): Strk20WalletAction[] {
    if (actions.length === 0) throw new Error("At least one STRK20 action is required.");
    const invokeActions = actions.filter((action) => action.type === "invoke");
    if (invokeActions.length > 1) {
      throw new VeilPrivacyError("MULTIPLE_EXTERNAL_INVOKES", "Wallet action batch contains multiple invoke actions.");
    }
    return actions.map((action) => {
      switch (action.type) {
        case "deposit":
          return { type: "deposit", token: address(action.token, "token"), amount: positiveFelt(action.amount, "amount") };
        case "withdraw":
          return {
            type: "withdraw",
            token: address(action.token, "token"),
            amount: positiveFelt(action.amount, "amount"),
            recipient: address(action.recipient, "recipient"),
          };
        case "transfer":
          return {
            type: "transfer",
            token: address(action.token, "token"),
            amount: action.amount === "OPEN" ? "OPEN" : positiveFelt(action.amount, "amount"),
            recipient: address(action.recipient, "recipient"),
          };
        case "invoke": {
          const contract = address(action.contract, "invoke contract");
          if (!this.#allowedInvokeContracts.has(contract)) {
            throw new VeilPrivacyError("SUBMISSION_FAILED", "STRK20 invoke target is not a configured VEIL contract.");
          }
          return {
            type: "invoke",
            contract,
            calldata: action.calldata.map((value, index) => felt(value, `calldata[${index}]`)),
          };
        }
      }
    });
  }
}

export function strk20DepositAction(token: string | bigint, amount: bigint): Strk20WalletAction {
  return { type: "deposit", token: address(token, "token"), amount: positiveBigint(amount, "amount") };
}

export function strk20TransferAction(
  token: string | bigint,
  recipient: string | bigint,
  amount: bigint | "OPEN",
): Strk20WalletAction {
  return {
    type: "transfer",
    token: address(token, "token"),
    recipient: address(recipient, "recipient"),
    amount: amount === "OPEN" ? "OPEN" : positiveBigint(amount, "amount"),
  };
}

export function strk20WithdrawAction(
  token: string | bigint,
  recipient: string | bigint,
  amount: bigint,
): Strk20WalletAction {
  return {
    type: "withdraw",
    token: address(token, "token"),
    recipient: address(recipient, "recipient"),
    amount: positiveBigint(amount, "amount"),
  };
}

export function strk20InvokeAction(
  contract: string | bigint,
  calldata: readonly (string | bigint)[],
): Strk20WalletAction {
  return {
    type: "invoke",
    contract: address(contract, "invoke contract"),
    calldata: calldata.map((value, index) => felt(value, `calldata[${index}]`)),
  };
}

function normalizeBalance(value: unknown, expectedToken?: string): Strk20WalletBalance {
  if (!isRecord(value)) throw new Error("Wallet returned an invalid balance entry.");
  const token = address(String(value.token), "balance token");
  if (expectedToken !== undefined && token !== expectedToken) {
    throw new Error("Wallet balance response token order does not match the request.");
  }
  const rawBalance = felt(String(value.balance), "balance");
  return { token, balance: BigInt(rawBalance) };
}

function normalizePreparedInvoke(value: unknown, simulated: boolean): Strk20PreparedInvoke {
  if (!isRecord(value) || !isRecord(value.call) || !isRecord(value.proof)) {
    throw new Error("Wallet returned an invalid prepared STRK20 invocation.");
  }
  const calldata = value.call.calldata;
  const output = value.proof.output;
  const proofFacts = value.proof.proof_facts;
  if (!Array.isArray(calldata) || !Array.isArray(output) || !Array.isArray(proofFacts)) {
    throw new Error("Wallet returned invalid STRK20 call/proof arrays.");
  }
  const data = typeof value.proof.data === "string" ? value.proof.data : "";
  if (!simulated && (data.length === 0 || proofFacts.length === 0)) {
    throw new VeilPrivacyError("INVALID_PROOF_FACTS", "Non-simulated wallet proof is empty.");
  }
  return {
    call: {
      contractAddress: address(String(value.call.contract_address), "prepared contract"),
      entrypoint: requiredString(value.call.entry_point, "prepared entrypoint"),
      calldata: calldata.map((entry, index) => felt(String(entry), `prepared calldata[${index}]`)),
    },
    proof: {
      data,
      output: output.map((entry, index) => felt(String(entry), `proof output[${index}]`)),
      proofFacts: proofFacts.map((entry, index) => felt(String(entry), `proof fact[${index}]`)),
    },
    simulated,
  };
}

function mapWalletApiError(cause: unknown, fallback: "DISCOVERY_FAILED" | "SUBMISSION_FAILED" | "PROVING_FAILED") {
  const code = isRecord(cause) && typeof cause.code === "number" ? cause.code : undefined;
  if (code === 118) return new VeilPrivacyError("SENDER_NOT_REGISTERED", "Wallet reports that this account is not registered.", { cause });
  if (code === 119) return new VeilPrivacyError("INSUFFICIENT_PRIVATE_BALANCE", "Wallet reports insufficient private balance.", { cause });
  if (code === 120) return new VeilPrivacyError("USER_LINKAGE_WARNING", "Wallet stopped the action because it may leak privacy.", { cause });
  if (code === 162) return new VeilPrivacyError("PRIVACY_WALLET_UNSUPPORTED", "Wallet does not support the pinned STRK20 API version.", { cause });
  return cause instanceof VeilPrivacyError ? cause : new VeilPrivacyError(fallback, "STRK20 Wallet API request failed.", { cause });
}

function address(value: string | bigint, label: string): string {
  const normalized = felt(value, label);
  if (BigInt(normalized) === 0n) throw new Error(`${label} cannot be zero.`);
  return normalized;
}

function positiveBigint(value: bigint, label: string): string {
  if (typeof value !== "bigint" || value <= 0n) throw new Error(`${label} must be a positive bigint.`);
  return `0x${value.toString(16)}`;
}

function positiveFelt(value: string, label: string): string {
  const normalized = felt(value, label);
  if (BigInt(normalized) === 0n) throw new Error(`${label} must be positive.`);
  return normalized;
}

function felt(value: string | bigint, label: string): string {
  let parsed: bigint;
  try {
    parsed = typeof value === "bigint" ? value : BigInt(value.trim());
  } catch (cause) {
    throw new Error(`${label} is not a felt.`, { cause });
  }
  if (parsed < 0n || parsed >= (1n << 251n)) throw new Error(`${label} is outside the felt range.`);
  return `0x${parsed.toString(16)}`;
}

function isFelt(value: string): boolean {
  try {
    felt(value, "felt");
    return true;
  } catch {
    return false;
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function isSemver(value: string): boolean {
  return /^\d+\.\d+(?:\.\d+)?$/u.test(value);
}

function compareSemver(first: string, second: string): number {
  const left = first.split(".").map(Number);
  const right = second.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
