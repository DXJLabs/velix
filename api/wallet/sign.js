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
    const { walletId, hash } = request.body || {};
    if (!walletId || !hash) {
      response.status(400).json({ error: "walletId and hash are required." });
      return;
    }

    const result = await createPrivyClient().wallets().rawSign(walletId, {
      params: { hash },
    });
    const signature = typeof result === "string"
      ? result
      : result.signature || result.rawSignature || result.raw_signature || result;

    response.status(200).json({ signature });
  } catch (error) {
    response.status(500).json({ error: error.message || "Failed to sign Starknet hash." });
  }
}
