-- The overarching transportation calendar is gone: Agenda USA is only asked for the driver,
-- and what was sent to them is no longer tracked.
update task_templates set email_key = 'transport_driver', title = 'Ask Agenda USA for the driver', details = 'Passengers, luggage and hotel from the Transportation tab.' where email_key = 'transport_calendar';
update tasks set email_key = 'transport_driver', title = 'Ask Agenda USA for the driver', details = 'Passengers, luggage and hotel from the Transportation tab.' where email_key = 'transport_calendar';
alter table projects drop column transport_sent, drop column transport_sent_at;
