-- Who speaks at a visit (contact_ids stays the point of contact). When the point of contact
-- also speaks they are listed under Speakers only, unless contact_when_speaking is on.
alter table schedule_items add column speaker_ids text[] not null default '{}';
alter table schedule_items add column contact_when_speaking boolean not null default false;
