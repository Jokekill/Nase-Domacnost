"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useDialog } from "@/components/dialog";
import { apiFetch } from "@/lib/api/client";
import { formatScaled } from "@/lib/domain/servings";
import { UNIT_LABELS, type Unit } from "@/lib/recipes/types";

type Candidate = {
  productId: number;
  name: string;
  brand: string | null;
  unit: string | null;
  textualAmount: string | null;
  price: number | null;
  currency: string | null;
  inStock: boolean;
  imagePath: string | null;
  url: string;
  packages: number | null;
  problem: string | null;
};

type Match = {
  itemId: string;
  name: string;
  amount: number | null;
  unit: string | null;
  note: string | null;
  foodId: string | null;
  savedProductId: number | null;
  suggestedProductId: number | null;
  candidates: Candidate[];
};

type MatchResponse = { items: Match[]; truncated: boolean };

type PushResult = {
  added: { productId: number; quantity: number }[];
  skipped: number;
  error: string | null;
  cart: {
    cartId: number | string | null;
    totalPrice: number | null;
    itemCount: number;
  } | null;
};

type Choice = { productId: number | null; quantity: number };

const SKIP = "none";
const unitLabel = (unit: string | null) =>
  unit ? (UNIT_LABELS[unit as Unit] ?? unit) : "";

/**
 * "Do Rohlíku": matches the open items of a list against Rohlík's catalogue,
 * lets the household fix what the match got wrong, and then fills the basket
 * (D-029).
 *
 * Deliberately a review screen and not a one-tap action: a shopping item is
 * "500 g mouky", a Rohlík line is "1× Pernerka hladká 1 kg", and only a human
 * can say those are the same thing. Nothing is ordered — the basket still has
 * to be checked out on rohlik.cz.
 */
export function RohlikPanel({
  listId,
  cartEnabled,
  onClose,
}: {
  listId: string;
  /** False when the server has no Rohlík credentials — review still works. */
  cartEnabled: boolean;
  onClose: () => void;
}) {
  const dialog = useDialog(onClose);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [extra, setExtra] = useState<Record<string, Candidate[]>>({});
  const [searchFor, setSearchFor] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [result, setResult] = useState<PushResult | null>(null);

  const match = useQuery({
    queryKey: ["rohlik-match", listId],
    queryFn: () =>
      apiFetch<MatchResponse>("/api/rohlik/match", {
        method: "POST",
        json: { listId },
      }),
    // The catalogue lookup is a handful of calls to someone else's site —
    // don't repeat it just because the window regained focus.
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const items = match.data?.items ?? [];

  const candidatesFor = (item: Match) => [
    ...item.candidates,
    ...(extra[item.itemId] ?? []).filter(
      (c) => !item.candidates.some((known) => known.productId === c.productId),
    ),
  ];

  const choiceFor = (item: Match): Choice => {
    const stored = choices[item.itemId];
    if (stored) return stored;
    const suggested = candidatesFor(item).find(
      (c) => c.productId === item.suggestedProductId,
    );
    return {
      productId: suggested?.productId ?? null,
      quantity: suggested?.packages ?? 1,
    };
  };

  const setChoice = (itemId: string, next: Choice) =>
    setChoices((prev) => ({ ...prev, [itemId]: next }));

  const search = useMutation({
    mutationFn: (query: string) =>
      apiFetch<{ items: Omit<Candidate, "packages" | "problem">[] }>(
        `/api/rohlik/search?q=${encodeURIComponent(query)}`,
      ),
    onSuccess: (data, query) => {
      if (!searchFor) return;
      setExtra((prev) => ({
        ...prev,
        [searchFor]: data.items.map((p) => ({
          ...p,
          // Hand-picked: we have no idea how many packages this is, so we do
          // not pretend to — the user sets the count.
          packages: null,
          problem: `nalezeno ručně („${query}“) — zkontroluj počet balení`,
        })),
      }));
      // A second search replaces the previous hand-picked results, so a
      // choice made from them would point at a product no longer offered.
      setChoice(searchFor, { productId: null, quantity: 1 });
    },
  });

  const lines = items
    .map((item) => {
      const choice = choiceFor(item);
      if (choice.productId === null) return null;
      const product = candidatesFor(item).find(
        (c) => c.productId === choice.productId,
      );
      return {
        productId: choice.productId,
        quantity: Math.max(1, choice.quantity),
        foodId: item.foodId,
        productName: product?.name ?? null,
      };
    })
    .filter((line): line is NonNullable<typeof line> => line !== null);

  const push = useMutation({
    mutationFn: () =>
      apiFetch<PushResult>("/api/rohlik/cart", {
        method: "POST",
        json: { lines },
      }),
    onSuccess: setResult,
    onError: (err: Error) =>
      setResult({
        added: [],
        skipped: lines.length,
        error: err.message,
        cart: null,
      }),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      {...dialog.backdropProps}
    >
      <div
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-card bg-surface p-4 shadow-pop sm:rounded-card"
        {...dialog.panelProps}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id={dialog.titleId} className="text-lg font-semibold">
            🥕 Do košíku na Rohlíku
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-sm min-h-11"
            aria-label="Zavřít"
          >
            ✕
          </button>
        </div>

        <p className="mb-3 text-sm text-muted-foreground">
          Zkontroluj, co se k čemu spárovalo, a pak to pošli do košíku.
          Objednávku nic nedokončí — tu potvrdíš sám na rohlik.cz.
        </p>

        {!cartEnabled && (
          <p
            role="status"
            className="mb-3 rounded-lg bg-surface-warm p-2.5 text-sm"
          >
            Přihlášení k Rohlíku není nastavené (<code>ROHLIK_EMAIL</code>,{" "}
            <code>ROHLIK_PASSWORD</code>), takže košík zatím naplnit nejde —
            hledání a párování funguje i tak.
          </p>
        )}

        {match.isLoading && (
          <p className="py-10 text-center text-muted-foreground">
            Hledám položky na Rohlíku…
          </p>
        )}
        {match.isError && (
          <p className="rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">
            {(match.error as Error).message}
          </p>
        )}
        {match.data?.truncated && (
          <p className="mb-3 text-xs text-muted-foreground">
            Seznam je dlouhý — zobrazeno prvních 60 položek.
          </p>
        )}
        {match.isSuccess && items.length === 0 && (
          <p className="rounded-card border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            V seznamu nejsou žádné neodškrtnuté položky.
          </p>
        )}

        <ul className="space-y-2">
          {items.map((item) => {
            const choice = choiceFor(item);
            const candidates = candidatesFor(item);
            const chosen = candidates.find(
              (c) => c.productId === choice.productId,
            );
            return (
              <li
                key={item.itemId}
                className="rounded-card border border-border bg-background p-3"
              >
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <strong>{item.name}</strong>
                  <span className="text-sm text-muted-foreground">
                    potřeba {formatScaled(item.amount)} {unitLabel(item.unit)}
                    {item.note && ` (${item.note})`}
                  </span>
                </div>

                {candidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Na Rohlíku se nic nenašlo — zkus hledat ručně.
                  </p>
                ) : (
                  <select
                    value={
                      choice.productId === null
                        ? SKIP
                        : String(choice.productId)
                    }
                    onChange={(e) => {
                      if (e.target.value === SKIP) {
                        setChoice(item.itemId, {
                          productId: null,
                          quantity: 1,
                        });
                        return;
                      }
                      const productId = Number(e.target.value);
                      const picked = candidates.find(
                        (c) => c.productId === productId,
                      );
                      setChoice(item.itemId, {
                        productId,
                        quantity: picked?.packages ?? 1,
                      });
                    }}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    aria-label={`Produkt pro ${item.name}`}
                  >
                    <option value={SKIP}>— nepřidávat —</option>
                    {candidates.map((c) => (
                      <option key={c.productId} value={c.productId}>
                        {c.name}
                        {c.textualAmount ? ` · ${c.textualAmount}` : ""}
                        {c.price != null
                          ? ` · ${c.price} ${c.currency ?? ""}`
                          : ""}
                        {c.inStock ? "" : " · není skladem"}
                        {c.productId === item.savedProductId ? " · minule" : ""}
                      </option>
                    ))}
                  </select>
                )}

                {chosen && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <label className="flex items-center gap-2">
                      <span className="text-xs font-medium">Balení</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={choice.quantity}
                        onChange={(e) =>
                          setChoice(item.itemId, {
                            ...choice,
                            quantity: Math.min(
                              50,
                              Math.max(1, Number(e.target.value) || 1),
                            ),
                          })
                        }
                        className="w-20 rounded-lg border border-border bg-surface px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-ring min-h-11"
                      />
                    </label>
                    <a
                      href={chosen.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary hover:underline"
                    >
                      otevřít na Rohlíku ↗
                    </a>
                    {chosen.problem && (
                      <span className="text-xs text-muted-foreground">
                        ⚠️ {chosen.problem}
                      </span>
                    )}
                    {!chosen.inStock && (
                      <span className="text-xs text-destructive">
                        není skladem
                      </span>
                    )}
                  </div>
                )}

                {searchFor === item.itemId ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (searchText.trim().length >= 2) {
                        search.mutate(searchText.trim());
                      }
                    }}
                    className="mt-2 flex gap-2"
                  >
                    <input
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="Hledat na Rohlíku…"
                      className="grow rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      type="submit"
                      disabled={search.isPending}
                      className="rounded-lg border border-border px-3 py-2 text-sm min-h-11"
                    >
                      {search.isPending ? "…" : "Hledat"}
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={() => {
                      setSearchFor(item.itemId);
                      setSearchText(item.name);
                    }}
                    className="mt-2 text-sm text-primary hover:underline min-h-11"
                  >
                    Hledat jiný produkt
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {result && (
          <div
            role="status"
            className="mt-3 rounded-lg bg-surface-warm p-2.5 text-sm"
          >
            {result.added.length > 0 && (
              <p>
                Do košíku přidáno {result.added.length} položek
                {result.cart?.totalPrice != null && (
                  <> — košík má teď {result.cart.totalPrice} Kč</>
                )}
                .{" "}
                <a
                  href="https://www.rohlik.cz/kosik"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary hover:underline"
                >
                  Otevřít košík ↗
                </a>
              </p>
            )}
            {result.error && (
              <p className="text-destructive">
                {result.error}
                {result.skipped > 0 && (
                  <> Nepřidáno: {result.skipped} položek.</>
                )}
              </p>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => {
              setResult(null);
              push.mutate();
            }}
            disabled={!cartEnabled || lines.length === 0 || push.isPending}
            className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground disabled:opacity-50 min-h-11"
          >
            {push.isPending
              ? "Přidávám do košíku…"
              : `Přidat do košíku (${lines.length})`}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-5 py-2.5 font-medium min-h-11"
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
}
