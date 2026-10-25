-- Template store (WO-03 C7; ADR-024; owner decision 5). Every edit is a new immutable version;
-- edit rights come from a grant list of WorkEdge user ids (no user table, ADR-028).

create table rhoe.templates (
  template_id       text not null check (template_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  workedge_team_id  text not null,
  name              text not null,
  current_version   integer not null default 1 check (current_version >= 1),
  archived          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (workedge_team_id, template_id)
);

create or replace function rhoe.templates_guard() returns trigger
language plpgsql
as $$
begin
  if new.current_version < old.current_version or new.current_version > old.current_version + 1 then
    raise exception 'template version must stay or grow by one (was %, got %)', old.current_version, new.current_version;
  end if;
  return new;
end;
$$;
create trigger templates_guard before update on rhoe.templates for each row execute function rhoe.templates_guard();

create table rhoe.template_versions (
  template_id       text not null,
  workedge_team_id  text not null,
  version           integer not null check (version >= 1),
  payload           jsonb not null,
  content_hash      text not null check (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  source            text not null check (source in ('repo', 'editor')),
  editor_user_id    text,
  change_note       text not null check (length(change_note) >= 1),
  created_at        timestamptz not null default now(),
  primary key (workedge_team_id, template_id, version),
  foreign key (workedge_team_id, template_id) references rhoe.templates (workedge_team_id, template_id)
);
create trigger template_versions_immutable before update or delete on rhoe.template_versions for each row execute function rhoe.immutable_row();

create table rhoe.template_editors (
  workedge_team_id  text not null,
  workedge_user_id  text not null,
  granted_by        text,
  granted_at        timestamptz not null default now(),
  primary key (workedge_team_id, workedge_user_id)
);

-- Edit rights: the session user must be on the team's grant list. Reads are open to the team.
create or replace function rhoe.is_template_editor() returns boolean
language sql stable
as $$
  select exists (
    select 1 from rhoe.template_editors e
    where e.workedge_team_id = rhoe.current_team_id() and e.workedge_user_id = rhoe.current_user_id()
  );
$$;

alter table rhoe.templates enable row level security;
alter table rhoe.templates force row level security;
alter table rhoe.template_versions enable row level security;
alter table rhoe.template_versions force row level security;
alter table rhoe.template_editors enable row level security;
alter table rhoe.template_editors force row level security;

create policy templates_select on rhoe.templates for select to authenticated using (workedge_team_id = rhoe.current_team_id());
create policy templates_insert on rhoe.templates for insert to authenticated with check (workedge_team_id = rhoe.current_team_id() and rhoe.is_template_editor());
create policy templates_update on rhoe.templates for update to authenticated using (workedge_team_id = rhoe.current_team_id() and rhoe.is_template_editor()) with check (workedge_team_id = rhoe.current_team_id());
create policy template_versions_select on rhoe.template_versions for select to authenticated using (workedge_team_id = rhoe.current_team_id());
create policy template_versions_insert on rhoe.template_versions for insert to authenticated with check (workedge_team_id = rhoe.current_team_id() and rhoe.is_template_editor());
create policy template_editors_select on rhoe.template_editors for select to authenticated using (workedge_team_id = rhoe.current_team_id());
create policy template_editors_insert on rhoe.template_editors for insert to authenticated with check (workedge_team_id = rhoe.current_team_id() and rhoe.is_template_editor());

grant select, insert, update on rhoe.templates to authenticated;
grant select, insert on rhoe.template_versions to authenticated;
grant select, insert on rhoe.template_editors to authenticated;
