const FELT_MODULUS = 2n ** 251n + 17n * 2n ** 192n + 1n;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function rpcConfig() {
  return {
    rpcUrl: env("STARKNET_RPC_URL", env("VITE_STARKNET_RPC_URL")),
    helperAddress: env("VEIL_CHANNEL_HELPER_ADDRESS", env("VITE_VEIL_CHANNEL_HELPER_ADDRESS")),
    fromBlock: Number(env("VEIL_INDEXER_FROM_BLOCK", "0")),
  };
}

function feltHash(value) {
  let hash = 1469598103934665603n;
  for (const byte of textEncoder.encode(value)) {
    hash ^= BigInt(byte);
    hash = (hash * 1099511628211n) % FELT_MODULUS;
  }
  return hash.toString();
}

function channelIdToFelt(channelId) {
  const trimmed = String(channelId || "").trim();
  if (!trimmed) return "";
  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) return BigInt(trimmed).toString();
  if (/^\d+$/.test(trimmed)) return BigInt(trimmed).toString();
  return feltHash(`veil:channel:${trimmed}`);
}

function normalizeFelt(value) {
  if (value === undefined || value === null) return "";
  return BigInt(value).toString();
}

function hexToBytes(hex) {
  const normalized = hex.length % 2 === 0 ? hex : `0${hex}`;
  return Uint8Array.from(normalized.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) || []);
}

function feltChunksToString(chunks) {
  const bytes = chunks.flatMap((chunk) => [...hexToBytes(BigInt(chunk).toString(16))]);
  return textDecoder.decode(Uint8Array.from(bytes));
}

function tryReadEnvelope(chunks) {
  if (!chunks?.length) return {};
  try {
    const envelope = JSON.parse(feltChunksToString(chunks));
    return {
      nonce: typeof envelope.nonce === "string" ? envelope.nonce : undefined,
      algorithm: typeof envelope.algorithm === "string" ? envelope.algorithm : undefined,
    };
  } catch {
    return {};
  }
}

async function rpc(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || `RPC ${method} failed.`);
  }
  return payload.result;
}

async function getHelperEvents(config) {
  const events = [];
  let continuationToken;

  do {
    const filter = {
      from_block: { block_number: config.fromBlock },
      to_block: "latest",
      address: config.helperAddress,
      chunk_size: 100,
      ...(continuationToken ? { continuation_token: continuationToken } : {}),
    };
    const result = await rpc(config.rpcUrl, "starknet_getEvents", [filter]);
    events.push(...(result.events || []));
    continuationToken = result.continuation_token;
  } while (continuationToken && events.length < 2_000);

  return events;
}

function parseEvents(events, channelFelt) {
  const timeline = new Map();
  const chunks = new Map();

  for (const event of events) {
    const keys = event.keys || [];
    const data = event.data || [];
    if (keys.length < 4 || normalizeFelt(keys[1]) !== channelFelt) continue;

    if (data.length >= 4) {
      const eventId = normalizeFelt(keys[3]);
      timeline.set(eventId, {
        eventId,
        channelId: channelFelt,
        eventType: Number(normalizeFelt(keys[2])),
        encryptedPayload: normalizeFelt(data[0]),
        payloadHash: normalizeFelt(data[1]),
        payloadChunkCount: Number(normalizeFelt(data[2])),
        timestamp: Number(normalizeFelt(data[3])) * 1000,
        transactionHash: event.transaction_hash,
        blockNumber: event.block_number,
      });
      continue;
    }

    if (data.length === 1) {
      const eventId = normalizeFelt(keys[2]);
      const chunkIndex = Number(normalizeFelt(keys[3]));
      const bucket = chunks.get(eventId) || [];
      bucket[chunkIndex] = normalizeFelt(data[0]);
      chunks.set(eventId, bucket);
    }
  }

  return [...timeline.values()]
    .map((item) => {
      const payloadChunks = chunks.get(item.eventId) || [];
      const envelope = tryReadEnvelope(payloadChunks);
      return {
        ...item,
        ...envelope,
        mode: "unshield",
        status: "confirmed",
        payloadChunks,
      };
    })
    .sort((first, second) => Number(first.eventId) - Number(second.eventId));
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  try {
    const channelId = request.query?.channelId || request.query?.channel_id;
    const channelFelt = channelIdToFelt(channelId);
    if (!channelFelt) {
      response.status(400).json({ error: "channelId is required." });
      return;
    }

    const config = rpcConfig();
    if (!config.rpcUrl || !config.helperAddress) {
      response.status(500).json({ error: "Indexer RPC or helper address is not configured." });
      return;
    }

    const events = await getHelperEvents(config);
    response.status(200).json({
      channelId: String(channelId),
      channelFelt,
      helperAddress: config.helperAddress,
      messages: parseEvents(events, channelFelt),
    });
  } catch (error) {
    response.status(500).json({ error: error.message || "Failed to index helper events." });
  }
}
