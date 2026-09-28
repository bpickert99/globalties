-- Global Ties KC program tracker: initial schema.

-- Access: only emails listed in members can read or write anything.
create table members (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

create function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where email = lower(auth.jwt() ->> 'email'));
$$;

-- Single-row organization settings used by itineraries and email drafts.
create table settings (
  id boolean primary key default true check (id),
  office_address text not null default '',
  transport_block text not null default '',
  transport_contact_name text not null default '',
  transport_email text not null default '',
  cc_name text not null default '',
  cc_email text not null default '',
  ceo_email text not null default '',
  survey_url text not null default ''
);
insert into settings (id) values (true);

-- Staff listed on the itinerary contacts page.
create table staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null default '',
  office_phone text not null default '',
  mobile_phone text not null default '',
  email text not null default '',
  emergency_contact boolean not null default false,
  sort int not null default 0
);

create table program_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort int not null default 0
);

-- Checklist template per program type. Due date = anchor date + offset_days.
create table task_templates (
  id uuid primary key default gen_random_uuid(),
  program_type_id uuid not null references program_types on delete cascade,
  phase text not null,
  title text not null,
  details text not null default '',
  anchor text not null check (anchor in ('accepted', 'arrival', 'departure')),
  offset_days int not null,
  requires text not null default 'none' check (requires in ('none', 'home_hospitality', 'event')),
  email_key text,
  sort int not null
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  program_type_id uuid not null references program_types,
  name text not null,
  subtitle text not null default '',
  reference text not null default '',
  countries text not null default '',
  accepted_on date not null default current_date,
  arrival_date date not null,
  departure_date date not null check (departure_date >= arrival_date),
  sharepoint_url text not null default '',
  npa_org text not null default '',
  npa_contacts jsonb not null default '[]',
  oiv_contacts jsonb not null default '[]',
  hotel_name text not null default '',
  hotel_address text not null default '',
  hotel_phone text not null default '',
  hotel_contact_name text not null default '',
  hotel_contact_email text not null default '',
  hotel_rate text not null default '',
  hotel_blurb text not null default '',
  drivers jsonb not null default '[]',
  home_hospitality boolean not null default false,
  has_event boolean not null default false,
  notes text not null default '',
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Project tasks (project_id set) and standalone to-dos (project_id null).
-- Template-derived tasks keep anchor/offset so due dates follow date changes;
-- a manually set date lives in due_date with anchor cleared.
create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  phase text not null default '',
  title text not null,
  details text not null default '',
  anchor text check (anchor in ('accepted', 'arrival', 'departure')),
  offset_days int,
  due_date date,
  requires text not null default 'none' check (requires in ('none', 'home_hospitality', 'event')),
  email_key text,
  enabled boolean not null default true,
  done_at timestamptz,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  check ((anchor is null) = (offset_days is null)),
  check (project_id is not null or anchor is null)
);
create index tasks_project_idx on tasks (project_id);

create table participants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  role text not null default 'participant' check (role in ('participant', 'interpreter', 'liaison')),
  given_name text not null,
  family_name text not null,
  position text not null default '',
  country text not null default '',
  dietary text not null default '',
  media_consent text not null default 'unknown' check (media_consent in ('unknown', 'yes', 'no')),
  arrival_flight text not null default '',
  departure_flight text not null default '',
  hotel_confirmation text not null default '',
  bio text not null default '',
  notes text not null default '',
  cancelled_at timestamptz,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index participants_project_idx on participants (project_id);

create table schedule_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  day date not null,
  start_time time,
  end_time time,
  kind text not null check (kind in ('meeting', 'meal', 'activity', 'home_hospitality', 'transport', 'flight', 'note')),
  title text not null,
  location text not null default '',
  address text not null default '',
  directions text not null default '',
  contacts jsonb not null default '[]',
  topic text not null default '',
  description text not null default '',
  restaurants jsonb not null default '[]',
  hh_groups jsonb not null default '[]',
  status text check (status in ('planned', 'requested', 'confirmed', 'declined', 'thanked')),
  status_changed_at timestamptz not null default now(),
  internal_notes text not null default '',
  created_at timestamptz not null default now(),
  check ((kind = 'meeting') = (status is not null))
);
create index schedule_items_project_idx on schedule_items (project_id);

-- Row level security: members only.
alter table members enable row level security;
alter table settings enable row level security;
alter table staff enable row level security;
alter table program_types enable row level security;
alter table task_templates enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table participants enable row level security;
alter table schedule_items enable row level security;

create policy members_read on members for select to authenticated using (is_member());
create policy settings_all on settings for all to authenticated using (is_member()) with check (is_member());
create policy staff_all on staff for all to authenticated using (is_member()) with check (is_member());
create policy program_types_all on program_types for all to authenticated using (is_member()) with check (is_member());
create policy task_templates_all on task_templates for all to authenticated using (is_member()) with check (is_member());
create policy projects_all on projects for all to authenticated using (is_member()) with check (is_member());
create policy tasks_all on tasks for all to authenticated using (is_member()) with check (is_member());
create policy participants_all on participants for all to authenticated using (is_member()) with check (is_member());
create policy schedule_items_all on schedule_items for all to authenticated using (is_member()) with check (is_member());
