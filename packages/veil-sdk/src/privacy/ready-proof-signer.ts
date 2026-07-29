import type { BigNumberish, SignerInterface } from "starknet";
import type { PrivateTransfersUser } from "@starkware-libs/starknet-privacy-sdk";
import { VeilPrivacyError } from "./errors.js";

const STARKNET_ADDRESS_LIMIT = 1n << 251n;

export interface ReadyProofSignerAccount {
  address?: BigNumberish;
  signer?: Partial<SignerInterface> | null;
}

export function hasReadyProofSigner(
  account: ReadyProofSignerAccount | null | undefined,
): boolean {
  return typeof account?.signer?.signTransaction === "function";
}

export function createReadyPrivateTransfersUser(
  account: ReadyProofSignerAccount | null | undefined,
): PrivateTransfersUser {
  if (!account?.address) {
    throw new VeilPrivacyError(
      "WALLET_NOT_CONNECTED",
      "Ready Wallet did not expose an account address.",
    );
  }

  const address = normalizeReadyAccountAddress(account.address);
  if (!hasReadyProofSigner(account)) {
    throw new VeilPrivacyError(
      "PRIVACY_WALLET_UNSUPPORTED",
      "Ready Wallet did not expose signer.signTransaction required by the official Privacy SDK.",
      {
        details: {
          requiredMethod: "signTransaction",
          wallet: "Ready",
        },
      },
    );
  }

  return {
    address,
    signer: account.signer as SignerInterface,
  };
}

function normalizeReadyAccountAddress(value: BigNumberish): string {
  let parsed: bigint;
  try {
    parsed = BigInt(String(value).trim());
  } catch (cause) {
    throw new VeilPrivacyError(
      "WALLET_NOT_CONNECTED",
      "Ready Wallet returned an invalid Starknet account address.",
      { cause },
    );
  }

  if (parsed <= 0n || parsed >= STARKNET_ADDRESS_LIMIT) {
    throw new VeilPrivacyError(
      "WALLET_NOT_CONNECTED",
      "Ready Wallet returned an out-of-range Starknet account address.",
    );
  }

  return `0x${parsed.toString(16)}`;
}
