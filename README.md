# VEIL UX Prototype

Static UX prototype for VEIL, built to run smoothly through WSL with Vite.

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

For this lightweight prototype, running from `/mnt/c/Users/frend/Veilc` is fine. If the app grows larger, copying it into the WSL filesystem, for example `~/Veilc`, will usually make installs and dev server file watching faster.

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
