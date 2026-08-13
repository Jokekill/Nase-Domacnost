"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

type Me = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "member";
  household: { id: string; name: string };
};
type Member = {
  userId: string;
  displayName: string;
  email: string;
  role: string;
};

const sectionClass =
  "rounded-card border border-border bg-surface p-4 shadow-card";
const buttonClass =
  "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 min-h-11";
const secondaryButtonClass =
  "rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-warm min-h-11";

function ThemeSwitcher() {
  const [theme, setTheme] = useState<string>("system");

  useEffect(() => {
    setTheme(localStorage.getItem("theme") ?? "system");
  }, []);

  function apply(value: string) {
    setTheme(value);
    if (value === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", value);
    const dark =
      value === "dark" ||
      (value !== "light" &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    // Persist to the profile too (non-blocking).
    apiFetch("/api/auth/me", {
      method: "PATCH",
      json: { preferences: { theme: value } },
    }).catch(() => {});
  }

  return (
    <div className="flex gap-2">
      {(
        [
          ["light", "Světlý"],
          ["dark", "Tmavý"],
          ["system", "Podle systému"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          onClick={() => apply(value)}
          className={`rounded-lg border px-3 py-2 text-sm min-h-11 ${
            theme === value
              ? "border-primary bg-surface-warm text-primary"
              : "border-border text-muted-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    try {
      const [meData, membersData] = await Promise.all([
        apiFetch<Me>("/api/auth/me"),
        apiFetch<{ items: Member[] }>("/api/household/members"),
      ]);
      setMe(meData);
      setMembers(membersData.items);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createInvite() {
    setPending(true);
    setError(null);
    try {
      const invite = await apiFetch<{ token: string }>(
        "/api/household/invites",
        { method: "POST", json: {} },
      );
      setInviteLink(
        `${location.origin}/registrace?pozvanka=${invite.token}`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.push("/prihlaseni");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Nastavení</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <section className={sectionClass}>
        <h2 className="mb-2 text-lg font-semibold">Vzhled</h2>
        <ThemeSwitcher />
      </section>

      <section className={sectionClass}>
        <h2 className="mb-2 text-lg font-semibold">Data</h2>
        <Link
          href="/nastaveni/potraviny"
          className={`${secondaryButtonClass} inline-flex items-center`}
        >
          🥕 Potraviny a nutriční hodnoty
        </Link>
      </section>

      {me && (
        <section className={sectionClass}>
          <h2 className="mb-2 text-lg font-semibold">Profil</h2>
          <p className="text-sm">
            {me.displayName}{" "}
            <span className="text-muted-foreground">({me.email})</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Domácnost: {me.household?.name} ·{" "}
            {me.role === "admin" ? "správce" : "člen"}
          </p>
        </section>
      )}

      <section className={sectionClass}>
        <h2 className="mb-2 text-lg font-semibold">Členové domácnosti</h2>
        <ul className="space-y-1">
          {members.map((m) => (
            <li key={m.userId} className="text-sm">
              {m.displayName}{" "}
              <span className="text-muted-foreground">
                ({m.email}) — {m.role === "admin" ? "správce" : "člen"}
              </span>
            </li>
          ))}
        </ul>
        {me?.role === "admin" && (
          <div className="mt-3 space-y-2">
            <button
              onClick={createInvite}
              disabled={pending}
              className={buttonClass}
            >
              Pozvat člena
            </button>
            {inviteLink && (
              <div className="rounded-lg bg-surface-warm p-3 text-sm">
                <p className="mb-1 font-medium">
                  Pozvánka (platí 7 dní, zobrazí se jen jednou):
                </p>
                <code className="break-all text-xs">{inviteLink}</code>
              </div>
            )}
          </div>
        )}
      </section>

      <section className={sectionClass}>
        <h2 className="mb-2 text-lg font-semibold">Účet</h2>
        <button onClick={logout} className={secondaryButtonClass}>
          Odhlásit se
        </button>
      </section>
    </div>
  );
}
