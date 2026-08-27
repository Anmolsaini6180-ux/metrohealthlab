import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.ts"],
    // Rules tests share one emulator instance and clear Firestore
    // between cases, so they must not run in parallel.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
