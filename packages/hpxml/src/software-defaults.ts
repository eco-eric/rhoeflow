/**
 * Read the values OpenStudio-HPXML filled in for itself (WO-02 Track C, item C4; ENG-003).
 * The oracle writes in.xml with every software-supplied element tagged dataSource='software'.
 * In reference mode RhoeFlow reads that file back and surfaces the values, so a reference run
 * is as inspectable as a RhoeFlow run: each one becomes a `defaulted` value whose source is
 * "openstudio-hpxml v1.12.0 default".
 *
 * `affectsDesignLoad` marks the elements that feed the Manual J block load in the cases the
 * engine supports (R01 findings §6.4). Everything else (schedules, appliances, utility rates,
 * annual-simulation inputs) is reported but flagged as not load-affecting.
 */
import { childElements, parseXml, textOf, type XmlElement } from "./xml.js";

export const ORACLE_DEFAULT_SOURCE = "openstudio-hpxml v1.12.0 default";

export interface SoftwareDefault {
  /** Element path with SystemIdentifier ids in brackets, e.g. Enclosure/Walls/Wall[wall-n]/Color. */
  path: string;
  element: string;
  value: string | undefined;
  affectsDesignLoad: boolean;
  /** Why it matters to the design load, when it does. */
  reason?: string;
  state: "defaulted";
  source: typeof ORACLE_DEFAULT_SOURCE;
}

/** Path suffix patterns that feed the block load, with the reason. Matched against the path with ids removed. */
const LOAD_AFFECTING: ReadonlyArray<readonly [RegExp, string]> = [
  [/HVACSizingControl\/ManualJInputs\//, "Manual J design input"],
  [/HVACSizingControl\/(HeatPumpSizingMethodology|AllowIncreasedFixedCapacities)$/, "sizing policy (ADR-005)"],
  [/AirInfiltrationMeasurement\/(InfiltrationVolume|InfiltrationHeight)$/, "infiltration geometry"],
  [/BuildingSummary\/Site\/(SiteType|ShieldingofHome)$/, "infiltration shielding class"],
  // Manual J ground conductivity comes from SoilType + MoistureType (hvac_sizing.rb 234 to 253);
  // Soil/Conductivity and Diffusivity feed only the annual Kiva ground model.
  [/BuildingSummary\/Site\/Soil\/(SoilType|MoistureType)$/, "slab ground conductivity"],
  [/Roof\/RoofColor$/, "attic cooling design temperature"],
  [/Wall\/Color$/, "wall CLTD color class"],
  [/InteriorShading\/(Type|SummerFractionCovered)$/, "window interior shading coefficient"],
  [/Ducts\/(DuctSurfaceArea|DuctEffectiveRValue|DuctFractionRectangular|DuctBuriedInsulationLevel|DuctSurfaceAreaMultiplier)$/, "duct conduction"],
  [/AirDistribution\/NumberofReturnRegisters$/, "return duct surface area"],
  [/HVACDistribution\/ConditionedFloorAreaServed$/, "duct surface area"],
  [/Slab\/Thickness$/, "slab F-value"],
  [/BlowerFanHeatBtuh$/, "blower heat"],
  // Not listed on purpose: HeatingDesignAirflowCFM / CoolingDesignAirflowCFM are autosizing
  // outputs, and Slab/DepthBelowGrade only matters for basement floors (unsupported in 0.1.0).
];

export function readSoftwareDefaults(inXml: string): SoftwareDefault[] {
  const root = parseXml(inXml);
  const out: SoftwareDefault[] = [];
  const walk = (e: XmlElement, path: string[], plain: string[]) => {
    const id = childElements(e, "SystemIdentifier")[0]?.attrs["id"];
    const seg = id ? `${e.name}[${id}]` : e.name;
    const p = [...path, seg];
    const q = [...plain, e.name];
    if (e.attrs["dataSource"] === "software") {
      const plainPath = q.join("/");
      const hit = LOAD_AFFECTING.find(([re]) => re.test(plainPath));
      out.push({
        path: p.slice(1).join("/"),
        element: e.name,
        value: textOf(e),
        affectsDesignLoad: hit !== undefined,
        ...(hit ? { reason: hit[1] } : {}),
        state: "defaulted",
        source: ORACLE_DEFAULT_SOURCE,
      });
    }
    for (const c of childElements(e)) walk(c, p, q);
  };
  walk(root, [], []);
  return out;
}
