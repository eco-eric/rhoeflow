import { TemplateSchema, type Template } from "../template.js";
import ranch from "./reference-templates/dfw-pre1980-ranch-slab.template.json" with { type: "json" };
import twoStory2001 from "./reference-templates/dfw-2001-2011-two-story-iecc2000.template.json" with { type: "json" };
import era2016 from "./reference-templates/dfw-2016-2020-iecc2015.template.json" with { type: "json" };

/**
 * The template values the committed calc fixtures were built with and run through the oracle
 * (QA-002). The live templates in `../data` follow the DFW era research and change as it does
 * (2026-11-07); the reference houses stay pinned to these frozen copies so their expected
 * results, which come from OpenStudio-HPXML runs, stay valid. Not offered to techs.
 */
const REFERENCE_TEMPLATES: readonly Template[] = [ranch, twoStory2001, era2016].map((t) => TemplateSchema.parse(t));

export function getReferenceTemplate(template_id: string): Template {
  const t = REFERENCE_TEMPLATES.find((x) => x.template_id === template_id);
  if (!t) throw new Error(`no frozen reference copy of template "${template_id}"`);
  return t;
}
