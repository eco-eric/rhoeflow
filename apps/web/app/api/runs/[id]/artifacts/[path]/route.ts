import { RunIdParamSchema, readRunArtifact } from "@rhoeflow/store";
import { requireContext } from "../../../../../../lib/context";
import { handler, type Params } from "../../../../../../lib/http";

/** GET /api/runs/:id/artifacts/:path: one bundle file, only by a name the run recorded (ENG-008, SEC-002). */
export const GET = handler(async (_req: Request, { params }: Params<"id" | "path">) => {
  const { ctx, deps } = await requireContext();
  const p = await params;
  const run_id = RunIdParamSchema.parse(p.id);
  const file = await readRunArtifact(deps, ctx, run_id, decodeURIComponent(p.path));
  return new Response(file.bytes.slice(), {
    status: 200,
    headers: { "content-type": file.content_type, "cache-control": "private, max-age=31536000, immutable", etag: `"${file.sha256}"`, "x-content-sha256": file.sha256 },
  });
});
