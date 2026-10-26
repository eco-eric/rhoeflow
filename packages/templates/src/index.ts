import { TemplateSchema, type Template } from "./template.js";
import pre1980 from "./data/dfw-pre1980-ranch-slab.template.json" with { type: "json" };
import era1980 from "./data/dfw-1980-2000-two-story.template.json" with { type: "json" };
import era2001 from "./data/dfw-2001-2011-one-story-iecc2000.template.json" with { type: "json" };
import era2001two from "./data/dfw-2001-2011-two-story-iecc2000.template.json" with { type: "json" };
import era2012 from "./data/dfw-2012-2016-two-story-irc2009.template.json" with { type: "json" };
import era2016 from "./data/dfw-2016-2020-iecc2015.template.json" with { type: "json" };
import era2021 from "./data/dfw-2021-iecc2021.template.json" with { type: "json" };

export * from "./template.js";
export * from "./apply.js";
export * from "./diff.js";
import { suggestFrom } from "./diff.js";
export { ranchBaseAssessment } from "./fixtures/ranch-1960s-dfw.js";
export { twoStoryBaseAssessment } from "./fixtures/two-story-2010-dfw.js";
export { DFW_WEATHER_REF } from "./fixtures/common.js";

/**
 * The templates (ADR-024): six from WO-01 plus the 2001 to 2011 two-story added in WO-02 A3.
 * Validated on load so a bad edit fails at import time. Ordered by era, then stories.
 */
export const TEMPLATES: readonly Template[] = [pre1980, era1980, era2001, era2001two, era2012, era2016, era2021].map((t) =>
  TemplateSchema.parse(t),
);

export function getTemplate(template_id: string): Template {
  const t = TEMPLATES.find((x) => x.template_id === template_id);
  if (!t) throw new Error(`unknown template "${template_id}"`);
  return t;
}

/**
 * Suggest templates for a year built and story count. Returns candidates, best style match
 * first; a person picks (ADR-003). Never auto-applies.
 */
export function suggestTemplates(year_built: number, stories?: number): Template[] {
  return suggestFrom(TEMPLATES, year_built, stories);
}
export { crawlRanchBaseAssessment, ductlessRanchBaseAssessment, garageOneStoryBaseAssessment, twoSystemTwoStoryBaseAssessment } from "./fixtures/wo03-houses.js";
export { sanityBandCheck } from "./checks.js";
export * from "./quick-pass.js";
export { SENSITIVITY_BASE_ANSWERS, SENSITIVITY_CASES, type SensitivityCase } from "./fixtures/sensitivity.js";
export { QUICK_PASS_HOUSES, QUICK_PASS_FIXTURE_TIMESTAMP, type QuickPassHouse } from "./fixtures/quick-pass-houses.js";
