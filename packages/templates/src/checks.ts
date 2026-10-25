import { TEMPLATE_VERSION, type Template } from "./template.js";

/**
 * The calc-input `checks.sanity_band` for a template (WO-03 A4), or undefined when the template
 * has no band on file. The run records the band so its warning is reproducible from the frozen
 * input alone. `version` is the stored template version (WO-03 C7, `v<n>`) when the template came
 * from the store; it defaults to the repo format version for the fixed repo set.
 */
export function sanityBandCheck(template: Template, version: string = TEMPLATE_VERSION) {
  const b = template.sanity_band;
  if (!b) return undefined;
  const cites = template.sources.filter((s) => b.sources.includes(s.id)).map((s) => s.citation);
  return {
    template_id: template.template_id,
    template_version: version,
    low_ft2_per_ton: b.ft2_per_ton.low,
    high_ft2_per_ton: b.ft2_per_ton.high,
    source: `template:${template.template_id} sanity band (${cites.join("; ")})`,
  };
}
