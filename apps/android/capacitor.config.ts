import type { CapacitorConfig } from "@capacitor/cli";

/**
 * RhoeFlow Pro on Android (ADR-032 native shells, ADR-046 how the shell loads the app).
 *
 * The web app is Next.js on Cloudflare Workers (ADR-036) with server routes (sign-in callback, API,
 * PDF printing), so it cannot be copied into the app as static files. The shell opens the live app at
 * app.rhoeflow.pro instead: web fixes reach phones without a Play upload, and only changes to this
 * folder need a new build. `www/` holds the screen shown when the phone has no signal.
 *
 * appId is permanent once the first build is uploaded to Google Play.
 */
const config: CapacitorConfig = {
  appId: "pro.rhoeflow.app",
  appName: "RhoeFlow",
  webDir: "www",
  server: {
    url: "https://app.rhoeflow.pro",
    androidScheme: "https",
    // Only the app's own pages load inside the shell; any other site opens in the phone's browser.
    allowNavigation: ["app.rhoeflow.pro"],
    // Shown when app.rhoeflow.pro cannot be reached (no signal in an attic or crawlspace).
    errorPath: "offline.html",
  },
  android: {
    // Lets Chrome on a computer inspect the app's WebView only in debug builds.
    webContentsDebuggingEnabled: false,
  },
};

export default config;
