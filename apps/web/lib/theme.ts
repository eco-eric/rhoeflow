/**
 * Theme choice storage (ADR-042), shared by the server layout and the client picker. A plain module
 * (not "use client") so the layout gets the script text itself.
 */
export type ThemeChoice = "system" | "light" | "dark";
export const THEME_KEY = "rhoe-theme";

/** Runs in <head> before the page paints. Kept tiny and dependency-free; any failure leaves System. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

/** What a stored value means; anything but light or dark is System. */
export function themeChoiceFrom(stored: string | null | undefined): ThemeChoice {
  return stored === "light" || stored === "dark" ? stored : "system";
}
