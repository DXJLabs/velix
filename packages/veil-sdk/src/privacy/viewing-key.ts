import { MAX_VIEWING_KEY } from "@starkware-libs/starknet-privacy-sdk";
import { VeilPrivacyError } from "./errors.js";

export { MAX_VIEWING_KEY as OFFICIAL_MAX_VIEWING_KEY };

export function assertViewingKey(value: unknown): asserts value is bigint {
  if (typeof value !== "bigint") {
    throw new VeilPrivacyError(
      value === undefined || value === null ? "VIEWING_KEY_UNAVAILABLE" : "INVALID_VIEWING_KEY",
      "Viewing keys must be provided as bigint values.",
    );
  }
  if (value < 1n || value > MAX_VIEWING_KEY) {
    throw new VeilPrivacyError(
      "INVALID_VIEWING_KEY",
      `Viewing key must be in the official SDK range [1, ${MAX_VIEWING_KEY.toString()}].`,
    );
  }
}

export function createLocalViewingKeyProvider(getViewingKey: () => Promise<unknown> | unknown) {
  return {
    async getViewingKey(): Promise<bigint> {
      const value = await getViewingKey();
      assertViewingKey(value);
      return value;
    },
  };
}
