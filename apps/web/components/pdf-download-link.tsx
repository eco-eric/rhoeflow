"use client";
import { useEffect, useState } from "react";
import { isNativeApp, saveAndSharePdf } from "../lib/native";

/**
 * "Download PDF" on the report page. In a browser it is a plain download link. In the Android app
 * (ADR-046) the WebView cannot download, so the same tap fetches the PDF and opens the phone's share
 * sheet to save it to Files or Drive or send it.
 */
export function PdfDownloadLink({ href, fallbackName }: { href: string; fallbackName: string }) {
  const [native, setNative] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setNative(isNativeApp()), []);
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!native) return;
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    saveAndSharePdf(href, fallbackName)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };
  return (
    <>
      <a href={href} download onClick={onClick} aria-busy={busy || undefined}>
        {busy ? "Making the PDF…" : native ? "Save or share PDF" : "Download PDF"}
      </a>
      {error ? (
        <span className="note" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}
