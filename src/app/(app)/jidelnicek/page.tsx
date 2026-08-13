import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Jídelníček" };

export default function MealPlanPage() {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-semibold">Jídelníček</h1>
      <EmptyState
        icon="🗓️"
        title="Jídelníček přijde ve Fázi 4"
        description="Týdenní plán jídel s recepty i volnými poznámkami."
      />
    </div>
  );
}
