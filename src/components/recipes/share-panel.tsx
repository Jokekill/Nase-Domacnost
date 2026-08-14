"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "@/lib/api/client";

type Share = {
  id: string;
  userId: string;
  permission: "view" | "edit";
  displayName: string;
  email: string;
};
type Member = { userId: string; displayName: string; email: string };
type PublicLink = {
  id: string;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  usable: boolean;
};

const btn =
  "rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-warm min-h-11";
const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-11";

/**
 * Sharing controls for a recipe — only rendered for whoever may hand out
 * access (owner or household admin); the API enforces the same rule.
 */
export function SharePanel({
  recipeId,
  ownerId,
  publicSharingEnabled,
  open,
  onClose,
}: {
  recipeId: string;
  ownerId: string;
  publicSharingEnabled: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"view" | "edit">("view");
  const [error, setError] = useState<string | null>(null);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);

  const shares = useQuery({
    queryKey: ["recipe-shares", recipeId],
    queryFn: () =>
      apiFetch<{ items: Share[] }>(`/api/recipes/${recipeId}/shares`),
    enabled: open,
  });
  const members = useQuery({
    queryKey: ["household-members"],
    queryFn: () => apiFetch<{ items: Member[] }>("/api/household/members"),
    enabled: open,
  });
  const links = useQuery({
    queryKey: ["recipe-public-links", recipeId],
    queryFn: () =>
      apiFetch<{ items: PublicLink[] }>(`/api/recipes/${recipeId}/public-links`),
    enabled: open && publicSharingEnabled,
  });

  const refreshShares = () =>
    queryClient.invalidateQueries({ queryKey: ["recipe-shares", recipeId] });
  const refreshLinks = () =>
    queryClient.invalidateQueries({
      queryKey: ["recipe-public-links", recipeId],
    });

  const addShare = useMutation({
    mutationFn: (payload: { userId?: string; email?: string }) =>
      apiFetch(`/api/recipes/${recipeId}/shares`, {
        method: "POST",
        json: { ...payload, permission },
      }),
    onSuccess: async () => {
      setEmail("");
      setError(null);
      await refreshShares();
    },
    onError: (err: Error) => setError(err.message),
  });

  const removeShare = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/api/recipes/${recipeId}/shares/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: refreshShares,
    onError: (err: Error) => setError(err.message),
  });

  const createLink = useMutation({
    mutationFn: () =>
      apiFetch<{ url: string }>(`/api/recipes/${recipeId}/public-links`, {
        method: "POST",
        json: {},
      }),
    onSuccess: async (data) => {
      // Shown exactly once — only the hash of the token is stored.
      setFreshUrl(new URL(data.url, window.location.origin).toString());
      setError(null);
      await refreshLinks();
    },
    onError: (err: Error) => setError(err.message),
  });

  const revokeLink = useMutation({
    mutationFn: (linkId: string) =>
      apiFetch(`/api/recipes/${recipeId}/public-links/${linkId}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      setFreshUrl(null);
      await refreshLinks();
    },
    onError: (err: Error) => setError(err.message),
  });

  const sharedUserIds = new Set(shares.data?.items.map((s) => s.userId) ?? []);
  const shareableMembers = (members.data?.items ?? []).filter(
    (m) => m.userId !== ownerId && !sharedUserIds.has(m.userId),
  );

  if (!open) return null;

  return (
    <section className="mt-6 rounded-card border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Sdílení receptu</h2>
        <button
          type="button"
          className="text-sm text-muted-foreground hover:underline min-h-11"
          onClick={onClose}
        >
          Zavřít
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      <h3 className="mb-1 font-medium">Konkrétní lidé</h3>
      {shares.data?.items.length ? (
        <ul className="mb-3 space-y-1.5">
          {shares.data.items.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 border-b border-border/60 pb-1 text-sm"
            >
              <span>
                {s.displayName}{" "}
                <span className="text-muted-foreground">
                  ({s.permission === "edit" ? "může upravovat" : "jen čtení"})
                </span>
              </span>
              <button
                type="button"
                className="text-sm text-destructive hover:underline min-h-11"
                onClick={() => removeShare.mutate(s.userId)}
              >
                Zrušit
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">
          Zatím nikomu nesdíleno.
        </p>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select
          value={permission}
          onChange={(e) => setPermission(e.target.value as "view" | "edit")}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-11"
        >
          <option value="view">jen čtení</option>
          <option value="edit">může upravovat</option>
        </select>
        {shareableMembers.map((m) => (
          <button
            key={m.userId}
            type="button"
            className={btn}
            onClick={() => addShare.mutate({ userId: m.userId })}
          >
            + {m.displayName}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nebo e-mail registrovaného uživatele"
          className={input}
        />
        <button
          type="button"
          className={btn}
          disabled={!email.trim() || addShare.isPending}
          onClick={() => addShare.mutate({ email: email.trim() })}
        >
          Sdílet
        </button>
      </div>

      <h3 className="mt-5 mb-1 font-medium">Veřejný odkaz</h3>
      {!publicSharingEnabled ? (
        <p className="text-sm text-muted-foreground">
          Veřejné odkazy jsou v této instalaci vypnuté
          (PUBLIC_SHARING_ENABLED).
        </p>
      ) : (
        <>
          {freshUrl && (
            <p className="mb-2 break-all rounded-lg bg-surface-warm p-2.5 text-sm">
              {freshUrl}
              <br />
              <span className="text-muted-foreground">
                Odkaz se zobrazuje jen teď — ulož si ho.
              </span>
            </p>
          )}
          {links.data?.items.length ? (
            <ul className="mb-2 space-y-1.5">
              {links.data.items.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-2 border-b border-border/60 pb-1 text-sm"
                >
                  <span>
                    Odkaz z {new Date(l.createdAt).toLocaleDateString("cs-CZ")}
                    {l.expiresAt
                      ? ` · platí do ${new Date(l.expiresAt).toLocaleDateString("cs-CZ")}`
                      : " · bez expirace"}
                    {!l.usable && " · neplatný"}
                  </span>
                  <button
                    type="button"
                    className="text-sm text-destructive hover:underline min-h-11"
                    onClick={() => revokeLink.mutate(l.id)}
                  >
                    Zneplatnit
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-2 text-sm text-muted-foreground">
              Žádný veřejný odkaz.
            </p>
          )}
          <button
            type="button"
            className={btn}
            disabled={createLink.isPending}
            onClick={() => createLink.mutate()}
          >
            Vytvořit veřejný odkaz
          </button>
        </>
      )}
    </section>
  );
}
