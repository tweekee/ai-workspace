import { build } from "vite";
import { mkdir, cp } from "node:fs/promises";
const out = "browser-extension";
await mkdir(out, { recursive: true });
await build({
  configFile: false,
  publicDir: false,
  logLevel: "error",
  build: {
    outDir: out,
    emptyOutDir: true,
    lib: {
      entry: "extension/src/background.ts",
      formats: ["iife"],
      name: "AIWorkspaceBackground",
      fileName: () => "background.js",
    },
  },
});
await build({
  configFile: false,
  publicDir: false,
  logLevel: "error",
  build: {
    outDir: out,
    emptyOutDir: false,
    lib: {
      entry: "extension/src/content.ts",
      name: "AIWorkspaceMonitor",
      formats: ["iife"],
      fileName: () => "content.js",
    },
  },
});
await cp("extension/public", out, { recursive: true });
await cp("src-tauri/icons/32x32.png", out + "/icon-32.png");
await cp("src-tauri/icons/128x128.png", out + "/icon-128.png");
console.log("Built unpacked Chrome extension: browser-extension/");
