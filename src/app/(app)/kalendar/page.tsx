import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Kalendář" };

export default function CalendarPage() {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-semibold">Kalendář</h1>
      <EmptyState
        icon="📅"
        title="Kalendář přijde ve Fázi 4"
        description="Měsíční i týdenní pohled na jídelníček, úkoly a události."
      />
    </div>
  );
}
