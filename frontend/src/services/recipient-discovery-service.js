import {
  isStarknetAddress,
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
  expectedChainId = "SN_SEPOLIA",
  now = () => Date.now(),
  cacheTtlMs = 60_000,
} = {}) {
  if (typeof getProvider !== "function") {
    throw new TypeError("Recipient discovery requires a Starknet provider factory.");
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
      return Object.freeze({ status: "invalid", query, address: "", starkName: "", reverseName: "", reverseVerified: false, source: "input" });
    }

    const key = starkName || directAddress;
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now()) return hit.promise;

    const promise = resolveFresh({ query, starkName, directAddress }).catch(() =>
      Object.freeze({ status: "unavailable", query, address: "", starkName, reverseName: "", reverseVerified: false, source: starkName ? "starknet-id" : "wallet" })
    );
    cache.set(key, { expiresAt: now() + cacheTtlMs, promise });
    return promise;
  }

  async function resolveFresh({ query, starkName, directAddress }) {
    const rpc = await provider();
    if (directAddress) {
      const reverseName = await reverse(rpc, directAddress);
      return Object.freeze({ status: "resolved", query, address: directAddress, starkName: reverseName, reverseName, reverseVerified: Boolean(reverseName), source: "wallet" });
    }

    if (!rpc.getAddressFromStarkName) throw new Error("Starknet ID resolver unavailable.");
    const address = normalizeRecipientAddress(await rpc.getAddressFromStarkName(starkName));
    if (!address) {
      return Object.freeze({ status: "not_found", query, address: "", starkName, reverseName: "", reverseVerified: false, source: "starknet-id" });
    }
    const reverseName = await reverse(rpc, address);
    return Object.freeze({ status: "resolved", query, address, starkName, reverseName, reverseVerified: reverseName === starkName, source: "starknet-id" });
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
