/**
 * Sensitivity cases (WO-03 E4; QA-005, QA-004). Each case changes ONE input of a base house; the
 * expected direction and size of the change is derived from the method, written beside it, and
 * asserted in packages/calc/test/sensitivity.test.ts. Every case is also a calc fixture, so the
 * CI oracle job checks the engine against OpenStudio-HPXML on it like any other house.
 *
 * Base: the quick-pass ranch (qp-ranch-1964-slab answers) with a measured blower-door ACH50 and
 * attic ducts. Pinning ACH50 keeps infiltration out of cases that would otherwise move the ResDB
 * regression (duct location, foundation), so each case isolates one effect.
 *
 * Orientation needs unequal glass by side (the quick pass splits glass equally, so rotating it
 * changes nothing by construction); that case rotates the R01 ranch, which has 50 / 30 / 60 / 30
 * ft2 on N / E / S / W.
 *
 * ILLUSTRATIVE FIXTURES, not real properties (GOV-002).
 */
import type { QuickPassAnswersInput } from "../quick-pass.js";
import { QUICK_PASS_HOUSES } from "./quick-pass-houses.js";

const S = "sensitivity case (WO-03 E4, QA-005)";

/** The base answers: qp-ranch-1964-slab with a measured ACH50 of 10. */
export const SENSITIVITY_BASE_ANSWERS: QuickPassAnswersInput = {
  ...QUICK_PASS_HOUSES[0]!.answers,
  tightness: { value: { ach50: 10 }, state: "measured", source: `${S}: blower door pinned at 10 ACH50 so no case moves the ResDB regression` },
  duct_location: { value: "attic", state: "assumed" },
};

export interface SensitivityCase {
  name: string;
  description: string;
  /** What changes and what must happen, with the reason. Mirrored in claude/06-architecture/sensitivity-cases.md. */
  expectation: string;
  /** "qp": SENSITIVITY_BASE_ANSWERS with `answers` merged; "r01-ranch": the committed R01 ranch, rotated. */
  base: "qp" | "r01-ranch";
  answers?: Partial<QuickPassAnswersInput>;
  /** Degrees to add to every azimuth (r01-ranch only). */
  rotate_degrees?: number;
  /** Override of a ManualJ design input on the built Assessment. */
  design?: { field: "heating_design_temperature" | "cooling_design_temperature"; delta_f: number };
}

export const SENSITIVITY_CASES: readonly SensitivityCase[] = [
  {
    name: "sens-base",
    description: "Sensitivity base: qp-ranch-1964-slab with a measured 10 ACH50 and attic ducts (WO-03 E4). Not a real property.",
    expectation: "Reference for the cases below.",
    base: "qp",
  },
  {
    name: "sens-glazing-lots",
    description: "Sensitivity: window amount typical (0.15 of floor area) to lots (0.22) (WO-03 E4). Not a real property.",
    expectation:
      "Window area scales by 0.22 / 0.15 = 1.467 on every side. Window heating (U x A x HTD) and window cooling (solar plus conduction, both per ft2) scale by exactly that factor. Each wall loses the added glass area, so each wall component falls by the same U x dA x TD. Doors, ceiling, slab, infiltration and internal gains do not change. Ducts carry a share of the load they deliver, so duct heating and cooling sensible rise. Totals: heating and cooling sensible both rise.",
    base: "qp",
    answers: { window_amount: { value: "lots", state: "assumed" } },
  },
  {
    name: "sens-leakage-up",
    description: "Sensitivity: blower door 10 to 15 ACH50 (WO-03 E4). Not a real property.",
    expectation:
      "MJ8.infiltration.blower_door is linear in ACH50 (ACH50 to SLA to ELA, CFM = ELA x sqrt(stack + wind)), so the infiltration heating, cooling sensible and cooling latent components each scale by exactly 1.5. Envelope, slab and internal gains do not change; the duct component rises with the load it carries. All three totals rise.",
    base: "qp",
    answers: { tightness: { value: { ach50: 15 }, state: "measured", source: `${S}: blower door 15 ACH50` } },
  },
  {
    name: "sens-ducts-conditioned",
    description: "Sensitivity: ducts in the vented attic to ducts inside conditioned space (WO-03 E4). Not a real property.",
    expectation:
      "Ducts inside conditioned space lose and leak to the space itself: the quick pass sets leakage to outside to 0 (no duct-blaster number given), so the duct component is 0 for heating, cooling sensible and cooling latent. ACH50 is pinned, so infiltration does not move; no other component changes. Each total falls by exactly the base duct component.",
    base: "qp",
    answers: { duct_location: { value: "conditioned", state: "assumed" } },
  },
  {
    name: "sens-heating-design-colder",
    description: "Sensitivity: heating design temperature 5 F colder than the ASHRAE 99 % value (WO-03 E4). Not a real property.",
    expectation:
      "Every conduction heating term (walls, windows, doors, ceiling, slab) is U x A x HTD (or F x P x HTD), so each scales by exactly HTD' / HTD = (70 - 20.88) / (70 - 25.88) = 1.1133. Infiltration rises by more than that ratio (its CFM also grows with the stack term), and ducts rise with the load they carry. Cooling does not change at all.",
    base: "qp",
    design: { field: "heating_design_temperature", delta_f: -5 },
  },
  {
    name: "sens-cooling-design-hotter",
    description: "Sensitivity: cooling design temperature 5 F hotter than the ASHRAE 1 % value (WO-03 E4). Not a real property.",
    expectation:
      "Wall, window, door and ceiling conduction cooling each rise by U x A x 5, the same Btu/h their heating rises by in the heating case above (the CLTD and CTD terms move one for one with the outdoor temperature). Window solar, slab and internal gains do not change. Infiltration sensible and latent rise (more CFM from the larger stack term at the station's own design moisture). Heating does not change at all.",
    base: "qp",
    design: { field: "cooling_design_temperature", delta_f: 5 },
  },
  {
    name: "sens-orientation-r01-rot90",
    description: "Sensitivity: the R01 ranch rotated 90 degrees clockwise, moving its 60 ft2 of south glass to the west (WO-03 E4). Not a real property.",
    expectation:
      "Orientation does not enter any heating term, so heating does not change at all. Walls do not change either (their CLTD here does not depend on orientation). The windows trade places: the 60 ft2 group moves from south to west and the 50 ft2 group from north to east, both of which raise their solar gain, so window cooling and cooling sensible rise. Latent changes only through the duct component.",
    base: "r01-ranch",
    rotate_degrees: 90,
  },
];
