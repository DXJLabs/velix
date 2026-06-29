import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const starkzapFile = (path) => fileURLToPath(new URL(`./node_modules/starkzap/dist/src/${path}`, import.meta.url));

export default defineConfig({
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
