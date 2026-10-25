# WorkEdge integration standard

Adopted Oct 24, 2026. Governs how RhoeFlow ("the design app") and WorkEdge share a job. This is the contract; implementation details on the WorkEdge side are deliberately left generic because WorkEdge has moved to native builds and its current schema will be confirmed from the repo, not from this document.

## 1. The split in one sentence

WorkEdge is the system of record for the job and everything captured on site. The design app owns the assessment walkthrough, the engineering, and the design artifacts. Trade OS reads both through WorkEdge.

| Owned by WorkEdge | Owned by the design app | Never duplicated |
| --- | --- | --- |
| Project (job), Property, Customer | Assessment (HPXML building model, per ADR-023) | Address, client, year built, sq ft, property type |
| Photos, videos, voice notes, transcripts, at rest | Per-field evidence links (photo id → input) | Media files and their storage |
| Equipment registry | Calculation runs, frozen artifact bundles | Existing equipment model/serial |
| Reports and share collections | Duct layouts, register schedules, equipment selection logic | Team, users, login |
| Team, auth, billing | Customer portal deep dive (ADR-025) | Report PDF (one copy, in WorkEdge) |

Rule: the design app has no table for a job, a customer, a property, a photo file, or a user. It stores foreign ids and reads.

## 2. Identifiers both apps agree on

Every Assessment record carries, from creation:

- `workedge_team_id` (tenant)
- `workedge_project_id` (the job)
- `workedge_property_id` (the address; required, create one if missing)
- `workedge_customer_id` (optional)

Every evidence reference in an Assessment is a `workedge_photo_id` or `workedge_video_id`, never a file path or signed URL. Signed URLs are resolved at read time and never persisted (they expire).

Every write-back from the design app tags the WorkEdge record with `source: "rhoeflow"` and the `assessment_id` + `run_id` so WorkEdge and Trade OS can trace any report, equipment entry, or material line back to a frozen run.

## 3. Entry points

**A. From WorkEdge (primary).** On any project, an "Assessment" action deep-links to the design app with `workedge_project_id`. Native app opens if installed; otherwise the web app at the same route. The design app creates the Assessment if none exists for that project, or resumes the open one.

**B. From the design app.** Starting an assessment with no WorkEdge project prompts for address/client, then creates the WorkEdge Project and Property first and links them. There is no "assessment without a WorkEdge job."

**C. From Trade OS (later).** The estimate agent or a scheduled visit creates the WorkEdge project and triggers entry A.

## 4. Field flow

1. Tech is in WorkEdge at the house, documenting as usual.
2. Tech taps Assessment. Design app opens on the job with property facts, existing equipment, and all photos shot so far.
3. Design app runs its photo engine (ADR-021) over the existing photos and pre-fills inputs as *proposed* with evidence ids and confidence. Nothing is committed without review.
4. Guided checklist (ADR-027) shows what is still missing or unconfirmed. For those items the tech captures inside the design app: tape-in-frame insulation, each window's orientation/glazing, RoomPlan scan or manual sketch (ADR-022), nameplate if not yet shot.
5. Every photo or video captured in the design app is uploaded to the same WorkEdge project with category, caption, and `assessment_id`. The returned `workedge_photo_id` becomes the evidence id. The design app keeps only a local cache (ADR-017) until the upload confirms.
6. Design app runs the calc, tech reviews, run is frozen.
7. Write-backs (section 6) land on the WorkEdge project. Office and Trade OS see them there.

The tech is never asked to shoot the same thing twice, and WorkEdge always holds the complete media set.

## 5. Capture categories WorkEdge should offer

A trade category template named "Load calc / System design", so photos shot in WorkEdge before the assessment starts arrive pre-labeled and pre-fill better:

Exterior / orientation · Windows · Attic / insulation · Existing equipment nameplate · Ductwork · Returns and supplies · Electrical panel · Crawlspace / foundation · Thermostat / controls

This is a template, not a feature, and stays inside WorkEdge's documentation-only rule.

## 6. Reads and writes the design app needs

Reads (available today via REST for project/property; media and equipment via the MCP server when it ships):

- get project, get property, get customer
- list photos (with category, caption, EXIF, GPS, signed URL) and list videos with transcripts
- list notes / voice notes with transcripts
- list equipment for project and property

Writes (the design app must be able to do all of these at launch):

- **upload photo / video to a project** with category, caption, and metadata, returning the new media id. *This is the one call not on the current WorkEdge roadmap and is the blocking dependency.*
- save report PDF to the project (type: engineering / Manual J-S-D)
- add note with the design summary and a link to the frozen run
- create or update an equipment registry entry for the selected system
- optionally, write the duct material takeoff to the project material list

All calls are authenticated with the team's WorkEdge API key now and per-user OAuth when WorkEdge offers it. Rate limits and pagination are respected (never assume a full page).

## 7. Identity

One Supabase Auth tenant shared with WorkEdge for TruFicient; the design app reads `team_id` from the session. Trade OS as the identity issuer is a later change and does not alter this contract.

## 8. What the design app does not do

- No direct Supabase or Postgres access to WorkEdge's database, no shared service-role key, no FDW. API and MCP only.
- No second camera roll, second storage bucket, or second report-sharing system for anything that is job documentation.
- No Manual J/S/D logic, duct math, or design canvas pushed into WorkEdge.

## 9. Platform

Both apps are native on the phone (Capacitor shells). RoomPlan, reliable camera/EXIF, and offline caching all require it. Desktop web remains the primary design and review surface for the design app (ADR-013); the phone is the capture surface.

## 10. Adapter rule

All WorkEdge calls live behind one `JobStore` interface in the design app (`packages/jobstore-workedge`). If the upload endpoint is not available when phase 3 capture work starts, a temporary `jobstore-local` implementation stores media in the design app's own bucket and migrates ids once the endpoint ships. The interface, not the WorkEdge schema, is what the rest of the app depends on.

## 11. Open items

- Upload endpoint: ticket to be opened on WorkEdge's MCP/API epic.
- Confirm current WorkEdge table and field names from the repo once the native build is merged; update section 6 call names to match.
- Decide whether the assessment capture module ever moves into WorkEdge as a guided mode. Revisit after the first 20–30 real assessments (ADR-021 measurement).
- Whether the Trade OS walkthrough-to-estimate voice flow and the design app's dictation share a pipeline. Default: separate until both exist.
