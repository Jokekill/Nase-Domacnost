import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicSharingEnabled, recipeIdForPublicToken } from "@/lib/recipes/access";
import { DIFFICULTY_LABELS, formatTime, type Difficulty } from "@/lib/recipes/types";
import { buildPublicRecipe } from "@/lib/sharing/public-view";

type Props = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: "Sdílený recept",
  // A shared link is for people, not for search engines.
  robots: { index: false, follow: false },
};

/**
 * Public read-only recipe page (§8.5). Rendered on the server without a
 * session; nothing here touches household data — see buildPublicRecipe.
 */
export default async function SharedRecipePage({ params }: Props) {
  const { token } = await params;
  if (!publicSharingEnabled()) notFound();
  const recipeId = await recipeIdForPublicToken(token);
  if (!recipeId) notFound();
  const recipe = await buildPublicRecipe(recipeId);

  const meta = [
    `${recipe.baseServings} porcí`,
    formatTime(recipe.totalTimeMin),
    recipe.difficulty
      ? DIFFICULTY_LABELS[recipe.difficulty as Difficulty]
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const groups = [...new Set(recipe.ingredients.map((i) => i.group))];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <p className="mb-4 text-sm text-muted-foreground">
        Sdílený recept{recipe.ownerName ? ` od ${recipe.ownerName}` : ""} ·
        Naše domácnost
      </p>
      <h1 className="font-display text-3xl font-semibold">{recipe.title}</h1>
      {meta && <p className="mt-1 text-muted-foreground">{meta}</p>}

      {recipe.photoKeys[0] && (
        <div className="mt-4 aspect-[16/9] max-h-[420px] overflow-hidden rounded-card bg-surface-warm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/files/${recipe.photoKeys[0]}?v=full&share=${encodeURIComponent(token)}`}
            alt={recipe.title}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      {recipe.intro && <p className="mt-4 text-lg">{recipe.intro}</p>}

      {recipe.prepAhead && (
        <p className="mt-4 rounded-lg bg-surface-warm p-3 text-sm">
          ⏳ <strong>Příprava předem:</strong> {recipe.prepAhead.description} (
          {recipe.prepAhead.leadTimeHours} h dopředu)
        </p>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-[280px_1fr]">
        <section>
          <h2 className="mb-2 text-xl font-semibold">Ingredience</h2>
          {groups.map((group) => (
            <div key={group ?? "_"} className="mb-3">
              {group && <h3 className="mb-1 font-medium">{group}</h3>}
              <ul className="space-y-1.5">
                {recipe.ingredients
                  .filter((i) => i.group === group)
                  .map((i, idx) => (
                    <li
                      key={`${group}-${idx}`}
                      className="flex items-baseline justify-between gap-2 border-b border-border/60 pb-1 text-sm"
                    >
                      <span>
                        {i.name}
                        {i.note && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({i.note})
                          </span>
                        )}
                        {i.isOptional && (
                          <span className="text-muted-foreground">
                            {" "}
                            — volitelně
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-medium">
                        {[i.amount, i.unit].filter(Boolean).join(" ")}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold">Postup</h2>
          <ol className="space-y-4">
            {recipe.steps.map((s, idx) => (
              <li key={idx} className="flex gap-3">
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
    </main>
  );
}
