/**
 * Which App Link the Android app should open (ADR-046). Pure, so it is unit-tested.
 *
 * Android hands the app a link to app.rhoeflow.pro (a sign-in, reset-password or invite email, or a
 * link shared from WorkEdge). The shell itself always starts at the home page, so the page has to go to
 * the link. Only this site's own https links are followed, and each one only once: a sign-in link is
 * single-use, and going back to it after it worked would show "link expired".
 */
export function appLinkTarget(link: string | null | undefined, origin: string, current: string, alreadyOpened: string | null): string | null {
  if (!link || link === alreadyOpened) return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.origin !== origin) return null;
  if (url.href === current) return null;
  return url.href;
}
