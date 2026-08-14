import { defineConfig, devices } from "@playwright/test";
import { AUTH_STATE } from "./e2e/config";

/**
 * Smoke tests (§11.3). Not a second test suite for business rules — those live
 * in Vitest as pure functions. This is here to catch the class of breakage a
 * unit test cannot see: a page that does not render, a login that does not log
 * in, a route that 500s.
 *
 * Runs against an already running app (`E2E_BASE_URL`, default the dev server)
 * so it never builds anything on its own; CI starts the production server
 * first. The account is the one `pnpm db:seed` creates.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "cs-CZ",
    timezoneId: "Europe/Prague",
    trace: "retain-on-failure",
  },
  projects: [
    // Signs in once; the rest reuse the session (the login endpoint is rate
    // limited on purpose).
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
      dependencies: ["setup"],
    },
    // The phone is the primary device (docs/DESIGN.md §5), so the smoke test
    // runs there too — the bottom bar and the sheets only exist on mobile.
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], storageState: AUTH_STATE },
      dependencies: ["setup"],
    },
  ],
});
