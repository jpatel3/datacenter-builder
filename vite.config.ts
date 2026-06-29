import { defineConfig } from "vitest/config";

// On GitHub Pages the app is served from /<repo>/, so the production build
// needs that base. Local dev (and tests) stay at "/".
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/datacenter-builder/" : "/",
  test: { globals: true, environment: "node" },
}));
