import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import { getSessionUser } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  if (!user) redirect("/prihlaseni");
  return (
    <Providers>
      <AppShell userName={user.displayName}>{children}</AppShell>
    </Providers>
  );
}
