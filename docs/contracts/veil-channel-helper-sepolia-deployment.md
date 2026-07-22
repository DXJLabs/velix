# VeilChannelHelper Sepolia Deployment

The `Deploy VeilChannelHelper to Starknet Sepolia` workflow builds and tests the
current Cairo source before it can declare or deploy anything. It is separate
from the Privacy Pool prover workflow because contract deployment does not need
the transaction prover.

## Running the workflow

Open **Actions → Build, Test, and Deploy VeilChannelHelper to Starknet Sepolia →
Run workflow** and choose one value for `deploy_contract`:

- `false` (default): runs `scarb build`, `snforge test`, deployment-script
  typechecking and tests, then validates the generated Sierra/CASM artifacts and
  their locally computed class hashes. No Starknet transaction is submitted.
- `true`: performs the same validation, then uses the configured Sepolia account
  to declare the current class when necessary and deploy one new helper instance.

The deployment path requires these repository secrets:

- `VEIL_POC_ACCOUNT_ADDRESS`
- `VEIL_POC_ACCOUNT_PRIVATE_KEY`
- `STARKNET_SEPOLIA_RPC_URL`

The current contract has one constructor argument, `privacy_pool`. The script
supplies the canonical Sepolia Privacy Pool address used by the register PoC;
there is no user-provided constructor payload.

Secret values, signatures, constructor calldata, and RPC credentials are not
written to the deployment summary or printed by the deployment script.

## Successful result

A successful deployment produces
`veil-channel-helper-deployment-summary.json` with result
`VEIL_CHANNEL_HELPER_DEPLOYED_ON_SEPOLIA`. The workflow accepts the result only
when the deploy receipt is `ACCEPTED_ON_L2` and `SUCCEEDED`, then independently
checks that `getClassHashAt` for the deployed address matches the locally built
class hash. A class that was already declared is valid and is represented by a
`null` `declareTransactionHash`.

## Privacy boundary

Deploying `VeilChannelHelper` is **not evidence that shielded messaging is
complete**. The helper is only an application target for Privacy Pool
`InvokeExternal` / `privacy_invoke` calls.

Plaintext message content, sender/recipient identity, or other private message
metadata must never be placed in contract calldata or emitted in events. The
next stage must test a real shielded-message action through the Privacy SDK and
verify the resulting encrypted helper state separately.
