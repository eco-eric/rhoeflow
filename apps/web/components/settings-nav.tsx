import Link from "next/link";

/** Tabs across the settings pages. */
export function SettingsNav({ active }: { active: "profile" | "account" | "connectors" }) {
  const tab = (key: typeof active, href: string, label: string) => (
    <Link href={href} className={`tab${active === key ? " on" : ""}`} aria-current={active === key ? "page" : undefined}>
      {label}
    </Link>
  );
  return (
    <nav className="tabs" aria-label="Settings">
      {tab("profile", "/settings/profile", "Profile")}
      {tab("account", "/settings/account", "Account")}
      {tab("connectors", "/settings/connectors", "Connectors")}
    </nav>
  );
}
