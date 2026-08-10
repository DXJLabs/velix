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

import {
  loadAuthSessionEnvironment,
} from "../../backend/dist/config/auth-session-env.js";
import {
  createWalletAuthChallenge,
} from "../../backend/dist/services/security/wallet-siwe-auth.js";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{1,64}$/;

export default async function handler(request, response) {
  const context = createRequestContext(request, "/api/auth/challenge");

  try {
    setPrivateResponseHeaders(response);
    requirePost(request, response, context);
    assertJsonBodyWithinLimit(request, context, 1_024);
    enforceRateLimit(request, response, context, { limit: 20, windowMs: 60_000 });

    const { address } = request.body || {};
    if (typeof address !== "string" || !ADDRESS_PATTERN.test(address)) {
      throw new ApiError(
        400,
        "AUTH_CHALLENGE_ADDRESS_INVALID",
        context.route,
        "address must be a 0x-prefixed Starknet account address.",
        "Pass the address of the wallet the user just connected.",
      );
    }

    const env = loadAuthSessionEnvironment();
    const chainId = process.env.STARKNET_CHAIN_ID || process.env.VITE_STARKNET_CHAIN_ID || "SN_SEPOLIA";
    const challenge = createWalletAuthChallenge(env.hmacSecret, address, Date.now(), chainId);

    logEvent("info", "auth.challenge.issued", context, {
      addressHash: hashForLog(address),
    });

    response.status(200).json({
      message: challenge.message,
      typedData: challenge.typedData,
      challengeToken: challenge.challengeToken,
      expiresAtMs: challenge.expiresAtMs,
    });
  } catch (error) {
    sendError(response, context, error);
  }
}
