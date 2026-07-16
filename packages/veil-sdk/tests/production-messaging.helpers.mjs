import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const sdk = await jiti.import("../src/index.ts");

function createFeeProvider({ amount = "10", collector = "0xfee" } = {}) {
  return {
    async callContract(call) {
      if (call.entrypoint === "get_fee_amount") return [amount];
      if (call.entrypoint === "get_fee_collector") return [collector];
      return [];
    },
  };
}

export { assert, createFeeProvider, sdk };
