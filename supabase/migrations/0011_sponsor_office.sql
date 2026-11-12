-- The State Department office named on the itinerary contacts page
-- ("Sponsored and Administered by the Office of ...").
alter table projects add column sponsor_office text not null default 'Office of International Visitors';
