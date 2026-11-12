-- Pickups / bus departures: a schedule item with a start time only (no end time on the itinerary).
alter table schedule_items drop constraint schedule_items_kind_check;
alter table schedule_items add constraint schedule_items_kind_check check (kind in ('meeting', 'meal', 'activity', 'home_hospitality', 'transport', 'pickup', 'flight', 'note'));
alter table schedule_items add constraint schedule_items_pickup_no_end check (kind <> 'pickup' or end_time is null);
