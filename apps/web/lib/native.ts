"use client";
import { Capacitor } from "@capacitor/core";
import { fileNameFrom } from "./download-file-name";

/**
 * The Android app (ADR-032, ADR-046) opens this same web app inside a Capacitor shell. These helpers
 * are no-ops in a normal browser: `isNativeApp()` is false there and nothing native is loaded.
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

function base64Of(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("could not read the file"));
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * In the Android app a plain `<a download>` does nothing (the WebView has no download manager), so the
 * report PDF is fetched with the session cookie, written to the app's cache and handed to the phone's
 * share sheet, where it can be saved to Files or Drive, emailed or texted.
 */
export async function saveAndSharePdf(url: string, fallbackName: string): Promise<void> {
  const res = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) {
    let message = `The PDF could not be made (${res.status}).`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      // not JSON; keep the status message
    }
    throw new Error(message);
  }
  const name = fileNameFrom(res.headers.get("content-disposition"), fallbackName);
  const data = await base64Of(await res.blob());
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
  const written = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
  try {
    await Share.share({ title: name, files: [written.uri], dialogTitle: "Save or send the report" });
  } catch (e) {
    // Closing the share sheet without picking anything is not an error.
    if (e instanceof Error && /cancel/i.test(e.message)) return;
    throw e;
  }
}
