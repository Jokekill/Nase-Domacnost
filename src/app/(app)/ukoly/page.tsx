import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Úkoly" };

export default function TasksPage() {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-semibold">Úkoly</h1>
      <EmptyState
        icon="✅"
        title="Úkoly a úklid přijdou ve Fázi 6"
        description="Seznamy, šablony úklidu, přiřazování a historie splnění."
      />
    </div>
  );
}
