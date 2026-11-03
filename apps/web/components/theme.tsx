"use client";
import { useEffect, useState } from "react";
import { THEME_KEY, themeChoiceFrom, type ThemeChoice } from "../lib/theme";
import { DeviceIcon, MoonIcon, SunIcon } from "./icons";

/**
 * Light, dark or the device's own setting (ADR-042). The choice is kept on this device in
 * localStorage under `rhoe-theme`; System is the default and means "no choice stored". A pinned
 * theme is set as <html data-theme> by THEME_SCRIPT (lib/theme.ts) before the first paint, so pages
 * never flash.
 */
export function readThemeChoice(): ThemeChoice {
  try {
    return themeChoiceFrom(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

export function applyThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Private mode or storage blocked: the choice still applies to this page.
  }
  if (choice === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", choice);
}

const OPTIONS: { value: ThemeChoice; label: string; Icon: () => React.JSX.Element }[] = [
  { value: "system", label: "System", Icon: DeviceIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
];

export function ThemePicker() {
  const [choice, setChoice] = useState<ThemeChoice | null>(null);
  useEffect(() => setChoice(readThemeChoice()), []);
  return (
    <fieldset className="theme-picker" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="sr-only">Theme</legend>
      {OPTIONS.map(({ value, label, Icon }) => (
        <label key={value}>
          <input
            type="radio"
            name="theme"
            value={value}
            checked={choice === value}
            onChange={() => {
              setChoice(value);
              applyThemeChoice(value);
            }}
          />
          <span>
            <Icon />
            {label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
