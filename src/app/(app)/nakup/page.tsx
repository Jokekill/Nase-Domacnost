import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Nákup" };

export default function ShoppingPage() {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-semibold">Nákup</h1>
      <EmptyState
        icon="🛒"
        title="Nákupní seznamy přijdou ve Fázi 5"
        description="Seznamy po týdnech, slučování položek z receptů a rychlé odškrtávání."
      />
    </div>
  );
}
