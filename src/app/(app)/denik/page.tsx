import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Deník" };

export default function DiaryPage() {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-semibold">Výživový deník</h1>
      <EmptyState
        icon="🥗"
        title="Deník přijde ve Fázi 7"
        description="Osobní záznamy snědeného jídla, denní přehledy a cíle."
      />
    </div>
  );
}
