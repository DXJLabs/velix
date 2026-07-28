import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";

const starkzapFile = (path) => fileURLToPath(new URL(`./node_modules/starkzap/dist/src/${path}`, import.meta.url));
const repoRoot = fileURLToPath(new URL(".", import.meta.url));
const frontendRoot = fileURLToPath(new URL("./frontend", import.meta.url));
const distRoot = fileURLToPath(new URL("./dist", import.meta.url));

export function resolvePublicPrivyAppId(env = {}) {
  return String(env.VITE_PRIVY_APP_ID || env.PRIVY_APP_ID || "").trim();
}

export function createVeilViteConfig({
  mode = "production",
  processEnv = process.env,
  loadEnvironment = loadEnv,
} = {}) {
  const loadedEnv = loadEnvironment(mode, repoRoot, "");
  const publicPrivyAppId = resolvePublicPrivyAppId({
    ...loadedEnv,
    ...processEnv,
  });

  return {
    root: frontendRoot,
    envDir: repoRoot,
    publicDir: "public",
    define: {
      "import.meta.env.VITE_PRIVY_APP_ID": JSON.stringify(publicPrivyAppId),
    },
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
  };
}

export default defineConfig(({ mode }) => createVeilViteConfig({ mode }));
