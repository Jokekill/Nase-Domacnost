import { eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { offCache } from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Open Food Facts integration (zadání §11). We honour their usage rules:
 * a descriptive User-Agent, a conservative rate limit, and cached responses.
 * OFF data is frequently incomplete — missing values stay missing, they are
 * never turned into zeros.
 */

const OFF_BASE = "https://world.openfoodfacts.org";
/** Search moved to a dedicated service; the legacy /cgi/search.pl returns 503. */
const OFF_SEARCH_BASE = "https://search.openfoodfacts.org";
const USER_AGENT =
  "NaseDomacnost/0.1 (self-hosted household app; contact via app owner)";
const CACHE_TTL_MS = 30 * 24 * 3600_000; // 30 days

export type OffProduct = {
  barcode: string | null;
  name: string;
  brand: string | null;
  quantity: string | null;
  imageUrl: string | null;
  referenceUnit: "100g" | "100ml";
  energyKj: number | null;
  proteinG: number | null;
  carbsG: number | null;
  sugarsG: number | null;
  fiberG: number | null;
  fatG: number | null;
  satFatG: number | null;
  saltG: number | null;
  /** Nutrients OFF did not provide — surfaced to the user (§11). */
  missing: string[];
};

type OffRaw = {
  code?: string;
  product_name?: string;
  product_name_cs?: string;
  brands?: string;
  quantity?: string;
  image_front_small_url?: string;
  quantity_unit?: string;
  nutriments?: Record<string, number | string | undefined>;
};

const NUTRIENT_MAP: {
  key: keyof Omit<
    OffProduct,
    | "barcode"
    | "name"
    | "brand"
    | "quantity"
    | "imageUrl"
    | "referenceUnit"
    | "missing"
  >;
  offKeys: string[];
  label: string;
}[] = [
  { key: "energyKj", offKeys: ["energy-kj_100g", "energy_100g"], label: "energie" },
  { key: "proteinG", offKeys: ["proteins_100g"], label: "bílkoviny" },
  { key: "carbsG", offKeys: ["carbohydrates_100g"], label: "sacharidy" },
  { key: "sugarsG", offKeys: ["sugars_100g"], label: "cukry" },
  { key: "fiberG", offKeys: ["fiber_100g"], label: "vláknina" },
  { key: "fatG", offKeys: ["fat_100g"], label: "tuky" },
  { key: "satFatG", offKeys: ["saturated-fat_100g"], label: "nasycené tuky" },
  { key: "saltG", offKeys: ["salt_100g"], label: "sůl" },
];

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapOffProduct(raw: OffRaw): OffProduct | null {
  const name = raw.product_name_cs?.trim() || raw.product_name?.trim();
  if (!name) return null;

  const nutriments = raw.nutriments ?? {};
  const missing: string[] = [];
  const values: Record<string, number | null> = {};

  for (const entry of NUTRIENT_MAP) {
    let value: number | null = null;
    for (const offKey of entry.offKeys) {
      value = num(nutriments[offKey]);
      if (value != null) break;
    }
    // OFF stores "energy_100g" in kJ already; energy-kcal would need scaling.
    if (entry.key === "energyKj" && value == null) {
      const kcal = num(nutriments["energy-kcal_100g"]);
      if (kcal != null) value = Math.round(kcal * 4.184);
    }
    if (value == null) missing.push(entry.label);
    values[entry.key] = value;
  }

  const isLiquid =
    typeof raw.quantity === "string" &&
    /\b(ml|l|litr)\b/i.test(raw.quantity ?? "");

  return {
    barcode: raw.code ?? null,
    name,
    brand: raw.brands?.split(",")[0]?.trim() || null,
    quantity: raw.quantity ?? null,
    imageUrl: raw.image_front_small_url ?? null,
    referenceUnit: isLiquid ? "100ml" : "100g",
    energyKj: values.energyKj,
    proteinG: values.proteinG,
    carbsG: values.carbsG,
    sugarsG: values.sugarsG,
    fiberG: values.fiberG,
    fatG: values.fatG,
    satFatG: values.satFatG,
    saltG: values.saltG,
    missing,
  };
}

async function cachedFetch(
  cacheKey: string,
  url: string,
  /** Status codes whose JSON body is a valid answer (e.g. 404 "not found"). */
  acceptStatuses: number[] = [],
): Promise<unknown> {
  const [hit] = await db
    .select()
    .from(offCache)
    .where(eq(offCache.cacheKey, cacheKey))
    .limit(1);
  if (hit && Date.now() - hit.fetchedAt.getTime() < CACHE_TTL_MS) {
    return hit.response;
  }

  // Be a good citizen: cap outbound requests regardless of user activity.
  enforceRateLimit("off:global", { limit: 60, windowMs: 60_000 });

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);

  if (!res || (!res.ok && !acceptStatuses.includes(res.status))) {
    if (hit) return hit.response; // stale cache beats no answer
    throw new ApiError(
      "internal",
      "Open Food Facts je teď nedostupný. Zkus to později nebo zadej hodnoty ručně.",
    );
  }
  const json = await res.json().catch(() => null);
  if (json == null) {
    throw new ApiError(
      "internal",
      "Open Food Facts vrátil neplatnou odpověď. Zkus to později.",
    );
  }

  await db
    .insert(offCache)
    .values({ cacheKey, response: json, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: offCache.cacheKey,
      set: { response: json, fetchedAt: new Date() },
    });
  // Opportunistic cleanup of long-expired entries.
  await db
    .delete(offCache)
    .where(lt(offCache.fetchedAt, new Date(Date.now() - CACHE_TTL_MS * 3)));

  return json;
}

/**
 * Search candidates. The search service does NOT return nutriments, so results
 * carry identification only — the user picks one and we then load the full
 * product by barcode (zadání §11: "nalezenou položku uživatel potvrdí").
 */
export type OffCandidate = {
  barcode: string;
  name: string;
  brand: string | null;
  quantity: string | null;
};

export async function offSearch(query: string): Promise<OffCandidate[]> {
  const url =
    `${OFF_SEARCH_BASE}/search?q=${encodeURIComponent(query)}&page_size=12` +
    `&fields=code,product_name,brands,quantity`;
  const json = (await cachedFetch(`search:${query.toLowerCase()}`, url)) as {
    hits?: {
      code?: string;
      product_name?: string;
      brands?: string[] | string;
      quantity?: string;
    }[];
  };
  return (json.hits ?? [])
    .filter((hit) => hit.code && hit.product_name)
    .map((hit) => ({
      barcode: hit.code!,
      name: hit.product_name!,
      brand: Array.isArray(hit.brands)
        ? (hit.brands[0] ?? null)
        : (hit.brands?.split(",")[0]?.trim() ?? null),
      quantity: hit.quantity ?? null,
    }));
}

export async function offByBarcode(barcode: string): Promise<OffProduct | null> {
  const url =
    `${OFF_BASE}/api/v2/product/${encodeURIComponent(barcode)}.json` +
    `?fields=code,product_name,product_name_cs,brands,quantity,image_front_small_url,nutriments`;
  // 404 is OFF's "no such product" — a valid answer, not an outage.
  const json = (await cachedFetch(`barcode:${barcode}`, url, [404])) as {
    status?: number;
    product?: OffRaw;
  };
  if (json.status !== 1 || !json.product) return null;
  return mapOffProduct(json.product);
}
