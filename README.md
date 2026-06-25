# VEIL

VEIL is a private channel workspace for encrypted negotiation, escrow coordination, payment memos, and proof references on Starknet.

VEIL is built to sit on top of Starknet Privacy Pool. Privacy Pool handles private channels, viewing keys, encrypted notes, private transfers, proofs, and `InvokeExternal`. VEIL handles the product workflow around a deal:

```text
private chat -> negotiation -> memo -> escrow workflow -> settlement proof
```

## What VEIL Is

- Channel-based chat and negotiation.
- Encrypted timeline events for messages, offers, memos, escrow status, and proof references.
- A protocol-agnostic escrow workflow contract.
- A TypeScript SDK for channel timelines and future Privacy Pool integration.
- A frontend workspace that treats conversation as the core product surface.

## What VEIL Is Not

- Not a DEX.
- Not a wallet.
- Not a Privacy Pool replacement.
- Not a fake privacy layer.

The current testnet path writes encrypted timeline references directly to VEIL contracts. The future production path routes the same workflow through Privacy Pool `InvokeExternal` once the official STRK20 Privacy Pool SDK is available.

## Current Implementation

| Layer | Status | Location |
| --- | --- | --- |
| Channel Workspace UI | Chat-first mobile workspace with Conversation, Deal, and Assistant views. | `index.html`, `app.js`, `styles.css` |
| VEIL SDK | Timeline client, encryption adapter, direct helper transport, session key layer, Privacy Pool research adapter. | `packages/veil-sdk` |
| Channel Helper Contract | Stores chat, offer, memo, escrow, and proof timeline events by channel. | `src/veil_channel_helper.cairo` |
| Escrow Contract | Coordinates escrow lifecycle without assuming ERC20, STRK20, or Privacy Pool custody. | `src/veil_escrow.cairo` |
| Research Adapter | Read-only tools for decoding Privacy Pool ABI, events, transactions, and invoke flows. | `docs/privacy-pool-research-adapter.md` |

## Smart Contract Proof

The Sepolia proof is designed to show the real product flow between two users, not just a single event:

```text
Alice and Bob chat
-> Bob creates offer
-> Alice counters
-> Bob accepts
-> Alice creates escrow
-> buyer deposit confirmed
-> seller deposit confirmed
-> escrow activated
-> escrow settled
```

`VeilChannelHelper` exposes `privacy_invoke(...) -> Span<OpenNoteDeposit>` to match the helper pattern used by Privacy Pool-compatible contracts such as Vesu and Ekubo. For chat and negotiation metadata it returns an empty deposit array because no funds are moved.

`VeilEscrow` emits settlement workflow events that can be reconstructed into the same channel timeline.

Full smart contract demo commands are documented in [src/README.md](src/README.md).

## Local Development

Run from WSL:

```bash
cd /mnt/c/Users/frend/Veilc
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

If Vite picks another port, use the URL shown in the terminal.

## Environment

Copy the example environment file before wiring wallet and contract calls:

```bash
cp .env.example .env.local
```

Important variables:

```text
VITE_PRIVY_APP_ID=
VITE_STARKNET_CHAIN_ID=SN_SEPOLIA
VITE_STARKNET_RPC_URL=
VITE_PRIVACY_POOL_ADDRESS=
VITE_VEIL_CHANNEL_HELPER_ADDRESS=
VITE_VEIL_ESCROW_ADDRESS=
VITE_DEMO_COUNTERPARTY_ADDRESS=
VITE_VEIL_TIMELINE_MODE=mock
```

Timeline modes:

| Mode | Purpose |
| --- | --- |
| `mock` | Local in-memory demo. |
| `direct-helper` | Testnet writes directly to `VeilChannelHelper.privacy_invoke`. |
| `privacy-pool` | Future path through Privacy Pool `InvokeExternal`. |

## Build And Test

Frontend:

```bash
npm run build
npm run preview
```

SDK:

```bash
npm run typecheck
npm run build:sdk
```

Cairo contracts:

```bash
scarb build
scarb test
```

## Documentation

| Topic | Document |
| --- | --- |
| Smart contract testnet proof | [src/README.md](src/README.md) |
| Onchain chat mode | [docs/onchain-chat-testnet.md](docs/onchain-chat-testnet.md) |
| Escrow V1 architecture | [docs/veil-escrow-v1.md](docs/veil-escrow-v1.md) |
| Encrypted channel privacy | [docs/encrypted-channel-privacy.md](docs/encrypted-channel-privacy.md) |
| Privacy Pool ABI analysis | [docs/privacy-pool-abi-analysis.md](docs/privacy-pool-abi-analysis.md) |
| Privacy Pool source analysis | [docs/privacy-pool-source-analysis.md](docs/privacy-pool-source-analysis.md) |
| Privacy Pool research adapter | [docs/privacy-pool-research-adapter.md](docs/privacy-pool-research-adapter.md) |
| Session key architecture | [docs/session-key-architecture.md](docs/session-key-architecture.md) |

## Deploy Frontend

Login to Vercel:

```bash
cd /mnt/c/Users/frend/Veilc
npx vercel login
```

Deploy production:

```bash
npx vercel --prod
```

The printed Vercel URL can be opened from desktop or mobile.

## Implementation Note

VEIL is being built before official Privacy Pool SDK access. The codebase keeps these paths separate:

- `MockPrivacyPoolAdapter` for local product development.
- `DirectHelperTransport` for real testnet helper writes.
- `ResearchPrivacyPoolAdapter` for read-only Privacy Pool ABI research.
- `RealPrivacyPoolAdapter` as a future integration boundary that intentionally waits for the official SDK.

This keeps development fast without claiming undocumented Privacy Pool transaction submission is complete.
