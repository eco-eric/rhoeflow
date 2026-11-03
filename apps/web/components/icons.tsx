/** Small line icons drawn in the current text colour (ADR-042). Decorative: always aria-hidden. */
const base = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const PlusIcon = () => (
  <svg {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const HouseIcon = () => (
  <svg {...base}>
    <path d="M3 11l9-7 9 7" />
    <path d="M5 10v10h14V10" />
    <path d="M10 20v-5h4v5" />
  </svg>
);
export const LinkIcon = () => (
  <svg {...base}>
    <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1" />
    <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1-1" />
  </svg>
);
export const ArchiveIcon = () => (
  <svg {...base}>
    <rect x="3" y="4" width="18" height="5" rx="1" />
    <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
    <path d="M10 13h4" />
  </svg>
);
export const RestoreIcon = () => (
  <svg {...base}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </svg>
);
export const SunIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
export const MoonIcon = () => (
  <svg {...base}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);
export const DeviceIcon = () => (
  <svg {...base}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </svg>
);

/** The marketing site's wordmark: two flow lines in a tile, "Rhoē" and gold "Flow" (ADR-033, ADR-042). */
export function Wordmark() {
  return (
    <>
      <svg width="28" height="28" viewBox="0 0 34 34" fill="none" aria-hidden="true">
        <rect className="logo-tile" x="1" y="1" width="32" height="32" rx="8" strokeWidth="2" />
        <path className="wave-gold" d="M8 22c3-6 6-8 9-8s6 2 9 8" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path className="wave-sage" d="M8 17c3-6 6-8 9-8s6 2 9 8" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      </svg>
      <span className="word">
        Rhoē<span className="flow">Flow</span>
      </span>
    </>
  );
}
