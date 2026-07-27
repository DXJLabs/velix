import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const starkzapFile = (path) => fileURLToPath(new URL(`./node_modules/starkzap/dist/src/${path}`, import.meta.url));
const repoRoot = fileURLToPath(new URL(".", import.meta.url));
const frontendRoot = fileURLToPath(new URL("./frontend", import.meta.url));
const distRoot = fileURLToPath(new URL("./dist", import.meta.url));


export default defineConfig({
  root: frontendRoot,
  envDir: repoRoot,
  publicDir: "public",
  build: {
    outDir: distRoot,
    emptyOutDir: true,
  },
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      "starkzap-sdk": starkzapFile("sdk.js"),
      "starkzap-account-presets": starkzapFile("account/presets.js"),
      "starkzap-config": starkzapFile("types/config.js"),
      "starkzap-onboard": starkzapFile("types/onboard.js"),
    },
  },
});
