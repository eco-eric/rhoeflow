"use client";
import { useEffect } from "react";
import { appLinkTarget } from "../lib/app-link";
import { isNativeApp } from "../lib/native";

const OPENED_KEY = "rhoe.app-link.opened";

/**
 * Only does anything inside the Android app (ADR-046). When Android opens the app from a link to
 * app.rhoeflow.pro (a sign-in or invite email), this page goes to that link inside the app, so the
 * sign-in lands in the app's own session instead of Chrome's.
 */
export function NativeShell() {
  useEffect(() => {
    if (!isNativeApp()) return;
    let remove: (() => void) | undefined;
    let live = true;
    const go = (link: string | undefined) => {
      let opened: string | null = null;
      try {
        opened = sessionStorage.getItem(OPENED_KEY);
      } catch {
        opened = null;
      }
      const target = appLinkTarget(link, window.location.origin, window.location.href, opened);
      if (!target) return;
      try {
        sessionStorage.setItem(OPENED_KEY, target);
      } catch {
        // without storage the link still opens; it just is not remembered
      }
      window.location.assign(target);
    };
    void import("@capacitor/app").then(async ({ App }) => {
      if (!live) return;
      // Cold start: the link that launched the app.
      const launch = await App.getLaunchUrl().catch(() => undefined);
      go(launch?.url);
      // Warm start: a link tapped while the app was already open.
      const handle = await App.addListener("appUrlOpen", (e) => go(e.url));
      if (live) remove = () => void handle.remove();
      else void handle.remove();
    });
    return () => {
      live = false;
      remove?.();
    };
  }, []);
  return null;
}
