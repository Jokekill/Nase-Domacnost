"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api/client";

type Preview = {
  recipes: {
    title: string;
    ingredientCount: number;
    matchedCount: number;
    unmatched: string[];
    stepCount: number;
    newCategories: string[];
    newTags: string[];
  }[];
  totals: {
    recipes: number;
    ingredients: number;
    matched: number;
    newCategories: number;
    newTags: number;
  };
};

const card = "rounded-card border border-border bg-surface p-4 shadow-card";

export default function ImportRecipesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<unknown | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(files: FileList | null) {
    const picked = files?.[0];
    if (!picked) return;
    setError(null);
    setPreview(null);
    setBusy(true);
    try {
      // Windows editors often save JSON with a UTF-8 BOM, which JSON.parse
      // rejects — strip it before parsing.
      const text = (await picked.text()).replace(/^﻿/, "");
      const parsed = JSON.parse(text);
      setFile(parsed);
      const result = await apiFetch<Preview>("/api/recipes/import", {
        method: "POST",
        json: { mode: "preview", file: parsed },
      });
      setPreview(result);
    } catch (err) {
      setError(
        err instanceof SyntaxError
          ? "Soubor není platný JSON. Zkontroluj ho podle návodu."
          : (err as Error).message,
      );
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/recipes/import", {
        method: "POST",
        json: { mode: "commit", file },
      });
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
      router.push("/kucharka");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-semibold">Import receptů</h1>
        <Link href="/kucharka" className="text-sm text-primary hover:underline">
          ← Kuchařka
        </Link>
      </div>

      <div className={card}>
        <p className="mb-3 text-sm text-muted-foreground">
          Nahraj soubor JSON s recepty. Formát i hotový prompt pro AI najdeš
          v <code className="text-xs">docs/IMPORT-RECIPES.md</code>. Nejdřív
          uvidíš náhled, teprve pak se cokoli uloží.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={(e) => onFile(e.target.files)}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
        />
        {busy && (
          <p className="mt-2 text-sm text-muted-foreground">Zpracovávám…</p>
        )}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>

      {preview && (
        <>
          <div className={card}>
            <h2 className="mb-2 text-lg font-semibold">Náhled importu</h2>
            <ul className="space-y-1 text-sm">
              <li>
                Receptů k vytvoření: <strong>{preview.totals.recipes}</strong>
              </li>
              <li>
                Ingrediencí celkem: <strong>{preview.totals.ingredients}</strong>
                , z toho spárováno s potravinami:{" "}
                <strong>{preview.totals.matched}</strong>
              </li>
              <li>
                Nových kategorií: <strong>{preview.totals.newCategories}</strong>
                , nových tagů: <strong>{preview.totals.newTags}</strong>
              </li>
            </ul>
            {preview.totals.matched < preview.totals.ingredients && (
              <p className="mt-2 rounded-lg bg-surface-warm p-2.5 text-xs">
                Nespárované ingredience se uloží jako text. Recept bude fungovat,
                jen u nich nepůjde počítat nutriční hodnoty ani hledat podle
                skupin. Můžeš je doplnit později v editaci receptu.
              </p>
            )}
            <button
              onClick={commit}
              disabled={busy}
              className="mt-3 rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground disabled:opacity-50 min-h-11"
            >
              Naimportovat {preview.totals.recipes} receptů
            </button>
          </div>

          <div className={card}>
            <h2 className="mb-2 text-lg font-semibold">Jednotlivé recepty</h2>
            <ul className="divide-y divide-border">
              {preview.recipes.map((r, i) => (
                <li key={i} className="py-2 text-sm">
                  <p className="font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.ingredientCount} ingrediencí ({r.matchedCount}{" "}
                    spárováno) · {r.stepCount} kroků
                    {r.newCategories.length > 0 &&
                      ` · nové kategorie: ${r.newCategories.join(", ")}`}
                    {r.newTags.length > 0 &&
                      ` · nové tagy: ${r.newTags.join(", ")}`}
                  </p>
                  {r.unmatched.length > 0 && (
                    <p className="text-xs text-warning">
                      Bez potraviny: {r.unmatched.join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
