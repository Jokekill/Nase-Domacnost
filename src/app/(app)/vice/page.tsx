import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Více" };

const ITEMS = [
  { href: "/kalendar", label: "Kalendář", icon: "📅" },
  { href: "/denik", label: "Výživový deník", icon: "🥗" },
  { href: "/nastaveni", label: "Nastavení", icon: "⚙️" },
];

export default function MorePage() {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-semibold">Více</h1>
      <div className="space-y-2">
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-card"
          >
            <span className="text-2xl">{item.icon}</span>
            <span className="font-medium">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
