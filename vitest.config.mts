import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests only. `e2e/` belongs to Playwright — Vitest picking those up
    // fails with "Playwright Test did not expect test() to be called here".
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "e2e", ".next", ".next-prod"],
  },
});
