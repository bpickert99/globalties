-- Flights are recorded from takeoff (start_time) to landing (end_time), both as on the ticket.
-- The itinerary shows the landing time for the flight into Kansas City.
alter table schedule_items add constraint schedule_items_flight_window check (kind <> 'flight' or (start_time is not null and end_time is not null));
