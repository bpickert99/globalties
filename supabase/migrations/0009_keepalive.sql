-- Free-plan projects pause after about a week without database activity. A scheduled
-- GitHub Action calls keepalive() every few days; it only stamps the time, nothing else.
create table heartbeat (
  id boolean primary key default true check (id),
  pinged_at timestamptz not null default now()
);
insert into heartbeat (id) values (true);
alter table heartbeat enable row level security;

create function keepalive() returns timestamptz
language sql security definer set search_path = public as $$
  update heartbeat set pinged_at = now() where id returning pinged_at;
$$;
revoke execute on function keepalive() from public;
grant execute on function keepalive() to anon;
