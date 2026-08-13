"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api/client";

type Photo = {
  id: string;
  storageKey: string;
  isMain: boolean;
  sortOrder: number;
};

export function PhotoManager({
  recipeId,
  photos,
}: {
  recipeId: string;
  photos: Photo[];
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["recipe", recipeId] });

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/recipes/${recipeId}/photos`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error?.message ?? "Nahrání selhalo.");
        }
      }
      await invalidate();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const setMain = useMutation({
    mutationFn: (photoId: string) =>
      apiFetch(`/api/photos/${photoId}`, {
        method: "PATCH",
        json: { isMain: true },
      }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (photoId: string) =>
      apiFetch(`/api/photos/${photoId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  return (
    <section className="rounded-card border border-border bg-surface p-4 shadow-card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Fotky</h2>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 min-h-11"
        >
          {uploading ? "Nahrávám…" : "📷 Nahrát fotky"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          multiple
          hidden
          onChange={(e) => upload(e.target.files)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Zatím žádné fotky. První nahraná se stane hlavní fotkou receptu.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((p) => (
            <figure key={p.id} className="space-y-1">
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-surface-warm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/files/${p.storageKey}?v=thumb`}
                  alt=""
                  className="h-full w-full object-cover"
                />
                {p.isMain && (
                  <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                    hlavní
                  </span>
                )}
              </div>
              <div className="flex justify-between text-xs">
                {!p.isMain ? (
                  <button
                    type="button"
                    onClick={() => setMain.mutate(p.id)}
                    className="text-primary hover:underline"
                  >
                    nastavit hlavní
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => remove.mutate(p.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  smazat
                </button>
              </div>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
