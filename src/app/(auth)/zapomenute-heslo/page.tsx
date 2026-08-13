"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AuthCard,
  buttonClass,
  errorClass,
  inputClass,
  labelClass,
} from "@/components/auth/auth-card";
import { apiFetch } from "@/lib/api/client";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    try {
      await apiFetch("/api/auth/password-reset/request", {
        method: "POST",
        json: { email: form.get("email") },
      });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard title="Zapomenuté heslo">
      {sent ? (
        <p className="text-sm">
          Pokud účet existuje, byl vytvořen odkaz pro obnovení hesla. Odesílání
          e-mailů zatím není zapnuté — odkaz najdeš v logu serveru, nebo požádej
          správce domácnosti.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className={inputClass}
            />
          </div>
          {error && <p className={errorClass}>{error}</p>}
          <button type="submit" disabled={pending} className={buttonClass}>
            Obnovit heslo
          </button>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link href="/prihlaseni" className="text-primary hover:underline">
          Zpět na přihlášení
        </Link>
      </p>
    </AuthCard>
  );
}
