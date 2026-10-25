import { CompareRunsRequestSchema, compareRuns } from "@rhoeflow/store";
import { requireContext } from "../../../../lib/context";
import { handler, json, parseBody } from "../../../../lib/http";

/** POST /api/runs/compare: baseline versus scenario from their frozen bundles (C5; SCN-001, SCN-002). */
export const POST = handler(async (req: Request) => {
  const { ctx, deps } = await requireContext();
  const body = await parseBody(req, CompareRunsRequestSchema);
  return json(await compareRuns(deps, ctx, body.baseline_run_id, body.scenario_run_id));
});
