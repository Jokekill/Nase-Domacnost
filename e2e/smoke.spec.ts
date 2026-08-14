import { expect, test } from "@playwright/test";

/**
 * The paths that must never be broken: getting in, finding a recipe, cooking
 * it, and ticking something off the shopping list. Everything here uses the
 * seeded test household (`pnpm db:seed`).
 */

test("kuchařka se načte a hledání najde recept bez diakritiky", async ({
  page,
}) => {
  await page.goto("/kucharka");
  await expect(page.getByRole("heading", { name: "Kuchařka" })).toBeVisible();

  const card = page.getByRole("heading", { name: /bábovka/i }).first();
  await expect(card).toBeVisible();

  await page.getByPlaceholder(/hledat recept/i).fill("babovka");
  await expect(card).toBeVisible();

  await page.getByPlaceholder(/hledat recept/i).fill("neexistujicijidlo");
  await expect(page.getByText(/nic nenalezeno/i)).toBeVisible();
});

test("detail receptu ukáže ingredience, přepočet porcí a nutriční hodnoty", async ({
  page,
}) => {
  await page.goto("/kucharka");
  await page
    .getByRole("heading", { name: /bábovka/i })
    .first()
    .click();

  await expect(
    page.getByRole("heading", { name: "Ingredience" }),
  ).toBeVisible();
  await expect(page.getByText("Nutriční hodnoty")).toBeVisible();

  // The stepper label, not the "12 porcí · 1:15 h · snadné" subtitle.
  const servings = page.locator("span").filter({ hasText: /^\d+ porcí$/ });
  await expect(servings).toHaveText("12 porcí");
  await page.getByRole("button", { name: "Více porcí" }).click();
  await expect(servings).toHaveText("13 porcí");
  await page.getByRole("button", { name: /původní/ }).click();
  await expect(servings).toHaveText("12 porcí");
});

test("režim vaření projde krokem a vrátí se zpět", async ({ page }) => {
  await page.goto("/kucharka");
  await page
    .getByRole("heading", { name: /bábovka/i })
    .first()
    .click();
  await page.getByRole("link", { name: /vařit/i }).click();

  await expect(page.getByText(/^Ingredience/)).toBeVisible();
  await page.getByRole("button", { name: /začít vařit/i }).click();
  await expect(page.getByText(/Krok 1 \//)).toBeVisible();
  await page.getByRole("link", { name: /zavřít/i }).click();
  await expect(
    page.getByRole("heading", { name: "Ingredience" }),
  ).toBeVisible();
});

test("odškrtnutí položky v nákupu se projeví a přežije nové načtení", async ({
  page,
}) => {
  await page.goto("/nakup");
  await expect(
    page.getByRole("heading", { name: "Nákup", level: 1 }),
  ).toBeVisible();
  const list = page.locator('a[href^="/nakup/"]').first();
  await expect(list).toBeVisible();
  await list.click();

  const tick = page.getByRole("button", { name: /^Odškrtnout / }).first();
  await expect(tick).toBeVisible();
  const name = (await tick.getAttribute("aria-label"))!.replace(
    "Odškrtnout ",
    "",
  );

  await tick.click();
  const back = page.getByRole("button", { name: `Vrátit ${name}` });
  await expect(back).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("button", { name: `Vrátit ${name}` }),
  ).toBeVisible();
  // Leave the list as it was found.
  await page.getByRole("button", { name: `Vrátit ${name}` }).click();
  await expect(
    page.getByRole("button", { name: `Odškrtnout ${name}` }),
  ).toBeVisible();
});

test("hlavní obrazovky odpovídají a mají nadpis", async ({ page }) => {
  for (const [path, heading] of [
    ["/jidelnicek", "Jídelníček"],
    ["/kalendar", "Kalendář"],
    ["/ukoly", "Úkoly"],
    ["/denik", "Deník"],
    ["/nastaveni", "Nastavení"],
  ] as const) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: heading, level: 1 }),
    ).toBeVisible();
  }
});

test("dialog jde zavřít klávesnicí a vrátí fokus", async ({ page }) => {
  await page.goto("/ukoly");
  const opener = page.getByRole("button", { name: /nový úklid/i });
  await opener.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("odkaz Preskocit na obsah se ukaze pri tabu a skoci na obsah", async ({
  page,
}) => {
  await page.goto("/kucharka");
  const skip = page.getByRole("link", { name: /přeskočit na obsah/i });
  // Parked above the viewport, not display:none — it has to stay focusable.
  await expect(skip).not.toBeInViewport();

  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();

  await page.keyboard.press("Enter");
  await expect(page.locator("main#obsah")).toBeFocused();
});
