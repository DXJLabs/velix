# VEIL UX Prototype

Static UX prototype for VEIL, built to run smoothly through WSL with Vite and Tailwind CSS.

## Run in WSL

From Ubuntu/WSL:

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

After config or Tailwind changes, restart `npm run dev` so Vite reloads the Tailwind plugin.

For this lightweight prototype, running from `/mnt/c/Users/frend/Veilc` is fine. If the app grows larger, copying it into the WSL filesystem, for example `~/Veilc`, will usually make installs and dev server file watching faster.

## Environment

Copy `.env.example` to `.env.local` before wiring wallet and contract calls:

```bash
cp .env.example .env.local
```

`VITE_PRIVY_APP_ID` is for the Privy frontend SDK. Contract addresses and RPC URL are public frontend config, not secrets.

## Build

```bash
npm run build
npm run preview
```

## VEIL SDK

The TypeScript SDK lives in `packages/veil-sdk`.

```bash
npm run typecheck
npm run build:sdk
```

The current Channel Workspace demo uses the SDK in mock mode: it creates a channel, renders chat/offer/escrow/memo/proof events, and appends new composer/actions into one unified feed. See `examples/veil-channel-demo.ts` for the end-to-end flow.

## Privacy Pool Research Adapter

VEIL now has a read-only Privacy Pool research layer for the private STRK20 SDK gap:

- `MockPrivacyPoolAdapter` keeps local UX and SDK work fast.
- `ResearchPrivacyPoolAdapter` decodes transactions/events using the known Privacy Pool ABI.
- `RealPrivacyPoolAdapter` intentionally throws `Waiting for official Privacy Pool SDK`.
- The app includes `Developer -> Privacy Pool Research` for tx-hash inspection.

Interview notes are in `docs/privacy-pool-research-adapter.md`.

## VEIL Escrow V1

`VeilEscrow` is an isolated Starknet testnet-ready settlement workflow contract. It uses OpenZeppelin Cairo ReentrancyGuard/SRC5, does not rebuild Privacy Pool, does not assume ERC20/STRK20 transfer behavior, and stores protocol-agnostic references for future adapters.

Docs: `docs/veil-escrow-v1.md`

Core flow:

`Create Escrow -> Buyer Deposit -> Seller Deposit -> Activate -> Settle`

## Deploy to Vercel

If the Vercel CLI is not logged in yet:

```bash
cd /mnt/c/Users/frend/Veilc
npx vercel login
```

If the CLI says the token is invalid:

```bash
npx vercel logout
npx vercel login
```

Then deploy a public production URL:

```bash
npx vercel --prod
```

The URL printed by Vercel can be opened from your phone.
