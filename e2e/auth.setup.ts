import { expect, test as setup } from "@playwright/test";
import { AUTH_STATE, EMAIL, PASSWORD } from "./config";

/**
 * Logs in once and hands the session to every other spec.
 *
 * Not a convenience: signing in per test trips the login rate limiter
 * (docs/ARCHITECTURE.md §1.2) and the suite starts failing on its own defences.
 */
setup("přihlášení", async ({ page }) => {
  await page.goto("/prihlaseni");
  await page.getByLabel(/e-?mail/i).fill(EMAIL);
  await page.getByLabel(/heslo/i).fill(PASSWORD);
  await page.getByRole("button", { name: /přihlásit/i }).click();

  await expect(page).toHaveURL(/\/(kucharka)?$/, { timeout: 15_000 });
  await page.context().storageState({ path: AUTH_STATE });
});
