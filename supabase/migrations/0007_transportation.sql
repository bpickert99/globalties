-- Transportation (Agenda USA) coordination, modeled on how bookings actually go:
-- a booking request (dates, passengers, bags, billing), then a day-by-day calendar
-- asking for the driver, then final confirmations. Changes after sending must reach Agenda.

-- NPA billing details: the billing contact varies (e.g. a Program Coordinator) and
-- Agenda needs the organization's mailing address.
alter table projects add column npa_address text not null default '';
alter table projects add column billing_contact text not null default 'manager' check (billing_contact in ('manager', 'associate'));

-- Approximate suitcases (about 3 per person); drives vehicle size.
alter table projects add column luggage_count int check (luggage_count >= 0);

-- What was last sent to Agenda, to flag changes afterwards: {passengers, luggage, hotel, days: {date: text}}.
alter table projects add column transport_sent jsonb;
alter table projects add column transport_sent_at timestamptz;
-- Phone calls and notes with Agenda: [{date, note}].
alter table projects add column transport_log jsonb not null default '[]';

-- Checklist: split the transportation work into its real steps.
update task_templates set title = 'Book transportation with Agenda USA', details = 'Dates, passengers, approximate luggage, billing contact. Ask them to confirm once it is in their system. Separate email per program.'
where email_key = 'transport_request';

insert into task_templates (program_type_id, phase, title, details, anchor, offset_days, requires, email_key, sort)
select id, 'Arrival Preparation: 1–2 weeks prior', 'Send transportation calendar to Agenda USA and ask for the driver',
       'Passengers, luggage, hotel and the day-by-day calendar from the Transportation tab. Resend if it changes.', 'arrival', -10, 'none', 'transport_calendar', 245
from program_types
union all
select id, 'Arrival Preparation: 1–2 weeks prior', 'Confirm Agenda USA driver name and phone',
       'Record it on the Transportation tab so it prints on the itinerary.', 'arrival', -5, 'none', null, 265
from program_types;

-- Give open projects the same new steps.
insert into tasks (project_id, phase, title, details, anchor, offset_days, requires, email_key, sort)
select p.id, t.phase, t.title, t.details, t.anchor, t.offset_days, t.requires, t.email_key, t.sort
from projects p join task_templates t on t.program_type_id = p.program_type_id
where p.closed_at is null and t.sort in (245, 265);

update tasks set title = 'Book transportation with Agenda USA', details = 'Dates, passengers, approximate luggage, billing contact. Ask them to confirm once it is in their system. Separate email per program.'
where email_key = 'transport_request' and done_at is null;
