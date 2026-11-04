/**
 * Where to look up permits for a house (ADR-043 permits, phase 1). No permit data is pulled yet:
 * the House facts card links to the city's own permit search so the tech can check for an HVAC
 * change-out, a roof, an addition or a remodel by hand. Each link below is the city's own page or
 * the permit portal the city's site names, checked 2026-11-04. A city not listed gets no link.
 */

export interface PermitSearch {
  city: string;
  url: string;
  /** What the tech will find there, in a few words. */
  note: string;
}

const CITIES: Record<string, Omit<PermitSearch, "city">> = {
  dallas: { url: "https://dallascityhall.com/departments/sustainabledevelopment/buildinginspection/pages/online-records.aspx", note: "Search records by permit number or address" },
  "fort worth": { url: "https://aca-prod.accela.com/CFW/Cap/CapHome.aspx?module=Development&TabName=Home", note: "Accela search by site address" },
  arlington: { url: "https://ap.arlingtontx.gov/AP/sfjsp?interviewID=PublicSearch&btnclk=search", note: "Public permit search" },
  plano: { url: "https://trakit.plano.gov/etrakit_prod/", note: "eTRAKiT permit search" },
  frisco: { url: "https://etrakit.friscotexas.gov/", note: "eTRAKiT permit search" },
  mckinney: { url: "https://www.mckinneytexas.org/165/Permits", note: "City permits page" },
  richardson: { url: "https://discovery.cor.gov/public/permits/permitInquiry.nsf/index.html", note: "Permit inquiry" },
  irving: { url: "https://irvingtx.gov/online-permit-instructions", note: "City page for the MGO permit portal" },
  garland: { url: "https://www.garlandtx.gov/2029/Permits", note: "City permits page" },
  carrollton: { url: "https://cityserve.cityofcarrollton.com/CityViewPortal/Permit/Locator", note: "Search by address" },
  allen: { url: "https://www.cityofallen.org/2215/Citizen-Self-Service-CSS", note: "City page for the CSS permit portal" },
  denton: { url: "https://www.cityofdenton.com/622/Residential-Permits", note: "City residential permits page" },
};

/** The permit search for the job's city, or null when RhoeFlow has none for it. */
export function permitSearchFor(city: string | null | undefined): PermitSearch | null {
  const key = (city ?? "").toLowerCase().replace(/^city of\s+/, "").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  const hit = CITIES[key];
  return hit ? { city: key.replace(/\b\w/g, (c) => c.toUpperCase()), ...hit } : null;
}
