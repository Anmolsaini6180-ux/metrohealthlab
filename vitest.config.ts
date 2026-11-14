import { defineConfig } from "vitest/config";
import path from "node:path";

// Frontend + rules tests. The rules suite needs the Firestore emulator
// running, so it lives behind `npm run test:rules` rather than the
// default `npm test`.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
