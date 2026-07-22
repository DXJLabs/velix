import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

import { MAX_VIEWING_KEY } from "@starkware-libs/starknet-privacy-sdk";

export type SecureRandomBytes = (size: number) => Uint8Array;

export function generateVeilViewingKey(
  secureRandomBytes: SecureRandomBytes = randomBytes,
): bigint {
  for (;;) {
    const bytes = secureRandomBytes(32);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 32) {
      throw new Error("Secure random source must return exactly 32 bytes.");
    }
    const candidate = BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
    if (candidate >= 1n && candidate <= MAX_VIEWING_KEY) return candidate;
  }
}

function isMainModule(): boolean {
  const invokedPath = process.argv[1];
  return invokedPath !== undefined
    && pathToFileURL(invokedPath).href === import.meta.url;
}

if (isMainModule()) {
  const viewingKey = generateVeilViewingKey();
  console.error(
    "WARNING: Store this value immediately as the VEIL_POC_VIEWING_KEY GitHub Secret. Do not share it or commit it.",
  );
  console.log(`0x${viewingKey.toString(16)}`);
}
