"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { PhotoManager } from "@/components/recipes/photo-manager";
import {
  RecipeForm,
  type RecipeAggregate,
} from "@/components/recipes/recipe-form";

type Detail = RecipeAggregate & {
  photos: { id: string; storageKey: string; isMain: boolean; sortOrder: number }[];
};

export default function EditRecipePage() {
  const { id } = useParams<{ id: string }>();
  const { data: recipe, isLoading } = useQuery({
    queryKey: ["recipe", id],
    queryFn: () => apiFetch<Detail>(`/api/recipes/${id}`),
  });

  if (isLoading || !recipe) {
    return <p className="py-16 text-center text-muted-foreground">Načítám…</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Upravit recept</h1>
      <div className="mx-auto max-w-3xl">
        <PhotoManager recipeId={id} photos={recipe.photos} />
      </div>
      <RecipeForm recipeId={id} initial={recipe} />
    </div>
  );
}
