import {
  STARKNET_CHAIN_TYPE,
  authenticatePrivyRequest,
  createPrivyClient,
  createRequestContext,
  formatWallet,
  getUserStarknetWallet,
  hashForLog,
  logEvent,
  requirePost,
  sendError,
  stableIdempotencyKey,
} from "../_lib/privy.js";

export default async function handler(request, response) {
  const context = createRequestContext(request, "/api/wallet/starknet");

  try {
    requirePost(request, response, context);

    const auth = await authenticatePrivyRequest(request, context);
    const client = createPrivyClient(context);
    const userIdHash = hashForLog(auth.userId);

    logEvent("info", "wallet.starknet.lookup.start", context, { userIdHash });
    const existingWallet = await getUserStarknetWallet(client, auth.userId, undefined, context);
    if (existingWallet) {
      logEvent("info", "wallet.starknet.lookup.hit", context, {
        userIdHash,
        walletId: existingWallet.id,
        address: existingWallet.address,
      });
      response.status(200).json({ wallet: formatWallet(existingWallet) });
      return;
    }

    logEvent("info", "wallet.starknet.create.start", context, { userIdHash });
    const wallet = await client.wallets().create({
      chain_type: STARKNET_CHAIN_TYPE,
      owner: { user_id: auth.userId },
      display_name: "VEIL Starknet Wallet",
      idempotency_key: stableIdempotencyKey("veil-starknet-wallet", auth.userId),
    });
    logEvent("info", "wallet.starknet.create.success", context, {
      userIdHash,
      walletId: wallet.id,
      address: wallet.address,
    });
    response.status(200).json({
      wallet: formatWallet(wallet),
    });
  } catch (error) {
    sendError(response, context, error);
  }
}
