-- Hotel coordination mirrors Agenda: the rooming list changes (rooms 15 → 23 → 24 → 23, dates
-- shifted, TBD names, cancellations) and every change must reach the hotel before arrival.

-- What the hotel was last sent: {rooms, names: ["Family, Given"], arrival, departure}.
alter table projects add column hotel_sent jsonb;
alter table projects add column hotel_sent_at timestamptz;
-- Final hotel email details: when the group reaches the hotel, and checkout time.
alter table projects add column hotel_eta time;
alter table projects add column hotel_checkout time not null default '11:00';

-- Agenda can assign several vehicles (a driver all week plus a luggage vehicle on arrival
-- and departure; separate airport and program drivers): [{role, name, phone}] plus notes.
alter table projects drop column driver_name;
alter table projects drop column driver_phone;
alter table projects add column drivers jsonb not null default '[]';
alter table projects add column vehicle_notes text not null default '';

-- One log of calls and emails with the hotel and Agenda: [{date, party, note}].
alter table projects drop column transport_log;
alter table projects add column vendor_log jsonb not null default '[]';

-- Checklist: hotel steps as they actually happen, and drivers are assigned late (about 2 days out).
update task_templates
set title = 'Final hotel email: cancellations, arrival time, pre-keyed rooms, checkout',
    details = 'Cancel rooms by name, give flight landing and expected hotel arrival, ask for pre-keyed rooms, confirm checkout. Resend if the rooming list changes.',
    email_key = 'hotel_final'
where title = 'Confirm hotel reservation confirmation numbers and send flight arrival time to KC hotel';

update task_templates set offset_days = -2 where title = 'Confirm Agenda USA driver name and phone';

insert into task_templates (program_type_id, phase, title, details, anchor, offset_days, requires, email_key, sort)
select id, 'Programming Preparation: 4–6 weeks prior', 'Hotel contract signed and confirmation numbers received',
       'NPA signs the room block contract (and credit card authorization if asked); hotel returns the rooming list with confirmation numbers. Enter them on the Participants tab.',
       'arrival', -24, 'none', null, 175
from program_types;

-- Bring open projects in line.
update tasks
set title = 'Final hotel email: cancellations, arrival time, pre-keyed rooms, checkout',
    details = 'Cancel rooms by name, give flight landing and expected hotel arrival, ask for pre-keyed rooms, confirm checkout. Resend if the rooming list changes.',
    email_key = 'hotel_final'
where title = 'Confirm hotel reservation confirmation numbers and send flight arrival time to KC hotel' and done_at is null;

update tasks set offset_days = -2 where title = 'Confirm Agenda USA driver name and phone' and anchor = 'arrival' and done_at is null;

insert into tasks (project_id, phase, title, details, anchor, offset_days, requires, email_key, sort)
select p.id, t.phase, t.title, t.details, t.anchor, t.offset_days, t.requires, t.email_key, t.sort
from projects p join task_templates t on t.program_type_id = p.program_type_id
where p.closed_at is null and t.sort = 175;
