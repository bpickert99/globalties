-- NPA team: a Program Manager and a Program Associate instead of a free contact list.
alter table projects drop column npa_contacts;
alter table projects add column npa_manager jsonb not null default '{"name": "", "title": "Program Manager", "phone": "", "email": ""}';
alter table projects add column npa_associate jsonb not null default '{"name": "", "title": "Program Associate", "phone": "", "email": ""}';

-- The driver is an Agenda Kansas City driver: just a name and phone.
alter table projects drop column drivers;
alter table projects add column driver_name text not null default '';
alter table projects add column driver_phone text not null default '';

-- Resources: organizations and places visited, kept as a library across projects.
-- contacts is a list of {id, name, title, phone, email}; visits pick contacts by id.
create table resources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'other'
    check (category in ('nonprofit', 'government', 'education', 'business', 'cultural', 'media', 'health', 'faith', 'other')),
  address text not null default '',
  lat double precision,
  lng double precision,
  location text not null default '',
  directions text not null default '',
  description text not null default '',
  website text not null default '',
  contacts jsonb not null default '[]',
  notes text not null default '',
  created_at timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
alter table resources enable row level security;
create policy resources_all on resources for all to authenticated using (is_member()) with check (is_member());

-- Meetings and cultural activities are visits to a resource; place, contacts and
-- description now live on the resource. description stays for home hospitality intros.
alter table schedule_items drop column location;
alter table schedule_items drop column address;
alter table schedule_items drop column directions;
alter table schedule_items drop column contacts;
alter table schedule_items add column resource_id uuid references resources on delete restrict;
alter table schedule_items add column contact_ids text[] not null default '{}';
alter table schedule_items add constraint schedule_items_resource_check
  check ((kind in ('meeting', 'activity')) = (resource_id is not null));
create index schedule_items_resource_idx on schedule_items (resource_id);
