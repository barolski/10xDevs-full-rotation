import path from "node:path";
import { defineConfig } from "vitest/config";

// Standalone on purpose: astro.config.mjs loads the Cloudflare adapter and Tailwind, which unit tests of pure
// src/lib logic neither need nor want.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
