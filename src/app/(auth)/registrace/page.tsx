"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  AuthCard,
  buttonClass,
  errorClass,
  inputClass,
  labelClass,
} from "@/components/auth/auth-card";
import { apiFetch } from "@/lib/api/client";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("pozvanka");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        json: {
          email: form.get("email"),
          password: form.get("password"),
          displayName: form.get("displayName"),
          inviteToken: inviteToken ?? undefined,
          householdName:
            (form.get("householdName") as string | null) || undefined,
        },
      });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  return (
    <AuthCard title="Registrace">
      {inviteToken ? (
        <p className="mb-4 rounded-lg bg-surface-warm p-3 text-sm">
          Registruješ se na pozvánku do existující domácnosti.
        </p>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">
          První účet založí novou domácnost. Další členové se přidávají přes
          pozvánku.
        </p>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="displayName">
            Jméno
          </label>
          <input
            id="displayName"
            name="displayName"
            required
            autoComplete="name"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="password">
            Heslo (min. 8 znaků)
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
        </div>
        {!inviteToken && (
          <div>
            <label className={labelClass} htmlFor="householdName">
              Název domácnosti
            </label>
            <input
              id="householdName"
              name="householdName"
              placeholder="Naše domácnost"
              className={inputClass}
            />
          </div>
        )}
        {error && <p className={errorClass}>{error}</p>}
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Zakládám účet…" : "Zaregistrovat se"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Už máš účet?{" "}
        <Link href="/prihlaseni" className="text-primary hover:underline">
          Přihlášení
        </Link>
      </p>
    </AuthCard>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
