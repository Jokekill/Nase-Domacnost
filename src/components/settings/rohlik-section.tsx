"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

type Status = {
  source: "settings" | "env" | "none";
  login: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  configured: boolean;
};

const sectionClass =
  "rounded-card border border-border bg-surface p-4 shadow-card";
const button =
  "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 min-h-11";
const secondary =
  "rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-warm disabled:opacity-50 min-h-11";
const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const label = "mb-1 block text-xs font-medium";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Connecting rohlik.cz from Nastavení (D-030).
 *
 * The form signs in before it saves, so the answer on screen is the real one:
 * either the account works or Rohlík says why not. A rejected password is not
 * stored, which is why there is no "uloženo, ale neověřeno" state to explain.
 */
export function RohlikSection({ isAdmin }: { isAdmin: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<null | "save" | "verify" | "delete">(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await apiFetch<Status>("/api/rohlik/credentials"));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(
    kind: "save" | "verify" | "delete",
    action: () => Promise<void>,
    done: string,
  ) {
    setPending(kind);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(done);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(null);
      await load();
    }
  }

  const save = () =>
    run(
      "save",
      async () => {
        const next = await apiFetch<Status>("/api/rohlik/credentials", {
          method: "PUT",
          json: { login: login.trim(), password },
        });
        setStatus(next);
        // The password has done its job; it does not stay in the form.
        setPassword("");
        setLogin("");
        setEditing(false);
      },
      "Přihlášení k Rohlíku funguje a je uložené.",
    );

  const verify = () =>
    run(
      "verify",
      async () => {
        setStatus(
          await apiFetch<Status>("/api/rohlik/credentials/verify", {
            method: "POST",
          }),
        );
      },
      "Přihlášení pořád funguje.",
    );

  const disconnect = () =>
    run(
      "delete",
      async () => {
        await apiFetch("/api/rohlik/credentials", { method: "DELETE" });
      },
      "Rohlík odpojen, heslo smazáno.",
    );

  const connected = status?.source === "settings";
  const fromEnv = status?.source === "env";

  return (
    <section className={sectionClass}>
      <h2 className="mb-1 text-lg font-semibold">🥕 Rohlík.cz</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Po přihlášení půjde nákupní seznam poslat rovnou do košíku na Rohlíku —
        tlačítkem „Do Rohlíku“ u seznamu. Objednávku nic nedokončí, tu potvrdíš
        sám na rohlik.cz.
      </p>

      {status === null ? (
        <p className="text-sm text-muted-foreground">Načítám…</p>
      ) : (
        <>
          <dl className="mb-3 grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">Stav</dt>
            <dd>
              {connected && <>✅ Připojeno jako {status.login}</>}
              {fromEnv && (
                <>
                  ✅ Připojeno přes nastavení serveru ({status.login}) — heslo
                  je v proměnných prostředí, ne tady
                </>
              )}
              {status.source === "none" && (
                <span className="text-muted-foreground">Nepřipojeno</span>
              )}
            </dd>
            {connected && (
              <>
                <dt className="text-muted-foreground">Naposledy ověřeno</dt>
                <dd>{formatDateTime(status.lastVerifiedAt)}</dd>
              </>
            )}
          </dl>

          {status.lastError && (
            <p className="mb-3 rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">
              Poslední pokus o přihlášení selhal: {status.lastError}
            </p>
          )}
        </>
      )}

      {!isAdmin ? (
        <p className="text-sm text-muted-foreground">
          Připojit nebo odpojit Rohlík může jen správce domácnosti.
        </p>
      ) : (
        <>
          {(editing || status?.source === "none") && (
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <label>
                <span className={label}>E-mail na Rohlíku</span>
                <input
                  type="email"
                  autoComplete="off"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  className={input}
                />
              </label>
              <label>
                <span className={label}>Heslo</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={input}
                />
              </label>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Heslo se uloží zašifrované na serveru, nikdy se nikam nevrací a
                není ani v exportu dat. Nejdřív se jím zkusíme přihlásit — když
                ho Rohlík odmítne, neuloží se.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {(editing || status?.source === "none") && (
              <button
                onClick={save}
                disabled={
                  pending !== null || login.trim() === "" || password === ""
                }
                className={button}
              >
                {pending === "save" ? "Přihlašuji…" : "Přihlásit a uložit"}
              </button>
            )}
            {!editing && status?.source !== "none" && (
              <button
                onClick={() => {
                  setEditing(true);
                  setLogin(connected ? (status?.login ?? "") : "");
                  setMessage(null);
                  setError(null);
                }}
                className={secondary}
              >
                Změnit přihlášení
              </button>
            )}
            {editing && status?.source !== "none" && (
              <button
                onClick={() => {
                  setEditing(false);
                  setLogin("");
                  setPassword("");
                }}
                className={secondary}
              >
                Zrušit
              </button>
            )}
            {connected && (
              <>
                <button
                  onClick={verify}
                  disabled={pending !== null}
                  className={secondary}
                >
                  {pending === "verify" ? "Ověřuji…" : "Ověřit znovu"}
                </button>
                <button
                  onClick={() => {
                    if (confirm("Opravdu odpojit Rohlík a smazat heslo?")) {
                      void disconnect();
                    }
                  }}
                  disabled={pending !== null}
                  className={`${secondary} text-destructive`}
                >
                  Odpojit
                </button>
              </>
            )}
          </div>
        </>
      )}

      {message && (
        <p role="status" className="mt-3 text-sm text-accent-green">
          {message}
        </p>
      )}
      {error && (
        <p role="status" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
