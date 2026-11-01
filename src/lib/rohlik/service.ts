import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { foodUnits, foods, shoppingItems, shoppingLists } from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import { REASON_LABELS, type ConversionFood } from "@/lib/domain/units";
import {
  PACKAGING_REASON_LABELS,
  formatInDimension,
  formatPackageSize,
  packagesNeeded,
  type PackagingReason,
} from "@/lib/domain/rohlik-packaging";
import {
  RohlikSession,
  searchProducts,
  type CartSummary,
  type RohlikProduct,
} from "./client";

type Actor = { userId: string; householdId: string };

/** How many list items we look up in one go — a basket, not a scrape. */
const MAX_ITEMS = 60;
/** Parallel searches. Enough to be quick, few enough to stay polite. */
const CONCURRENCY = 4;
const CANDIDATES_PER_ITEM = 6;

export type RohlikCandidate = RohlikProduct & {
  /** Whole packages that cover the needed amount, or null if undecidable. */
  packages: number | null;
  /** Why we could not work the amount out — shown instead of a guess. */
  problem: string | null;
};

export type RohlikMatch = {
  itemId: string;
  name: string;
  amount: number | null;
  unit: string | null;
  note: string | null;
  foodId: string | null;
  /** The product this food was paired with last time, if it came up again. */
  savedProductId: number | null;
  /** Our suggestion; null when nothing usable was found. */
  suggestedProductId: number | null;
  candidates: RohlikCandidate[];
};

/* ------------------------------------------------------------------ */
/* Matching the list against the catalogue                            */
/* ------------------------------------------------------------------ */

/**
 * Looks every open item of a shopping list up in Rohlík and works out how
 * many packages each candidate product would mean (D-029).
 *
 * Nothing is bought here and nothing is remembered — this is the review step.
 * The quantities come from the shared packaging rules, which refuse to guess,
 * so an item whose amount cannot be converted arrives with `packages: null`
 * and a sentence saying what is missing.
 */
export async function matchList(
  householdId: string,
  listId: string,
): Promise<{ items: RohlikMatch[]; truncated: boolean }> {
  const [list] = await db
    .select({ id: shoppingLists.id })
    .from(shoppingLists)
    .where(
      and(
        eq(shoppingLists.id, listId),
        eq(shoppingLists.householdId, householdId),
        isNull(shoppingLists.deletedAt),
      ),
    )
    .limit(1);
  if (!list) throw new ApiError("not_found", "Nákupní seznam nenalezen.");

  const rows = await db
    .select({
      id: shoppingItems.id,
      foodId: shoppingItems.foodId,
      freeText: shoppingItems.freeText,
      amount: shoppingItems.amount,
      unit: shoppingItems.unit,
      note: shoppingItems.note,
      foodName: foods.name,
      densityGPerMl: foods.densityGPerMl,
      gramsPerPiece: foods.gramsPerPiece,
      rohlikProductId: foods.rohlikProductId,
    })
    .from(shoppingItems)
    .leftJoin(foods, eq(foods.id, shoppingItems.foodId))
    .where(
      and(
        eq(shoppingItems.shoppingListId, listId),
        isNull(shoppingItems.deletedAt),
        // Already in the trolley — no reason to order it again.
        eq(shoppingItems.isChecked, false),
      ),
    )
    .orderBy(asc(shoppingItems.sortOrder));

  const pending = rows.slice(0, MAX_ITEMS);
  const foodIds = pending
    .map((row) => row.foodId)
    .filter((id): id is string => Boolean(id));
  const unitRows = foodIds.length
    ? await db
        .select()
        .from(foodUnits)
        .where(
          and(inArray(foodUnits.foodId, foodIds), isNull(foodUnits.deletedAt)),
        )
    : [];

  const items = await mapWithConcurrency(pending, CONCURRENCY, async (row) => {
    const name = row.foodName ?? row.freeText ?? "";
    const food: ConversionFood | null = row.foodId
      ? {
          densityGPerMl: row.densityGPerMl,
          gramsPerPiece: row.gramsPerPiece,
          units: unitRows
            .filter((u) => u.foodId === row.foodId)
            .map((u) => ({ unit: u.unit, gramsPerUnit: u.gramsPerUnit })),
        }
      : null;

    // One bad query must not sink the whole review — the item comes back with
    // no candidates and the screen offers a manual search.
    const products = await searchProducts(name, CANDIDATES_PER_ITEM).catch(
      () => [] as RohlikProduct[],
    );

    const candidates: RohlikCandidate[] = products.map((product) => {
      const result = packagesNeeded(row.amount, row.unit, food, product);
      return {
        ...product,
        packages: result.ok ? result.packages : null,
        problem: result.ok
          ? result.surplus > 0
            ? `${result.packages}× ${formatPackageSize(result.packageSize)} — potřeba ${formatInDimension(
                result.packageSize.dimension,
                result.needed,
              )}, zbyde ${formatInDimension(
                result.packageSize.dimension,
                result.surplus,
              )}`
            : null
          : reasonLabel(result.reason),
      };
    });

    const saved = row.rohlikProductId ?? null;
    const savedHere = candidates.find((c) => c.productId === saved) ?? null;
    const suggested =
      savedHere ??
      candidates.find((c) => c.inStock && c.packages !== null) ??
      candidates.find((c) => c.inStock) ??
      null;

    return {
      itemId: row.id,
      name,
      amount: row.amount,
      unit: row.unit,
      note: row.note,
      foodId: row.foodId,
      savedProductId: saved,
      suggestedProductId: suggested?.productId ?? null,
      candidates,
    } satisfies RohlikMatch;
  });

  return { items, truncated: rows.length > pending.length };
}

function reasonLabel(reason: PackagingReason): string {
  return reason === "unknown_package"
    ? PACKAGING_REASON_LABELS.unknown_package
    : REASON_LABELS[reason];
}

/** Keeps at most `limit` requests in flight, preserving input order. */
async function mapWithConcurrency<In, Out>(
  inputs: In[],
  limit: number,
  fn: (input: In) => Promise<Out>,
): Promise<Out[]> {
  const results: Out[] = new Array(inputs.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, inputs.length) }, () =>
    (async () => {
      while (true) {
        const index = next++;
        if (index >= inputs.length) return;
        results[index] = await fn(inputs[index]);
      }
    })(),
  );
  await Promise.all(workers);
  return results;
}

/* ------------------------------------------------------------------ */
/* Pushing the basket                                                 */
/* ------------------------------------------------------------------ */

export type CartLine = {
  productId: number;
  quantity: number;
  /** When given, the pairing is remembered on the food for next time. */
  foodId?: string | null;
  /** Product name as the user saw it, stored alongside the id. */
  productName?: string | null;
};

export type PushResult = {
  added: { productId: number; quantity: number }[];
  /** Lines that never made it — the first failure stops the run. */
  skipped: number;
  error: string | null;
  cart: CartSummary | null;
};

/**
 * Signs in and puts the chosen products in the household's Rohlík basket.
 *
 * Stops at the first failure rather than retrying down the list: a rejected
 * add usually means the session died or Rohlík changed something, and
 * hammering it would neither help nor be polite. What already went in is
 * reported, so the screen can say "7 z 12 je v košíku" instead of pretending
 * the basket is complete.
 *
 * It only ever ADDS. Nothing here empties or edits the existing basket, so
 * the worst case is a duplicate the user removes on Rohlík.
 */
export async function pushToCart(
  actor: Actor,
  lines: CartLine[],
): Promise<PushResult> {
  if (lines.length === 0) {
    throw new ApiError("validation_error", "Není co přidat do košíku.");
  }

  const session = await RohlikSession.login();
  const added: { productId: number; quantity: number }[] = [];
  let error: string | null = null;

  for (const [index, line] of lines.entries()) {
    try {
      await session.addToCart(line.productId, line.quantity);
      added.push({ productId: line.productId, quantity: line.quantity });
    } catch (err) {
      error =
        err instanceof Error
          ? err.message
          : "Rohlík odmítl položku a nenapsal proč.";
      return {
        added,
        skipped: lines.length - index,
        error,
        cart: await session.cartSummary().catch(() => null),
      };
    }
  }

  await rememberPairings(actor, lines);
  return {
    added,
    skipped: 0,
    error: null,
    cart: await session.cartSummary().catch(() => null),
  };
}

/** Remembers which Rohlík product a food maps to, so it is asked only once. */
async function rememberPairings(
  actor: Actor,
  lines: CartLine[],
): Promise<void> {
  for (const line of lines) {
    if (!line.foodId) continue;
    await db
      .update(foods)
      .set({
        rohlikProductId: line.productId,
        rohlikProductName: line.productName ?? null,
        lastModifiedBy: actor.userId,
      })
      .where(
        and(
          eq(foods.id, line.foodId),
          // The food id comes from the request, so it is checked against the
          // actor's household, never trusted (ARCHITECTURE.md §2.1).
          eq(foods.householdId, actor.householdId),
        ),
      );
  }
}
