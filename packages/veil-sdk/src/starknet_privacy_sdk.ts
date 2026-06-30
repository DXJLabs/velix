import { prepareApplyActionsCall } from "./privacy_pool_actions";
import type {
  FeltLike,
  StarknetPrivacyCompiledActions,
  StarknetPrivacyMessageAction,
  StarknetPrivacyProofResult,
  StarknetPrivacySdkExecutionInput,
  StarknetPrivacySdkLike,
} from "./types";

export async function buildStarknetPrivacySdkAction(
  sdk: StarknetPrivacySdkLike,
  input: StarknetPrivacySdkExecutionInput,
): Promise<StarknetPrivacyMessageAction> {
  const compiledActions = await sdk.compileActions(input);
  const proof = await generateProof(sdk, input, compiledActions);
  const applyActionsCall = createApplyActionsCall(input.privacyPoolAddress, compiledActions);
  const applyInput = {
    ...input,
    compiledActions,
    proof,
    ...(applyActionsCall ? { applyActionsCall } : {}),
  };

  if (sdk.invokeAndApplyAction) {
    return { execute: () => sdk.invokeAndApplyAction!(applyInput) };
  }

  if (sdk.applyAction) {
    return { execute: () => sdk.applyAction!(applyInput) };
  }

  if (!sdk.buildApplyActionsTransaction) {
    throw new Error(
      "Starknet Privacy SDK integration must expose buildApplyActionsTransaction(), invokeAndApplyAction(), or applyAction().",
    );
  }

  return normalizeSdkAction(await sdk.buildApplyActionsTransaction(applyInput));
}

async function generateProof(
  sdk: StarknetPrivacySdkLike,
  input: StarknetPrivacySdkExecutionInput,
  compiledActions: StarknetPrivacyCompiledActions,
): Promise<StarknetPrivacyProofResult> {
  const proofInput = { ...input, compiledActions };
  if (sdk.generateProof) {
    return sdk.generateProof(proofInput);
  }
  if (sdk.prove) {
    return sdk.prove(proofInput);
  }

  throw new Error("Starknet Privacy SDK integration must expose generateProof() or prove().");
}

function createApplyActionsCall(
  privacyPoolAddress: string,
  compiledActions: StarknetPrivacyCompiledActions,
) {
  const serverActionsCalldata = compiledActions.serverActionsCalldata;
  if (!serverActionsCalldata) {
    return undefined;
  }

  return prepareApplyActionsCall({
    privacyPoolAddress,
    serverActionsCalldata: serverActionsCalldata.map((value) => felt(value, "server_action")),
  });
}

function normalizeSdkAction(value: StarknetPrivacyMessageAction | unknown): StarknetPrivacyMessageAction {
  if (isSdkAction(value)) {
    return value;
  }

  return { transaction: value };
}

function isSdkAction(value: unknown): value is StarknetPrivacyMessageAction {
  return typeof value === "object"
    && value !== null
    && ("execute" in value || "transaction" in value);
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
