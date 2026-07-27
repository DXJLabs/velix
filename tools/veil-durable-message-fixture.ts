import {
  writeFile,
} from "node:fs/promises";

import type {
  ProofInvocation,
} from "@starkware-libs/starknet-privacy-sdk";

export const DURABLE_MESSAGE_FIXTURE_SCHEMA =
  "veil-real-message-proof-fixture-v1" as const;

const PRIVATE_FIELD =
  /(accountprivatekey|channelkey|channelsecret|decrypted|mnemonic|plaintext|privatekey|seedphrase|sharedsecret|viewingkey|viewingmaterial)/iu;

const NUMERIC_SENSITIVE_VALUE =
  /^(?:0x[0-9a-f]+|[0-9]+)$/iu;

const MIN_DISTINCTIVE_SENSITIVE_LENGTH =
  16;

const OFFICIAL_VIEWING_MATERIAL_PATH =
  "$.request.transaction.calldata[5]";

export interface DurableMessagePreparedInput {
  readonly messageLocator: string;
  readonly payloadCommitment: string;

  readonly applicationEnvelope: {
    readonly version: number;
    readonly salt: string;
    readonly nonce: string;
    readonly ciphertext: string;
  };
}

export interface DurableMessageProofFixture {
  readonly schemaVersion:
    typeof DURABLE_MESSAGE_FIXTURE_SCHEMA;

  readonly idempotencyKey:
    string;

  readonly authenticatedSubject:
    string;

  readonly request: {
    readonly canonical: {
      readonly messageReference:
        string;

      readonly requestId:
        string;

      readonly operation:
        "message";

      readonly keyDomain:
        "VEIL_MESSAGE_KEY_V1";

      readonly envelope: {
        readonly version:
          number;

        readonly algorithm:
          "A256GCM";

        readonly salt:
          string;

        readonly nonce:
          string;

        readonly ciphertext:
          string;
      };

      readonly messageLocator:
        string;

      readonly claimedCommitment:
        string;

      readonly applicationInvokes:
        readonly [
          {
            readonly contractAddress:
              string;

            readonly selector:
              "privacy_invoke";
          },
        ];
    };

    readonly blockId: {
      readonly block_number:
        number;
    };

    readonly transaction:
      ProofInvocation;
  };
}

export function createDurableMessageProofFixture(
  input: {
    readonly prepared:
      DurableMessagePreparedInput;

    readonly provingBlockId:
      number;

    readonly helperAddress:
      string;

    readonly invocation:
      ProofInvocation;

    readonly authenticatedSubject?:
      string;

    readonly sensitiveValues?:
      readonly string[];

    readonly allowedViewingMaterial?:
      readonly string[];
  },
): DurableMessageProofFixture {
  const locator =
    normalizeFelt(
      input.prepared
        .messageLocator,
      "messageLocator",
    );

  const commitment =
    normalizeFelt(
      input.prepared
        .payloadCommitment,
      "payloadCommitment",
    );

  const helperAddress =
    normalizeFelt(
      input.helperAddress,
      "helperAddress",
    );

  if (
    !Number.isSafeInteger(
      input.provingBlockId,
    )
    || input.provingBlockId < 0
  ) {
    throw new Error(
      "provingBlockId must be a non-negative safe integer.",
    );
  }

  const locatorToken =
    locator.slice(2);

  const fixture:
    DurableMessageProofFixture = {
      schemaVersion:
        DURABLE_MESSAGE_FIXTURE_SCHEMA,

      idempotencyKey:
        `github-message-${locatorToken}`,

      authenticatedSubject:
        input.authenticatedSubject
        ?? "github-actions-durable-message-e2e",

      request: {
        canonical: {
          messageReference:
            `message-${locatorToken}`,

          requestId:
            `request-${locatorToken}`,

          operation:
            "message",

          keyDomain:
            "VEIL_MESSAGE_KEY_V1",

          envelope: {
            version:
              input.prepared
                .applicationEnvelope
                .version,

            algorithm:
              "A256GCM",

            salt:
              input.prepared
                .applicationEnvelope
                .salt,

            nonce:
              input.prepared
                .applicationEnvelope
                .nonce,

            ciphertext:
              input.prepared
                .applicationEnvelope
                .ciphertext,
          },

          messageLocator:
            locator,

          claimedCommitment:
            commitment,

          applicationInvokes: [
            {
              contractAddress:
                helperAddress,

              selector:
                "privacy_invoke",
            },
          ],
        },

        blockId: {
          block_number:
            input.provingBlockId,
        },

        transaction:
          toJsonSafe(
            input.invocation,
          ) as ProofInvocation,
      },
    };

  assertDurableMessageProofFixtureSafe(
    fixture,
    input.sensitiveValues,
    input.allowedViewingMaterial,
  );

  return deepFreeze(
    fixture,
  );
}

export async function writeDurableMessageProofFixture(
  input: {
    readonly path:
      string;

    readonly fixture:
      DurableMessageProofFixture;

    readonly sensitiveValues?:
      readonly string[];

    readonly allowedViewingMaterial?:
      readonly string[];
  },
): Promise<void> {
  assertDurableMessageProofFixtureSafe(
    input.fixture,
    input.sensitiveValues,
    input.allowedViewingMaterial,
  );

  await writeFile(
    input.path,
    `${JSON.stringify(
      input.fixture,
      null,
      2,
    )}\n`,
    {
      encoding:
        "utf8",

      mode:
        0o600,
    },
  );
}

export function assertDurableMessageProofFixtureSafe(
  fixture:
    DurableMessageProofFixture,

  sensitiveValues:
    readonly string[] = [],

  allowedViewingMaterial:
    readonly string[] = [],
): void {
  const topLevelKeys =
    Object.keys(fixture);

  if (
    JSON.stringify(
      topLevelKeys,
    )
    !== JSON.stringify([
      "schemaVersion",
      "idempotencyKey",
      "authenticatedSubject",
      "request",
    ])
    || fixture.schemaVersion
      !== DURABLE_MESSAGE_FIXTURE_SCHEMA
    || !/^[A-Za-z0-9._~-]{16,200}$/u
      .test(
        fixture.idempotencyKey,
      )
    || fixture.authenticatedSubject
      .length < 1
    || fixture.authenticatedSubject
      .length > 512
  ) {
    throw new Error(
      "The durable message proof fixture schema is invalid.",
    );
  }

  rejectPrivateFieldNames(
    fixture,
  );

  const allowedViewingValues =
    new Set(
      allowedViewingMaterial
        .map(
          (value) =>
            value.trim(),
        )
        .filter(
          (value) =>
            isDistinctiveSensitiveValue(
              value,
            ),
        ),
    );

  for (
    const allowedViewingValue
    of allowedViewingValues
  ) {
    if (
      !sensitiveValues.some(
        (sensitive) =>
          sensitive.trim()
            === allowedViewingValue,
      )
    ) {
      throw new Error(
        "Allowed viewing material must also be classified as sensitive.",
      );
    }
  }

  for (
    const [
      sensitiveIndex,
      sensitive,
    ]
    of sensitiveValues.entries()
  ) {
    const normalized =
      sensitive.trim();

    if (
      !isDistinctiveSensitiveValue(
        normalized,
      )
    ) {
      continue;
    }

    const sensitiveMatches =
      findSensitiveValueMatches(
        fixture,
        normalized,
      );

    const disallowedMatch =
      sensitiveMatches.find(
        (match) =>
          !(
            allowedViewingValues
              .has(
                normalized,
              )
            && match.path
              === OFFICIAL_VIEWING_MATERIAL_PATH
            && match.exact
          ),
      );

    if (
      disallowedMatch !== undefined
    ) {
      throw new Error(
        `The durable message proof fixture contains sensitive material at ${disallowedMatch.path} (sensitive value #${sensitiveIndex + 1}).`,
      );
    }
  }
}

function rejectPrivateFieldNames(
  value: unknown,
  depth = 0,
): void {
  if (depth > 24) {
    throw new Error(
      "The durable message proof fixture exceeds the JSON depth limit.",
    );
  }

  if (
    value === null
    || typeof value
      !== "object"
  ) {
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      rejectPrivateFieldNames(
        entry,
        depth + 1,
      );
    }

    return;
  }

  for (
    const [
      key,
      entry,
    ]
    of Object.entries(
      value,
    )
  ) {
    const normalized =
      key.replace(
        /[^a-z0-9]/giu,
        "",
      );

    if (
      PRIVATE_FIELD.test(
        normalized,
      )
    ) {
      throw new Error(
        `Private field ${key} is forbidden in the durable message proof fixture.`,
      );
    }

    rejectPrivateFieldNames(
      entry,
      depth + 1,
    );
  }
}

function isDistinctiveSensitiveValue(
  value: string,
): boolean {
  if (!value) {
    return false;
  }

  const significant =
    NUMERIC_SENSITIVE_VALUE.test(
      value,
    )
      ? value
        .replace(
          /^0x/iu,
          "",
        )
        .replace(
          /^0+/u,
          "",
        )
      : value;

  return significant.length
    >= MIN_DISTINCTIVE_SENSITIVE_LENGTH;
}

interface SensitiveValueMatch {
  readonly path:
    string;

  readonly exact:
    boolean;
}

function findSensitiveValueMatches(
  value: unknown,
  sensitive: string,
  path = "$",
  depth = 0,
): SensitiveValueMatch[] {
  if (depth > 24) {
    throw new Error(
      "The durable message proof fixture exceeds the JSON depth limit.",
    );
  }

  if (typeof value === "string") {
    if (value === sensitive) {
      return [
        {
          path,
          exact:
            true,
        },
      ];
    }

    return value.includes(
      sensitive,
    )
      ? [
          {
            path,
            exact:
              false,
          },
        ]
      : [];
  }

  if (
    value === null
    || typeof value
      !== "object"
  ) {
    return [];
  }

  const matches:
    SensitiveValueMatch[] = [];

  if (Array.isArray(value)) {
    for (
      let index = 0;
      index < value.length;
      index += 1
    ) {
      matches.push(
        ...findSensitiveValueMatches(
          value[index],
          sensitive,
          `${path}[${index}]`,
          depth + 1,
        ),
      );
    }

    return matches;
  }

  for (
    const [
      key,
      entry,
    ]
    of Object.entries(
      value,
    )
  ) {
    matches.push(
      ...findSensitiveValueMatches(
        entry,
        sensitive,
        `${path}.${key}`,
        depth + 1,
      ),
    );
  }

  return matches;
}

function normalizeFelt(
  value: string,
  label: string,
): string {
  let parsed: bigint;

  try {
    parsed =
      BigInt(value);
  } catch {
    throw new Error(
      `${label} must be a Starknet felt.`,
    );
  }

  if (
    parsed <= 0n
    || parsed >= (1n << 251n)
  ) {
    throw new Error(
      `${label} must be a nonzero Starknet felt.`,
    );
  }

  return `0x${parsed.toString(16)}`;
}

function toJsonSafe(
  value: unknown,
): unknown {
  if (
    typeof value
      === "bigint"
  ) {
    return `0x${value.toString(16)}`;
  }

  if (
    value === null
    || typeof value
      !== "object"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(
      toJsonSafe,
    );
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(
        ([
          key,
          entry,
        ]) => [
          key,
          toJsonSafe(
            entry,
          ),
        ],
      ),
  );
}

function deepFreeze<T>(
  value: T,
): T {
  if (
    value !== null
    && typeof value
      === "object"
  ) {
    for (
      const entry
      of Object.values(
        value,
      )
    ) {
      deepFreeze(entry);
    }

    Object.freeze(value);
  }

  return value;
}
