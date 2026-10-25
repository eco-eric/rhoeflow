#!/usr/bin/env node
/**
 * Manual smoke test against the real Supabase project (WO-01 definition of done:
 * "jobstore-local can upload a file and return an id"). Run after `pnpm build` with:
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... [RHOE_MEDIA_BUCKET=rhoe-media] pnpm --filter @rhoeflow/jobstore-local smoke:upload
 *
 * Uploads a 1x1 PNG labeled as a smoke test under team/project/assessment ids that are
 * obviously fake, prints the returned local: id, and exits 0. Not part of CI (needs secrets).
 */
import { createSupabaseLocalJobStore } from "../dist/index.js";

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const bucket = process.env.RHOE_MEDIA_BUCKET ?? "rhoe-media";
if (!url || !anon) {
  console.error("smoke-upload: set SUPABASE_URL and SUPABASE_ANON_KEY (never commit them)");
  process.exit(2);
}

const onePixelPng = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="),
  (c) => c.charCodeAt(0),
);

const store = createSupabaseLocalJobStore({ url, anon_key: anon, bucket });
const result = await store.uploadMedia(
  { team_id: "smoke-team" },
  {
    project_id: "smoke-project",
    kind: "photo",
    category: "smoke-test",
    caption: "WO-01 smoke upload; safe to delete",
    assessment_id: "00000000-0000-4000-8000-000000000000",
    file_name: `smoke-${Date.now()}.png`,
    content_type: "image/png",
    content: onePixelPng,
    captured_at: new Date().toISOString(),
    metadata: { smoke: true },
  },
);
console.log(JSON.stringify({ bucket, ...result }, null, 2));
