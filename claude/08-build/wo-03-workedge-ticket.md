# Jira ticket for WorkEdge (draft, 2026-10-25)

For: Jose Carlo. Site: workedgepro.atlassian.net, project KAN (Workedge Pro Team).
Type: Task, child of epic KAN-124 (WorkEdge MCP Server). Not yet created in Jira.

**Summary:** RhoeFlow integration: media upload, PDF report save, write-back tags and public sign-in keys

---

## Why

RhoeFlow is TruFicient's load-calculation and duct-design app. It works on WorkEdge projects, and
WorkEdge stays the system of record for jobs, properties and media. RhoeFlow stores only WorkEdge
ids and never keeps its own copy of a job, a customer or a photo.

KAN-124 Phase 1 already plans the reads RhoeFlow needs. This ticket adds the writes RhoeFlow needs,
which KAN-124 does not list yet, plus one auth setting. Item 1 is the blocking one: without it, a
tech has to take photos twice.

## What RhoeFlow needs

### 1. Upload a photo or video to a project (blocking)

- An `upload_media` MCP tool, and the same operation over the REST API, scoped to the API key's team.
- Inputs: `project_id`, kind (photo or video), category, caption, capture time, and metadata
  `{ source: "rhoeflow", assessment_id, field_key }`. Keep the original EXIF.
- For large files, a two-step flow is fine: request an upload URL, PUT the file, confirm. That
  matches the presigned pattern in KAN-106.
- Returns the new photo or video id, the same id `list_photos` and `list_videos` return.
- Accepts an idempotency key, so a retried upload returns the first id instead of making a copy.
- Documented size limits, and errors as JSON with a code.

### 2. `save_report` accepts a PDF

KAN-124 open question 2 asks whether `save_report` takes a PDF or Markdown. RhoeFlow needs PDF.
The report type is engineering (Manual J/S/D). Store the metadata
`{ source: "rhoeflow", assessment_id, run_id }` and return the report id.

### 3. `add_note` stores the same metadata

`source`, `assessment_id` and `run_id` are stored with the note and returned when it is read.

### 4. Create or update an equipment entry

Create or update an equipment registry entry on a project or property, with the same metadata.
RhoeFlow writes the selected system here. This is not in KAN-124 yet.

### 5. Reads RhoeFlow will call (already in Phase 1), with three checks

- `get_project` returns `property_id` and the property's address. `projects.property_id` is
  optional today, so RhoeFlow also needs a way to create or link a property when a project has none.
- `list_photos` returns category and caption and supports cursor paging.
- Optional: properties have no year built, conditioned floor area, stories or property type. If
  WorkEdge adds them, RhoeFlow cites them. If not, the tech enters them in RhoeFlow.

### 6. Public sign-in keys (needed before RhoeFlow can use WorkEdge logins)

RhoeFlow will use WorkEdge's Supabase sign-in, so a tech has one login. To check a WorkEdge session
without holding any WorkEdge secret, RhoeFlow needs WorkEdge's public signing key.

- Today the project's JWKS endpoint returns no keys
  (`https://vesncoasnajcdinipgkv.supabase.co/auth/v1/.well-known/jwks.json`), so sessions are signed
  with the legacy shared secret.
- Please switch the project to asymmetric JWT signing keys: Supabase dashboard, Project Settings,
  JWT Keys. Supabase keeps tokens signed with the old secret valid during the switch.
- RhoeFlow will never ask for the JWT secret or a service-role key.

### 7. A test API key

Create a WorkEdge API key on the TruFicient team for RhoeFlow testing, and give it to Eric
directly, not in this ticket. Also confirm which header RhoeFlow should send: `api-projects` reads
`x-api-key`, while KAN-124 says `Authorization: Bearer`.

## Acceptance criteria

- [ ] A script using a test key uploads a photo and gets an id back; `list_photos` returns that id
      with its category, caption and metadata.
- [ ] Repeating the upload with the same idempotency key returns the same id and no duplicate.
- [ ] A key for team A cannot upload to, or save a report on, a team B project.
- [ ] A PDF saved through `save_report` opens from `list_reports`.
- [ ] Notes, reports and equipment entries written by RhoeFlow return `source`, `assessment_id`
      and `run_id` on read.
- [ ] The JWKS endpoint above returns at least one public key.
- [ ] `docs/API/MCP.md` documents the new tools.

## Priority

Item 6 and the Phase 1 reads come first, because RhoeFlow's sign-in and project reads depend on
them. Item 1 is next. Until it lands, RhoeFlow holds photos in its own storage and moves them to
WorkEdge afterwards. Items 2 to 4 are needed before RhoeFlow saves its first report to a real job,
which is planned within its next work order, about 7 to 9 weeks.
