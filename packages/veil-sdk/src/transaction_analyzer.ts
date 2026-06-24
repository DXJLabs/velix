import {
  PRIVACY_POOL_CLIENT_ACTIONS,
  PRIVACY_POOL_EVENT_ABI,
  PRIVACY_POOL_SERVER_ACTIONS,
  PRIVACY_POOL_SOURCE_CONSTRAINTS,
} from "./privacy_pool_abi";
import { VeilEventType } from "./types";
import {
  decodePrivacyPoolEvent,
  type DecodedPrivacyPoolEvent,
  type Felt,
  type RawStarknetEvent,
  type StarknetAbi,
} from "./event_decoder";

export interface RawStarknetTransaction {
  transaction_hash?: Felt;
  calldata?: Felt[];
  contract_address?: Felt;
  sender_address?: Felt;
  version?: Felt;
  type?: string;
}

export interface RawStarknetReceipt {
  transaction_hash?: Felt;
  events?: RawStarknetEvent[];
  execution_status?: string;
  finality_status?: string;
}

export interface DecodedCall {
  to?: Felt;
  selector?: Felt;
  calldata: Felt[];
  decodedActions: DecodedActionSet[];
}

export interface DecodedActionField {
  name: string;
  type: string;
  value?: Felt;
  values?: Felt[];
}

export interface DecodedHelperInvoke {
  helperAddress?: Felt;
  channelId: Felt;
  eventType: Felt;
  eventTypeLabel: string;
  encryptedPayload: Felt;
  payloadHash: Felt;
}

export interface DecodedPrivacyPoolAction {
  source: "ClientAction" | "ServerAction";
  variant: number;
  name: string;
  offset: number;
  fields: DecodedActionField[];
  helperInvoke?: DecodedHelperInvoke;
}

export interface DecodedActionSet {
  source: "ClientAction" | "ServerAction";
  offset: number;
  actions: DecodedPrivacyPoolAction[];
}

export interface PrivacyPoolTransactionAnalysis {
  transactionHash: string;
  calledFunction: string;
  contractAddress?: Felt;
  decodedCalldata: DecodedCall[];
  decodedEvents: DecodedPrivacyPoolEvent[];
  interpretation: string[];
  raw: {
    transaction?: RawStarknetTransaction;
    receipt?: RawStarknetReceipt;
  };
}

export interface AnalyzeTransactionInput {
  transactionHash: string;
  transaction?: RawStarknetTransaction;
  receipt?: RawStarknetReceipt;
}

export interface PrivacyPoolTransactionAnalyzerConfig {
  rpcUrl?: string;
  privacyPoolAddress?: Felt;
  helperAddress?: Felt;
  abi?: StarknetAbi;
}

const HELPER_EVENT_LABELS: Record<string, string> = {
  [String(VeilEventType.CHAT)]: "CHAT",
  [String(VeilEventType.PAYMENT_MEMO)]: "PAYMENT_MEMO",
  [String(VeilEventType.OFFER)]: "OFFER",
  [String(VeilEventType.COUNTER_OFFER)]: "COUNTER_OFFER",
  [String(VeilEventType.ACCEPT_OFFER)]: "ACCEPT_OFFER",
  [String(VeilEventType.REJECT_OFFER)]: "REJECT_OFFER",
  [String(VeilEventType.ESCROW_CREATED)]: "ESCROW_CREATED",
  [String(VeilEventType.ESCROW_DEPOSITED)]: "ESCROW_DEPOSITED",
  [String(VeilEventType.ESCROW_SETTLED)]: "ESCROW_SETTLED",
  [String(VeilEventType.ESCROW_CANCELLED)]: "ESCROW_CANCELLED",
  [String(VeilEventType.PROOF_ATTACHED)]: "PROOF_ATTACHED",
};

const WRITE_ONCE_CLIENT_ACTIONS = new Set<string>(
  PRIVACY_POOL_SOURCE_CONSTRAINTS.writeOnceGeneratingClientActions,
);

export class PrivacyPoolTransactionAnalyzer {
  readonly rpcUrl: string | undefined;
  readonly privacyPoolAddress: Felt | undefined;
  readonly helperAddress: Felt | undefined;
  readonly abi: StarknetAbi;

  constructor(config: PrivacyPoolTransactionAnalyzerConfig = {}) {
    this.rpcUrl = config.rpcUrl;
    this.privacyPoolAddress = config.privacyPoolAddress;
    this.helperAddress = config.helperAddress;
    this.abi = config.abi ?? PRIVACY_POOL_EVENT_ABI;
  }

  async analyzeTransaction(input: AnalyzeTransactionInput): Promise<PrivacyPoolTransactionAnalysis> {
    const transaction =
      input.transaction ??
      (await this.fetchRpc<RawStarknetTransaction>("starknet_getTransactionByHash", [
        input.transactionHash,
      ]));
    const receipt =
      input.receipt ??
      (await this.fetchRpc<RawStarknetReceipt>("starknet_getTransactionReceipt", [
        input.transactionHash,
      ]));

    const decodedCalldata = decodeTransactionCalldata(transaction, this.helperAddress);
    const decodeOptions: Parameters<typeof decodePrivacyPoolEvent>[1] = { abi: this.abi };
    if (this.helperAddress) decodeOptions.helperAddress = this.helperAddress;
    if (this.privacyPoolAddress) decodeOptions.privacyPoolAddress = this.privacyPoolAddress;
    const decodedEvents = (receipt.events ?? []).map((event) => decodePrivacyPoolEvent(event, decodeOptions));

    const analysis: PrivacyPoolTransactionAnalysis = {
      transactionHash: input.transactionHash,
      calledFunction: describeCalledFunction(decodedCalldata),
      decodedCalldata,
      decodedEvents,
      interpretation: interpretFlow(decodedCalldata, decodedEvents),
      raw: { transaction, receipt },
    };
    const contractAddress = transaction.contract_address ?? transaction.sender_address;
    if (contractAddress) analysis.contractAddress = contractAddress;
    return analysis;
  }

  async fetchTransaction(transactionHash: string): Promise<RawStarknetTransaction> {
    return this.fetchRpc<RawStarknetTransaction>("starknet_getTransactionByHash", [transactionHash]);
  }

  async fetchReceipt(transactionHash: string): Promise<RawStarknetReceipt> {
    return this.fetchRpc<RawStarknetReceipt>("starknet_getTransactionReceipt", [transactionHash]);
  }

  async fetchRpc<T>(method: string, params: unknown[]): Promise<T> {
    if (!this.rpcUrl) {
      throw new Error("RPC URL is required for Privacy Pool transaction research.");
    }

    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const body = (await response.json()) as { result?: T; error?: { message?: string } };
    if (!response.ok || body.error || !body.result) {
      throw new Error(body.error?.message ?? `RPC ${method} failed`);
    }
    return body.result;
  }
}

export function decodeTransactionCalldata(
  transaction: RawStarknetTransaction,
  helperAddress?: Felt,
): DecodedCall[] {
  const calldata = transaction.calldata ?? [];
  const accountCalls = decodeAccountExecuteCalls(calldata);
  const calls =
    accountCalls.length > 0
      ? accountCalls
      : [transaction.contract_address ? { to: transaction.contract_address, calldata, decodedActions: [] } : { calldata, decodedActions: [] }];

  return calls.map((call) => ({
    ...call,
    decodedActions: [
      ...decodeActionSets(call.calldata, "ClientAction", helperAddress),
      ...decodeActionSets(call.calldata, "ServerAction", helperAddress),
    ],
  }));
}

function decodeAccountExecuteCalls(calldata: readonly Felt[]): DecodedCall[] {
  const count = parseSmallFelt(calldata[0]);
  if (count === null || count < 1 || count > 64) {
    return [];
  }

  const calls: DecodedCall[] = [];
  let cursor = 1;
  for (let index = 0; index < count; index += 1) {
    const to = calldata[cursor++];
    const selector = calldata[cursor++];
    const length = parseSmallFelt(calldata[cursor++]);
    if (!to || !selector || length === null || cursor + length > calldata.length) {
      return [];
    }

    calls.push({ to, selector, calldata: calldata.slice(cursor, cursor + length), decodedActions: [] });
    cursor += length;
  }

  return cursor <= calldata.length ? calls : [];
}

function decodeActionSets(
  calldata: readonly Felt[],
  source: "ClientAction" | "ServerAction",
  helperAddress?: Felt,
): DecodedActionSet[] {
  const offsets = source === "ClientAction" ? [0, 2] : [0];
  return offsets
    .map((offset) => decodeActionSetAt(calldata, source, offset, helperAddress))
    .filter((actionSet): actionSet is DecodedActionSet => Boolean(actionSet));
}

function decodeActionSetAt(
  calldata: readonly Felt[],
  source: "ClientAction" | "ServerAction",
  offset: number,
  helperAddress?: Felt,
): DecodedActionSet | null {
  const count = parseSmallFelt(calldata[offset]);
  if (count === null || count < 1 || count > 64) {
    return null;
  }

  const actions: DecodedPrivacyPoolAction[] = [];
  let cursor = offset + 1;
  for (let actionIndex = 0; actionIndex < count; actionIndex += 1) {
    const variant = parseSmallFelt(calldata[cursor++]);
    if (variant === null) {
      return null;
    }

    const definition = findActionDefinition(source, variant);
    if (!definition) {
      return null;
    }

    const fields: DecodedActionField[] = [];
    for (const field of definition.fields) {
      if (field.type === "Span<felt252>") {
        const length = parseSmallFelt(calldata[cursor++]);
        if (length === null || cursor + length > calldata.length) {
          return null;
        }
        fields.push({ name: field.name, type: field.type, values: calldata.slice(cursor, cursor + length) });
        cursor += length;
        continue;
      }

      const value = calldata[cursor++];
      if (!value) {
        return null;
      }
      fields.push({ name: field.name, type: field.type, value });
    }

    const action: DecodedPrivacyPoolAction = {
      source,
      variant,
      name: definition.name,
      offset: cursor,
      fields,
    };
    const helperInvoke = decodeHelperInvoke(definition.name, fields, helperAddress);
    if (helperInvoke) action.helperInvoke = helperInvoke;
    actions.push(action);
  }

  return { source, offset, actions };
}

function findActionDefinition(source: "ClientAction" | "ServerAction", variant: number) {
  const definitions = source === "ClientAction" ? PRIVACY_POOL_CLIENT_ACTIONS : PRIVACY_POOL_SERVER_ACTIONS;
  return definitions.find((definition) => definition.variant === variant);
}

function decodeHelperInvoke(
  name: string,
  fields: readonly DecodedActionField[],
  helperAddress?: Felt,
): DecodedHelperInvoke | undefined {
  if (name !== "InvokeExternal" && name !== "Invoke") {
    return undefined;
  }

  const contractAddress = fields.find((field) => field.name === "contract_address")?.value;
  const calldata = fields.find((field) => field.name === "calldata")?.values;
  if (!calldata || calldata.length < 4) {
    return undefined;
  }

  const eventType = feltToDecimal(calldata[1] ?? "") ?? calldata[1] ?? "";
  const decoded: DecodedHelperInvoke = {
    channelId: calldata[0] ?? "",
    eventType,
    eventTypeLabel: HELPER_EVENT_LABELS[eventType] ?? "UNKNOWN",
    encryptedPayload: calldata[2] ?? "",
    payloadHash: calldata[3] ?? "",
  };
  const resolvedHelper = contractAddress ?? helperAddress;
  if (resolvedHelper) decoded.helperAddress = resolvedHelper;
  return decoded;
}

function describeCalledFunction(calls: readonly DecodedCall[]): string {
  const hasClientActions = calls.some((call) =>
    call.decodedActions.some((set) => set.source === "ClientAction"),
  );
  const hasServerActions = calls.some((call) =>
    call.decodedActions.some((set) => set.source === "ServerAction"),
  );
  if (hasClientActions) return "compile_and_panic or compile_actions client action flow";
  if (hasServerActions) return "apply_actions server action flow";
  if (calls.length > 1) return "account multicall";
  return "unknown Starknet call";
}

function interpretFlow(
  calls: readonly DecodedCall[],
  events: readonly DecodedPrivacyPoolEvent[],
): string[] {
  const actions = calls.flatMap((call) => call.decodedActions.flatMap((set) => set.actions));
  const interpretations = new Set<string>();

  for (const action of actions) {
    if (action.name === "OpenChannel") interpretations.add("Privacy Pool channel opening action detected.");
    if (action.name === "OpenSubchannel") interpretations.add("Privacy Pool subchannel opening action detected.");
    if (action.name === "CreateEncNote") interpretations.add("Encrypted note creation action detected.");
    if (action.name === "CreateOpenNote") interpretations.add("Open note creation action detected.");
    if (action.name === "Deposit") interpretations.add("Token deposit action detected.");
    if (action.name === "UseNote") interpretations.add("Private note spend action detected.");
    if (action.name === "Withdraw") interpretations.add("Withdraw action detected.");
    if (action.helperInvoke) {
      interpretations.add(
        `InvokeExternal-style call detected for helper event ${action.helperInvoke.eventTypeLabel}.`,
      );
    }
  }

  const hasInvokeExternal = actions.some((action) => action.name === "InvokeExternal" || action.name === "Invoke");
  const hasReplayProtection =
    actions.some((action) => action.name === "WriteOnce") ||
    actions.some((action) => action.source === "ClientAction" && WRITE_ONCE_CLIENT_ACTIONS.has(action.name));
  if (hasInvokeExternal && !hasReplayProtection) {
    interpretations.add(
      "Source-derived warning: standalone InvokeExternal does not provide WriteOnce replay protection and may fail NO_REPLAY_PROTECTION.",
    );
  }

  for (const event of events) {
    if (event.category === "timeline") interpretations.add("VEIL helper timeline event emitted.");
    if (event.name.includes("EncNoteCreated")) interpretations.add("Encrypted note event emitted.");
    if (event.name.includes("OpenNoteCreated")) interpretations.add("Open note event emitted.");
    if (event.name.includes("ViewingKeySet")) interpretations.add("Viewing key event emitted.");
    if (event.name.includes("NoteUsed")) interpretations.add("Note nullifier event emitted.");
  }

  if (interpretations.size === 0) {
    interpretations.add("No Privacy Pool flow could be confidently decoded from ABI shape alone.");
  }

  return [...interpretations];
}

function parseSmallFelt(value: Felt | undefined): number | null {
  if (!value) return null;
  try {
    const parsed = BigInt(value);
    if (parsed < 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(parsed);
  } catch {
    return null;
  }
}

function feltToDecimal(value: Felt): string | null {
  try {
    return BigInt(value).toString(10);
  } catch {
    return null;
  }
}
