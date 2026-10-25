/**
 * MJ8.slab.perimeter: slab-on-grade heating loss as F-value (Btu/h per ft of exposed
 * perimeter per °F) × HTD × exposed perimeter. No cooling load.
 *
 * The F-value model is the reference engine's: an effective U summed over concentric soil
 * paths of radius 0 to R for six path radii (8 to 13 ft) and averaged, with concrete,
 * gravel, insulation, air films and soil in series (OpenStudio-HPXML v1.12.0
 * `hvac_sizing.rb` 4914 to 4960; "calibrated to Table 4A values by Tony Fontanini").
 * Constants in coefficients.ts.
 *
 * Supported in 0.1.0: slabs at or near grade. Not supported: basement floors ≥ 2 ft below
 * grade (different U-factor model), exterior horizontal insulation.
 */
import { SLAB } from "./coefficients.js";
import type { DesignConditions } from "./design-conditions.js";
import { EngineInputError } from "./errors.js";

export const MJ8_SLAB_PERIMETER = { id: "MJ8.slab.perimeter", version: "0.1.0" } as const;
const M = MJ8_SLAB_PERIMETER.id;

export interface SlabInput {
  thicknessIn: number;
  exposedPerimeterFt: number;
  perimeterInsulationR: number;
  perimeterInsulationDepthFt: number;
  underSlabInsulationR: number;
  /** Width of under-slab insulation from the edge; ignored when it spans the whole slab. */
  underSlabInsulationWidthFt: number;
  underSlabInsulationSpansEntireSlab: boolean;
  radiantFloor?: boolean;
}

/** F-value, Btu/h-ft-°F. */
export function slabFValue(slab: SlabInput, groundConductivity: number): number {
  if (!(slab.thicknessIn > 0)) throw new EngineInputError("out_of_range", "slab thickness must be positive", { method: M, path: "thicknessIn" });
  if (!(groundConductivity > 0)) throw new EngineInputError("out_of_range", "ground conductivity must be positive", { method: M });
  const rConcrete = slab.thicknessIn / SLAB.concreteKInPerInch;
  const rGravel = Math.max(SLAB.gravelRPerInch * (12 - slab.thicknessIn), 0);
  const fValues: number[] = [];
  for (const pathRadius of SLAB.pathRadiiFt) {
    let uSum = 0;
    for (let radius = 0; radius <= pathRadius; radius++) {
      const spl = Math.max(Math.PI * radius - 1, 0);
      let rIns = 0;
      let rConc = 0;
      let rGrav = 0;
      if (radius === 0) {
        if (slab.perimeterInsulationDepthFt > 0) rIns = slab.perimeterInsulationR;
      } else {
        rConc = rConcrete;
        rGrav = rGravel;
        if (slab.underSlabInsulationSpansEntireSlab || radius <= slab.underSlabInsulationWidthFt) rIns += slab.underSlabInsulationR;
        if (radius <= slab.perimeterInsulationDepthFt) rIns += slab.perimeterInsulationR;
      }
      const rSoil = spl / groundConductivity;
      uSum += 1 / (rConc + rGrav + rIns + SLAB.airFilmsR + rSoil);
    }
    fValues.push(uSum);
  }
  return fValues.reduce((s, f) => s + f, 0) / fValues.length;
}

export interface SlabLoad {
  fValue: number;
  heatingHtmPerFt: number;
  heatingLoad: number;
  coolingSensibleLoad: 0;
  lengthFt: number;
}

export function slabPerimeterLoad(slab: SlabInput, dc: DesignConditions): SlabLoad {
  const fValue = slabFValue(slab, dc.groundConductivity);
  const htd = dc.htd + (slab.radiantFloor ? SLAB.radiantFloorHtdOffset : 0);
  const heatingHtmPerFt = fValue * htd;
  return { fValue, heatingHtmPerFt, heatingLoad: heatingHtmPerFt * slab.exposedPerimeterFt, coolingSensibleLoad: 0, lengthFt: slab.exposedPerimeterFt };
}
