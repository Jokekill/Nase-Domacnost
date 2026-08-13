"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";
import { BarcodeScanner } from "@/components/foods/barcode-scanner";
import { apiFetch } from "@/lib/api/client";
import {
  NUTRIENT_KEYS,
  NUTRIENT_LABELS,
  NUTRIENT_UNITS,
  type NutrientKey,
} from "@/lib/domain/nutrition";

type Food = {
  id: string;
  name: string;
  foodCategoryId: string | null;
  referenceUnit: string;
  source: string;
  densityGPerMl: number | null;
  gramsPerPiece: number | null;
  divisiblePieces: boolean;
} & Partial<Record<NutrientKey, number | null>>;

type FoodDetail = Food & {
  offBarcode: string | null;
  units: { id: string; unit: string; gramsPerUnit: number }[];
};

type OffProduct = {
  barcode: string | null;
  name: string;
  brand: string | null;
  quantity: string | null;
  referenceUnit: "100g" | "100ml";
  missing: string[];
} & Partial<Record<NutrientKey, number | null>>;

/** Search results carry identification only; nutrition is fetched on confirm. */
type OffCandidate = {
  barcode: string;
  name: string;
  brand: string | null;
  quantity: string | null;
};

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const label = "mb-1 block text-xs font-medium";
const card = "rounded-card border border-border bg-surface p-4 shadow-card";

export default function FoodsPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [offCandidates, setOffCandidates] = useState<OffCandidate[] | null>(
    null,
  );
  const [offProduct, setOffProduct] = useState<OffProduct | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data: foods } = useQuery({
    queryKey: ["foods", debounced],
    queryFn: () =>
      apiFetch<{ items: Food[] }>(
        `/api/foods?q=${encodeURIComponent(debounced)}`,
      ),
  });
  const { data: categories } = useQuery({
    queryKey: ["food-categories"],
    queryFn: () =>
      apiFetch<{ items: { id: string; name: string; parentId: string | null }[] }>(
        "/api/food-categories",
      ),
  });

  async function lookupBarcode(code: string) {
    setScanning(false);
    setMessage(null);
    setOffCandidates(null);
    setBusy(true);
    try {
      setOffProduct(await apiFetch<OffProduct>(`/api/off/barcode/${code}`));
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function searchOff() {
    setMessage(null);
    setOffProduct(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ items: OffCandidate[] }>(
        `/api/off/search?q=${encodeURIComponent(q)}`,
      );
      setOffCandidates(res.items);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const importOff = useMutation({
    mutationFn: (product: OffProduct) =>
      apiFetch("/api/foods", {
        method: "POST",
        json: {
          id: uuidv7(),
          name: [product.brand, product.name].filter(Boolean).join(" "),
          referenceUnit: product.referenceUnit,
          energyKj: product.energyKj ?? null,
          proteinG: product.proteinG ?? null,
          carbsG: product.carbsG ?? null,
          sugarsG: product.sugarsG ?? null,
          fiberG: product.fiberG ?? null,
          fatG: product.fatG ?? null,
          satFatG: product.satFatG ?? null,
          saltG: product.saltG ?? null,
          source: "openfoodfacts",
          offBarcode: product.barcode,
        },
      }),
    onSuccess: async () => {
      setOffProduct(null);
      setOffCandidates(null);
      setMessage("Potravina byla přidána.");
      await queryClient.invalidateQueries({ queryKey: ["foods"] });
    },
    onError: (err) => setMessage(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-semibold">Potraviny</h1>
        <Link
          href="/nastaveni"
          className="text-sm text-primary hover:underline"
        >
          ← Nastavení
        </Link>
      </div>

      <div className={card}>
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Hledat potravinu…"
            className={`${input} grow`}
          />
          <button
            onClick={() => setScanning(true)}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-warm min-h-11"
          >
            📷 Skenovat kód
          </button>
          <button
            onClick={searchOff}
            disabled={q.trim().length < 2}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-warm disabled:opacity-50 min-h-11"
          >
            Hledat v Open Food Facts
          </button>
          <button
            onClick={() => setEditingId("new")}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground min-h-11"
          >
            + Nová potravina
          </button>
        </div>
        {message && <p className="mt-2 text-sm">{message}</p>}
      </div>

      {scanning && (
        <BarcodeScanner
          onDetected={lookupBarcode}
          onClose={() => setScanning(false)}
        />
      )}

      {busy && (
        <p className="text-sm text-muted-foreground">
          Ptám se Open Food Facts…
        </p>
      )}

      {offCandidates && (
        <div className={card}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Nalezeno v Open Food Facts</h2>
            <button
              onClick={() => setOffCandidates(null)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              zavřít
            </button>
          </div>
          {offCandidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nic nenalezeno.</p>
          ) : (
            <ul className="space-y-2">
              {offCandidates.map((c) => (
                <li
                  key={c.barcode}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2"
                >
                  <p className="text-sm">
                    <span className="font-medium">
                      {[c.brand, c.name].filter(Boolean).join(" ")}
                    </span>
                    {c.quantity && (
                      <span className="text-muted-foreground"> · {c.quantity}</span>
                    )}
                  </p>
                  <button
                    onClick={() => lookupBarcode(c.barcode)}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-warm min-h-11"
                  >
                    Zobrazit hodnoty
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {offProduct && (
        <div className={card}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {[offProduct.brand, offProduct.name].filter(Boolean).join(" ")}
            </h2>
            <button
              onClick={() => setOffProduct(null)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              zavřít
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            {NUTRIENT_KEYS.map((key) => (
              <div key={key} className="flex justify-between border-b border-border/60 py-1">
                <dt className="text-muted-foreground">{NUTRIENT_LABELS[key]}</dt>
                <dd className="font-medium">
                  {offProduct[key] != null
                    ? `${Math.round((offProduct[key] as number) * 10) / 10} ${NUTRIENT_UNITS[key]}`
                    : "—"}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            Hodnoty na{" "}
            {offProduct.referenceUnit === "100ml" ? "100 ml" : "100 g"}.
            {offProduct.missing.length > 0 && (
              <>
                {" "}
                <span className="text-warning">
                  Open Food Facts neuvádí: {offProduct.missing.join(", ")}.
                </span>{" "}
                Zůstanou prázdné (nedosazujeme nuly) — doplň je ručně, pokud je
                znáš.
              </>
            )}
          </p>
          <button
            onClick={() => importOff.mutate(offProduct)}
            disabled={importOff.isPending}
            className="mt-3 rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground min-h-11"
          >
            Přidat do potravin
          </button>
        </div>
      )}

      {editingId && (
        <FoodEditor
          foodId={editingId === "new" ? null : editingId}
          categories={categories?.items ?? []}
          onClose={() => setEditingId(null)}
          onSaved={async () => {
            setEditingId(null);
            await queryClient.invalidateQueries({ queryKey: ["foods"] });
          }}
        />
      )}

      <div className={card}>
        <ul className="divide-y divide-border">
          {(foods?.items ?? []).map((food) => (
            <li
              key={food.id}
              className="flex items-center justify-between gap-2 py-2"
            >
              <div className="text-sm">
                <p className="font-medium">{food.name}</p>
                <p className="text-xs text-muted-foreground">
                  {food.energyKj != null
                    ? `${Math.round(food.energyKj)} kJ`
                    : "bez hodnot"}{" "}
                  / {food.referenceUnit === "100ml" ? "100 ml" : food.referenceUnit === "piece" ? "kus" : "100 g"}
                  {food.source === "openfoodfacts" && " · OFF"}
                  {food.source === "seed" && " · základní katalog"}
                </p>
              </div>
              <button
                onClick={() => setEditingId(food.id)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-warm min-h-11"
              >
                Upravit
              </button>
            </li>
          ))}
          {(foods?.items ?? []).length === 0 && (
            <li className="py-4 text-sm text-muted-foreground">
              Nic nenalezeno.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function FoodEditor({
  foodId,
  categories,
  onClose,
  onSaved,
}: {
  foodId: string | null;
  categories: { id: string; name: string; parentId: string | null }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<
    { id?: string; unit: string; gramsPerUnit: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  const { data: detail } = useQuery({
    queryKey: ["food", foodId],
    queryFn: () => apiFetch<FoodDetail>(`/api/foods/${foodId}`),
    enabled: !!foodId,
  });

  useEffect(() => {
    if (!detail) return;
    const next: Record<string, string> = {
      name: detail.name,
      referenceUnit: detail.referenceUnit,
      foodCategoryId: detail.foodCategoryId ?? "",
      densityGPerMl: detail.densityGPerMl?.toString() ?? "",
      gramsPerPiece: detail.gramsPerPiece?.toString() ?? "",
      divisiblePieces: detail.divisiblePieces ? "1" : "",
    };
    for (const key of NUTRIENT_KEYS) next[key] = detail[key]?.toString() ?? "";
    setForm(next);
    setUnits(
      detail.units.map((u) => ({
        id: u.id,
        unit: u.unit,
        gramsPerUnit: String(u.gramsPerUnit),
      })),
    );
  }, [detail]);

  const set = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const num = (value?: string) =>
    value && value.trim() !== "" ? Number(value.replace(",", ".")) : null;

  async function save() {
    setError(null);
    const payload = {
      name: form.name?.trim(),
      referenceUnit: form.referenceUnit || "100g",
      foodCategoryId: form.foodCategoryId || null,
      densityGPerMl: num(form.densityGPerMl),
      gramsPerPiece: num(form.gramsPerPiece),
      divisiblePieces: form.divisiblePieces === "1",
      ...Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, num(form[k])])),
      units: units
        .filter((u) => u.unit.trim() && u.gramsPerUnit.trim())
        .map((u) => ({
          id: u.id,
          unit: u.unit.trim(),
          gramsPerUnit: Number(u.gramsPerUnit.replace(",", ".")),
        })),
    };
    try {
      if (foodId) {
        await apiFetch(`/api/foods/${foodId}`, { method: "PATCH", json: payload });
      } else {
        await apiFetch("/api/foods", {
          method: "POST",
          json: { ...payload, id: uuidv7(), source: "manual" },
        });
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {foodId ? "Upravit potravinu" : "Nová potravina"}
        </h2>
        <button
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          zavřít
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className={label}>Název</span>
          <input
            value={form.name ?? ""}
            onChange={(e) => set("name", e.target.value)}
            className={input}
          />
        </label>
        <label>
          <span className={label}>Hodnoty se vztahují k</span>
          <select
            value={form.referenceUnit ?? "100g"}
            onChange={(e) => set("referenceUnit", e.target.value)}
            className={input}
          >
            <option value="100g">100 g</option>
            <option value="100ml">100 ml</option>
            <option value="piece">1 kus</option>
          </select>
        </label>
        <label>
          <span className={label}>Skupina</span>
          <select
            value={form.foodCategoryId ?? ""}
            onChange={(e) => set("foodCategoryId", e.target.value)}
            className={input}
          >
            <option value="">— bez skupiny —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? "– " : ""}
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h3 className="mb-2 mt-4 text-sm font-semibold">
        Nutriční hodnoty (prázdné = neznámé, nedosazuje se nula)
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {NUTRIENT_KEYS.map((key) => (
          <label key={key}>
            <span className={label}>
              {NUTRIENT_LABELS[key]} ({NUTRIENT_UNITS[key]})
            </span>
            <input
              value={form[key] ?? ""}
              onChange={(e) => set(key, e.target.value)}
              inputMode="decimal"
              className={input}
            />
          </label>
        ))}
      </div>

      <h3 className="mb-2 mt-4 text-sm font-semibold">Převody</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label>
          <span className={label}>Hustota (g/ml) — pro převod ml ↔ g</span>
          <input
            value={form.densityGPerMl ?? ""}
            onChange={(e) => set("densityGPerMl", e.target.value)}
            inputMode="decimal"
            className={input}
          />
        </label>
        <label>
          <span className={label}>Hmotnost kusu (g)</span>
          <input
            value={form.gramsPerPiece ?? ""}
            onChange={(e) => set("gramsPerPiece", e.target.value)}
            inputMode="decimal"
            className={input}
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={form.divisiblePieces === "1"}
            onChange={(e) => set("divisiblePieces", e.target.checked ? "1" : "")}
          />
          Půlky kusů dávají smysl
        </label>
      </div>

      <div className="mt-3 space-y-2">
        <p className={label}>Vlastní jednotky (lžíce, lžička…)</p>
        {units.map((u, i) => (
          <div key={i} className="flex gap-2">
            <select
              value={u.unit}
              onChange={(e) =>
                setUnits((prev) =>
                  prev.map((x, j) =>
                    j === i ? { ...x, unit: e.target.value } : x,
                  ),
                )
              }
              className={input}
            >
              <option value="lzice">lžíce</option>
              <option value="lzicka">lžička</option>
              <option value="ks">kus</option>
            </select>
            <input
              value={u.gramsPerUnit}
              onChange={(e) =>
                setUnits((prev) =>
                  prev.map((x, j) =>
                    j === i ? { ...x, gramsPerUnit: e.target.value } : x,
                  ),
                )
              }
              inputMode="decimal"
              placeholder="gramů"
              className={input}
            />
            <button
              onClick={() => setUnits((prev) => prev.filter((_, j) => j !== i))}
              className="shrink-0 px-2 text-muted-foreground hover:text-destructive"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            setUnits((prev) => [...prev, { unit: "lzice", gramsPerUnit: "" }])
          }
          className="text-sm text-primary hover:underline"
        >
          + přidat převod
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button
          onClick={save}
          className="rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground min-h-11"
        >
          Uložit
        </button>
        <button
          onClick={onClose}
          className="rounded-lg border border-border px-5 py-2 font-medium min-h-11"
        >
          Zrušit
        </button>
      </div>
    </div>
  );
}
