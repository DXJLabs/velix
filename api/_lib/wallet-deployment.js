import { accountPresets } from "../../node_modules/starkzap/dist/src/account/presets.js";
import { hash } from "starknet";

import { ApiError } from "./privy.js";

const ARGENT_X_V050 = accountPresets.argentXV050;
const BOOLEAN_TRUE = new Set(["1", "true", "yes", "on"]);
const BOOLEAN_FALSE = new Set(["0", "false", "no", "off", ""]);

export function walletDeploySponsorshipEnabled(env = process.env) {
  const raw = env.AVNU_WALLET_DEPLOY_ENABLED
    ?? env.VITE_AVNU_WALLET_DEPLOY_ENABLED
    ?? env.VITE_AVNU_PAYMASTER_ENABLED
    ?? "false";
  const value = String(raw).trim().toLowerCase();
  if (BOOLEAN_TRUE.has(value)) return true;
  if (BOOLEAN_FALSE.has(value)) return false;
  throw new Error("Wallet deployment sponsorship flag must be a boolean.");
}

export function assertWalletDeploySponsorshipEnabled(context, env = process.env) {
  if (walletDeploySponsorshipEnabled(env)) return true;
  throw new ApiError(
    503,
    "WALLET_DEPLOY_PAYMASTER_DISABLED",
    context.route,
    "Wallet deployment sponsorship is disabled.",
    "Set VITE_AVNU_WALLET_DEPLOY_ENABLED=true, keep private-transaction sponsorship disabled, and redeploy.",
  );
}

export function expectedArgentXV050Deployment(publicKey) {
  const normalizedPublicKey = normalizeFelt(publicKey, "public key");
  const classHash = normalizeFelt(ARGENT_X_V050.classHash, "Argent X v0.5.0 class hash");
  const calldata = ARGENT_X_V050
    .buildConstructorCalldata(normalizedPublicKey)
    .map((value, index) => normalizeFelt(value, `constructor calldata[${index}]`));
  const normalizedSalt = normalizeFelt(
    typeof ARGENT_X_V050.getSalt === "function"
      ? ARGENT_X_V050.getSalt(normalizedPublicKey)
      : normalizedPublicKey,
    "deployment salt",
  );
  const address = normalizeFelt(
    hash.calculateContractAddressFromHash(normalizedSalt, classHash, calldata, 0),
    "deployment address",
  );

  return Object.freeze({
    address,
    classHash,
    salt: normalizedSalt,
    calldata: Object.freeze(calldata),
    version: 1,
  });
}

export function validateWalletDeployPayload(payload, publicKey, context) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw invalidPaymasterRequest(context, "The paymaster body must be one JSON-RPC object.");
  }
  if (payload.jsonrpc !== "2.0") {
    throw invalidPaymasterRequest(context, "The paymaster body must use JSON-RPC 2.0.");
  }
  if (!["paymaster_buildTransaction", "paymaster_executeTransaction"].includes(payload.method)) {
    throw new ApiError(
      403,
      "PAYMASTER_METHOD_FORBIDDEN",
      context.route,
      "Only AVNU build and execute methods required for wallet deployment are allowed.",
      "Use this proxy only through StarkZap onboarding with deploy: if_needed.",
    );
  }

  const { transaction, parameters } = readTransactionAndParameters(payload.params, context);
  if (transaction?.type !== "deploy" || !transaction.deployment) {
    throw new ApiError(
      403,
      "PAYMASTER_TRANSACTION_FORBIDDEN",
      context.route,
      "Only a deploy-only wallet onboarding transaction may use this paymaster.",
      "Do not send invoke or deploy_and_invoke transactions through the wallet-deployment proxy.",
    );
  }
  if (String(parameters?.version || "").toLowerCase() !== "0x1"
    || parameters?.fee_mode?.mode !== "sponsored") {
    throw new ApiError(
      403,
      "PAYMASTER_FEE_MODE_FORBIDDEN",
      context.route,
      "Wallet onboarding requires SNIP-29 version 0x1 in sponsored mode.",
      "Let StarkZap build the sponsored deployment request.",
    );
  }

  const deployment = normalizeDeployment(transaction.deployment, context);
  const expected = expectedArgentXV050Deployment(publicKey);
  if (deployment.classHash !== expected.classHash
    || deployment.address !== expected.address
    || deployment.salt !== expected.salt
    || deployment.version !== expected.version
    || !sameFelts(deployment.calldata, expected.calldata)) {
    throw new ApiError(
      403,
      "PAYMASTER_DEPLOYMENT_MISMATCH",
      context.route,
      "The sponsored deployment does not match the authenticated user's pinned Argent X v0.5.0 account.",
      "Use VEIL's StarkZap Privy onboarding flow and the argentXV050 account preset.",
    );
  }

  return Object.freeze({
    method: payload.method,
    transaction,
    parameters,
    deployment,
  });
}

export function normalizeDeployment(value, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidPaymasterRequest(context, "Deployment data is missing.");
  }
  const calldata = Array.isArray(value.calldata)
    ? value.calldata.map((item, index) => normalizeFelt(item, `deployment calldata[${index}]`))
    : null;
  if (!calldata || calldata.length === 0 || calldata.length > 32) {
    throw invalidPaymasterRequest(context, "Deployment calldata must contain between 1 and 32 felts.");
  }
  const version = Number(value.version);
  if (version !== 1) {
    throw invalidPaymasterRequest(context, "Only account deployment data version 1 is allowed.");
  }
  const sigdata = value.sigdata;
  if (sigdata !== undefined && sigdata !== null) {
    if (!Array.isArray(sigdata) || sigdata.length > 16) {
      throw invalidPaymasterRequest(context, "Deployment sigdata must be a bounded felt array when present.");
    }
    sigdata.forEach((item, index) => normalizeFelt(item, `deployment sigdata[${index}]`));
  }

  return Object.freeze({
    address: normalizeFelt(value.address, "deployment address"),
    classHash: normalizeFelt(value.class_hash, "deployment class hash"),
    salt: normalizeFelt(value.salt, "deployment salt"),
    calldata: Object.freeze(calldata),
    version,
  });
}

export function normalizeFelt(value, label = "felt") {
  let numeric;

  if (typeof value === "bigint") {
    numeric = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative safe integer felt.`);
    }
    numeric = BigInt(value);
  } else {
    const normalized = String(value ?? "").trim();
    if (!/^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(normalized)) {
      throw new Error(`${label} must be a hexadecimal or decimal felt.`);
    }
    numeric = BigInt(normalized);
  }

  if (numeric < 0n || numeric >= (1n << 252n)) {
    throw new Error(`${label} is outside the Starknet felt range.`);
  }
  return `0x${numeric.toString(16)}`;
}

function readTransactionAndParameters(params, context) {
  if (Array.isArray(params)) {
    if (params.length !== 2) {
      throw invalidPaymasterRequest(context, "Paymaster params must contain transaction and parameters.");
    }
    return { transaction: params[0], parameters: params[1] };
  }
  if (!params || typeof params !== "object") {
    throw invalidPaymasterRequest(context, "Paymaster params are missing.");
  }
  return { transaction: params.transaction, parameters: params.parameters };
}

function sameFelts(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function invalidPaymasterRequest(context, why) {
  return new ApiError(
    400,
    "PAYMASTER_REQUEST_INVALID",
    context.route,
    why,
    "Let StarkZap create the AVNU wallet-deployment request; do not handcraft it.",
  );
}
