"use client";

import { useRef, useState } from "react";
import { formatBytes } from "./backup-section";

type Preview = {
  formatVersion: number;
  exportedAt: string | null;
  includesCredentials: boolean;
  counts: Record<string, { inFile: number; existing: number; toInsert: number }>;
  photos: { inFile: number; missing: string[] };
  problems: string[];
  canApply: boolean;
};
type Result = {
  inserted: Record<string, number>;
  skipped: Record<string, number>;
  photosWritten: number;
};

const button =
  "rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-warm disabled:opacity-50 min-h-11";

function sum(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

/** Export / restore (§9.4, §9.5). Admin-only, mirrors docs/EXPORT-FORMAT.md. */
export function TransferSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [withCredentials, setWithCredentials] = useState(true);
  const [withPhotos, setWithPhotos] = useState(true);

  async function exportZip() {
    setBusy("export");
    setError(null);
    try {
      const params = new URLSearchParams({
        credentials: String(withCredentials),
        photos: String(withPhotos),
      });
      const res = await fetch(`/api/export?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? "Export selhal.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nase-domacnost-export-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function send(mode: "preview" | "apply") {
    if (!file) return;
    setBusy(mode);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", mode);
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "Import selhal.");
      }
      if (mode === "preview") setPreview(data as Preview);
      else {
        setResult(data as Result);
        setPreview(null);
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-card border border-border bg-surface p-4 shadow-card">
      <h2 className="mb-2 text-lg font-semibold">Export a obnovení</h2>

      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}

      <div className="mb-4">
        <p className="mb-2 text-sm text-muted-foreground">
          ZIP s <code>data.json</code> a fotkami — čitelný formát, popsaný
          v docs/EXPORT-FORMAT.md.
        </p>
        <label className="mb-1 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={withPhotos}
            onChange={(e) => setWithPhotos(e.target.checked)}
            className="h-5 w-5 accent-primary"
          />
          včetně fotek
        </label>
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={withCredentials}
            onChange={(e) => setWithCredentials(e.target.checked)}
            className="h-5 w-5 accent-primary"
          />
          včetně přihlašovacích údajů (hashů hesel) — nutné pro plnou obnovu
        </label>
        {withCredentials && (
          <p className="mb-2 text-sm text-muted-foreground">
            ⚠️ Soubor pak obsahuje hashe hesel všech členů — chraň ho jako
            heslo samotné.
          </p>
        )}
        <button
          onClick={exportZip}
          disabled={busy !== null}
          className={button}
        >
          {busy === "export" ? "Připravuji…" : "⬇︎ Stáhnout export"}
        </button>
      </div>

      <div className="border-t border-border pt-4">
        <p className="mb-2 text-sm text-muted-foreground">
          Obnovení ze ZIPu: nejdřív se ukáže náhled, teprve pak se zapisuje.
          Záznamy, které už v databázi existují, se <strong>přeskočí</strong> —
          import nikdy nepřepisuje novější data.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setResult(null);
          }}
          className="mb-2 block w-full text-sm"
        />
        {file && (
          <p className="mb-2 text-sm text-muted-foreground">
            {file.name} · {formatBytes(file.size)}
          </p>
        )}
        <button
          onClick={() => send("preview")}
          disabled={!file || busy !== null}
          className={button}
        >
          {busy === "preview" ? "Kontroluji…" : "Zkontrolovat archiv"}
        </button>

        {preview && (
          <div className="mt-3 rounded-lg bg-surface-warm p-3 text-sm">
            <p className="mb-1">
              Export z{" "}
              {preview.exportedAt
                ? new Date(preview.exportedAt).toLocaleString("cs-CZ")
                : "neznámého data"}{" "}
              · formát v{preview.formatVersion}
              {preview.includesCredentials ? " · s hesly" : " · bez hesel"}
            </p>
            <p className="mb-1">
              K vložení:{" "}
              <strong>
                {sum(
                  Object.fromEntries(
                    Object.entries(preview.counts).map(([k, v]) => [
                      k,
                      v.toInsert,
                    ]),
                  ),
                )}
              </strong>{" "}
              záznamů, přeskočí se{" "}
              {sum(
                Object.fromEntries(
                  Object.entries(preview.counts).map(([k, v]) => [
                    k,
                    v.existing,
                  ]),
                ),
              )}{" "}
              už existujících · fotek v archivu: {preview.photos.inFile}
            </p>
            <ul className="mb-2 max-h-40 overflow-y-auto text-xs text-muted-foreground">
              {Object.entries(preview.counts)
                .filter(([, c]) => c.inFile > 0)
                .map(([name, c]) => (
                  <li key={name}>
                    {name}: {c.toInsert} nových
                    {c.existing > 0 ? `, ${c.existing} už je` : ""}
                  </li>
                ))}
            </ul>
            {preview.problems.length > 0 && (
              <ul className="mb-2 space-y-1 text-destructive">
                {preview.problems.map((p, i) => (
                  <li key={i}>⚠️ {p}</li>
                ))}
              </ul>
            )}
            <button
              onClick={() => {
                if (
                  confirm(
                    "Opravdu importovat? Existující záznamy se nepřepíšou, nové se vloží.",
                  )
                )
                  void send("apply");
              }}
              disabled={!preview.canApply || busy !== null}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 min-h-11"
            >
              {busy === "apply" ? "Importuji…" : "Importovat"}
            </button>
            {!preview.canApply && preview.problems.length === 0 && (
              <p className="mt-2 text-muted-foreground">
                Není co vkládat — všechno už v databázi je.
              </p>
            )}
          </div>
        )}

        {result && (
          <div className="mt-3 rounded-lg bg-surface-warm p-3 text-sm">
            ✅ Importováno {sum(result.inserted)} záznamů, přeskočeno{" "}
            {sum(result.skipped)} · fotek zapsáno {result.photosWritten}
          </div>
        )}
      </div>
    </section>
  );
}
