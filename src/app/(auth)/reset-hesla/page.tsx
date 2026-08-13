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

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    try {
      await apiFetch("/api/auth/password-reset/confirm", {
        method: "POST",
        json: { token, newPassword: form.get("newPassword") },
      });
      router.push("/prihlaseni");
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  if (!token) {
    return (
      <AuthCard title="Obnovení hesla">
        <p className={errorClass}>Chybí token — použij odkaz z e-mailu.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Obnovení hesla">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="newPassword">
            Nové heslo (min. 8 znaků)
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
        </div>
        {error && <p className={errorClass}>{error}</p>}
        <button type="submit" disabled={pending} className={buttonClass}>
          Nastavit nové heslo
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link href="/prihlaseni" className="text-primary hover:underline">
          Zpět na přihlášení
        </Link>
      </p>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
