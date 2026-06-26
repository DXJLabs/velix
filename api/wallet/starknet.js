import { PrivyClient } from "@privy-io/node";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function createPrivyClient() {
  return new PrivyClient({
    appId: requireEnv("PRIVY_APP_ID"),
    appSecret: requireEnv("PRIVY_APP_SECRET"),
  });
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  try {
    const { userId } = request.body || {};
    const wallet = await createPrivyClient().wallets().create({
      chain_type: "starknet",
      ...(userId ? { user_id: userId } : {}),
    });

    response.status(200).json({
      wallet: {
        id: wallet.id,
        address: wallet.address,
        publicKey: wallet.public_key || wallet.publicKey,
      },
    });
  } catch (error) {
    response.status(500).json({ error: error.message || "Failed to create Starknet wallet." });
  }
}
