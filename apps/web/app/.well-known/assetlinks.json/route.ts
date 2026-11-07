import { getCloudflareContext } from "@opennextjs/cloudflare";
import { assetLinks, parseFingerprints } from "../../../lib/assetlinks";

export const dynamic = "force-dynamic";

/**
 * GET /.well-known/assetlinks.json (ADR-046): lets the Android app open app.rhoeflow.pro links.
 * Public, no session. The certificate fingerprints come from the Worker's ANDROID_CERT_FINGERPRINTS
 * setting (apps/web/wrangler.jsonc); until it is filled in this answers 404 and links keep opening in
 * the browser.
 */
export async function GET(): Promise<Response> {
  let raw: string | undefined;
  try {
    raw = (getCloudflareContext().env as unknown as Record<string, unknown>)["ANDROID_CERT_FINGERPRINTS"] as string | undefined;
  } catch {
    raw = undefined;
  }
  raw ??= process.env["ANDROID_CERT_FINGERPRINTS"];
  const links = assetLinks(parseFingerprints(raw));
  if (links.length === 0) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(JSON.stringify(links), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
  });
}
