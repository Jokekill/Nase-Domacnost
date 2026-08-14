/**
 * Marks a screen that is showing the local mirror instead of the server
 * (docs/SYNC.md §6). Deliberately plain and always visible when it applies —
 * offline data can be stale and the user has to be able to tell.
 */
export function OfflineNotice({ children }: { children?: React.ReactNode }) {
  return (
    <p className="mb-3 rounded-lg bg-surface-warm p-2.5 text-sm">
      ⚡ Offline — ukazuji poslední staženou kopii.
      {children ? (
        <span className="text-muted-foreground"> {children}</span>
      ) : null}
    </p>
  );
}
