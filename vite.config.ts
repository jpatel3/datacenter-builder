import { defineConfig } from "vitest/config";

// On GitHub Pages the app is served from /<repo>/, so the production build
// needs that base. Local dev (and tests) stay at "/".
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/datacenter-builder/" : "/",
  // Pinned so the local OAuth redirect matches the Supabase allow-list (localhost:5174).
  server: { port: 5174, strictPort: true },
  test: { globals: true, environment: "node" },
}));
