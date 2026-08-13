"use client";

import { useEffect, useRef, useState } from "react";

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};
declare global {
  interface Window {
    BarcodeDetector?: new (options?: {
      formats?: string[];
    }) => BarcodeDetectorLike;
  }
}

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

/**
 * Camera barcode scanner using the native BarcodeDetector API.
 * Requires a secure context (HTTPS or localhost) — on the Pi this is provided
 * by `tailscale serve` (docs/DEPLOY.md). When the API is missing the user can
 * always type the digits manually.
 */
export function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    async function start() {
      if (!window.isSecureContext) {
        setError(
          "Skenování vyžaduje zabezpečené připojení (HTTPS). Zadej kód ručně.",
        );
        return;
      }
      if (!window.BarcodeDetector) {
        setError(
          "Tento prohlížeč neumí skenovat kódy. Zadej číslo pod kódem ručně.",
        );
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const detector = new window.BarcodeDetector({ formats: FORMATS });
        const scan = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const code = codes[0]?.rawValue;
            if (code) {
              onDetected(code);
              return;
            }
          } catch {
            /* transient decode errors are normal */
          }
          raf = requestAnimationFrame(scan);
        };
        raf = requestAnimationFrame(scan);
      } catch {
        setError("Nepodařilo se zapnout kameru. Zadej kód ručně.");
      }
    }

    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Naskenovat čárový kód</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-3 py-2 text-sm min-h-11"
        >
          ✕ Zavřít
        </button>
      </div>

      {error ? (
        <p className="rounded-lg bg-surface-warm p-3 text-sm">{error}</p>
      ) : (
        <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-card bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-auto w-full"
          />
          <div className="pointer-events-none absolute inset-x-6 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-primary/80" />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (/^\d{6,14}$/.test(manual.trim())) onDetected(manual.trim());
        }}
        className="mx-auto mt-4 flex w-full max-w-md gap-2"
      >
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          inputMode="numeric"
          placeholder="…nebo číslo pod kódem"
          className="grow rounded-lg border border-border bg-background px-3 py-2.5 text-base min-h-11"
        />
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground min-h-11"
        >
          Najít
        </button>
      </form>
    </div>
  );
}
