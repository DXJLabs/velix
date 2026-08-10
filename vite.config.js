import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));
const frontendRoot = fileURLToPath(new URL("./frontend", import.meta.url));
const distRoot = fileURLToPath(new URL("./dist", import.meta.url));

export function createVeilViteConfig({
  mode = "production",
} = {}) {
  return {
    root: frontendRoot,
    envDir: repoRoot,
    publicDir: "public",
    build: {
      outDir: distRoot,
      emptyOutDir: true,
    },
    plugins: [tailwindcss()],
  };
}

export default defineConfig(({ mode }) => createVeilViteConfig({ mode }));
