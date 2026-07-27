import lucide from "lucide/dist/cjs/lucide.js";
import { mountAppShell } from "./ui/shell/app-shell-template.js";
import { bootstrapVeilApp } from "./app/bootstrap.js";

const { createIcons, icons } = lucide;
globalThis.lucide = {
  createIcons: () => createIcons({ icons }),
};

mountAppShell();
bootstrapVeilApp();
