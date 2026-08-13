"use client";

import { useState } from "react";
import { uuidv7 } from "uuidv7";
import { RecipeForm } from "@/components/recipes/recipe-form";

export default function NewRecipePage() {
  // Client-generated UUIDv7 (sync-ready, docs/DATA-MODEL.md §5.1)
  const [recipeId] = useState(() => uuidv7());
  return (
    <div>
      <h1 className="mb-4 text-3xl font-semibold">Nový recept</h1>
      <RecipeForm recipeId={recipeId} />
    </div>
  );
}
