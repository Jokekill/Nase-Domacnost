"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SyncIndicator } from "@/components/sync-indicator";

const MAIN_NAV = [
  { href: "/kucharka", label: "Kuchařka", icon: "📖" },
  { href: "/jidelnicek", label: "Jídelníček", icon: "🗓️" },
  { href: "/nakup", label: "Nákup", icon: "🛒" },
  { href: "/ukoly", label: "Úkoly", icon: "✅" },
];

const MORE_NAV = [
  { href: "/kalendar", label: "Kalendář", icon: "📅" },
  { href: "/denik", label: "Deník", icon: "🥗" },
  { href: "/nastaveni", label: "Nastavení", icon: "⚙️" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({
  children,
  userName,
}: {
  children: React.ReactNode;
  userName: string;
}) {
  const pathname = usePathname();
  const moreActive = MORE_NAV.some((i) => isActive(pathname, i.href));

  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      {/* Nine links stand between the top of the page and the content on the
          desktop — a keyboard user needs a way past them (§11.2). */}
      <a
        href="#obsah"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Přeskočit na obsah
      </a>

      {/* Desktop top bar */}
      <header className="sticky top-0 z-40 hidden border-b border-border bg-background/90 backdrop-blur md:block">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-4">
          <Link
            href="/kucharka"
            className="mr-4 font-display text-lg font-semibold"
          >
            📖 Naše domácnost
          </Link>
          {[...MAIN_NAV, ...MORE_NAV].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive(pathname, item.href)
                  ? "bg-surface-warm text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <div className="ml-auto flex items-center gap-1">
            <SyncIndicator />
            <span className="text-sm text-muted-foreground">{userName}</span>
          </div>
        </div>
      </header>

      <main
        id="obsah"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 py-4 md:py-6"
      >
        {children}
      </main>

      {/* Mobile bottom bar — max 5 items, cookbook first (docs/DESIGN.md §5) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface md:hidden">
        <div className="grid grid-cols-5">
          {MAIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${
                isActive(pathname, item.href)
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              {item.label}
            </Link>
          ))}
          <Link
            href="/vice"
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${
              moreActive || isActive(pathname, "/vice")
                ? "text-primary"
                : "text-muted-foreground"
            }`}
          >
            <span className="text-xl leading-none">⋯</span>
            Více
          </Link>
        </div>
      </nav>
    </div>
  );
}
