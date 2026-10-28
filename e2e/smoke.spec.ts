import { expect, test } from "@playwright/test";
import {
  createChapter,
  createShoppingItem,
  deleteChapter,
  deleteShoppingItem,
} from "./fixtures";

/**
 * The paths that must never be broken: getting in, finding a recipe, cooking
 * it, and ticking something off the shopping list. Everything here uses the
 * seeded test household (`pnpm db:seed`).
 */

test("kuchařka otevře kapitoly, ne hromadu receptů", async ({ page }) => {
  await page.goto("/kucharka");
  await expect(page.getByRole("heading", { name: "Kuchařka" })).toBeVisible();

  // Chapters first (§5.1): no recipe card until you pick where to look.
  await expect(
    page.getByRole("heading", { name: "Všechny recepty" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /bábovka/i })).toHaveCount(0);

  await page.getByRole("link", { name: /Všechny recepty/ }).click();
  await expect(page.getByRole("heading", { name: /bábovka/i })).toBeVisible();
});

test("hledání na úvodu přeskočí kapitoly a najde recept bez diakritiky", async ({
  page,
}) => {
  await page.goto("/kucharka");
  const card = page.getByRole("heading", { name: /bábovka/i }).first();

  await page.getByPlaceholder(/hledat recept/i).fill("babovka");
  await expect(card).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Všechny recepty" }),
  ).toHaveCount(0);

  await page.getByPlaceholder(/hledat recept/i).fill("neexistujicijidlo");
  await expect(page.getByText(/nic nenalezeno/i)).toBeVisible();

  // Emptying the box brings the chapters back.
  await page.getByPlaceholder(/hledat recept/i).fill("");
  await expect(
    page.getByRole("heading", { name: "Všechny recepty" }),
  ).toBeVisible();
});

test("kapitolu jde skrýt z úvodu a zase vrátit", async ({ page }) => {
  const { id, name } = await createChapter(page.request);
  try {
    await page.goto("/kucharka");
    const tile = page.getByRole("heading", { name });
    await expect(tile).toBeVisible();

    await page.getByRole("button", { name: /Kapitoly/ }).click();
    const row = page.locator("li").filter({ hasText: name });
    await row.getByRole("checkbox").click();
    await expect(row.getByText(/skrytá/)).toBeVisible();

    await page.getByRole("button", { name: "Hotovo" }).first().click();
    await expect(tile).toHaveCount(0);

    await page.getByRole("button", { name: /Kapitoly/ }).click();
    await row.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Hotovo" }).first().click();
    await expect(tile).toBeVisible();
  } finally {
    await deleteChapter(page.request, id);
  }
});

test("detail receptu ukáže ingredience, přepočet porcí a nutriční hodnoty", async ({
  page,
}) => {
  await page.goto("/kucharka/kategorie/vse");
  await page
    .getByRole("heading", { name: /bábovka/i })
    .first()
    .click();

  await expect(
    page.getByRole("heading", { name: "Ingredience" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nutriční hodnoty" }),
  ).toBeVisible();

  // The stepper label, not the "12 porcí · 1:15 h · snadné" subtitle.
  const servings = page.locator("span").filter({ hasText: /^\d+ porcí$/ });
  await expect(servings).toHaveText("12 porcí");
  await page.getByRole("button", { name: "Více porcí" }).click();
  await expect(servings).toHaveText("13 porcí");
  await page.getByRole("button", { name: /původní/ }).click();
  await expect(servings).toHaveText("12 porcí");
});

test("režim vaření projde krokem a vrátí se zpět", async ({ page }) => {
  await page.goto("/kucharka/kategorie/vse");
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

test("odškrtnutí položky v nákupu dojde na server a přežije nové načtení", async ({
  page,
}) => {
  const { listId, itemId, name } = await createShoppingItem(page.request);
  const checkedOnServer = async () => {
    const detail = await page.request
      .get(`/api/shopping-lists/${listId}`)
      .then((r) => r.json());
    return detail.items.find((i: { id: string }) => i.id === itemId)?.isChecked;
  };

  await page.goto(`/nakup/${listId}`);
  await page.getByRole("button", { name: `Odškrtnout ${name}` }).click();

  // Optimistic first, then the real proof: the outbox got it to the server.
  await expect(
    page.getByRole("button", { name: `Vrátit ${name}` }),
  ).toBeVisible();
  await expect.poll(checkedOnServer).toBe(true);

  await page.reload();
  await expect(
    page.getByRole("button", { name: `Vrátit ${name}` }),
  ).toBeVisible();

  await deleteShoppingItem(page.request, itemId);
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
