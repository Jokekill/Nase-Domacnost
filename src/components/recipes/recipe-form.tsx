"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm, Controller } from "react-hook-form";
import { uuidv7 } from "uuidv7";
import { apiFetch } from "@/lib/api/client";
import { UNITS } from "@/db/schema";
import { UNIT_LABELS, DIFFICULTY_LABELS } from "@/lib/recipes/types";
import { FoodPicker } from "./food-picker";

/* Form state keeps numbers as strings (inputs); converted on submit. */
type IngredientField = {
  id: string;
  groupId: string;
  foodId: string | null;
  foodName: string | null;
  freeText: string;
  amount: string;
  unit: string;
  note: string;
  isOptional: boolean;
};
type GroupField = { id: string; name: string };
type StepField = { id: string; text: string };

export type RecipeFormValues = {
  title: string;
  intro: string;
  baseServings: string;
  prepTimeMin: string;
  cookTimeMin: string;
  difficulty: string;
  source: string;
  notes: string;
  visibility: string;
  groups: GroupField[];
  ingredients: IngredientField[];
  steps: StepField[];
  categoryIds: string[];
  tagIds: string[];
  prepAheadEnabled: boolean;
  prepAheadId: string;
  prepAheadHours: string;
  prepAheadDescription: string;
};

export type RecipeAggregate = {
  id: string;
  title: string;
  intro: string | null;
  baseServings: number;
  prepTimeMin: number | null;
  cookTimeMin: number | null;
  difficulty: string | null;
  source: string | null;
  notes: string | null;
  visibility: string;
  groups: { id: string; name: string; sortOrder: number }[];
  ingredients: {
    id: string;
    groupId: string | null;
    foodId: string | null;
    foodName: string | null;
    freeText: string | null;
    amount: number | null;
    unit: string | null;
    note: string | null;
    isOptional: boolean;
  }[];
  steps: { id: string; text: string; sortOrder: number }[];
  categoryIds: string[];
  tagIds: string[];
  prepAhead: {
    id: string;
    leadTimeHours: number;
    description: string;
  } | null;
};

function toFormValues(recipe?: RecipeAggregate): RecipeFormValues {
  return {
    title: recipe?.title ?? "",
    intro: recipe?.intro ?? "",
    baseServings: String(recipe?.baseServings ?? 4),
    prepTimeMin: recipe?.prepTimeMin != null ? String(recipe.prepTimeMin) : "",
    cookTimeMin: recipe?.cookTimeMin != null ? String(recipe.cookTimeMin) : "",
    difficulty: recipe?.difficulty ?? "",
    source: recipe?.source ?? "",
    notes: recipe?.notes ?? "",
    visibility: recipe?.visibility ?? "household",
    groups: recipe?.groups.map((g) => ({ id: g.id, name: g.name })) ?? [],
    ingredients:
      recipe?.ingredients.map((i) => ({
        id: i.id,
        groupId: i.groupId ?? "",
        foodId: i.foodId,
        foodName: i.foodName,
        freeText: i.freeText ?? "",
        amount: i.amount != null ? String(i.amount) : "",
        unit: i.unit ?? "",
        note: i.note ?? "",
        isOptional: i.isOptional,
      })) ?? [],
    steps: recipe?.steps.map((s) => ({ id: s.id, text: s.text })) ?? [
      { id: uuidv7(), text: "" },
    ],
    categoryIds: recipe?.categoryIds ?? [],
    tagIds: recipe?.tagIds ?? [],
    prepAheadEnabled: !!recipe?.prepAhead,
    prepAheadId: recipe?.prepAhead?.id ?? uuidv7(),
    prepAheadHours: String(recipe?.prepAhead?.leadTimeHours ?? 24),
    prepAheadDescription: recipe?.prepAhead?.description ?? "",
  };
}

function buildPayload(recipeId: string, v: RecipeFormValues) {
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  return {
    id: recipeId,
    title: v.title.trim(),
    intro: v.intro.trim() || null,
    baseServings: Number(v.baseServings) || 4,
    prepTimeMin: num(v.prepTimeMin),
    cookTimeMin: num(v.cookTimeMin),
    difficulty: v.difficulty || null,
    source: v.source.trim() || null,
    notes: v.notes.trim() || null,
    visibility: v.visibility,
    groups: v.groups
      .filter((g) => g.name.trim())
      .map((g, i) => ({ id: g.id, name: g.name.trim(), sortOrder: i })),
    ingredients: v.ingredients
      .filter((i) => i.foodId || i.freeText.trim() || i.foodName)
      .map((i, idx) => ({
        id: i.id,
        groupId: i.groupId || null,
        foodId: i.foodId,
        // Keep the display text even for linked foods so the recipe reads
        // naturally; the food link is what search and nutrition use.
        freeText: i.foodId ? i.foodName : i.freeText.trim() || null,
        amount: num(i.amount),
        unit: i.unit || null,
        note: i.note.trim() || null,
        isOptional: i.isOptional,
        sortOrder: idx,
      })),
    steps: v.steps
      .filter((s) => s.text.trim())
      .map((s, i) => ({
        id: s.id,
        text: s.text.trim(),
        sortOrder: i,
        ingredientIds: [],
      })),
    categoryIds: v.categoryIds,
    tagIds: v.tagIds,
    prepAhead:
      v.prepAheadEnabled && v.prepAheadDescription.trim()
        ? {
            id: v.prepAheadId,
            leadTimeHours: Number(v.prepAheadHours) || 24,
            description: v.prepAheadDescription.trim(),
          }
        : null,
  };
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const labelCls = "mb-1 block text-sm font-medium";
const sectionCls =
  "rounded-card border border-border bg-surface p-4 shadow-card space-y-3";

export function RecipeForm({
  recipeId,
  initial,
}: {
  recipeId: string;
  initial?: RecipeAggregate;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isNew = !initial;
  const [error, setError] = useState<string | null>(null);

  const { register, control, handleSubmit, watch, setValue } =
    useForm<RecipeFormValues>({ defaultValues: toFormValues(initial) });

  const groupsArray = useFieldArray({ control, name: "groups" });
  const ingredientsArray = useFieldArray({ control, name: "ingredients" });
  const stepsArray = useFieldArray({ control, name: "steps" });
  const groups = watch("groups");
  const prepAheadEnabled = watch("prepAheadEnabled");

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () =>
      apiFetch<{ items: { id: string; name: string; parentId: string | null }[] }>(
        "/api/categories",
      ),
  });
  const { data: tagsData } = useQuery({
    queryKey: ["tags"],
    queryFn: () => apiFetch<{ items: { id: string; name: string }[] }>("/api/tags"),
  });

  const mutation = useMutation({
    mutationFn: async (values: RecipeFormValues) => {
      const payload = buildPayload(recipeId, values);
      if (isNew) {
        return apiFetch(`/api/recipes`, { method: "POST", json: payload });
      }
      return apiFetch(`/api/recipes/${recipeId}`, {
        method: "PATCH",
        json: payload,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
      await queryClient.invalidateQueries({ queryKey: ["recipe", recipeId] });
      router.push(`/kucharka/${recipeId}`);
    },
    onError: (err) => setError(err.message),
  });

  const [newTag, setNewTag] = useState("");
  async function addTag() {
    const name = newTag.trim();
    if (!name) return;
    const id = uuidv7();
    await apiFetch("/api/tags", { method: "POST", json: { id, name } });
    await queryClient.invalidateQueries({ queryKey: ["tags"] });
    setValue("tagIds", [...watch("tagIds"), id]);
    setNewTag("");
  }

  return (
    <form
      onSubmit={handleSubmit((v) => mutation.mutate(v))}
      className="mx-auto max-w-3xl space-y-4"
    >
      <section className={sectionCls}>
        <div>
          <label className={labelCls}>Název receptu *</label>
          <input
            {...register("title", { required: true })}
            className={inputCls}
            placeholder="Babiččina bábovka"
          />
        </div>
        <div>
          <label className={labelCls}>Úvod / popis</label>
          <textarea {...register("intro")} rows={2} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className={labelCls}>Porce *</label>
            <input
              type="number"
              min={1}
              {...register("baseServings", { required: true })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Příprava (min)</label>
            <input type="number" min={0} {...register("prepTimeMin")} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Vaření (min)</label>
            <input type="number" min={0} {...register("cookTimeMin")} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Obtížnost</label>
            <select {...register("difficulty")} className={inputCls}>
              <option value="">—</option>
              {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Zdroj (odkaz, kniha…)</label>
            <input {...register("source")} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Viditelnost</label>
            <select {...register("visibility")} className={inputCls}>
              <option value="household">Celá domácnost</option>
              <option value="private">Jen já</option>
            </select>
          </div>
        </div>
      </section>

      <section className={sectionCls}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Ingredience</h2>
          <button
            type="button"
            onClick={() =>
              groupsArray.append({ id: uuidv7(), name: "" })
            }
            className="text-sm text-primary hover:underline"
          >
            + skupina (Těsto, Poleva…)
          </button>
        </div>

        {groupsArray.fields.map((g, gi) => (
          <div key={g.id} className="flex items-center gap-2">
            <input
              {...register(`groups.${gi}.name`)}
              placeholder="Název skupiny"
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => groupsArray.remove(gi)}
              className="shrink-0 text-muted-foreground hover:text-destructive"
              title="Odebrat skupinu"
            >
              ✕
            </button>
          </div>
        ))}

        <div className="space-y-2">
          {ingredientsArray.fields.map((field, i) => (
            <div
              key={field.id}
              className="rounded-lg border border-border p-2 space-y-2"
            >
              <div className="flex items-start gap-2">
                <div className="grow">
                  <Controller
                    control={control}
                    name={`ingredients.${i}`}
                    render={({ field: { value, onChange } }) => (
                      <FoodPicker
                        value={value.foodId}
                        valueName={value.foodName ?? value.freeText}
                        onChange={(foodId, foodName) =>
                          onChange({ ...value, foodId, foodName })
                        }
                        onTextChange={(text) =>
                          onChange({ ...value, freeText: text })
                        }
                      />
                    )}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => ingredientsArray.remove(i)}
                  className="mt-2 shrink-0 text-muted-foreground hover:text-destructive"
                  title="Odebrat ingredienci"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
                <input
                  {...register(`ingredients.${i}.amount`)}
                  placeholder="Množství"
                  inputMode="decimal"
                  className={inputCls}
                />
                <select {...register(`ingredients.${i}.unit`)} className={inputCls}>
                  <option value="">— jednotka —</option>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {UNIT_LABELS[u]}
                    </option>
                  ))}
                </select>
                {groups.filter((g) => g.name.trim()).length > 0 ? (
                  <select
                    {...register(`ingredients.${i}.groupId`)}
                    className={inputCls}
                  >
                    <option value="">— bez skupiny —</option>
                    {groups
                      .filter((g) => g.name.trim())
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                  </select>
                ) : (
                  <span />
                )}
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    {...register(`ingredients.${i}.isOptional`)}
                  />
                  volitelná
                </label>
              </div>
              <input
                {...register(`ingredients.${i}.note`)}
                placeholder="Poznámka (nahrubo nasekaná, pokojové teploty…)"
                className={inputCls}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            ingredientsArray.append({
              id: uuidv7(),
              groupId: "",
              foodId: null,
              foodName: null,
              freeText: "",
              amount: "",
              unit: "",
              note: "",
              isOptional: false,
            })
          }
          className="rounded-lg border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:bg-surface-warm w-full"
        >
          + Přidat ingredienci
        </button>
      </section>

      <section className={sectionCls}>
        <h2 className="text-lg font-semibold">Postup</h2>
        {stepsArray.fields.map((field, i) => (
          <div key={field.id} className="flex items-start gap-2">
            <span className="mt-2 w-6 shrink-0 text-center font-display font-semibold text-primary">
              {i + 1}.
            </span>
            <textarea
              {...register(`steps.${i}.text`)}
              rows={2}
              placeholder={`Krok ${i + 1}…`}
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => stepsArray.remove(i)}
              className="mt-2 shrink-0 text-muted-foreground hover:text-destructive"
              title="Odebrat krok"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => stepsArray.append({ id: uuidv7(), text: "" })}
          className="rounded-lg border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:bg-surface-warm w-full"
        >
          + Přidat krok
        </button>
      </section>

      <section className={sectionCls}>
        <h2 className="text-lg font-semibold">Zařazení</h2>
        {(categoriesData?.items ?? []).length > 0 && (
          <div>
            <label className={labelCls}>Kategorie</label>
            <div className="flex flex-wrap gap-2">
              {(categoriesData?.items ?? []).map((c) => {
                const selected = watch("categoryIds").includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setValue(
                        "categoryIds",
                        selected
                          ? watch("categoryIds").filter((id) => id !== c.id)
                          : [...watch("categoryIds"), c.id],
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-sm ${
                      selected
                        ? "border-primary bg-surface-warm text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div>
          <label className={labelCls}>Tagy</label>
          <div className="flex flex-wrap items-center gap-2">
            {(tagsData?.items ?? []).map((t) => {
              const selected = watch("tagIds").includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setValue(
                      "tagIds",
                      selected
                        ? watch("tagIds").filter((id) => id !== t.id)
                        : [...watch("tagIds"), t.id],
                    )
                  }
                  className={`rounded-full border px-3 py-1 text-sm ${
                    selected
                      ? "border-primary bg-surface-warm text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  #{t.name}
                </button>
              );
            })}
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addTag();
                }
              }}
              placeholder="Nový tag + Enter"
              className="w-40 rounded-full border border-dashed border-border bg-background px-3 py-1 text-sm outline-none"
            />
          </div>
        </div>
      </section>

      <section className={sectionCls}>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" {...register("prepAheadEnabled")} />
          Vyžaduje přípravu předem
        </label>
        {prepAheadEnabled && (
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <div>
              <label className={labelCls}>Hodin předem</label>
              <input
                type="number"
                min={1}
                {...register("prepAheadHours")}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Co je potřeba udělat</label>
              <input
                {...register("prepAheadDescription")}
                placeholder="Namočit fazole, připravit kvásek…"
                className={inputCls}
              />
            </div>
          </div>
        )}
      </section>

      <section className={sectionCls}>
        <div>
          <label className={labelCls}>Poznámky</label>
          <textarea {...register("notes")} rows={3} className={inputCls} />
        </div>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3 pb-8">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-lg bg-primary px-6 py-2.5 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 min-h-11"
        >
          {mutation.isPending
            ? "Ukládám…"
            : isNew
              ? "Vytvořit recept"
              : "Uložit změny"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-border px-6 py-2.5 font-medium hover:bg-surface-warm min-h-11"
        >
          Zrušit
        </button>
      </div>
    </form>
  );
}
