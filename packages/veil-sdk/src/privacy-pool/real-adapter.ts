import {
  buildPrivacyPoolChannelActions,
  createEncNoteAction,
  invokeExternalAction,
} from "../privacy_pool_actions";
import { createPreparedActionResult } from "./shared";
import type {
  PrivacyPoolAdapter,
  PrivacyPoolAdapterActionResult,
  PrivacyPoolCreateEncryptedNoteInput,
  PrivacyPoolInvokeExternalCalldataInput,
  PrivacyPoolOpenChannelInput,
  PrivacyPoolOpenSubchannelInput,
} from "../types";

// VEIL IMPLEMENTATION NOTE:
// RealPrivacyPoolAdapter is a deliberate placeholder. Once the Starknet Privacy
// SDK is wired, this class becomes the only place where protocol action/proof
// construction should be implemented. AVNU remains only the paymaster path.
export class RealPrivacyPoolAdapter implements PrivacyPoolAdapter {
  readonly mode = "real";

  async openChannel(input: PrivacyPoolOpenChannelInput): Promise<PrivacyPoolAdapterActionResult> {
    return createPreparedActionResult(
      this.mode,
      "OpenChannel",
      buildPrivacyPoolChannelActions({
        openChannel: {
          recipientAddress: input.recipientAddress,
          index: input.index,
          random: input.random,
          salt: input.salt,
        },
      }),
      ["Prepared official Privacy Pool OpenChannel ClientAction. Submission still requires Starknet Privacy SDK proof generation."],
    );
  }

  async openSubchannel(input: PrivacyPoolOpenSubchannelInput): Promise<PrivacyPoolAdapterActionResult> {
    return createPreparedActionResult(
      this.mode,
      "OpenSubchannel",
      buildPrivacyPoolChannelActions({
        openSubchannel: {
          recipientAddress: input.recipientAddress,
          recipientPublicKey: input.recipientPublicKey,
          channelKey: input.channelKey,
          index: input.index,
          token: input.token,
          salt: input.salt,
        },
      }),
      ["Prepared official Privacy Pool OpenSubchannel ClientAction. Submission still requires Starknet Privacy SDK proof generation."],
    );
  }

  async createEncryptedNote(input: PrivacyPoolCreateEncryptedNoteInput): Promise<PrivacyPoolAdapterActionResult> {
    return createPreparedActionResult(
      this.mode,
      "CreateEncNote",
      [
        createEncNoteAction({
          recipientAddress: input.recipientAddress,
          recipientPublicKey: input.recipientPublicKey,
          token: input.token,
          amount: input.amount,
          index: input.index,
          salt: input.salt,
        }),
      ],
      ["Prepared official Privacy Pool CreateEncNote ClientAction. Submission still requires Starknet Privacy SDK proof generation."],
    );
  }

  async prepareInvokeExternal(input: PrivacyPoolInvokeExternalCalldataInput): Promise<PrivacyPoolAdapterActionResult> {
    return createPreparedActionResult(
      this.mode,
      "InvokeExternal",
      [
        invokeExternalAction({
          contractAddress: input.contractAddress,
          calldata: input.calldata,
        }),
      ],
      [
        "Prepared official Privacy Pool InvokeExternal ClientAction.",
        "InvokeExternal alone does not provide replay protection; combine it with a WriteOnce-producing action in the Starknet Privacy SDK proof flow.",
      ],
    );
  }
}
