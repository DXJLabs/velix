import type { FeltLike, StarknetContractCall } from "./types";

const ZERO_FELTS = new Set(["0", "0x0", "0x00"]);

export const PRIVACY_POOL_CLIENT_ACTION_VARIANTS = {
  SetViewingKey: 0,
  OpenChannel: 1,
  OpenSubchannel: 2,
  CreateEncNote: 3,
  CreateOpenNote: 4,
  Deposit: 5,
  UseNote: 6,
  Withdraw: 7,
  InvokeExternal: 8,
} as const;

export const PRIVACY_POOL_CLIENT_ACTION_PHASES = {
  SetViewingKey: 0,
  OpenChannel: 1,
  OpenSubchannel: 2,
  Deposit: 3,
  UseNote: 4,
  CreateEncNote: 5,
  CreateOpenNote: 5,
  Withdraw: 6,
  InvokeExternal: 7,
} as const;

const WRITE_ONCE_CLIENT_ACTIONS = new Set<PrivacyPoolClientAction["type"]>([
  "SetViewingKey",
  "OpenChannel",
  "OpenSubchannel",
  "CreateEncNote",
  "CreateOpenNote",
  "UseNote",
]);

export interface PrivacyPoolSetViewingKeyActionInput {
  random: FeltLike;
}

export interface PrivacyPoolOpenChannelActionInput {
  recipientAddress: FeltLike;
  index: FeltLike;
  random: FeltLike;
  salt: FeltLike;
}

export interface PrivacyPoolOpenSubchannelActionInput {
  recipientAddress: FeltLike;
  recipientPublicKey: FeltLike;
  channelKey: FeltLike;
  index: FeltLike;
  token: FeltLike;
  salt: FeltLike;
}

export interface PrivacyPoolCreateEncNoteActionInput {
  recipientAddress: FeltLike;
  recipientPublicKey: FeltLike;
  token: FeltLike;
  amount: FeltLike;
  index: FeltLike;
  salt: FeltLike;
}

export interface PrivacyPoolCreateOpenNoteActionInput {
  recipientAddress: FeltLike;
  recipientPublicKey: FeltLike;
  token: FeltLike;
  index: FeltLike;
  random: FeltLike;
}

export interface PrivacyPoolDepositActionInput {
  token: FeltLike;
  amount: FeltLike;
}

export interface PrivacyPoolUseNoteActionInput {
  channelKey: FeltLike;
  token: FeltLike;
  index: FeltLike;
}

export interface PrivacyPoolWithdrawActionInput {
  toAddress: FeltLike;
  token: FeltLike;
  amount: FeltLike;
  random: FeltLike;
}

export interface PrivacyPoolInvokeExternalActionInput {
  contractAddress: FeltLike;
  calldata: readonly FeltLike[];
}

export type PrivacyPoolClientAction =
  | { type: "SetViewingKey"; input: PrivacyPoolSetViewingKeyActionInput }
  | { type: "OpenChannel"; input: PrivacyPoolOpenChannelActionInput }
  | { type: "OpenSubchannel"; input: PrivacyPoolOpenSubchannelActionInput }
  | { type: "CreateEncNote"; input: PrivacyPoolCreateEncNoteActionInput }
  | { type: "CreateOpenNote"; input: PrivacyPoolCreateOpenNoteActionInput }
  | { type: "Deposit"; input: PrivacyPoolDepositActionInput }
  | { type: "UseNote"; input: PrivacyPoolUseNoteActionInput }
  | { type: "Withdraw"; input: PrivacyPoolWithdrawActionInput }
  | { type: "InvokeExternal"; input: PrivacyPoolInvokeExternalActionInput };

export interface PrivacyPoolClientActionBatchAnalysis {
  actionTypes: readonly PrivacyPoolClientAction["type"][];
  hasReplayProtection: boolean;
  invokeExternalCount: number;
  encodedClientActions: readonly string[];
}

export interface PrivacyPoolCompileActionsInput {
  privacyPoolAddress: string;
  userAddress: FeltLike;
  userPrivateKey: FeltLike;
  actions: readonly PrivacyPoolClientAction[];
}

export interface PrivacyPoolApplyActionsInput {
  privacyPoolAddress: string;
  serverActionsCalldata: readonly FeltLike[];
}

export interface BuildPrivacyPoolChannelActionsInput {
  setViewingKey?: PrivacyPoolSetViewingKeyActionInput;
  openChannel?: PrivacyPoolOpenChannelActionInput;
  openSubchannel?: PrivacyPoolOpenSubchannelActionInput;
}

export interface BuildPrivacyPoolMessageActionsInput extends BuildPrivacyPoolChannelActionsInput {
  deposit?: PrivacyPoolDepositActionInput;
  useNote?: PrivacyPoolUseNoteActionInput;
  createEncNote?: PrivacyPoolCreateEncNoteActionInput;
  createOpenNote?: PrivacyPoolCreateOpenNoteActionInput;
  withdraw?: PrivacyPoolWithdrawActionInput;
}

export function setViewingKeyAction(input: PrivacyPoolSetViewingKeyActionInput): PrivacyPoolClientAction {
  assertNonZero(input.random, "SetViewingKey.random");
  return { type: "SetViewingKey", input };
}

export function openChannelAction(input: PrivacyPoolOpenChannelActionInput): PrivacyPoolClientAction {
  assertNonZero(input.recipientAddress, "OpenChannel.recipientAddress");
  assertNonZero(input.random, "OpenChannel.random");
  assertNonZero(input.salt, "OpenChannel.salt");
  return { type: "OpenChannel", input };
}

export function openSubchannelAction(input: PrivacyPoolOpenSubchannelActionInput): PrivacyPoolClientAction {
  assertNonZero(input.recipientAddress, "OpenSubchannel.recipientAddress");
  assertNonZero(input.recipientPublicKey, "OpenSubchannel.recipientPublicKey");
  assertNonZero(input.token, "OpenSubchannel.token");
  assertNonZero(input.salt, "OpenSubchannel.salt");
  return { type: "OpenSubchannel", input };
}

export function createEncNoteAction(input: PrivacyPoolCreateEncNoteActionInput): PrivacyPoolClientAction {
  assertNonZero(input.recipientAddress, "CreateEncNote.recipientAddress");
  assertNonZero(input.recipientPublicKey, "CreateEncNote.recipientPublicKey");
  assertNonZero(input.token, "CreateEncNote.token");
  assertNonZero(input.salt, "CreateEncNote.salt");
  assertCreateEncNoteSalt(input.salt);
  return { type: "CreateEncNote", input };
}

export function createOpenNoteAction(input: PrivacyPoolCreateOpenNoteActionInput): PrivacyPoolClientAction {
  assertNonZero(input.recipientAddress, "CreateOpenNote.recipientAddress");
  assertNonZero(input.recipientPublicKey, "CreateOpenNote.recipientPublicKey");
  assertNonZero(input.token, "CreateOpenNote.token");
  assertNonZero(input.random, "CreateOpenNote.random");
  return { type: "CreateOpenNote", input };
}

export function depositAction(input: PrivacyPoolDepositActionInput): PrivacyPoolClientAction {
  assertNonZero(input.token, "Deposit.token");
  assertNonZero(input.amount, "Deposit.amount");
  return { type: "Deposit", input };
}

export function useNoteAction(input: PrivacyPoolUseNoteActionInput): PrivacyPoolClientAction {
  assertNonZero(input.token, "UseNote.token");
  return { type: "UseNote", input };
}

export function withdrawAction(input: PrivacyPoolWithdrawActionInput): PrivacyPoolClientAction {
  assertNonZero(input.toAddress, "Withdraw.toAddress");
  assertNonZero(input.token, "Withdraw.token");
  assertNonZero(input.amount, "Withdraw.amount");
  assertNonZero(input.random, "Withdraw.random");
  return { type: "Withdraw", input };
}

export function invokeExternalAction(input: PrivacyPoolInvokeExternalActionInput): PrivacyPoolClientAction {
  assertNonZero(input.contractAddress, "InvokeExternal.contractAddress");
  return { type: "InvokeExternal", input };
}

export function buildPrivacyPoolChannelActions(
  input: BuildPrivacyPoolChannelActionsInput,
): PrivacyPoolClientAction[] {
  const actions: PrivacyPoolClientAction[] = [];
  if (input.setViewingKey) actions.push(setViewingKeyAction(input.setViewingKey));
  if (input.openChannel) actions.push(openChannelAction(input.openChannel));
  if (input.openSubchannel) actions.push(openSubchannelAction(input.openSubchannel));
  if (!actions.length) {
    throw new Error("Channel creation requires SetViewingKey, OpenChannel, or OpenSubchannel input.");
  }

  assertValidClientActionBatch(actions);
  return actions;
}

export function buildPrivacyPoolMessageActions(
  input: BuildPrivacyPoolMessageActionsInput = {},
): PrivacyPoolClientAction[] {
  const actions: PrivacyPoolClientAction[] = [];
  if (input.setViewingKey) actions.push(setViewingKeyAction(input.setViewingKey));
  if (input.openChannel) actions.push(openChannelAction(input.openChannel));
  if (input.openSubchannel) actions.push(openSubchannelAction(input.openSubchannel));
  if (input.deposit) actions.push(depositAction(input.deposit));
  if (input.useNote) actions.push(useNoteAction(input.useNote));
  if (input.createEncNote) actions.push(createEncNoteAction(input.createEncNote));
  if (input.createOpenNote) actions.push(createOpenNoteAction(input.createOpenNote));
  if (input.withdraw) actions.push(withdrawAction(input.withdraw));
  assertOrderedClientActions(actions);
  return actions;
}

export function encodeClientAction(action: PrivacyPoolClientAction): string[] {
  switch (action.type) {
    case "SetViewingKey":
      return [variant(action.type), felt(action.input.random, "random")];
    case "OpenChannel":
      return [
        variant(action.type),
        felt(action.input.recipientAddress, "recipient_addr"),
        felt(action.input.index, "index"),
        felt(action.input.random, "random"),
        felt(action.input.salt, "salt"),
      ];
    case "OpenSubchannel":
      return [
        variant(action.type),
        felt(action.input.recipientAddress, "recipient_addr"),
        felt(action.input.recipientPublicKey, "recipient_public_key"),
        felt(action.input.channelKey, "channel_key"),
        felt(action.input.index, "index"),
        felt(action.input.token, "token"),
        felt(action.input.salt, "salt"),
      ];
    case "CreateEncNote":
      return [
        variant(action.type),
        felt(action.input.recipientAddress, "recipient_addr"),
        felt(action.input.recipientPublicKey, "recipient_public_key"),
        felt(action.input.token, "token"),
        felt(action.input.amount, "amount"),
        felt(action.input.index, "index"),
        felt(action.input.salt, "salt"),
      ];
    case "CreateOpenNote":
      return [
        variant(action.type),
        felt(action.input.recipientAddress, "recipient_addr"),
        felt(action.input.recipientPublicKey, "recipient_public_key"),
        felt(action.input.token, "token"),
        felt(action.input.index, "index"),
        felt(action.input.random, "random"),
      ];
    case "Deposit":
      return [variant(action.type), felt(action.input.token, "token"), felt(action.input.amount, "amount")];
    case "UseNote":
      return [
        variant(action.type),
        felt(action.input.channelKey, "channel_key"),
        felt(action.input.token, "token"),
        felt(action.input.index, "index"),
      ];
    case "Withdraw":
      return [
        variant(action.type),
        felt(action.input.toAddress, "to_addr"),
        felt(action.input.token, "token"),
        felt(action.input.amount, "amount"),
        felt(action.input.random, "random"),
      ];
    case "InvokeExternal":
      return [
        variant(action.type),
        felt(action.input.contractAddress, "contract_address"),
        ...encodeFeltSpan(action.input.calldata, "calldata"),
      ];
  }
}

export function encodeClientActions(actions: readonly PrivacyPoolClientAction[]): string[] {
  return [String(actions.length), ...actions.flatMap((action) => encodeClientAction(action))];
}

export function analyzeClientActionBatch(
  actions: readonly PrivacyPoolClientAction[],
): PrivacyPoolClientActionBatchAnalysis {
  assertOrderedClientActions(actions);
  const actionTypes = actions.map((action) => action.type);
  return {
    actionTypes,
    hasReplayProtection: actionTypes.some((type) => WRITE_ONCE_CLIENT_ACTIONS.has(type)),
    invokeExternalCount: actionTypes.filter((type) => type === "InvokeExternal").length,
    encodedClientActions: encodeClientActions(actions),
  };
}

export function assertValidClientActionBatch(actions: readonly PrivacyPoolClientAction[]): void {
  const analysis = analyzeClientActionBatch(actions);
  if (!analysis.hasReplayProtection) {
    throw new Error("Privacy Pool ClientAction batch requires a WriteOnce-producing replay-protection action.");
  }
}

export function prepareCompileActionsCalldata(input: Omit<PrivacyPoolCompileActionsInput, "privacyPoolAddress">): string[] {
  assertNonZero(input.userAddress, "userAddress");
  assertNonZero(input.userPrivateKey, "userPrivateKey");
  assertValidClientActionBatch(input.actions);
  return [
    felt(input.userAddress, "user_addr"),
    felt(input.userPrivateKey, "user_private_key"),
    ...encodeClientActions(input.actions),
  ];
}

export function prepareCompileActionsCall(input: PrivacyPoolCompileActionsInput): StarknetContractCall {
  return {
    contractAddress: input.privacyPoolAddress,
    entrypoint: "compile_actions",
    calldata: prepareCompileActionsCalldata(input),
  };
}

export function prepareApplyActionsCall(input: PrivacyPoolApplyActionsInput): StarknetContractCall {
  return {
    contractAddress: input.privacyPoolAddress,
    entrypoint: "apply_actions",
    calldata: encodeFeltSpan(input.serverActionsCalldata, "server_actions"),
  };
}

function assertOrderedClientActions(actions: readonly PrivacyPoolClientAction[]): void {
  let currentPhase = 0;
  let invokeExternalCount = 0;
  for (const action of actions) {
    const actionPhase = PRIVACY_POOL_CLIENT_ACTION_PHASES[action.type];
    if (actionPhase < currentPhase) {
      throw new Error(`Privacy Pool ClientAction ${action.type} is out of order.`);
    }
    if (action.type === "InvokeExternal") {
      invokeExternalCount += 1;
      currentPhase = actionPhase + 1;
    } else {
      currentPhase = actionPhase;
    }
  }
  if (invokeExternalCount > 1) {
    throw new Error("Privacy Pool ClientAction batch can include InvokeExternal at most once.");
  }
}

function encodeFeltSpan(values: readonly FeltLike[], label: string): string[] {
  return [String(values.length), ...values.map((value, index) => felt(value, `${label}[${index}]`))];
}

function variant(type: PrivacyPoolClientAction["type"]): string {
  return String(PRIVACY_POOL_CLIENT_ACTION_VARIANTS[type]);
}

function felt(value: FeltLike, label: string): string {
  if (typeof value === "bigint") {
    if (value < 0n) throw new Error(`${label} must be non-negative.`);
    return value.toString();
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative safe integer.`);
    }
    return String(value);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} cannot be empty.`);
  }
  return trimmed;
}

function assertNonZero(value: FeltLike, label: string): void {
  const normalized = felt(value, label).toLowerCase();
  if (ZERO_FELTS.has(normalized)) {
    throw new Error(`${label} must be non-zero.`);
  }
}

function assertCreateEncNoteSalt(value: FeltLike): void {
  const salt = BigInt(felt(value, "CreateEncNote.salt"));
  if (salt <= 1n) {
    throw new Error("CreateEncNote.salt must be greater than OPEN_NOTE_SALT.");
  }
  if (salt >= 2n ** 120n) {
    throw new Error("CreateEncNote.salt must be less than 2^120.");
  }
}
