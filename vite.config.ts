import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  preview: {
    headers: {
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' asset: http://asset.localhost data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src ipc: http://ipc.localhost; object-src 'none'; base-uri 'self'; frame-src 'none'",
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: (id) =>
          id.includes("node_modules/pixi.js") ? "pixi" : undefined,
      },
    },
  },
});
