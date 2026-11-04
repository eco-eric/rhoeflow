import { z } from "zod";
import { JobIdParamSchema, getJob, getJobSite, lookupHouse } from "@rhoeflow/store";
import { requireContext } from "../../../../../lib/context";
import { devMemoryEnabled } from "../../../../../lib/dev";
import { fixtureHouseSources, houseSources, houseView } from "../../../../../lib/house";
import { handler, json, parseBody, type Params } from "../../../../../lib/http";

const LookRequestSchema = z.strictObject({ force: z.boolean().default(false) });

/** GET /api/jobs/:id/house: the job's house lookup, merged, and the city's permit search (ADR-043). */
export const GET = handler(async (_req: Request, { params }: Params<"id">) => {
  const { ctx, deps } = await requireContext();
  const id = JobIdParamSchema.parse((await params).id);
  const job = await getJob(deps, ctx, id);
  return json(houseView(await getJobSite(deps, ctx, id), job.city));
});

/**
 * POST /api/jobs/:id/house {force?}: looks the house up (RentCast, then the county record where
 * RhoeFlow has the county). Runs once per job; `force` looks again after the address is fixed.
 * Keys stay on the server; with none set the lookup is off and the job works as before.
 */
export const POST = handler(async (req: Request, { params }: Params<"id">) => {
  const { ctx, deps } = await requireContext();
  const id = JobIdParamSchema.parse((await params).id);
  const body = await parseBody(req, LookRequestSchema);
  const rentcastKey = process.env["RENTCAST_API_KEY"];
  const orsKey = process.env["ORS_API_KEY"];
  const sources = !rentcastKey && !orsKey && devMemoryEnabled() ? fixtureHouseSources() : houseSources({ rentcastKey, orsKey });
  const site = await lookupHouse(deps, ctx, id, sources, { force: body.force });
  const job = await getJob(deps, ctx, id);
  return json(houseView(site, job.city));
});
