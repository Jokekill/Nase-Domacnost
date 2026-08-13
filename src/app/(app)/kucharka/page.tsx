import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Kuchařka" };

export default function CookbookPage() {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-semibold">Kuchařka</h1>
      <EmptyState
        icon="🥘"
        title="Zatím žádné recepty"
        description="Recepty přibudou ve Fázi 2 — tady bude přehled karet s fotkami, vyhledávání a filtry."
      />
    </div>
  );
}
