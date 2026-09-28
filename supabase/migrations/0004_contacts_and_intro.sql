-- Interpreters/liaisons need contact info (home hospitality emails give the liaison's phone).
alter table participants add column phone text not null default '';
alter table participants add column email text not null default '';

-- Intro paragraph on the itinerary cover, per program type.
alter table program_types add column itinerary_intro text not null default '';
update program_types set itinerary_intro = 'These visitors are invited to the United States under the auspices of the Department of State''s International Visitor Leadership Program. The program in western Missouri and Kansas is arranged by Global Ties KC.'
where name = 'IVLP';
update program_types set itinerary_intro = 'These visitors are invited to the United States under the auspices of the Open World Leadership Center. The program in western Missouri and Kansas is arranged by Global Ties KC.'
where name = 'Open World';
