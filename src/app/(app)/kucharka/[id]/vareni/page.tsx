"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type { RecipeAggregate } from "@/components/recipes/recipe-form";
import { UNIT_LABELS, type Unit } from "@/lib/recipes/types";

/**
 * Cooking mode (zadání §9.5): one step per screen, large type, screen kept
 * awake via the Wake Lock API (requires HTTPS or localhost).
 */
export default function CookingModePage() {
  const { id } = useParams<{ id: string }>();
  const [stepIndex, setStepIndex] = useState(-1); // -1 = ingredience
  const [wakeLockActive, setWakeLockActive] = useState(false);

  const { data: recipe } = useQuery({
    queryKey: ["recipe", id],
    queryFn: () => apiFetch<RecipeAggregate>(`/api/recipes/${id}`),
  });

  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let released = false;
    async function acquire() {
      try {
        if ("wakeLock" in navigator) {
          lock = await navigator.wakeLock.request("screen");
          if (released) {
            void lock.release();
            return;
          }
          setWakeLockActive(true);
          lock.addEventListener("release", () => setWakeLockActive(false));
        }
      } catch {
        setWakeLockActive(false);
      }
    }
    void acquire();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release();
    };
  }, []);

  if (!recipe) {
    return <p className="py-16 text-center text-muted-foreground">Načítám…</p>;
  }

  const steps = recipe.steps;
  const atIngredients = stepIndex < 0;
  const step = atIngredients ? null : steps[stepIndex];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h1 className="truncate text-lg font-semibold">{recipe.title}</h1>
        <div className="flex items-center gap-3">
          {wakeLockActive && (
            <span
              className="text-sm text-accent-green"
              title="Obrazovka nezhasne"
            >
              ☀️ svítí
            </span>
          )}
          <Link
            href={`/kucharka/${id}`}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-warm"
          >
            ✕ Zavřít
          </Link>
        </div>
      </header>

      <main className="flex grow flex-col items-center justify-center overflow-y-auto px-6 py-8">
        {atIngredients ? (
          <div className="w-full max-w-lg">
            <h2 className="mb-4 text-2xl font-semibold">
              Ingredience{" "}
              <span className="text-muted-foreground">
                ({recipe.baseServings} porcí)
              </span>
            </h2>
            <ul className="space-y-3 text-xl leading-relaxed">
              {recipe.ingredients.map((i) => (
                <li key={i.id} className="flex justify-between gap-4">
                  <span>{i.foodName ?? i.freeText}</span>
                  <span className="shrink-0 font-semibold">
                    {i.amount != null ? String(i.amount).replace(".", ",") : ""}{" "}
                    {i.unit ? (UNIT_LABELS[i.unit as Unit] ?? i.unit) : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="w-full max-w-2xl text-center">
            <p className="mb-3 font-display text-2xl font-semibold text-primary">
              Krok {stepIndex + 1} / {steps.length}
            </p>
            <p className="text-[1.4rem] leading-relaxed sm:text-2xl">
              {step?.text}
            </p>
          </div>
        )}
      </main>

      <footer className="grid grid-cols-2 gap-3 border-t border-border p-4">
        <button
          onClick={() => setStepIndex((i) => Math.max(-1, i - 1))}
          disabled={atIngredients}
          className="rounded-lg border border-border py-4 text-lg font-medium hover:bg-surface-warm disabled:opacity-40"
        >
          ← {stepIndex === 0 ? "Ingredience" : "Předchozí"}
        </button>
        {stepIndex < steps.length - 1 ? (
          <button
            onClick={() => setStepIndex((i) => i + 1)}
            className="rounded-lg bg-primary py-4 text-lg font-medium text-primary-foreground hover:opacity-90"
          >
            {atIngredients ? "Začít vařit" : "Další"} →
          </button>
        ) : (
          <Link
            href={`/kucharka/${id}`}
            className="flex items-center justify-center rounded-lg bg-accent-green py-4 text-lg font-medium text-primary-foreground hover:opacity-90"
          >
            ✓ Hotovo
          </Link>
        )}
      </footer>
    </div>
  );
}
