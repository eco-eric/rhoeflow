import type { z } from "zod";
import { AssessmentSchema, type Assessment } from "./assessment.js";
import { walkFields } from "./walk.js";

export interface ValidationIssue {
  path: string;
  message: string;
  /** `shape` = Zod structural failure; `invariant` = cross-reference or domain rule. */
  kind: "shape" | "invariant";
}

export type ValidationResult =
  | { ok: true; assessment: Assessment; issues: [] }
  | { ok: false; assessment?: undefined; issues: ValidationIssue[] };

function zodIssuesToValidation(issues: z.core.$ZodIssue[]): ValidationIssue[] {
  return issues.map((i) => ({
    path: i.path.map((p) => (typeof p === "number" ? `[${p}]` : String(p))).join(".").replace(/\.\[/g, "["),
    message: i.message,
    kind: "shape",
  }));
}

const EPSILON = 1e-6;

/**
 * Cross-reference and domain invariants Zod cannot express structurally (DAT-001, DAT-002).
 * Returns an empty list when the assessment is internally consistent.
 */
export function checkInvariants(a: Assessment): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const b = a.building;
  const seen = new Map<string, string>();

  const register = (id: string, path: string) => {
    const prior = seen.get(id);
    if (prior !== undefined) {
      issues.push({ path, message: `duplicate element id "${id}" (also at ${prior})`, kind: "invariant" });
    } else {
      seen.set(id, path);
    }
  };

  const wallIds = new Set<string>();
  const spaceIds = new Set<string>();
  const zoneIds = new Set<string>();
  const distributionIds = new Set<string>();

  register(b.climate_and_risk_zones.weather_station.id, "building.climate_and_risk_zones.weather_station");
  register(b.enclosure.air_infiltration.id, "building.enclosure.air_infiltration");
  b.zones.forEach((z, zi) => {
    register(z.id, `building.zones[${zi}]`);
    zoneIds.add(z.id);
    z.spaces.forEach((s, si) => {
      register(s.id, `building.zones[${zi}].spaces[${si}]`);
      spaceIds.add(s.id);
    });
  });
  const e = b.enclosure;
  e.attics.forEach((x, i) => register(x.id, `building.enclosure.attics[${i}]`));
  e.foundations.forEach((x, i) => register(x.id, `building.enclosure.foundations[${i}]`));
  e.roofs.forEach((x, i) => register(x.id, `building.enclosure.roofs[${i}]`));
  e.foundation_walls.forEach((x, i) => register(x.id, `building.enclosure.foundation_walls[${i}]`));
  e.walls.forEach((x, i) => {
    register(x.id, `building.enclosure.walls[${i}]`);
    wallIds.add(x.id);
  });
  e.floors.forEach((x, i) => register(x.id, `building.enclosure.floors[${i}]`));
  e.slabs.forEach((x, i) => register(x.id, `building.enclosure.slabs[${i}]`));
  e.windows.forEach((x, i) => register(x.id, `building.enclosure.windows[${i}]`));
  e.doors.forEach((x, i) => register(x.id, `building.enclosure.doors[${i}]`));
  const h = b.systems.hvac;
  h.hvac_distributions.forEach((x, i) => {
    register(x.id, `building.systems.hvac.hvac_distributions[${i}]`);
    distributionIds.add(x.id);
    x.ducts.forEach((d, di) => register(d.id, `building.systems.hvac.hvac_distributions[${i}].ducts[${di}]`));
  });
  h.heating_systems.forEach((x, i) => register(x.id, `building.systems.hvac.heating_systems[${i}]`));
  h.cooling_systems.forEach((x, i) => register(x.id, `building.systems.hvac.cooling_systems[${i}]`));
  h.heat_pumps.forEach((x, i) => register(x.id, `building.systems.hvac.heat_pumps[${i}]`));
  if (h.hvac_control) register(h.hvac_control.id, "building.systems.hvac.hvac_control");

  // A radiant barrier needs its grade (HPXML RadiantBarrierGrade), 1 to 3.
  e.roofs.forEach((r, i) => {
    if (r.radiant_barrier.state === "unknown" || r.radiant_barrier.value !== true) return;
    const g = r.radiant_barrier_grade;
    if (g === undefined) {
      issues.push({ path: `building.enclosure.roofs[${i}].radiant_barrier_grade`, message: "a roof with a radiant barrier needs radiant_barrier_grade (1 to 3)", kind: "invariant" });
    } else if (g.state !== "unknown" && ![1, 2, 3].includes(g.value as number)) {
      issues.push({ path: `building.enclosure.roofs[${i}].radiant_barrier_grade`, message: "radiant_barrier_grade must be 1, 2 or 3", kind: "invariant" });
    }
  });

  // References
  const checkSpace = (ref: string | undefined, path: string) => {
    if (ref !== undefined && !spaceIds.has(ref)) {
      issues.push({ path, message: `attached_to_space "${ref}" is not a space id`, kind: "invariant" });
    }
  };
  e.roofs.forEach((x, i) => checkSpace(x.attached_to_space, `building.enclosure.roofs[${i}].attached_to_space`));
  e.walls.forEach((x, i) => checkSpace(x.attached_to_space, `building.enclosure.walls[${i}].attached_to_space`));
  e.floors.forEach((x, i) => checkSpace(x.attached_to_space, `building.enclosure.floors[${i}].attached_to_space`));
  e.slabs.forEach((x, i) => checkSpace(x.attached_to_space, `building.enclosure.slabs[${i}].attached_to_space`));

  e.windows.forEach((w, i) => {
    if (!wallIds.has(w.attached_to_wall)) {
      issues.push({
        path: `building.enclosure.windows[${i}].attached_to_wall`,
        message: `attached_to_wall "${w.attached_to_wall}" is not a wall id`,
        kind: "invariant",
      });
    }
  });
  e.doors.forEach((d, i) => {
    if (!wallIds.has(d.attached_to_wall)) {
      issues.push({
        path: `building.enclosure.doors[${i}].attached_to_wall`,
        message: `attached_to_wall "${d.attached_to_wall}" is not a wall id`,
        kind: "invariant",
      });
    }
  });

  const checkSystemRefs = (
    sys: { distribution_system?: string | undefined; x_served_zone_ids?: string[] | undefined },
    path: string,
  ) => {
    if (sys.distribution_system !== undefined && !distributionIds.has(sys.distribution_system)) {
      issues.push({
        path: `${path}.distribution_system`,
        message: `distribution_system "${sys.distribution_system}" is not an hvac_distribution id`,
        kind: "invariant",
      });
    }
    for (const zid of sys.x_served_zone_ids ?? []) {
      if (!zoneIds.has(zid)) {
        issues.push({ path: `${path}.x_served_zone_ids`, message: `"${zid}" is not a zone id`, kind: "invariant" });
      }
    }
  };
  h.heating_systems.forEach((s, i) => checkSystemRefs(s, `building.systems.hvac.heating_systems[${i}]`));
  h.cooling_systems.forEach((s, i) => checkSystemRefs(s, `building.systems.hvac.cooling_systems[${i}]`));
  h.heat_pumps.forEach((s, i) => checkSystemRefs(s, `building.systems.hvac.heat_pumps[${i}]`));

  // Load-served fractions: each in [0,1]; totals per service type never exceed 1.
  let heatServed = 0;
  let coolServed = 0;
  const addFraction = (f: { value: number | null }, path: string, acc: "heat" | "cool") => {
    if (f.value === null) return;
    if (f.value < 0 || f.value > 1) {
      issues.push({ path, message: `fraction ${f.value} is outside [0, 1]`, kind: "invariant" });
    }
    if (acc === "heat") heatServed += f.value;
    else coolServed += f.value;
  };
  h.heating_systems.forEach((s, i) =>
    addFraction(s.fraction_heat_load_served, `building.systems.hvac.heating_systems[${i}].fraction_heat_load_served`, "heat"),
  );
  h.cooling_systems.forEach((s, i) =>
    addFraction(s.fraction_cool_load_served, `building.systems.hvac.cooling_systems[${i}].fraction_cool_load_served`, "cool"),
  );
  h.heat_pumps.forEach((s, i) => {
    addFraction(s.fraction_heat_load_served, `building.systems.hvac.heat_pumps[${i}].fraction_heat_load_served`, "heat");
    addFraction(s.fraction_cool_load_served, `building.systems.hvac.heat_pumps[${i}].fraction_cool_load_served`, "cool");
  });
  if (heatServed > 1 + EPSILON) {
    issues.push({ path: "building.systems.hvac", message: `heat load served sums to ${heatServed} (> 1)`, kind: "invariant" });
  }
  if (coolServed > 1 + EPSILON) {
    issues.push({ path: "building.systems.hvac", message: `cool load served sums to ${coolServed} (> 1)`, kind: "invariant" });
  }

  // Provenance invariants beyond the shape: a known field's source is never whitespace-only
  // (Zod trims, so this is belt-and-braces for hand-edited fixtures), and evidence ids are
  // never signed URLs (ADR-028).
  for (const { path, field } of walkFields(a)) {
    for (const ev of field.evidence) {
      if (/^https?:\/\//i.test(ev)) {
        issues.push({ path: `${path}.evidence`, message: "evidence must be a media id, not a URL", kind: "invariant" });
      }
    }
  }

  return issues;
}

/** Parse an unknown payload into an Assessment, then run the cross-reference invariants. */
export function validateAssessment(input: unknown): ValidationResult {
  const parsed = AssessmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: zodIssuesToValidation(parsed.error.issues) };
  }
  const invariantIssues = checkInvariants(parsed.data);
  if (invariantIssues.length > 0) {
    return { ok: false, issues: invariantIssues };
  }
  return { ok: true, assessment: parsed.data, issues: [] };
}
