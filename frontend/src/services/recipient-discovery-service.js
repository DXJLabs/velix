import {
  isStarknetAddress,
  isStarknetFelt,
  normalizeStarknetChainId,
} from "../../../config/veil-sepolia.js";

export function normalizeRecipientAddress(value) {
  const text = String(value || "").trim();
  if (!isStarknetAddress(text)) return "";
  return `0x${BigInt(text).toString(16)}`;
}

export function normalizeStarkName(value) {
  const text = String(value || "").trim().toLowerCase();
  return text.endsWith(".stark") && !/\s/u.test(text) ? text : "";
}

export function createRecipientDiscoveryService({
  getProvider,
  privacyPoolAddress,
  expectedChainId = "SN_SEPOLIA",
  now = () => Date.now(),
  cacheTtlMs = 60_000,
} = {}) {
  if (typeof getProvider !== "function") {
    throw new TypeError("Recipient discovery requires a Starknet provider factory.");
  }
  const poolAddress = normalizeRecipientAddress(privacyPoolAddress);
  if (!poolAddress) {
    throw new TypeError("Recipient discovery requires the verified VEIL Privacy Pool address.");
  }

  const cache = new Map();
  let verifiedProvider;
  let verification;

  async function provider() {
    if (verifiedProvider) return verifiedProvider;
    if (!verification) {
      verification = (async () => {
        const next = await getProvider();
        if (!next?.getChainId) throw new Error("Starknet provider cannot report its chain.");
        const actual = normalizeStarknetChainId(await next.getChainId());
        const expected = normalizeStarknetChainId(expectedChainId);
        if (actual !== expected) throw new Error(`Expected ${expected}, received ${actual || "unknown"}.`);
        verifiedProvider = next;
        return next;
      })().catch((error) => {
        verification = undefined;
        throw error;
      });
    }
    return verification;
  }

  async function resolve(input) {
    const query = String(input || "").trim();
    const starkName = normalizeStarkName(query);
    const directAddress = normalizeRecipientAddress(query);
    if (!starkName && !directAddress) {
      return freeze({ status: "invalid", query, address: "", starkName: "", reverseName: "", reverseVerified: false, source: "input", privacyPoolStatus: "not_checked" });
    }

    const key = starkName || directAddress;
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now()) return hit.promise;

    const promise = resolveFresh({ query, starkName, directAddress }).catch(() =>
      freeze({ status: "unavailable", query, address: "", starkName, reverseName: "", reverseVerified: false, source: starkName ? "starknet-id" : "wallet", privacyPoolStatus: "not_checked" })
    );
    cache.set(key, { expiresAt: now() + cacheTtlMs, promise });
    return promise;
  }

  async function resolveFresh({ query, starkName, directAddress }) {
    const rpc = await provider();
    let identity;

    if (directAddress) {
      const reverseName = await reverse(rpc, directAddress);
      identity = {
        status: "resolved",
        query,
        address: directAddress,
        starkName: reverseName,
        reverseName,
        reverseVerified: Boolean(reverseName),
        source: "wallet",
      };
    } else {
      if (!rpc.getAddressFromStarkName) throw new Error("Starknet ID resolver unavailable.");
      const address = normalizeRecipientAddress(await rpc.getAddressFromStarkName(starkName));
      if (!address) {
        return freeze({ status: "not_found", query, address: "", starkName, reverseName: "", reverseVerified: false, source: "starknet-id", privacyPoolStatus: "not_checked" });
      }
      const reverseName = await reverse(rpc, address);
      identity = {
        status: "resolved",
        query,
        address,
        starkName,
        reverseName,
        reverseVerified: reverseName === starkName,
        source: "starknet-id",
      };
    }

    return freeze({
      ...identity,
      privacyPoolStatus: await resolvePoolStatus(rpc, identity.address),
    });
  }

  async function resolvePoolStatus(rpc, accountAddress) {
    if (typeof rpc.callContract !== "function") return "unavailable";
    try {
      const response = await rpc.callContract({
        contractAddress: poolAddress,
        entrypoint: "get_public_key",
        calldata: [accountAddress],
      }, "latest");
      const values = Array.isArray(response) ? response : response?.result;
      if (!Array.isArray(values) || values.length !== 1) throw new Error("Invalid pool response.");
      return parseFelt(values[0]) === 0n ? "not_registered" : "registered";
    } catch {
      return "unavailable";
    }
  }

  function clearCache() {
    cache.clear();
    verifiedProvider = undefined;
    verification = undefined;
  }

  return Object.freeze({ clearCache, resolve });
}

async function reverse(provider, address) {
  if (!provider.getStarkName) return "";
  try {
    return normalizeStarkName(await provider.getStarkName(address));
  } catch {
    return "";
  }
}

function parseFelt(value) {
  const text = String(value ?? "").trim();
  if (!/^(?:0x[0-9a-fA-F]+|[0-9]+)$/u.test(text)) throw new Error("Not a felt.");
  const parsed = BigInt(text);
  if (!isStarknetFelt(`0x${parsed.toString(16)}`)) throw new Error("Felt out of range.");
  return parsed;
}

function freeze(value) {
  return Object.freeze(value);
}
