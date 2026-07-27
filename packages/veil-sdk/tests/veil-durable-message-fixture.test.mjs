import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import {
  tmpdir,
} from "node:os";
import {
  join,
} from "node:path";
import test from "node:test";

import {
  assertDurableMessageProofFixtureSafe,
  createDurableMessageProofFixture,
  writeDurableMessageProofFixture,
} from "../../../tools/veil-durable-message-fixture.ts";

const INVOCATION = {
  type:
    "INVOKE",

  version:
    "0x3",

  sender_address:
    "0x123",

  calldata: [
    "0x1",
    "0x2",
  ],

  signature: [
    "0x3",
    "0x4",
  ],

  nonce:
    "0x5",

  resource_bounds: {
    l1_gas: {
      max_amount:
        "0x6",

      max_price_per_unit:
        "0x0",
    },

    l2_gas: {
      max_amount:
        "0x7",

      max_price_per_unit:
        "0x0",
    },

    l1_data_gas: {
      max_amount:
        "0x8",

      max_price_per_unit:
        "0x0",
    },
  },

  tip:
    "0x0",

  paymaster_data: [],
  account_deployment_data: [],

  nonce_data_availability_mode:
    "L1",

  fee_data_availability_mode:
    "L1",
};

function createFixture(
  sensitiveValues = [],
) {
  return createDurableMessageProofFixture({
    prepared: {
      messageLocator:
        "0x77",

      payloadCommitment:
        "0x88",

      applicationEnvelope: {
        version:
          1,

        salt:
          "safe-salt",

        nonce:
          "safe-nonce",

        ciphertext:
          "safe-ciphertext",
      },
    },

    provingBlockId:
      123,

    helperAddress:
      "0x99",

    invocation:
      INVOCATION,

    sensitiveValues,
  });
}

test(
  "durable message fixture contains only the public proving request boundary",
  () => {
    const fixture =
      createFixture();

    assert.equal(
      fixture.schemaVersion,
      "veil-real-message-proof-fixture-v1",
    );

    assert.equal(
      fixture.request
        .canonical
        .operation,
      "message",
    );

    assert.equal(
      fixture.request
        .canonical
        .applicationInvokes[0]
        .selector,
      "privacy_invoke",
    );

    assert.deepEqual(
      fixture.request
        .transaction,
      INVOCATION,
    );

    assert.doesNotThrow(
      () =>
        assertDurableMessageProofFixtureSafe(
          fixture,
        ),
    );
  },
);

test(
  "short numeric secrets do not collide with public Invoke V3 constants",
  () => {
    assert.doesNotThrow(
      () =>
        createFixture([
          "0x1",
          "1",
          "0x3",
          "3",
        ]),
    );
  },
);

test(
  "durable message fixture rejects exact sensitive material",
  () => {
    assert.throws(
      () =>
        createDurableMessageProofFixture({
          prepared: {
            messageLocator:
              "0x77",

            payloadCommitment:
              "0x88",

            applicationEnvelope: {
              version:
                1,

              salt:
                "safe-salt",

              nonce:
                "safe-nonce",

              ciphertext:
                "private-material",
            },
          },

          provingBlockId:
            123,

          helperAddress:
            "0x99",

          invocation:
            INVOCATION,

          sensitiveValues: [
            "private-material",
          ],
        }),

      /contains sensitive material/u,
    );
  },
);

test(
  "durable message fixture still rejects distinctive embedded secrets",
  () => {
    const distinctiveSecret =
      "distinctive-private-material-1234567890";

    assert.throws(
      () =>
        createDurableMessageProofFixture({
          prepared: {
            messageLocator:
              "0x77",

            payloadCommitment:
              "0x88",

            applicationEnvelope: {
              version:
                1,

              salt:
                "safe-salt",

              nonce:
                "safe-nonce",

              ciphertext:
                `prefix-${distinctiveSecret}-suffix`,
            },
          },

          provingBlockId:
            123,

          helperAddress:
            "0x99",

          invocation:
            INVOCATION,

          sensitiveValues: [
            distinctiveSecret,
          ],
        }),

      /contains sensitive material/u,
    );
  },
);

test(
  "durable message fixture is written with the exact schema",
  async () => {
    const directory =
      await mkdtemp(
        join(
          tmpdir(),
          "veil-durable-fixture-",
        ),
      );

    const path =
      join(
        directory,
        "fixture.json",
      );

    try {
      const fixture =
        createFixture();

      await writeDurableMessageProofFixture({
        path,
        fixture,
      });

      const stored =
        JSON.parse(
          await readFile(
            path,
            "utf8",
          ),
        );

      assert.deepEqual(
        stored,
        fixture,
      );
    } finally {
      await rm(
        directory,
        {
          recursive:
            true,

          force:
            true,
        },
      );
    }
  },
);
