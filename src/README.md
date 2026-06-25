# VEIL Smart Contracts

This folder contains the Cairo contracts used by the VEIL testnet proof.

VEIL is not a DEX, not a wallet, and not a Privacy Pool replacement. VEIL is a channel-based private negotiation and escrow workflow layer.

The smart contract proof should show the full product story:

```text
Alice and Bob open a channel
-> chat
-> negotiate offer / counter offer
-> accept
-> create escrow
-> buyer deposit confirmed
-> seller deposit confirmed
-> activate escrow
-> settle
```

For the current Sepolia demo, chat and negotiation events are written to `VeilChannelHelper`. Escrow workflow is written to `VeilEscrow`.

## Contracts

| Contract | File | Purpose |
| --- | --- | --- |
| `VeilChannelHelper` | `src/veil_channel_helper.cairo` | Stores encrypted channel timeline events: chat, payment memo, offer, counter offer, escrow status, proof references. |
| `VeilEscrow` | `src/veil_escrow.cairo` | Protocol-agnostic escrow state machine for settlement workflow. It stores references and emits reconstructable timeline events. |

Supporting modules:

| File | Purpose |
| --- | --- |
| `src/escrow_types.cairo` | Escrow data types and status enum. |
| `src/escrow_events.cairo` | Escrow events used by the frontend timeline. |
| `src/escrow_interfaces.cairo` | Escrow and future settlement adapter interfaces. |
| `src/escrow_validation.cairo` | Escrow authorization and state transition validation. |
| `src/lib.cairo` | Cairo module exports. |

## What Is Proven On Testnet

The current testnet proof demonstrates:

- channel timeline events are written onchain
- chat is treated as a first-class onchain timeline event
- offers and counter offers are part of the same channel feed
- escrow is created after negotiation
- both parties confirm deposits
- escrow activates only after both confirmations
- escrow settles only after activation
- events can reconstruct the product flow in a frontend or explorer

This is intentionally not claiming full Privacy Pool anonymity yet. The official STRK20 Privacy Pool SDK is still private. VEIL already matches the helper interface pattern by exposing `privacy_invoke`, so the future Privacy Pool path can call the helper through `InvokeExternal`.

## Channel Timeline Event Types

`VeilChannelHelper` stores every item as a channel event.

| Type | Constant | Meaning |
| --- | --- | --- |
| `1` | `EVENT_CHAT` | Encrypted chat message. |
| `2` | `EVENT_PAYMENT_MEMO` | Encrypted payment memo. |
| `3` | `EVENT_OFFER` | Offer created. |
| `4` | `EVENT_COUNTER_OFFER` | Counter offer created. |
| `5` | `EVENT_ACCEPT_OFFER` | Offer accepted. |
| `6` | `EVENT_REJECT_OFFER` | Offer rejected. |
| `7` | `EVENT_ESCROW_CREATED` | Escrow created marker. |
| `8` | `EVENT_ESCROW_DEPOSITED` | Deposit confirmation marker. |
| `9` | `EVENT_ESCROW_SETTLED` | Escrow settled marker. |
| `10` | `EVENT_ESCROW_CANCELLED` | Escrow cancelled marker. |
| `11` | `EVENT_PROOF_ATTACHED` | Proof reference attached. |

The helper stores only felt references:

```text
channel_id
event_type
encrypted_payload
payload_hash
```

For the demo, `encrypted_payload` and `payload_hash` can be dummy non-zero felts. In production, these point to encrypted payload storage or an indexer.

## Privacy Pool Compatibility

Privacy Pool-compatible helpers such as Vesu and Ekubo expose:

```text
privacy_invoke(...) -> Span<OpenNoteDeposit>
```

VEIL follows the same pattern:

```text
privacy_invoke(calldata: Span<felt252>) -> Span<OpenNoteDeposit>
```

For chat and negotiation metadata, VEIL returns an empty deposit array:

```text
[]
```

That is correct because chat, offer, memo, and proof metadata do not move funds. Future settlement helpers may return real `OpenNoteDeposit` values.

`invoke(...)` remains available as a legacy/direct-call alias, but `privacy_invoke(...)` is the entrypoint to use for the Privacy Pool helper pattern.

## Build And Test

Run from WSL:

```bash
cd /mnt/c/Users/frend/Veilc
scarb build
scarb test
```

Expected test coverage:

- `VeilChannelHelper`: stores chat, memo, offer events, rejects invalid input, preserves order and channel isolation.
- `VeilEscrow`: create, deposit confirmations, activate, settle, cancel, unauthorized calls, invalid state transitions.

## Sepolia Proof Demo

Use two funded Sepolia accounts:

- `ALICE_ACCOUNT`: buyer
- `BOB_ACCOUNT`: seller
- `BOB_ADDRESS`: seller address

Use one channel id for the whole story:

```bash
export CHANNEL_ID=12345
```

### 1. Build

```bash
cd /mnt/c/Users/frend/Veilc
scarb --profile release build
```

### 2. Declare And Deploy `VeilChannelHelper`

```bash
sncast --account ALICE_ACCOUNT declare \
  --contract-name VeilChannelHelper \
  --network sepolia \
  --wait
```

Use the printed class hash:

```bash
sncast --account ALICE_ACCOUNT deploy \
  --class-hash <CHANNEL_HELPER_CLASS_HASH> \
  --network sepolia \
  --wait
```

Save the deployed address:

```bash
export HELPER=<VEIL_CHANNEL_HELPER_ADDRESS>
```

### 3. Declare And Deploy `VeilEscrow`

```bash
sncast --account ALICE_ACCOUNT declare \
  --contract-name VeilEscrow \
  --network sepolia \
  --wait
```

Use the printed class hash:

```bash
sncast --account ALICE_ACCOUNT deploy \
  --class-hash <VEIL_ESCROW_CLASS_HASH> \
  --network sepolia \
  --wait
```

Save the deployed address:

```bash
export ESCROW=<VEIL_ESCROW_ADDRESS>
```

## A/B Channel Proof Flow

Every `privacy_invoke` call below uses a `Span<felt252>`, so raw calldata is:

```text
4 <channel_id> <event_type> <encrypted_payload> <payload_hash>
```

### 1. Alice Sends Chat

```bash
sncast --account ALICE_ACCOUNT invoke \
  --contract-address $HELPER \
  --function privacy_invoke \
  --calldata 4 $CHANNEL_ID 1 100001 900001 \
  --network sepolia \
  --wait
```

Meaning:

```text
Alice: "Can you do 500 STRK?"
EVENT_CHAT
```

### 2. Bob Creates Offer

```bash
sncast --account BOB_ACCOUNT invoke \
  --contract-address $HELPER \
  --function privacy_invoke \
  --calldata 4 $CHANNEL_ID 3 100002 900002 \
  --network sepolia \
  --wait
```

Meaning:

```text
OFFER_CREATED: 500 STRK
```

### 3. Alice Sends Counter Offer

```bash
sncast --account ALICE_ACCOUNT invoke \
  --contract-address $HELPER \
  --function privacy_invoke \
  --calldata 4 $CHANNEL_ID 4 100003 900003 \
  --network sepolia \
  --wait
```

Meaning:

```text
COUNTER_OFFER: 450 STRK
```

### 4. Bob Accepts

```bash
sncast --account BOB_ACCOUNT invoke \
  --contract-address $HELPER \
  --function privacy_invoke \
  --calldata 4 $CHANNEL_ID 5 100004 900004 \
  --network sepolia \
  --wait
```

Meaning:

```text
ACCEPT_OFFER
```

### 5. Alice Creates Escrow

`asset_type`, `asset_reference`, and `payment_reference` are protocol-agnostic felt references in V1.

```bash
sncast --account ALICE_ACCOUNT invoke \
  --contract-address $ESCROW \
  --function create_escrow \
  --calldata $CHANNEL_ID $BOB_ADDRESS 1 700001 450000000000000000000 \
  --network sepolia \
  --wait
```

If this is a fresh escrow deployment, the first escrow id is `1`:

```bash
export ESCROW_ID=1
```

For an existing deployment, check:

```bash
sncast call \
  --contract-address $ESCROW \
  --function get_escrow_count \
  --network sepolia
```

Append an escrow marker into the channel timeline:

```bash
sncast --account ALICE_ACCOUNT invoke \
  --contract-address $HELPER \
  --function privacy_invoke \
  --calldata 4 $CHANNEL_ID 7 100005 900005 \
  --network sepolia \
  --wait
```

### 6. Alice Confirms Buyer Deposit

```bash
sncast --account ALICE_ACCOUNT invoke \
  --contract-address $ESCROW \
  --function confirm_buyer_deposit \
  --calldata $ESCROW_ID \
  --network sepolia \
  --wait
```

Append a channel event:

```bash
sncast --account ALICE_ACCOUNT invoke \
  --contract-address $HELPER \
  --function privacy_invoke \
  --calldata 4 $CHANNEL_ID 8 100006 900006 \
  --network sepolia \
  --wait
```

### 7. Bob Confirms Seller Deposit

```bash
sncast --account BOB_ACCOUNT invoke \
  --contract-address $ESCROW \
  --function confirm_seller_deposit \
  --calldata $ESCROW_ID \
  --network sepolia \
  --wait
```

Append a channel event:

```bash
sncast --account BOB_ACCOUNT invoke \
  --contract-address $HELPER \
  --function privacy_invoke \
  --calldata 4 $CHANNEL_ID 8 100007 900007 \
  --network sepolia \
  --wait
```

### 8. Activate Escrow

```bash
sncast --account ALICE_ACCOUNT invoke \
  --contract-address $ESCROW \
  --function activate \
  --calldata $ESCROW_ID \
  --network sepolia \
  --wait
```

### 9. Settle Escrow

```bash
sncast --account BOB_ACCOUNT invoke \
  --contract-address $ESCROW \
  --function settle \
  --calldata $ESCROW_ID \
  --network sepolia \
  --wait
```

Append final channel event:

```bash
sncast --account BOB_ACCOUNT invoke \
  --contract-address $HELPER \
  --function privacy_invoke \
  --calldata 4 $CHANNEL_ID 9 100008 900008 \
  --network sepolia \
  --wait
```

## Executed Sepolia Proof Ledger

This is the executed onchain proof for the current VEIL demo. Use [Voyager Sepolia](https://sepolia.voyager.online/) and paste the transaction hashes into search if direct links are unavailable.

| Item | Value |
| --- | --- |
| Network | Starknet Sepolia |
| Channel id | `20260625` |
| Escrow id | `1` |
| Buyer / Alice | `0x289f797b9c2dc6c661fd058968d9ba39d01c7547f8259f01b7bce55696d0ff0` |
| Seller / Bob | `0x494f2bc712960a2d5cd651c8264ae6dc165482444efa091da34b6417e661060` |
| `VeilChannelHelper` | `0x0333e805547d0e91cec741045bf7305e8ff58e8b7d1e9f70ecb3ca559712ef6c` |
| `VeilEscrow` | `0x01354470e87067cf6e4956de43e89554c8b51267f359b3fc1b6be86104014abb` |
| Final escrow status | `Completed` |
| Expected helper timeline count | `11` events |

Deployment evidence:

| Contract | Class hash | Declare tx | Deploy tx |
| --- | --- | --- | --- |
| `VeilChannelHelper` | `0x07c77d18d96431836bf031dfa6fd1c1715acb6ee3b5195cd7c422d34c7412812` | `0x488fb0c6a41141d9af8ce110ac50f975d3a2a10ad7bdec37ceb3c74a422edad` | `0x5dfe5cab14fccc82cd1febe3433be969a23ca9ec722410699bbc358d9428d13` |
| `VeilEscrow` | `0x023ce3291ff5d40b0f01cd65a9eef43fa9e3a2402416acf72e9d6c45abc24b06` | `0x3a164ed3732262c07a60e79990730027f3244ff5aa6a72a8f582449e7c80a0d` | `0x7ac23ec9403b87b4d5cadae6e000aaf82ea72cd648a9c942621c81486fbcc95` |

Timeline evidence:

| Order | Meaning | Event type | Contract | Tx hash |
| --- | --- | --- | --- | --- |
| 1 | Alice chat message | `EVENT_CHAT` | `VeilChannelHelper` | `0x4c31bfdde4fa4dba833427f812801e2fa0df23aa559e267199597cf69272669` |
| 2 | Bob chat message | `EVENT_CHAT` | `VeilChannelHelper` | `0x747d59b38537da66d05d39617105c3e1c2345e0110847b6ba75fba6081e7316` |
| 3 | Offer created | `EVENT_OFFER` | `VeilChannelHelper` | `0x1b3b436e576d2223ee88729c18d010344dcb32861b3f9d584b1aa1ff65a067` |
| 4 | Counter offer | `EVENT_COUNTER_OFFER` | `VeilChannelHelper` | `0xb40e5739ee80e2d201b73da5d882209750c6e00a3527163d0588f05138e4c0` |
| 5 | Offer accepted | `EVENT_ACCEPT_OFFER` | `VeilChannelHelper` | `0x5622cb82551de474117caee80c0257472522e7efcd60378a018688483feeabd` |
| 6 | Escrow created marker | `EVENT_ESCROW_CREATED` | `VeilChannelHelper` | `0x75d553c177800265627f6054dfaa58b4947691582c74169d37841db76cf17c5` |
| 7 | Buyer deposit marker | `EVENT_ESCROW_DEPOSITED` | `VeilChannelHelper` | `0x189dd71da24ecd2ddc66d460ee1f0ade503342df38aba98efa12194d242f17` |
| 8 | Seller deposit marker | `EVENT_ESCROW_DEPOSITED` | `VeilChannelHelper` | `0x539aad2156ff0a961148552b39bea03e9981d66d264b1c538cc0c0b299b1b7b` |
| 9 | Payment memo attached | `EVENT_PAYMENT_MEMO` | `VeilChannelHelper` | `0x55ec134fb8fc756c1a188ed36f7c533a80068cf3952bb3fb3746231ad3d1bad` |
| 10 | Escrow settled marker | `EVENT_ESCROW_SETTLED` | `VeilChannelHelper` | `0x27e37912a88ff0075132071b4daf603a3a835e91339628a40d43244e81179e5` |
| 11 | Proof attached | `EVENT_PROOF_ATTACHED` | `VeilChannelHelper` | `0x6cdd37d63627e233af9251cc3350f423f2337b0661894683ca95b1e9524e207` |

Escrow state evidence:

| Order | Escrow action | Contract | Tx hash |
| --- | --- | --- | --- |
| 1 | Create escrow | `VeilEscrow` | `0x6d77da4b28221888fa89f10d35c9ca83cbfbc7213d5e38ad04c20a0931b01f9` |
| 2 | Buyer deposit confirmed | `VeilEscrow` | `0x7cf3987c0160e838dd8107fbc8c049d9810c90122fab6a6b49df2cb3925d84e` |
| 3 | Seller deposit confirmed | `VeilEscrow` | `0x5ce49f04deaea912204075a2b49c7a7d9b02182e9107b60233ee994225f6ac3` |
| 4 | Escrow activated | `VeilEscrow` | `0x729a1091d044fe009b5e82188aeb02f3d5091b4986f035d3e8d3fe003ad4b3c` |
| 5 | Escrow settled | `VeilEscrow` | `0x285784074b762414afdfe04f24aae296f6c0722b9360995a47d894bc25421f8` |

## Verify The Proof

Read the channel event count:

```bash
sncast call \
  --contract-address $HELPER \
  --function get_event_count \
  --calldata $CHANNEL_ID \
  --network sepolia
```

Read individual channel events:

```bash
sncast call \
  --contract-address $HELPER \
  --function get_event \
  --calldata $CHANNEL_ID 0 \
  --network sepolia
```

Read escrow state:

```bash
sncast call \
  --contract-address $ESCROW \
  --function get_escrow \
  --calldata $ESCROW_ID \
  --network sepolia

sncast call \
  --contract-address $ESCROW \
  --function get_status \
  --calldata $ESCROW_ID \
  --network sepolia
```

Open the contracts and transactions in Voyager Sepolia:

```text
https://sepolia.voyager.online/contract/<VEIL_CHANNEL_HELPER_ADDRESS>
https://sepolia.voyager.online/contract/<VEIL_ESCROW_ADDRESS>
https://sepolia.voyager.online/tx/<TX_HASH>
```

The proof should show:

- Alice chat event
- Bob offer event
- Alice counter offer event
- Bob accept event
- escrow created
- buyer deposit confirmed
- seller deposit confirmed
- escrow activated
- escrow settled

## Interview Explanation

Use this wording:

```text
VEIL proves the full channel workflow on Sepolia. Alice and Bob chat, negotiate an offer, accept terms, create escrow, confirm both sides, activate, and settle. Chat and negotiation events are stored in VeilChannelHelper through privacy_invoke. Escrow state is enforced by VeilEscrow. This is the direct testnet proof path; the future Privacy Pool path will call the same helper through InvokeExternal, so the app workflow does not need to be redesigned.
```

## What This Does Not Claim Yet

- It does not claim production Privacy Pool anonymity.
- It does not submit through official STRK20 Privacy Pool SDK.
- It does not custody STRK20 assets in escrow V1.
- It does not decrypt payloads onchain.

Those are intentionally separated. Privacy Pool handles privacy; VEIL handles channel workflow.
