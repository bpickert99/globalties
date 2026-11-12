-- To-do lists (Google Tasks style), meeting-fatigue window, project documents, and the
-- assistant's conversations.

-- Lists: General plus one per project (created automatically); more can be added by hand.
create table task_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  project_id uuid unique references projects on delete cascade,
  shown boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table task_lists enable row level security;
create policy task_lists_all on task_lists for all to authenticated using (is_member()) with check (is_member());

insert into task_lists (name, sort) values ('General', 0);
insert into task_lists (name, project_id, sort)
select name, id, 100 from projects;

create function create_project_list() returns trigger
language plpgsql set search_path = public as $$
begin
  insert into task_lists (name, project_id, sort) values (new.name, new.id, 100);
  return new;
end;
$$;
create trigger projects_create_list after insert on projects
for each row execute function create_project_list();

-- A project list follows the project's name.
create function rename_project_list() returns trigger
language plpgsql set search_path = public as $$
begin
  update task_lists set name = new.name where project_id = new.id;
  return new;
end;
$$;
create trigger projects_rename_list after update of name on projects
for each row when (old.name is distinct from new.name) execute function rename_project_list();

-- To-do tasks belong to a list; checklist tasks (project_id set, list_id null) stay on the
-- project's Checklist tab. The two are separate by design.
alter table tasks add column list_id uuid references task_lists on delete cascade;
alter table tasks add column starred boolean not null default false;
update tasks set list_id = (select id from task_lists where project_id is null and name = 'General') where project_id is null;
alter table tasks add constraint tasks_list_xor_checklist check ((list_id is null) <> (project_id is null));
create index tasks_list_idx on tasks (list_id);

-- Warn when a resource or contact was met within this many days.
alter table settings add column fatigue_days int not null default 30 check (fatigue_days > 0);

-- Documents uploaded to a project (proposals, emails, rooming lists...). Files live in Storage.
create table documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  name text not null,
  mime_type text not null,
  size_bytes int not null,
  storage_path text not null unique,
  text_content text,
  anthropic_file_id text,
  created_at timestamptz not null default now()
);
alter table documents enable row level security;
create policy documents_all on documents for all to authenticated using (is_member()) with check (is_member());
create index documents_project_idx on documents (project_id);

insert into storage.buckets (id, name, public) values ('documents', 'documents', false);
create policy documents_bucket_all on storage.objects for all to authenticated
  using (bucket_id = 'documents' and is_member()) with check (bucket_id = 'documents' and is_member());

-- Assistant conversations per project. api_content is exactly what was sent to / returned by
-- Claude (replayed unchanged); ui holds what the page shows, including proposal approvals.
create table chats (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now()
);
alter table chats enable row level security;
create policy chats_all on chats for all to authenticated using (is_member()) with check (is_member());

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chats on delete cascade,
  seq int not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  api_content jsonb not null,
  ui jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (chat_id, seq)
);
alter table chat_messages enable row level security;
create policy chat_messages_all on chat_messages for all to authenticated using (is_member()) with check (is_member());
