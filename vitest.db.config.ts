import path from "node:path";
import { defineConfig } from "vitest/config";

// Database integration tests (test-plan Phase 2) run against the local Supabase stack, so they live in their own
// config: `npm test` (and the CI `ci` job, which has no Supabase) never picks them up. Files run one after another;
// the parallelism that matters is inside the race tests, on separate connections.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
