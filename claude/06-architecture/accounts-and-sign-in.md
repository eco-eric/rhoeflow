# RhoeFlow accounts, sign-in, profile and account settings (ADR-039, proposed 2026-11-01)

Status: **Proposed**, awaiting the owner's approval. On approval the decision-log row changes to
Decided (owner, date) and the build pull request is reviewed against this text.

## Why this exists

RhoeFlow cannot be used today: every screen needs a signed-in session, and the only sign-in the
plan allowed was WorkEdge's own (WO-03 A1, integration standard §7), which waits on WorkEdge
publishing public signing keys. That blocks the Connect WorkEdge screen ADR-038 just shipped,
because only a signed-in account admin may paste a key.

On 2026-11-01 the owner asked for two things:

- "Let's create a sign-in for RhoeFlow."
- "Let's go ahead and set up like we have accounts. So we would need to set up profile and account
  settings and all that."

Together with his earlier direction for ADR-038 ("set it up like ... a paid app"; Trade OS users
"would need to have their own connectors"; "eventually it could be for sale ... but right now
it's not"), that means RhoeFlow gets its own accounts, the way a paid multi-company app has them,
instead of borrowing WorkEdge's.

## Why an account cannot simply be a WorkEdge team any more

ADR-028 and ADR-038 keyed everything on `workedge_team_id` from the session. With RhoeFlow's own
sign-in nobody hands RhoeFlow that id: WorkEdge's MCP and REST replies never return a key's team
(`workedge-connections.md`), and a company signing up for RhoeFlow (or arriving from Trade OS)
exists before it connects WorkEdge. So the account has to be RhoeFlow's own record, and WorkEdge
becomes something an account connects, exactly as ADR-038 already describes for the key.

The live RhoeFlow Supabase project (`Rhoe_Flow`) was checked on 2026-11-01: the `rhoe` schema is
empty and no migration has been run. The rename below therefore edits the existing migration
files in place instead of adding a rename migration.

## Decision

1. **RhoeFlow has accounts.** An account is a company using RhoeFlow (`rhoe.accounts`: id, name,
   created). Every RhoeFlow table's tenant column becomes `account_id` (was `workedge_team_id`),
   and row-level security compares it with `rhoe.current_account_id()` (was
   `rhoe.current_team_id()`). Nothing else about the tables changes. Assessments keep
   `workedge_project_id` and `workedge_property_id`; which WorkEdge team they belong to is the
   account's connection (ADR-038, one connection per account).
2. **People sign in with RhoeFlow's own Supabase Auth** (the `Rhoe_Flow` project, which already
   holds RhoeFlow's data). Default method: **email and password**, with "forgot password" by
   email. The browser talks to Supabase Auth directly, so the password never passes through
   RhoeFlow's Worker. Sessions are Supabase's cookies through `@supabase/ssr` (already approved,
   WO-03 decision 10). Email one-time codes, Google, "Sign in with WorkEdge" and Trade OS sign-in
   can be added later as more methods on the same users; nothing below depends on the method.
3. **Membership and roles.** `rhoe.account_members` (account, user, role, joined). Two roles now:
   - **admin**: everything a member can do, plus rename the account, invite and remove people,
     change roles, connect or disconnect WorkEdge, and edit templates.
   - **member**: use RhoeFlow for the account's jobs (assessments, runs, reports).
   An account always keeps at least one admin; the database refuses removing or demoting the last
   one. Template editing is also open to members on the existing editor grant list
   (`rhoe.template_editors`, owner decision 5), so an office person can edit templates without
   being an admin. ADR-038's separate `rhoe.connection_admins` list is dropped: connecting
   WorkEdge is an admin right.
4. **Which account a request acts for** is decided in the database, not in the token:
   `rhoe.current_account_id()` returns the account the user picked last (their profile's current
   account) if they are still a member, otherwise their oldest membership, otherwise nothing.
   Removing someone or changing their role therefore takes effect on their next request, with no
   token refresh and no Auth hook to configure. A user in several accounts switches on their
   profile page.
5. **Profile.** `rhoe.profiles` (the user's name, phone and current account). The profile page
   lets people change their name and phone, change their email (Supabase sends a confirmation to
   the new address), change their password, switch account and sign out.
6. **Account settings** (`/settings/account`): the account's name (admins edit), the member list
   with name, email, role and joined date (admins change roles and remove people), invites
   (below), and the link to Connect WorkEdge (`/settings/workedge`, unchanged from ADR-038 except
   that it now asks for an account admin).
7. **Invites by email address, proven by email confirmation.** An admin adds an email and a role;
   the invite is a row (`rhoe.account_invites`), not a link with a secret. The person creates a
   RhoeFlow login with that same email on the sign-up page, confirms the address from the email
   Supabase sends, and on their first sign-in every pending invite for that confirmed address is
   accepted. Admins can withdraw an invite before it is used. RhoeFlow sends no invite email itself
   in this step: the screen shows the sign-up link for the admin to pass on. Invite emails from
   RhoeFlow can come later.
8. **A login with no account sees nothing.** Sign-up is open in Supabase so invited people can
   make a login, but a login that belongs to no account gets a "you're not part of an account yet"
   page and no data: every policy requires a current account.
9. **No self-serve account creation yet.** RhoeFlow is not for sale now, so there is no "create a
   company" button. Accounts are created once in the SQL editor with
   `supabase/seed/first_account.sql`, which makes the account and its first admin from an
   existing login's email. That is how Truficient's account and its first admin (the owner) are
   set up. Self-serve sign-up with a plan can be added later without changing these tables.
10. **No billing, plans or Truficient special case.** A later plan or billing record attaches to
    `rhoe.accounts`. Trade OS-linked accounts can then be marked as not billed by RhoeFlow.
11. **Still no service-role key in the app (ADR-031).** Everything runs as the signed-in user
    under row-level security. The few steps that must read another table first (accepting
    invites, listing members' emails, finding the current account) are small `security definer`
    functions with a fixed search path that only ever act for the caller.
12. **Email delivery.** Supabase's built-in email sender only delivers to the Supabase
    organization's own members and only a few messages an hour, so before anyone outside the
    owner signs up or resets a password, the project needs its own email sender (custom SMTP in
    Supabase Auth settings, for example the Resend account already used for Total Mini Split).
    The owner's own first login does not need email: it is created in the Supabase dashboard with
    the address already confirmed.

## The frozen snapshot's `workedge.team_id`

Every accepted snapshot and every committed fixture carries `workedge: { team_id, project_id,
property_id }`, and the run's input hash covers it. Changing that schema would change every
fixture's hash, so this decision leaves the snapshot schema alone: new snapshots carry the
RhoeFlow account id in that field, and the report's run record labels it "Account". The rename to
`account_id` belongs to the snapshot schema's next version, when other fields change too.

## What this amends

- **ADR-028** (Locked): "no ... user table" now reads "no job, customer, property or photo-file
  table; people are RhoeFlow's own logins (Supabase Auth) with a profile and account
  memberships". The tenant column is `account_id`, not `workedge_team_id`. The rest stands: job,
  property and media live in WorkEdge and are referenced by WorkEdge ids; signed URLs are never
  stored. The owner's request on 2026-11-01 is the basis for changing a Locked ADR.
- **ADR-031**: "Shared Supabase Auth tenant / `team_id` for identity; Trade OS as issuer later"
  now reads "RhoeFlow's own Supabase Auth and accounts; WorkEdge and Trade OS sign-in later as
  extra ways into the same accounts". API/MCP only, the `JobStore` and no service-role key stand.
- **ADR-038** decision 1 ("an account is a WorkEdge team") and decision 7 (the connection-admin
  grant list): the account is RhoeFlow's own; its admins connect WorkEdge. The connection row,
  encryption, checks and the rest of ADR-038 stand, keyed by `account_id`.
- **Integration standard §7 (Identity)**: replaced by this document.
- **WO-03 owner decision 2** ("the owner signs in during the A1 spike; RhoeFlow never handles the
  owner's password"): the owner signs in with a RhoeFlow login; the password still never passes
  through RhoeFlow's server, only between the browser and Supabase Auth.
- **WO-03 A1** (identity spike on WorkEdge's signing keys): no longer blocks anything. It becomes
  the optional "Sign in with WorkEdge" method. WorkEdge's public signing keys move from "needed"
  to "optional" in the Jose list.
- **WO-03 C7** ("edit rights from the WorkEdge session's role ... otherwise a grant list of
  WorkEdge user ids"): admins edit templates, plus the grant list of RhoeFlow user ids.
- **WO-03 D1**: sign-in is RhoeFlow's own.

## Rejected

- **Wait for WorkEdge's sign-in (A1).** Blocks every screen on someone else's change, and still
  leaves a company without WorkEdge unable to have an account.
- **Keep the account id equal to the WorkEdge team id.** RhoeFlow cannot learn a team id from
  WorkEdge, so every new account would need someone to dig the id out of WorkEdge's database.
- **Put the account and role in the token with a Supabase Auth hook.** Works, but removing someone
  only takes effect when their token expires (up to an hour), and it adds a dashboard step that
  breaks every sign-in if it is misconfigured. The database lookup is immediate and needs no hook.
- **Magic links only.** No passwords to manage, but every sign-in needs working email on day one,
  and a link opened from a phone's mail app often lands in the wrong browser. Kept as a later
  option.
- **Invite links carrying a secret token.** Needs the app to send or show secrets; the confirmed
  email address already proves who someone is.
- **A service-role key for invites and member lists.** ADR-031 rules it out; `security definer`
  functions acting only for the caller do the same job.

## What the build adds (pull request after this one)

- Migrations: tenant rename in the existing files; a new `rhoe_accounts` migration with accounts,
  members, profiles, invites, `current_account_id()`, the role checks and the invite and member
  functions. `supabase/tests/accounts.sql` with negative tests (another account's rows, a member
  acting as admin, removing the last admin, an unconfirmed email taking an invite).
- Web: `/sign-in`, `/sign-up`, `/forgot-password`, `/auth/callback` (email links), sign-out,
  `/settings/profile`, `/settings/account`, a "no account yet" page, and the Connect WorkEdge
  screen asking for an admin. A small header shows who is signed in and in which account.
- Store and tests: the services use `account_id`; account, member and invite rules are mirrored
  in the in-memory database the service tests use, the same way the other rules are.

## What the owner does once it is built

1. In Supabase (`Rhoe_Flow`), run the migrations in order in the SQL editor, then add `rhoe` to
   the exposed schemas.
2. Authentication → Users → Add user: his email and a password, with "auto confirm" ticked.
3. Run `supabase/seed/first_account.sql` with the account name (Truficient) and his email.
4. Authentication → URL configuration: site URL `https://rhoeflow.pro`, and add
   `https://rhoeflow.pro/auth/callback` to the redirect URLs.
5. Before inviting anyone: set up custom SMTP (for example Resend) under Authentication → Emails.
6. Sign in at rhoeflow.pro, then paste the WorkEdge key on Connect WorkEdge (needs the
   `RHOE_CONNECTION_KEY` Worker secret from ADR-038).
