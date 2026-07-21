import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Offline unit suite. Pure logic only (no DB, no live Asterisk) — see test/setup.ts.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
