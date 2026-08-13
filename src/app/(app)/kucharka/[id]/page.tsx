"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import type { RecipeAggregate } from "@/components/recipes/recipe-form";
import {
  DIFFICULTY_LABELS,
  UNIT_LABELS,
  formatTime,
  type Difficulty,
  type Unit,
} from "@/lib/recipes/types";

type Photo = {
  id: string;
  storageKey: string;
  isMain: boolean;
  sortOrder: number;
};
type Detail = RecipeAggregate & {
  photos: Photo[];
  totalTimeMin: number | null;
};

function formatAmount(amount: number | null, unit: string | null): string {
  const parts: string[] = [];
  if (amount != null) {
    parts.push(
      Number.isInteger(amount)
        ? String(amount)
        : String(amount).replace(".", ","),
    );
  }
  if (unit) parts.push(UNIT_LABELS[unit as Unit] ?? unit);
  return parts.join(" ");
}

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: recipe, isLoading } = useQuery({
    queryKey: ["recipe", id],
    queryFn: () => apiFetch<Detail>(`/api/recipes/${id}`),
  });

  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/recipes/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
      router.push("/kucharka");
    },
  });

  if (isLoading) {
    return <p className="py-16 text-center text-muted-foreground">Načítám…</p>;
  }
  if (!recipe) {
    return (
      <p className="py-16 text-center text-muted-foreground">
        Recept nenalezen.
      </p>
    );
  }

  const mainPhoto =
    recipe.photos.find((p) => p.isMain) ?? recipe.photos[0] ?? null;
  const meta = [
    `${recipe.baseServings} porcí`,
    formatTime(recipe.totalTimeMin),
    recipe.difficulty
      ? DIFFICULTY_LABELS[recipe.difficulty as Difficulty]
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const ungrouped = recipe.ingredients.filter((i) => !i.groupId);
  const groupsWithItems = recipe.groups
    .map((g) => ({
      ...g,
      items: recipe.ingredients.filter((i) => i.groupId === g.id),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <article className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">{recipe.title}</h1>
          {meta && <p className="mt-1 text-muted-foreground">{meta}</p>}
        </div>
        <div className="flex gap-2">
          <Link
            href={`/kucharka/${id}/vareni`}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 min-h-11 inline-flex items-center"
          >
            🍳 Vařit
          </Link>
          <Link
            href={`/kucharka/${id}/upravit`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-warm min-h-11 inline-flex items-center"
          >
            ✏️ Upravit
          </Link>
          <button
            onClick={() => {
              if (confirm("Opravdu smazat tento recept?")) remove.mutate();
            }}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-destructive hover:bg-surface-warm min-h-11"
          >
            Smazat
          </button>
        </div>
      </div>

      {mainPhoto && (
        <div className="mb-4 overflow-hidden rounded-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/files/${mainPhoto.storageKey}?v=full`}
            alt={recipe.title}
            className="max-h-[420px] w-full object-cover"
          />
        </div>
      )}
      {recipe.photos.length > 1 && (
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {recipe.photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.id}
              src={`/api/files/${p.storageKey}?v=thumb`}
              alt=""
              className="h-20 w-28 shrink-0 rounded-lg object-cover"
            />
          ))}
        </div>
      )}

      {recipe.intro && <p className="mb-4 text-lg">{recipe.intro}</p>}

      {recipe.prepAhead && (
        <p className="mb-4 rounded-lg bg-surface-warm p-3 text-sm">
          ⏳ <strong>Příprava předem:</strong> {recipe.prepAhead.description} (
          {recipe.prepAhead.leadTimeHours} h dopředu)
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <section>
          <h2 className="mb-2 text-xl font-semibold">Ingredience</h2>
          <p className="mb-2 text-sm text-muted-foreground">
            na {recipe.baseServings} porcí
          </p>
          {ungrouped.length > 0 && (
            <ul className="space-y-1.5">
              {ungrouped.map((i) => (
                <IngredientLine key={i.id} ingredient={i} />
              ))}
            </ul>
          )}
          {groupsWithItems.map((g) => (
            <div key={g.id} className="mt-3">
              <h3 className="mb-1 font-medium">{g.name}</h3>
              <ul className="space-y-1.5">
                {g.items.map((i) => (
                  <IngredientLine key={i.id} ingredient={i} />
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold">Postup</h2>
          <ol className="space-y-4">
            {recipe.steps.map((s, idx) => (
              <li key={s.id} className="flex gap-3">
                <span className="font-display text-xl font-semibold text-primary">
                  {idx + 1}.
                </span>
                <p className="pt-0.5 leading-relaxed">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {recipe.notes && (
        <section className="mt-6 rounded-card bg-surface-warm p-4">
          <h2 className="mb-1 font-semibold">Poznámky</h2>
          <p className="whitespace-pre-wrap text-sm">{recipe.notes}</p>
        </section>
      )}
      {recipe.source && (
        <p className="mt-4 text-sm text-muted-foreground">
          Zdroj: {recipe.source}
        </p>
      )}
    </article>
  );
}

function IngredientLine({
  ingredient,
}: {
  ingredient: Detail["ingredients"][number];
}) {
  const name = ingredient.foodName ?? ingredient.freeText ?? "";
  const amount = formatAmount(ingredient.amount, ingredient.unit);
  return (
    <li className="flex items-baseline justify-between gap-2 border-b border-border/60 pb-1 text-sm">
      <span>
        {name}
        {ingredient.note && (
          <span className="text-muted-foreground"> ({ingredient.note})</span>
        )}
        {ingredient.isOptional && (
          <span className="text-muted-foreground"> — volitelně</span>
        )}
      </span>
      <span className="shrink-0 font-medium">{amount}</span>
    </li>
  );
}
