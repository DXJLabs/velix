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
