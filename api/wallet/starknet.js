import {
  STARKNET_CHAIN_TYPE,
  authenticatePrivyRequest,
  createPrivyClient,
  createRequestContext,
  formatWallet,
  getServerManagedStarknetWallet,
  hashForLog,
  logEvent,
  requirePost,
  sendError,
  starknetWalletExternalId,
  stableIdempotencyKey,
} from "../_lib/privy.js";

export default async function handler(request, response) {
  const context = createRequestContext(request, "/api/wallet/starknet");

  try {
    logEvent("info", "wallet.starknet.request.received", context, {
      method: request.method,
      contentType: request.headers["content-type"],
      authorizationPresent: Boolean(request.headers.authorization || request.headers.Authorization),
    });
    requirePost(request, response, context);

    const auth = await authenticatePrivyRequest(request, context);
    const client = createPrivyClient(context);
    const userIdHash = hashForLog(auth.userId);
    const externalId = starknetWalletExternalId(auth.userId);

    logEvent("info", "wallet.starknet.lookup.start", context, {
      userIdHash,
      walletMode: "server-managed",
    });
    const existingWallet = await getServerManagedStarknetWallet(client, auth.userId, undefined, context);
    if (existingWallet) {
      logEvent("info", "wallet.starknet.lookup.hit", context, {
        userIdHash,
        walletMode: "server-managed",
        walletId: existingWallet.id,
        address: existingWallet.address,
      });
      logEvent("info", "wallet.starknet.response.ready", context, {
        userIdHash,
        walletMode: "server-managed",
        walletId: existingWallet.id,
        address: existingWallet.address,
        publicKeyPresent: Boolean(existingWallet.public_key || existingWallet.publicKey),
      });
      response.status(200).json({ wallet: formatWallet(existingWallet) });
      return;
    }

    logEvent("info", "wallet.starknet.create.start", context, {
      userIdHash,
      walletMode: "server-managed",
      chainType: STARKNET_CHAIN_TYPE,
      externalIdPresent: Boolean(externalId),
    });
    const wallet = await client.wallets().create({
      chain_type: STARKNET_CHAIN_TYPE,
      external_id: externalId,
      display_name: "VEIL Starknet Wallet",
      "privy-idempotency-key": stableIdempotencyKey("veil-starknet-wallet", auth.userId),
    });
    logEvent("info", "wallet.starknet.create.success", context, {
      userIdHash,
      walletMode: "server-managed",
      walletId: wallet.id,
      address: wallet.address,
      publicKeyPresent: Boolean(wallet.public_key || wallet.publicKey),
    });
    logEvent("info", "wallet.starknet.response.ready", context, {
      userIdHash,
      walletMode: "server-managed",
      walletId: wallet.id,
      address: wallet.address,
      publicKeyPresent: Boolean(wallet.public_key || wallet.publicKey),
    });
    response.status(200).json({
      wallet: formatWallet(wallet),
    });
  } catch (error) {
    sendError(response, context, error);
  }
}
