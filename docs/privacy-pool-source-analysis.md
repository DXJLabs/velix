# Privacy Pool Source Analysis

This note is based on the mainnet Cairo source shared by the team.

## Biggest Integration Finding

`ClientAction.InvokeExternal` alone is not enough.

The source enforces:

```text
assert(has_replay_protection, errors::NO_REPLAY_PROTECTION)
```

Replay protection is set only when a generated server action includes:

```text
ServerAction::WriteOnce
```

`InvokeExternal` compiles to:

```text
ServerAction::Invoke(InvokeInput { contract_address, calldata })
```

It does not create `WriteOnce`.

So a standalone VEIL message sent only as `InvokeExternal` likely fails `NO_REPLAY_PROTECTION`.

## Client Action Phase Ordering

The README confirms phase ordering:

| Phase | Action |
| --- | --- |
| 0 | `SetViewingKey` |
| 1 | `OpenChannel` |
| 2 | `OpenSubchannel` |
| 3 | `Deposit` |
| 4 | `UseNote` |
| 5 | `CreateEncNote` |
| 5 | `CreateOpenNote` |
| 6 | `Withdraw` |
| 7 | `InvokeExternal` |

`InvokeExternal` is the last phase and is allowed at most once per transaction.

This matters for VEIL: message metadata can be appended after privacy actions, but it cannot appear before them or multiple times in the same Privacy Pool transaction.

## Correct Mental Model

VEIL helper invocation must be part of a Privacy Pool action batch that also includes a WriteOnce-producing privacy action.

Examples of client actions that generate `WriteOnce`:

- `SetViewingKey`
- `OpenChannel`
- `OpenSubchannel`
- `CreateEncNote`
- `CreateOpenNote`
- `UseNote`

This means the final Privacy Pool flow is not:

```text
InvokeExternal only
```

It is:

```text
Privacy action with WriteOnce replay protection
+
InvokeExternal to VeilChannelHelper
```

## Confirmed Invoke Shape

Source path:

```text
ClientAction::InvokeExternal(input)
  -> invoke_external(input)
  -> ServerAction::Invoke(InvokeInput { contract_address, calldata })
  -> _apply_invoke(input)
  -> call contract_address with INVOKE_SELECTOR
```

The external helper must expose:

```text
invoke(calldata: Span<felt252>) -> Span<OpenNoteDeposit>
```

VEIL's `VeilChannelHelper.invoke` matches this shape and returns an empty deposit array for MVP.

The README also mentions `deposit_to_open_note`, which fills a pre-created open note and emits `OpenNoteDeposited`. VEIL does not need this for chat-only metadata, but payment/escrow settlement flows should account for it later.

## Proof Requirement

`apply_actions` runs:

```text
validate_proof(actions)
collect_fee()
_apply_actions(actions)
```

`validate_proof` checks proof facts and a message hash. This confirms production submission depends on Privacy Pool's proof flow. VEIL should not fake this in the SDK.

## Account Contract Behavior

The Privacy Pool contract is marked:

```text
#[starknet::contract(account)]
```

`__execute__`:

1. extracts `user_addr`, `user_private_key`, and `client_actions`
2. compiles client actions into server actions
3. validates the user signature
4. sends a message to the server/apply-actions path

The source also requires zero tip/resource price in validation.

## Channel Key Derivation

The source computes channel keys with:

```text
compute_channel_key(
  sender_addr,
  sender_private_key,
  recipient_addr,
  recipient_public_key
)
```

This confirms why VEIL must not invent ECDH behavior from ABI alone. The actual hash/encryption implementation lives in Privacy Pool source/utils and official SDK.

## Impact On VEIL

What remains correct:

- `VeilChannelHelper` is the right helper shape.
- Returning an empty `Span<OpenNoteDeposit>` is valid for message-only MVP.
- SDK transport boundaries are correct.
- Direct helper mode remains useful for testnet proof of onchain timeline events.

What changes for full Privacy Pool mode:

- `RealPrivacyPoolAdapter` must build a full Privacy Pool client action batch.
- Message-only `InvokeExternal` needs a replay-protection strategy.
- `InvokeExternal` must be placed at phase 7 and appear at most once.
- The easiest production-safe path is likely to attach VEIL messages to real privacy actions such as channel/subchannel/note usage until the official SDK clarifies the intended replay-protection pattern for metadata-only messages.

## Interview Explanation

The source confirms the extension point but also reveals an important constraint: Privacy Pool requires a `WriteOnce` replay-protection action in every client action batch. VEIL's helper invocation is compatible, but a standalone message-only Privacy Pool transaction is not enough. Our architecture keeps `DirectHelperTransport` for immediate testnet proof and isolates `RealPrivacyPoolAdapter` for the official Privacy Pool SDK/proof flow.
