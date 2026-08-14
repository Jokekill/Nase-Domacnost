import Link from "next/link";
import {
  DIFFICULTY_LABELS,
  formatTime,
  type RecipeListItem,
} from "@/lib/recipes/types";

export function RecipeCard({ recipe }: { recipe: RecipeListItem }) {
  const meta = [
    `${recipe.baseServings} porcí`,
    formatTime(recipe.totalTimeMin),
    recipe.difficulty ? DIFFICULTY_LABELS[recipe.difficulty] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/kucharka/${recipe.id}`}
      // `block`: as a grid item this is implied, but the PDF selection mode
      // wraps the card in a label where an inline link would collapse.
      className="group block overflow-hidden rounded-card border border-border bg-surface shadow-card transition-shadow hover:shadow-pop"
    >
      <div className="aspect-[4/3] overflow-hidden bg-surface-warm">
        {recipe.mainPhotoKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/files/${recipe.mainPhotoKey}?v=card`}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">
            🥄
          </div>
        )}
      </div>
      <div className="p-3">
        {/* h2: the cards sit directly under the page h1 (§11.2). */}
        <h2 className="font-display text-lg font-semibold leading-snug">
          {recipe.title}
          {recipe.sharedWithMe && (
            <span
              className="ml-1.5 align-middle text-sm text-muted-foreground"
              title="Recept sdílený tobě"
            >
              🔗
            </span>
          )}
        </h2>
        {meta && <p className="mt-0.5 text-sm text-muted-foreground">{meta}</p>}
      </div>
    </Link>
  );
}
