export function AuthCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-card bg-surface p-6 shadow-card border border-border">
        <div className="mb-6 text-center">
          <span className="text-3xl">📖</span>
          <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
        </div>
        {children}
      </div>
    </main>
  );
}

export const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring";
export const buttonClass =
  "w-full rounded-lg bg-primary px-3 py-2.5 text-base font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 min-h-11";
export const labelClass = "mb-1 block text-sm font-medium";
export const errorClass = "text-sm text-destructive";
