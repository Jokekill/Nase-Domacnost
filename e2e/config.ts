/** Shared test-account details — the household `pnpm db:seed` creates. */
export const EMAIL = process.env.E2E_EMAIL ?? "vojta@test.local";
export const PASSWORD = process.env.E2E_PASSWORD ?? "heslo123";

/** Where the logged-in session is kept between specs (gitignored). */
export const AUTH_STATE = "e2e/.auth/state.json";
