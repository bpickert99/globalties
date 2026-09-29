-- The second program category is FFS (Fee for service); Open World is one FFS client, not a category.
update program_types
set name = 'FFS (Fee for service)',
    itinerary_intro = 'These visitors are in the United States on a professional exchange program. The program in western Missouri and Kansas is arranged by Global Ties KC.'
where name = 'Open World';

-- The "reference" was really the arrival date (YY.M); it is derived, not stored.
alter table projects drop column reference;
