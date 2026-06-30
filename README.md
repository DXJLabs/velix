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

The current unshield path writes encrypted timeline references directly to VEIL contracts. Shield mode is isolated behind a Starknet Privacy SDK transport boundary so VEIL does not invent STRK20 note encryption or proof construction. AVNU is used only as the Paymaster/Forwarder layer for transaction execution and gas sponsorship.

## Current Implementation

| Layer | Status | Location |
| --- | --- | --- |
| Channel Workspace UI | Chat-first mobile workspace with Conversation, Deal, and Assistant views. | `index.html`, `app.js`, `styles.css` |
| VEIL SDK | Privacy Pool-derived message encryption boundary, direct helper transport, Starknet Privacy SDK transport boundary, AVNU Paymaster execution hook, session key layer, Privacy Pool research adapter. | `packages/veil-sdk` |
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

### Sepolia Onchain Evidence

Explorer: [Voyager Sepolia](https://sepolia.voyager.online/). If a direct explorer URL does not open, paste the raw transaction hash into Voyager Sepolia search.

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

Core proof transactions:

| Step | Contract | Tx hash |
| --- | --- | --- |
| Deploy `VeilChannelHelper` | Helper | `0x5dfe5cab14fccc82cd1febe3433be969a23ca9ec722410699bbc358d9428d13` |
| Deploy `VeilEscrow` | Escrow | `0x7ac23ec9403b87b4d5cadae6e000aaf82ea72cd648a9c942621c81486fbcc95` |
| Alice chat message | Helper | `0x4c31bfdde4fa4dba833427f812801e2fa0df23aa559e267199597cf69272669` |
| Bob chat message | Helper | `0x747d59b38537da66d05d39617105c3e1c2345e0110847b6ba75fba6081e7316` |
| Offer created | Helper | `0x1b3b436e576d2223ee88729c18d010344dcb32861b3f9d584b1aa1ff65a067` |
| Counter offer | Helper | `0xb40e5739ee80e2d201b73da5d882209750c6e00a3527163d0588f05138e4c0` |
| Offer accepted | Helper | `0x5622cb82551de474117caee80c0257472522e7efcd60378a018688483feeabd` |
| Create escrow | Escrow | `0x6d77da4b28221888fa89f10d35c9ca83cbfbc7213d5e38ad04c20a0931b01f9` |
| Buyer deposit confirmed | Escrow | `0x7cf3987c0160e838dd8107fbc8c049d9810c90122fab6a6b49df2cb3925d84e` |
| Seller deposit confirmed | Escrow | `0x5ce49f04deaea912204075a2b49c7a7d9b02182e9107b60233ee994225f6ac3` |
| Escrow activated | Escrow | `0x729a1091d044fe009b5e82188aeb02f3d5091b4986f035d3e8d3fe003ad4b3c` |
| Escrow settled | Escrow | `0x285784074b762414afdfe04f24aae296f6c0722b9360995a47d894bc25421f8` |
| Proof attached | Helper | `0x6cdd37d63627e233af9251cc3350f423f2337b0661894683ca95b1e9524e207` |

Full smart contract demo commands and the complete transaction ledger are documented in [src/README.md](src/README.md).

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
VITE_PRIVY_LOGIN_METHODS=email,wallet,google
VITE_VEIL_CHANNEL_KEY=
VITE_VEIL_ONCHAIN_PAYLOADS=false
PRIVY_APP_ID=
PRIVY_APP_SECRET=
PRIVY_VERIFICATION_KEY=
AVNU_PAYMASTER_API_KEY=
AVNU_PAYMASTER_NODE_URL=https://sepolia.paymaster.avnu.fi
VITE_AVNU_PAYMASTER_ENABLED=true
VITE_STARKNET_CHAIN_ID=SN_SEPOLIA
VITE_STARKNET_RPC_URL=
VITE_PRIVY_STARKNET_RPC_URL=https://starknet-sepolia.public.blastapi.io/rpc/v0_8
VITE_PRIVACY_POOL_ADDRESS=
VITE_VEIL_CHANNEL_HELPER_ADDRESS=
VITE_VEIL_ESCROW_ADDRESS=
VITE_DEMO_COUNTERPARTY_ADDRESS=
VEIL_INDEXER_FROM_BLOCK=0
VITE_VEIL_TIMELINE_MODE=direct-helper
```

Timeline modes:

| Mode | Purpose |
| --- | --- |
| `mock` | Local in-memory demo only. |
| `direct-helper` | Testnet writes directly to `VeilChannelHelper.privacy_invoke` after wallet network and helper deployment checks pass. |
| `privacy-pool` | Starknet Privacy SDK path through Privacy Pool `InvokeExternal`; AVNU Paymaster may submit the built transaction. |

Wallet connection uses Privy on the frontend (`VITE_PRIVY_APP_ID`) and Vercel serverless endpoints for Starknet wallet creation/signing (`PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_VERIFICATION_KEY`). `VITE_PRIVY_LOGIN_METHODS=email,wallet,google` enables Google in the login modal; Google must also be enabled in the Privy dashboard for the app. The browser never receives a private key. For `direct-helper`, VEIL follows StarkZap's Privy server-signing model: `/api/wallet/starknet` creates a server-managed Starknet wallet without a Privy owner, maps it to the authenticated user with a stable `external_id`, and `/api/wallet/sign` signs with Privy `rawSign`. The JWT is still required to authenticate VEIL API requests and prevent signing a wallet mapped to another user. StarkZap handles account address derivation and `deploy: "if_needed"` with the ArgentX v0.5 account preset. When `VITE_AVNU_PAYMASTER_ENABLED=true`, StarkZap uses `feeMode: { type: "paymaster" }` and `/api/paymaster` proxies AVNU Paymaster requests with the server-side `AVNU_PAYMASTER_API_KEY`; never expose that key in frontend code. VEIL also checks that the wallet is on `VITE_STARKNET_CHAIN_ID` and that `VITE_VEIL_CHANNEL_HELPER_ADDRESS` is deployed before submitting chat, offer, memo, escrow, or proof events.

### Google OAuth And Privy Redirects

Do not hardcode application redirect URLs in code. Configure them in the provider dashboards for every deployed origin.

Current Privy Google OAuth callback URI:

```text
https://auth.privy.io/api/v1/oauth/callback
```

Google Cloud OAuth client:

- Authorized redirect URIs: add `https://auth.privy.io/api/v1/oauth/callback`.
- Authorized JavaScript origins: add each app origin with no path, for example `http://localhost:5173` and the production origin.

Privy dashboard:

- Allowed domains / OAuth redirect URLs: add each exact app origin that loads VEIL, for example `http://localhost:5173` and the production origin.
- Login methods: enable Google for the same Privy app id used by `VITE_PRIVY_APP_ID`.
- Wallets: enable Starknet embedded wallets for the same app.

Server:

- `PRIVY_APP_ID` must match `VITE_PRIVY_APP_ID`.
- `PRIVY_APP_SECRET` must come from the same Privy app.
- `PRIVY_VERIFICATION_KEY` must come from the same Privy app and is required to authenticate VEIL API requests. Wallets are server-managed in Privy and mapped to users by `external_id`, so Privy `rawSign` uses app credentials rather than user-owned wallet authorization.
- `AVNU_PAYMASTER_API_KEY` must be an active AVNU Paymaster key. If the key was exposed in screenshots or logs, rotate it before adding it to Vercel Production and Preview.
- `AVNU_PAYMASTER_NODE_URL` defaults to Sepolia/Mainnet from `VITE_STARKNET_CHAIN_ID`; set it explicitly when using a custom AVNU endpoint.

### Encrypted Onchain Messaging

`VeilChannelHelper` supports append-only encrypted timeline storage. `privacy_invoke` accepts the legacy four-felt reference format and a chunked format:

```text
channel_id, event_type, encrypted_payload, payload_hash, payload_chunk_count, payload_chunk...
```

The helper stores metadata, stores each encrypted payload chunk, and emits reconstructable events. The Vercel indexer endpoint reads helper events and returns ciphertext only:

```text
GET /api/indexer/messages?channelId=20260625
```

Decryption stays in the browser. Production messaging must use Privacy Pool-derived secret material supplied by the official Starknet Privacy SDK flow, then pass that material to `deriveSharedSecret` or `PrivacyPoolChannelEncryptionAdapter`. AVNU Paymaster is only used to execute or sponsor the already-built transaction. Browser ECDH exports remain compatibility shims that fail closed because they are not STRK20 Privacy Pool-compatible. `VITE_VEIL_CHANNEL_KEY` remains a legacy 128/192/256-bit AES testnet fallback only.

Set `VITE_VEIL_ONCHAIN_PAYLOADS=true` only after deploying the upgraded `VeilChannelHelper` that supports payload chunks. Older helper deployments only accept the four-felt reference format.

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
npm run test:sdk
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
| Production onchain messaging | [docs/production-onchain-messaging.md](docs/production-onchain-messaging.md) |
| Escrow V1 architecture | [docs/veil-escrow-v1.md](docs/veil-escrow-v1.md) |
| Encrypted channel privacy | [docs/encrypted-channel-privacy.md](docs/encrypted-channel-privacy.md) |
| Privacy Pool ABI analysis | [docs/privacy-pool-abi-analysis.md](docs/privacy-pool-abi-analysis.md) |
| Privacy Pool source analysis | [docs/privacy-pool-source-analysis.md](docs/privacy-pool-source-analysis.md) |
| Privacy Pool research adapter | [docs/privacy-pool-research-adapter.md](docs/privacy-pool-research-adapter.md) |
| STRK20 migration report | [docs/privacy-pool-migration-report.md](docs/privacy-pool-migration-report.md) |
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

VEIL is being built before public Starknet Privacy SDK integration is wired. The codebase keeps these paths separate:

- `MockPrivacyPoolAdapter` for explicit local product development only.
- `DirectHelperTransport` for real testnet helper writes.
- `StarknetPrivacyPoolTransport` for Shield mode through Starknet Privacy SDK action/proof builders.
- `AvnuPrivacyPoolTransport` as a deprecated compatibility alias; AVNU remains the Paymaster/Forwarder layer.
- `ResearchPrivacyPoolAdapter` for read-only Privacy Pool ABI research.
- `RealPrivacyPoolAdapter` as a future integration boundary for the official Starknet Privacy SDK.

This keeps development fast without claiming undocumented Privacy Pool transaction submission is complete.
