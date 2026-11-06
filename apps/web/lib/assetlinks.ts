/**
 * Digital Asset Links for the Android app (ADR-046). Android reads
 * https://app.rhoeflow.pro/.well-known/assetlinks.json to confirm that the app signed with these
 * certificates may open app.rhoeflow.pro links (sign-in and invite emails). Pure, so it is unit-tested.
 */

/** The Android app's package name (apps/android/capacitor.config.ts). Permanent once on Google Play. */
export const ANDROID_PACKAGE = "pro.rhoeflow.app";

const FINGERPRINT = /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/;

/**
 * SHA-256 certificate fingerprints from the comma- or space-separated `ANDROID_CERT_FINGERPRINTS`
 * setting: Play Console's app signing key, plus the upload key for builds installed outside Play.
 * Anything that is not a SHA-256 fingerprint is dropped.
 */
export function parseFingerprints(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,]+/)) {
    const f = part.trim().toUpperCase();
    if (FINGERPRINT.test(f)) seen.add(f);
  }
  return [...seen];
}

export interface AssetLink {
  relation: string[];
  target: { namespace: "android_app"; package_name: string; sha256_cert_fingerprints: string[] };
}

export function assetLinks(fingerprints: readonly string[]): AssetLink[] {
  if (fingerprints.length === 0) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: [...fingerprints] },
    },
  ];
}
