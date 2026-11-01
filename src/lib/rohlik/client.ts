/**
 * Thin client for rohlik.cz (D-029).
 *
 * Rohlík has no public API. These are the endpoints its own web app calls,
 * and they can change without notice — which is exactly why they all live in
 * this one file, behind a small typed surface, and why every failure comes
 * back as a plain sentence the shopping screen can show instead of a stack
 * trace. If Rohlík moves something, this file is the only thing to fix.
 *
 * Verified against the live site: product search and reading the cart.
 * NOT verified (no account was used while writing this): signing in and
 * adding to the cart. Both follow what the web app sends; the first real run
 * has to confirm them, and the UI says so.
 */

import { ApiError } from "@/lib/api/errors";

const BASE = "https://www.rohlik.cz";
const SERVICE = `${BASE}/services/frontend-service`;
/** Identifies us honestly, the same courtesy as the Open Food Facts client. */
const USER_AGENT =
  "NaseDomacnost/1.0 (self-hosted household app; +https://github.com/Jokekill/Nase-Domacnost)";
const TIMEOUT_MS = 15_000;

export type RohlikProduct = {
  productId: number;
  name: string;
  brand: string | null;
  /** Rohlík's own `unit` — "kg", "l", "ks", … */
  unit: string | null;
  /** Rohlík's own `textualAmount` — "1 kg", "2x250 g", … */
  textualAmount: string | null;
  price: number | null;
  currency: string | null;
  inStock: boolean;
  imagePath: string | null;
  /** Absolute product page, for "podívat se na Rohlíku". */
  url: string;
};

/** What signing in needs. Where it comes from is `./credentials`' business. */
export type RohlikLogin = { login: string; password: string };

/* ------------------------------------------------------------------ */
/* Cookies                                                            */
/* ------------------------------------------------------------------ */

/**
 * Minimal cookie jar. `fetch` does not keep cookies between calls, and the
 * whole point of signing in is that the next request is recognised.
 */
class CookieJar {
  private jar = new Map<string, string>();

  absorb(res: Response): void {
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  header(): string {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  get size(): number {
    return this.jar.size;
  }
}

type Envelope<T> = { status?: number; messages?: unknown[]; data?: T };

async function request<T>(
  url: string,
  init: RequestInit & { jar?: CookieJar } = {},
): Promise<T> {
  const { jar, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...(jar && jar.size > 0 ? { Cookie: jar.header() } : {}),
        ...rest.headers,
      },
      // Never let a slow Rohlík hold an app request open for minutes.
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // We handle the session ourselves; a redirect to the login page should
      // surface as a failure, not be followed silently.
      redirect: "manual",
      cache: "no-store",
    });
  } catch (err) {
    throw new ApiError(
      "internal",
      `Rohlík neodpověděl (${err instanceof Error ? err.message : "síťová chyba"}).`,
    );
  }

  jar?.absorb(res);

  if (res.status >= 300 && res.status < 400) {
    throw new ApiError(
      "internal",
      "Rohlík přesměrovává — pravděpodobně vypršelo přihlášení.",
    );
  }
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok) {
    const detail = describeMessages(body?.messages);
    throw new ApiError(
      res.status === 401 || res.status === 403 ? "forbidden" : "internal",
      `Rohlík odmítl požadavek (HTTP ${res.status})${detail ? `: ${detail}` : "."}`,
    );
  }
  if (body === null) {
    throw new ApiError("internal", "Rohlík poslal odpověď, která není JSON.");
  }
  // The service wraps everything in {status, messages, data}; a few endpoints
  // answer with the payload directly.
  return (body.data ?? (body as unknown)) as T;
}

function describeMessages(messages: unknown[] | undefined): string | null {
  if (!messages?.length) return null;
  const texts = messages
    .map((m) =>
      typeof m === "string"
        ? m
        : ((m as { content?: string; message?: string })?.content ??
          (m as { message?: string })?.message ??
          null),
    )
    .filter((t): t is string => Boolean(t));
  return texts.length ? texts.join(" ") : null;
}

/* ------------------------------------------------------------------ */
/* Search — public, no sign-in needed                                 */
/* ------------------------------------------------------------------ */

type SearchResponse = {
  productList?: {
    productId: number;
    productName: string;
    brand?: string | null;
    unit?: string | null;
    textualAmount?: string | null;
    price?: { full?: number; currency?: string } | null;
    inStock?: boolean;
    imgPath?: string | null;
    baseLink?: string | null;
  }[];
};

/** Searches the catalogue. Anonymous — prices and stock are the public ones. */
export async function searchProducts(
  query: string,
  limit = 8,
): Promise<RohlikProduct[]> {
  const trimmed = query.trim();
  if (trimmed === "") return [];
  const url = `${SERVICE}/search-metadata?search=${encodeURIComponent(
    trimmed,
  )}&companyId=1`;
  const data = await request<SearchResponse>(url);
  return (data.productList ?? []).slice(0, limit).map((p) => ({
    productId: p.productId,
    name: p.productName,
    brand: p.brand ?? null,
    unit: p.unit ?? null,
    textualAmount: p.textualAmount ?? null,
    price: p.price?.full ?? null,
    currency: p.price?.currency ?? null,
    inStock: p.inStock !== false,
    imagePath: p.imgPath ? `${BASE}${p.imgPath}` : null,
    url: p.baseLink ? `${BASE}/${p.baseLink}` : BASE,
  }));
}

/* ------------------------------------------------------------------ */
/* Signed-in session — basket writes                                  */
/* ------------------------------------------------------------------ */

export type CartSummary = {
  cartId: number | string | null;
  totalPrice: number | null;
  itemCount: number;
};

type CartResponse = {
  cartId?: number | string | null;
  totalPrice?: number | null;
  items?: Record<string, unknown> | null;
};

/**
 * A signed-in Rohlík session. Short-lived on purpose: it is created for one
 * basket push and thrown away, so nothing holds the household's Rohlík
 * session longer than the request that needed it.
 */
export class RohlikSession {
  private constructor(private readonly jar: CookieJar) {}

  /**
   * Signs in. The caller says with what — this module never reaches for the
   * environment or the database, so there is exactly one place (./credentials)
   * that decides whose account is being used.
   */
  static async login({
    login,
    password,
  }: RohlikLogin): Promise<RohlikSession> {
    if (!login || !password) {
      throw new ApiError(
        "validation_error",
        "Rohlík není připojený — vyplň e-mail a heslo v Nastavení.",
      );
    }
    const jar = new CookieJar();
    // Pick up the anonymous session cookie first; the login endpoint expects
    // to upgrade an existing one rather than start from nothing.
    await request<CartResponse>(`${SERVICE}/v2/cart`, { jar }).catch(
      () => null,
    );
    await request<unknown>(`${SERVICE}/login`, {
      method: "POST",
      body: JSON.stringify({ email: login, password, name: "" }),
      jar,
    });
    return new RohlikSession(jar);
  }

  /** Puts `quantity` of a product in the basket. */
  async addToCart(productId: number, quantity: number): Promise<void> {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new ApiError("validation_error", "Počet balení musí být aspoň 1.");
    }
    await request<unknown>(`${SERVICE}/v2/cart`, {
      method: "POST",
      body: JSON.stringify({
        productId,
        quantity,
        // Rohlík records where an item came from; be honest about it.
        source: "true:nase-domacnost",
        actionId: null,
        recipeId: null,
      }),
      jar: this.jar,
    });
  }

  async cartSummary(): Promise<CartSummary> {
    const data = await request<CartResponse>(`${SERVICE}/v2/cart`, {
      jar: this.jar,
    });
    return {
      cartId: data.cartId ?? null,
      totalPrice: data.totalPrice ?? null,
      itemCount: Object.keys(data.items ?? {}).length,
    };
  }
}
