# WorkEdge connections per account (ADR-038, decided 2026-11-01)

Status: **Decided** by the owner, 2026-11-01 (pull request 8 merged on his word).

## Why this exists

Until now RhoeFlow assumed one WorkEdge team. WO-03 owner decision 1 put one WorkEdge API key in
the server's environment, and integration standard §7 speaks of one Auth tenant "for TruFicient".
On 2026-11-01 the owner asked for the WorkEdge hookup to work like a paid app instead: each account
connects its own WorkEdge inside RhoeFlow, Trade OS users reach RhoeFlow through Trade OS without
paying for it and still need their own connection, and RhoeFlow is not for sale now but should be
built so it could be later.

One server key cannot do that. It ties RhoeFlow to one WorkEdge team, and the day a second
company signs in it would read and write TruFicient's jobs.

## What WorkEdge offers today (read from `eco-eric/field-doc-suite`, branch `dev`, 2026-11-01)

- The WorkEdge MCP server (KAN-124, marked done 2026-10-29) at
  `https://<project-ref>.supabase.co/functions/v1/mcp`, stateless JSON-RPC over HTTP POST.
- Auth: a WorkEdge **team API key** (`sk_...`), made in WorkEdge under Settings, Integrations,
  API Keys. The key sees only the team that was selected when it was made. Sent as
  `Authorization: Bearer <key>` or `x-api-key: <key>`. Unknown or deactivated keys get 401.
- Writes made with a key are attributed to the WorkEdge user who created it.
- 100 requests an hour per key by default; over that, 429.
- Reads RhoeFlow needs: `get_project` (with the property and contacts), `list_photos`,
  `list_videos`, `list_equipment`, all scoped to the key's team, with opaque `next_cursor` paging
  and signed links that expire after an hour.
- Beside the MCP server, on the same project and with the same key (in `x-api-key`), WorkEdge's
  REST functions `api-projects`, `api-properties` and `api-customers`. `GET api-properties/{id}`
  reads one property, so RhoeFlow needs no new `get_property` tool.
- Writes that work today: `add_note`, `add_photo_caption`, `create_project`, and `save_report`,
  which takes Markdown and has WorkEdge render its own PDF into the project's reports.
- Which team a key belongs to: WorkEdge's key record stores it (`api_keys.team_id`) and scopes
  every read to it, but no reply returns it; `api-properties` and `api-customers` strip
  `team_id`. RhoeFlow therefore cannot check it, and shows the job names the key sees instead.
- Not there yet: per-user sign-in (WorkEdge's "Phase 3" OAuth; nothing in the code), photo
  upload (only the subcontractor portal's link-based upload, not a key), attaching RhoeFlow's own
  PDF, write-back tags, equipment writes, photo categories. See "What WorkEdge needs to add".

## Decision

1. *(Amended by ADR-039, proposed 2026-11-01: an account is RhoeFlow's own record, `rhoe.accounts`, keyed `account_id`; its connection is to one WorkEdge team.)* **An account is a WorkEdge team.** RhoeFlow's account is the `workedge_team_id` in the
   signed-in session, as today (ADR-028, ADR-031, `rhoe.current_team_id()`). Nothing about who an
   account is changes, and RhoeFlow still has no user, customer or company table.
2. **Each account connects its own WorkEdge** on a "Connect WorkEdge" screen. Today the account's
   admin pastes a WorkEdge team API key made for RhoeFlow. Later "Sign in with WorkEdge" (OAuth)
   replaces pasting, stored in the same row with `credential_kind = 'oauth'`; the `JobStore` and
   everything above it do not change.
3. **One connection row per account** in RhoeFlow's own database:
   `rhoe.workedge_connections` (team id, credential kind, ciphertext, IV, key version, the last
   four characters for display, who connected it and when, when it was last checked).
4. **The key is encrypted before it is stored.** AES-256-GCM through the Worker's WebCrypto, with
   the account's team id as additional data so a stored key cannot be moved to another account.
   The Worker holds one master secret, `RHOE_CONNECTION_KEY` (32 random bytes, base64). That is the
   only WorkEdge-related secret in Cloudflare; no customer's key is ever in Cloudflare. The
   database holds only ciphertext, so a leaked database row is useless without the Worker secret,
   and the Worker secret is useless without the rows.
5. **Every WorkEdge call uses the calling account's own key.** The server loads the row for the
   session's team, decrypts it for that request only, and builds the `JobStore` with it
   (ADR-031). The key never reaches a browser, a log or a response; screens show only the last
   four characters.
6. **Checked when connected.** Saving a key first calls WorkEdge with it. A 401 is refused with a
   plain message. On success the screen shows how many projects the key sees and the first few
   names, so the admin can confirm it is their company's WorkEdge before saving. When WorkEdge adds
   a call that names a key's team, RhoeFlow also refuses a key whose team differs from the
   account's.
7. *(Amended by ADR-039, proposed: the admins are the account's members with the admin role; `rhoe.connection_admins` is dropped.)* **Only the account's admins connect, replace or disconnect.** Until sign-in (A1) finds a
   WorkEdge role, admins are a grant list of WorkEdge user ids, `rhoe.connection_admins`, the same
   pattern as template editors (owner decision 5). The first admin per account is added once in
   the SQL editor, like the first template editor. Every team member can see whether the account
   is connected and the last four characters.
8. **The WorkEdge server address is one setting for everyone**, `WORKEDGE_MCP_URL`, a plain
   variable in `apps/web/wrangler.jsonc`, not a secret. At WorkEdge's cutover only this value
   changes; stored keys stay valid (Jose, 2026-10-29).
9. **No billing, no plans, no TruFicient special case.** Nothing in the connection, the store or
   the screens assumes TruFicient. A later plan or billing record can attach to the account
   without changing this design.
10. **Trade OS users** reach RhoeFlow through Trade OS sign-in when Trade OS becomes an identity
    issuer (ADR-031's "later"). Their session carries their own `workedge_team_id`, and they
    connect their own WorkEdge on the same screen. RhoeFlow still requires a WorkEdge job for every
    assessment (standard §3), so a Trade OS company without WorkEdge cannot start one.

## What this amends

- **WO-03 owner decision 1** ("use a test-team API key ... into an untracked `.env.local`"): the
  test key is now pasted on the Connect WorkEdge screen like any account's. Local development keeps
  the fixture store.
- **Integration standard §6 and §7**: "the team's WorkEdge API key" now means each account's own
  key, held as above; "one Supabase Auth tenant shared with WorkEdge for TruFicient" now reads
  "for each account". The ownership split, ids and write-back tags are unchanged.
- **ADR-035**, one sentence: "RhoeFlow stays TruFicient-internal with no plans to license it to
  anyone" becomes "RhoeFlow is not for sale now (owner, 2026-11-01); it is built so it could be
  later". The rest of ADR-035 (no paid external tools) stands.
- Not changed: ADR-028 (no job, customer, property, photo or user table), ADR-030 (write-back
  tags), ADR-031 (API/MCP only, `JobStore`, no service-role key).

## Rejected

- **One WorkEdge key as a Cloudflare secret.** One team forever; a second account would see
  TruFicient's jobs.
- **A key per user.** WorkEdge keys are team keys, so every tech pasting their own adds nothing
  but more keys to lose; per-user access arrives with WorkEdge's OAuth, which this design already
  leaves room for.
- **Per-account keys in Cloudflare (Secrets Store or KV).** Writing them needs a Cloudflare API
  token inside the app, and the stack has no such binding.
- **Supabase Vault.** Decryption happens inside the database, which puts the plain key in SQL and
  needs a security-definer function or the service-role key that ADR-031 rules out.
- **Plain text in the database.** Anyone who can read the table could use the key.

## What WorkEdge needs to add (for Jose; not yet asked)

Checked against WorkEdge's code (`field-doc-suite`, `dev`, 2026-11-01). Reads work for any
number of accounts today. Still missing:

1. **Writes RhoeFlow's results need** (KAN-125 as filed): a photo upload with the key,
   `save_report` accepting a ready PDF (today it renders its own from Markdown), the
   `source`/`assessment_id`/`run_id` tags on notes and reports, and equipment create/update.
2. **Photo categories** on photos, so RhoeFlow can ask for "attic photos" (KAN-125 item 5).
3. **Public signing keys (JWKS)** so RhoeFlow can trust WorkEdge's sign-in (WO-03 A1). *Optional since ADR-039 (proposed): RhoeFlow has its own sign-in.*

Small and optional, to make many accounts smoother:

4. **Return the key's team** (id and name) on any reply, or a `whoami` tool. WorkEdge already
   knows it; it just does not say it. RhoeFlow could then show "connected to Truficient" and
   refuse a key from another company outright instead of relying on the admin's check.
5. **"Sign in with WorkEdge" (Phase 3 OAuth)**, so people connect without copying a key.

No longer needed: a `get_property` tool (`api-properties` already does it).

Already fine for many accounts: keys are scoped to one team on WorkEdge's side, the rate limit is
per key (one account cannot use up another's), and keys can be deactivated in WorkEdge.

## What the owner does once this is built

1. Add the Worker secret `RHOE_CONNECTION_KEY` in Cloudflare (the build pull request gives the one
   command that makes the value).
2. Run the new migration in the Supabase SQL editor and add himself as the first connection admin.
3. Make a WorkEdge API key on the Truficient team named RhoeFlow and paste it on the Connect
   WorkEdge screen.
