import assert from "node:assert/strict";
import test from "node:test";

import {
  createReadyPrivateTransfersUser,
  hasReadyProofSigner,
} from "../dist/privacy/ready-proof-signer.js";
import { VeilPrivacyError } from "../dist/privacy/errors.js";

test("Ready adapter returns the exact signer object required by RC.2", async () => {
  const callsSeen = [];
  const detailsSeen = [];
  const signer = {
    async signTransaction(calls, details) {
      callsSeen.push(calls);
      detailsSeen.push(details);
      return ["0x1", "0x2"];
    },
  };

  const user = createReadyPrivateTransfersUser({
    address: "0x0469",
    signer,
  });

  assert.equal(user.address, "0x469");
  assert.equal(user.signer, signer);
  assert.equal(hasReadyProofSigner({ address: "0x469", signer }), true);

  const signature = await user.signer.signTransaction(
    [{ contractAddress: "0x1", entrypoint: "compile_actions", calldata: [] }],
    { walletAddress: "0x1", cairoVersion: "1" },
  );

  assert.deepEqual(signature, ["0x1", "0x2"]);
  assert.equal(callsSeen.length, 1);
  assert.equal(detailsSeen.length, 1);
});

test("Ready adapter fails closed without signTransaction", () => {
  assert.equal(hasReadyProofSigner({ address: "0x469", signer: {} }), false);

  assert.throws(
    () => createReadyPrivateTransfersUser({ address: "0x469", signer: {} }),
    (error) => error instanceof VeilPrivacyError
      && error.code === "PRIVACY_WALLET_UNSUPPORTED"
      && error.details.requiredMethod === "signTransaction",
  );
});

test("Ready adapter rejects missing and invalid addresses", () => {
  assert.throws(
    () => createReadyPrivateTransfersUser({
      signer: { signTransaction: async () => [] },
    }),
    (error) => error instanceof VeilPrivacyError
      && error.code === "WALLET_NOT_CONNECTED",
  );

  for (const address of [
    "0x0",
    "-1",
    `0x${(1n << 251n).toString(16)}`,
    "not-an-address",
  ]) {
    assert.throws(
      () => createReadyPrivateTransfersUser({
        address,
        signer: { signTransaction: async () => [] },
      }),
      (error) => error instanceof VeilPrivacyError
        && error.code === "WALLET_NOT_CONNECTED",
    );
  }
});
