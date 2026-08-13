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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        json: {
          email: form.get("email"),
          password: form.get("password"),
        },
      });
      router.push(searchParams.get("next") ?? "/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  return (
    <AuthCard title="Přihlášení">
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
            autoComplete="email"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="password">
            Heslo
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
          />
        </div>
        {error && <p className={errorClass}>{error}</p>}
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Přihlašuji…" : "Přihlásit se"}
        </button>
      </form>
      <div className="mt-4 space-y-1 text-center text-sm text-muted-foreground">
        <p>
          <Link href="/zapomenute-heslo" className="hover:text-primary">
            Zapomenuté heslo
          </Link>
        </p>
        <p>
          Nemáš účet?{" "}
          <Link href="/registrace" className="text-primary hover:underline">
            Registrace
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
