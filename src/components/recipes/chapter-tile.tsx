import Link from "next/link";
import { recipeCount } from "@/lib/plural";

/**
 * One chapter of the cookbook (§5.1). Looks like a recipe card on purpose —
 * the front page and the chapter behind it are the same kind of browsing.
 */
export function ChapterTile({
  href,
  name,
  count,
  coverPhotoKey,
  icon,
  subtitle,
}: {
  href: string;
  name: string;
  count: number;
  coverPhotoKey?: string | null;
  /** Shown when there is no photo — or instead of one, for the two specials. */
  icon?: string;
  subtitle?: string;
}) {
  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-card border border-border bg-surface shadow-card transition-shadow hover:shadow-pop"
    >
      {/* A chapter with no photo gets a short band instead of a big empty
          rectangle — otherwise eleven chapters make an endless page. */}
      {coverPhotoKey ? (
        <div className="aspect-[16/9] overflow-hidden bg-surface-warm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/files/${coverPhotoKey}?v=card`}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
        </div>
      ) : (
        <div
          className={`flex h-16 w-full items-center justify-center bg-surface-warm text-3xl sm:h-20 ${
            count === 0 ? "opacity-40" : ""
          }`}
        >
          {icon ?? "📖"}
        </div>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 p-3">
        <h2
          className={`font-display text-lg font-semibold leading-snug ${
            count === 0 ? "text-muted-foreground" : ""
          }`}
        >
          {name}
        </h2>
        <span className="shrink-0 text-xs text-muted-foreground sm:text-sm">
          {subtitle ?? recipeCount(count)}
        </span>
      </div>
    </Link>
  );
}
