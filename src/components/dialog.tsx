"use client";

import { useEffect, useId, useRef } from "react";

/**
 * The bits every modal in the app needs and none of them had (§11.2):
 * a dialog role, Escape, focus that starts inside the dialog, stays inside it
 * while tabbing and goes back where it came from on close.
 *
 * Deliberately a hook and not a wrapper component — the four dialogs have
 * different layouts (bottom sheet on the phone, centred card on the desktop)
 * and this way none of them has to change how it looks.
 *
 *   const dialog = useDialog(onClose);
 *   <div className="fixed inset-0 …" {...dialog.backdropProps}>
 *     <div className="…" {...dialog.panelProps}>
 *       <h2 id={dialog.titleId}>…</h2>
 */
export function useDialog(onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Kept in a ref so the effect does not re-run (and re-steal focus) whenever
  // the parent re-renders with a fresh closure.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = () =>
      [
        ...(panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter((el) => el.offsetParent !== null);

    // Focus the first control, not the close button: on a phone the dialog is
    // opened to do something, not to dismiss it.
    (focusable()[0] ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, []);

  return {
    titleId,
    backdropProps: {
      // Clicking the dark area around the dialog closes it — the same gesture
      // as Escape, for a thumb.
      onMouseDown: (event: React.MouseEvent) => {
        if (event.target === event.currentTarget) closeRef.current();
      },
    },
    panelProps: {
      ref: panelRef,
      role: "dialog" as const,
      "aria-modal": true,
      "aria-labelledby": titleId,
      tabIndex: -1,
    },
  };
}
