import { LocalJobStore, SupabaseMediaStorage } from "@rhoeflow/jobstore-local";
import { AssessmentIdParamSchema, StoreError, assertUpload, getAssessment } from "@rhoeflow/store";
import { requireContext } from "../../../lib/context";
import { serverEnv } from "../../../lib/env";
import { handler, json } from "../../../lib/http";

/**
 * POST /api/media (multipart): photo or video evidence for an assessment, through the interim
 * jobstore-local store until WorkEdge accepts uploads (ADR-031; owner decision 6). Limits and
 * path rules per C6 (SEC-002). The returned `media_id` (`local:` prefixed) is the evidence id the
 * Assessment stores; no URL is ever returned or persisted (ADR-028).
 *
 * Fields: assessment_id, kind (photo|video), category, caption?, captured_at?, file.
 */
export const POST = handler(async (req: Request) => {
  const { ctx, deps, client } = await requireContext();
  const form = await req.formData().catch(() => {
    throw new StoreError("invalid_request", "expected multipart/form-data");
  });
  const assessment_id = AssessmentIdParamSchema.parse(form.get("assessment_id"));
  const kind = form.get("kind");
  if (kind !== "photo" && kind !== "video") throw new StoreError("invalid_request", "kind must be photo or video");
  const category = String(form.get("category") ?? "");
  if (!category) throw new StoreError("invalid_request", "category is required (standard §5)");
  const file = form.get("file");
  if (!(file instanceof File)) throw new StoreError("invalid_request", "file is required");
  assertUpload({ kind, content_type: file.type, byte_length: file.size, file_name: file.name });

  const assessment = await getAssessment(deps, ctx, assessment_id);
  const store = new LocalJobStore({ storage: new SupabaseMediaStorage(client.storage, serverEnv().mediaBucket) });
  const result = await store.uploadMedia(
    { team_id: ctx.team_id, ...(ctx.user_id ? { user_id: ctx.user_id } : {}) },
    {
      project_id: assessment.workedge_project_id,
      kind,
      category,
      caption: typeof form.get("caption") === "string" ? (form.get("caption") as string) : null,
      assessment_id,
      file_name: file.name,
      content_type: file.type,
      content: new Uint8Array(await file.arrayBuffer()),
      captured_at: typeof form.get("captured_at") === "string" ? (form.get("captured_at") as string) : null,
      metadata: null,
    },
  );
  return json(result, 201);
});
