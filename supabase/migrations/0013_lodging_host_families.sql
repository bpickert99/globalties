-- Where the group sleeps: a hotel, or host families for the whole stay (e.g. Open World).
-- Host families replace the hotel tab, and the hotel checklist steps only apply to hotel stays.
alter table projects add column lodging text not null default 'hotel' check (lodging in ('hotel', 'host_families'));
alter table projects add column host_families jsonb not null default '[]';

alter table task_templates drop constraint task_templates_requires_check;
alter table task_templates add constraint task_templates_requires_check check (requires in ('none', 'home_hospitality', 'event', 'hotel'));
alter table tasks drop constraint tasks_requires_check;
alter table tasks add constraint tasks_requires_check check (requires in ('none', 'home_hospitality', 'event', 'hotel'));

update task_templates set requires = 'hotel' where requires = 'none' and title in (
  'Email hotel for availability',
  'Connect NPA and hotel contact via email',
  'Hotel contract signed and confirmation numbers received',
  'Send hotel confirmation numbers to DC',
  'Final hotel email: cancellations, arrival time, pre-keyed rooms, checkout',
  'Cross-reference hotel confirmation list and final itinerary',
  'Drop off packets at hotel'
);
update tasks set requires = 'hotel' where requires = 'none' and title in (
  'Email hotel for availability',
  'Connect NPA and hotel contact via email',
  'Hotel contract signed and confirmation numbers received',
  'Send hotel confirmation numbers to DC',
  'Final hotel email: cancellations, arrival time, pre-keyed rooms, checkout',
  'Cross-reference hotel confirmation list and final itinerary',
  'Drop off packets at hotel'
);
