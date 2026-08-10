import {
  ApiError,
  createRequestContext,
  hashForLog,
  logEvent,
  requirePost,
  sendError,
} from "../_lib/auth.js";
import {
  assertJsonBodyWithinLimit,
  enforceRateLimit,
  setPrivateResponseHeaders,
} from "../_lib/security.js";
import { verifyStarknetAccountSignature } from "../_lib/starknet-account-rpc.js";

import {
  loadAuthSessionEnvironment,
} from "../../backend/dist/config/auth-session-env.js";
import {
  buildChallengeTypedData,
  createWalletAuthSession,
  verifyWalletAuthChallengeToken,
} from "../../backend/dist/services/security/wallet-siwe-auth.js";

import { typedData as starknetTypedData } from "starknet";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{1,64}$/;

export default async function handler(request, response) {
  const context = createRequestContext(request, "/api/auth/verify");

  try {
    setPrivateResponseHeaders(response);
    requirePost(request, response, context);
    assertJsonBodyWithinLimit(request, context, 4_096);
    enforceRateLimit(request, response, context, { limit: 20, windowMs: 60_000 });

    const { address, challengeToken, signature } = request.body || {};
    if (typeof address !== "string" || !ADDRESS_PATTERN.test(address)) {
      throw new ApiError(
        400,
        "AUTH_VERIFY_ADDRESS_INVALID",
        context.route,
        "address must be a 0x-prefixed Starknet account address.",
        "Pass the same address used to request the sign-in challenge.",
      );
    }
    if (typeof challengeToken !== "string" || challengeToken.length < 1) {
      throw new ApiError(
        400,
        "AUTH_VERIFY_CHALLENGE_TOKEN_MISSING",
        context.route,
        "challengeToken is required.",
        "Pass the challengeToken returned by POST /api/auth/challenge.",
      );
    }
    if (
      !Array.isArray(signature)
      || signature.length < 1
      || signature.length > 8
      || !signature.every((element) => typeof element === "string" && /^0x[0-9a-fA-F]{1,64}$/.test(element))
    ) {
      throw new ApiError(
        400,
        "AUTH_VERIFY_SIGNATURE_INVALID",
        context.route,
        "signature must be a non-empty array of 0x-prefixed felt strings.",
        "Pass the raw signature array returned by the wallet's signTypedData call.",
      );
    }

    const env = loadAuthSessionEnvironment();
    const payload = verifyWalletAuthChallengeToken(
      env.hmacSecret,
      challengeToken,
      address,
      Date.now(),
    );

    const chainId = process.env.STARKNET_CHAIN_ID || process.env.VITE_STARKNET_CHAIN_ID || "SN_SEPOLIA";
    const typedDataObject = buildChallengeTypedData(payload, chainId);
    const messageHash = starknetTypedData.getMessageHash(typedDataObject, payload.address);

    const rpcUrl = process.env.STARKNET_RPC_URL;
    if (!rpcUrl) {
      throw new ApiError(
        500,
        "SERVER_ENV_MISSING",
        context.route,
        "STARKNET_RPC_URL is not configured.",
        "Set STARKNET_RPC_URL in the server environment to a reviewed HTTPS Sepolia endpoint.",
      );
    }

    const valid = await verifyStarknetAccountSignature({
      rpcUrl,
      address: payload.address,
      messageHash,
      signature,
      context,
    });

    if (!valid) {
      throw new ApiError(
        401,
        "AUTH_SIGNATURE_INVALID",
        context.route,
        "The wallet signature did not verify against the connected account.",
        "Sign in again and approve the exact sign-in request shown by your wallet.",
      );
    }

    const session = createWalletAuthSession(env.hmacSecret, payload.address, Date.now());

    logEvent("info", "auth.verify.success", context, {
      addressHash: hashForLog(payload.address),
    });

    response.status(200).json({
      sessionToken: session.sessionToken,
      expiresAtMs: session.expiresAtMs,
    });
  } catch (error) {
    sendError(response, context, error);
  }
}
