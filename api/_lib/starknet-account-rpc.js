import crypto from "node:crypto";

import { hash, num } from "starknet";

import { ApiError } from "./auth.js";

// This client exists only to verify SNIP-6 `is_valid_signature` calls
// against an arbitrary connected wallet's account contract, for the SIWE
// sign-in flow. It intentionally does not share the indexer's RPC client
// (api/indexer/_lib/starknet-rpc.js), which is scoped to a fixed allowlist
// of read-only helper-contract entrypoints.
const RPC_TIMEOUT_MS = 8_000;
const MAX_RPC_RESPONSE_BYTES = 64 * 1024;
const IS_VALID_SIGNATURE_SELECTOR = hash.getSelectorFromName("is_valid_signature");
// SNIP-6 success value: the ASCII bytes of "VALID" as a felt.
const SNIP6_VALID_RESPONSE = "0x56414c4944";

export async function verifyStarknetAccountSignature({
  rpcUrl,
  address,
  messageHash,
  signature,
  context,
}) {
  const url = validatedRpcUrl(rpcUrl, context);
  const calldata = [
    num.toHex(messageHash),
    num.toHex(signature.length),
    ...signature.map((element) => num.toHex(element)),
  ];

  let result;
  try {
    result = await rpc(
      url,
      "starknet_call",
      [
        {
          contract_address: address,
          entry_point_selector: IS_VALID_SIGNATURE_SELECTOR,
          calldata,
        },
        "pending",
      ],
      context,
    );
  } catch (error) {
    // A REVERTED call (the most common shape of an invalid signature) comes
    // back from most RPC providers as a JSON-RPC error, not a result — treat
    // any RPC-level rejection of this specific call as "signature invalid"
    // rather than surfacing it as an RPC-availability error, so a bad
    // signature fails the sign-in cleanly instead of looking like an outage.
    if (error instanceof ApiError && error.code === "AUTH_RPC_REJECTED") return false;
    throw error;
  }

  if (!Array.isArray(result) || result.length < 1) return false;
  return num.toHex(result[0]) === SNIP6_VALID_RESPONSE;
}

async function rpc(url, method, params, context) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  let response;
  let body;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomInt(1, 2_147_483_647),
        method,
        params,
      }),
      signal: controller.signal,
    });
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RPC_RESPONSE_BYTES) {
      throw invalidRpcResponse(context);
    }
    body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_RPC_RESPONSE_BYTES) throw invalidRpcResponse(context);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      502,
      error?.name === "AbortError" ? "AUTH_RPC_TIMEOUT" : "AUTH_RPC_UNAVAILABLE",
      context.route,
      error?.name === "AbortError"
        ? "The Starknet RPC did not respond within the sign-in timeout."
        : "The Starknet RPC is unavailable to verify the wallet signature.",
      "Retry sign-in once, then check the configured Sepolia RPC health.",
      { rpcMethod: method },
    );
  } finally {
    clearTimeout(timeout);
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw invalidRpcResponse(context);
  }
  if (!response.ok || payload?.error || !("result" in (payload || {}))) {
    throw new ApiError(
      502,
      "AUTH_RPC_REJECTED",
      context.route,
      "The Starknet RPC rejected the signature verification call.",
      "This usually means the signature was invalid for this account. Sign in again with the correct wallet.",
      { rpcMethod: method, upstreamStatus: response.status },
    );
  }
  return payload.result;
}

function validatedRpcUrl(value, context) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw invalidRpcConfig(context);
  }
  if (url.protocol !== "https:" || url.username || url.password) throw invalidRpcConfig(context);
  return url.toString();
}

function invalidRpcConfig(context) {
  return new ApiError(
    503,
    "AUTH_RPC_CONFIG_INVALID",
    context.route,
    "Wallet sign-in requires a valid HTTPS Starknet Sepolia RPC URL.",
    "Configure STARKNET_RPC_URL with a reviewed HTTPS Sepolia endpoint and keep credentials server-side.",
  );
}

function invalidRpcResponse(context) {
  return new ApiError(
    502,
    "AUTH_RPC_RESPONSE_INVALID",
    context.route,
    "The Starknet RPC returned an unexpected response while verifying the wallet signature.",
    "Retry sign-in once, then check the configured Sepolia RPC health.",
  );
}
