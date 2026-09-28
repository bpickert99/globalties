-- New projects get their program type's checklist.
create function copy_checklist() returns trigger
language plpgsql set search_path = public as $$
begin
  insert into tasks (project_id, phase, title, details, anchor, offset_days, requires, email_key, sort)
  select new.id, phase, title, details, anchor, offset_days, requires, email_key, sort
  from task_templates where program_type_id = new.program_type_id;
  return new;
end;
$$;

create trigger projects_copy_checklist after insert on projects
for each row execute function copy_checklist();

-- Program types. Open World starts as a copy of the IVLP checklist.
insert into program_types (name, sort) values ('IVLP', 1), ('Open World', 2);

insert into task_templates (program_type_id, phase, title, details, anchor, offset_days, requires, email_key, sort)
select (select id from program_types where name = 'IVLP'), t.phase, t.title, t.details, t.anchor, t.offset_days, t.requires, t.email_key, t.sort
from (values
  ('Pre-Program: As soon as accepted', 'Make SharePoint folder', '', 'accepted', 0, 'none', null, 10),
  ('Pre-Program: As soon as accepted', 'Create event in Outlook shared calendar', 'Start & end times reflect flight times.', 'accepted', 0, 'none', null, 20),
  ('Pre-Program: As soon as accepted', 'Fill in project overview', 'SharePoint link, participant numbers, liaisons/interpreters & contact info, countries, NPA organization & PO, hotel, home hospitality yes/no, event yes/no.', 'accepted', 1, 'none', null, 30),
  ('Pre-Program: As soon as accepted', 'Create draft itinerary', 'Update with as much information as possible.', 'accepted', 2, 'none', null, 40),
  ('Pre-Program: As soon as accepted', 'Email rate sheet to NPA', '', 'accepted', 1, 'none', null, 50),
  ('Pre-Program: As soon as accepted', 'Email hotel for availability', 'Hotel email contact is in the rate sheets. Separate email for each program.', 'accepted', 1, 'none', 'hotel_request', 60),
  ('Pre-Program: As soon as accepted', 'Connect NPA and hotel contact via email', '', 'accepted', 3, 'none', 'hotel_npa_connect', 70),
  ('Pre-Program: As soon as accepted', 'Email Agenda USA for transportation', 'Separate email per program.', 'accepted', 3, 'none', 'transport_request', 80),
  ('Programming Preparation: 4–6 weeks prior', 'Inform staff at Monday meeting of intended meeting requests', 'See the Monday Meeting page.', 'arrival', -42, 'none', null, 110),
  ('Programming Preparation: 4–6 weeks prior', 'Salesforce research: previous resource usage', '', 'arrival', -42, 'none', null, 120),
  ('Programming Preparation: 4–6 weeks prior', 'Send preliminary meeting requests', 'Based on the final DC proposal.', 'arrival', -38, 'none', null, 130),
  ('Programming Preparation: 4–6 weeks prior', 'Check IVRC', 'Hotel, transportation, and emergency contact information are correct.', 'arrival', -28, 'none', null, 140),
  ('Programming Preparation: 4–6 weeks prior', 'Research cultural activities', '', 'arrival', -28, 'none', null, 150),
  ('Programming Preparation: 4–6 weeks prior', 'Weekly itinerary update to NPA Program Officer', 'At least weekly, or as soon as a meeting falls through.', 'arrival', -35, 'none', null, 160),
  ('Programming Preparation: 4–6 weeks prior', 'Weekly itinerary update to NPA Program Officer', 'At least weekly, or as soon as a meeting falls through.', 'arrival', -28, 'none', null, 161),
  ('Programming Preparation: 4–6 weeks prior', 'Confirm meeting details', 'Location, point of contact, how to get to the meeting space.', 'arrival', -21, 'none', null, 170),
  ('Programming Preparation: 4–6 weeks prior', 'Weekly itinerary update to NPA Program Officer', 'At least weekly, or as soon as a meeting falls through.', 'arrival', -21, 'none', null, 171),
  ('Programming Preparation: 4–6 weeks prior', 'Send hotel confirmation numbers to DC', '', 'arrival', -21, 'none', null, 180),
  ('Arrival Preparation: 1–2 weeks prior', 'Weekly itinerary update to NPA Program Officer', 'At least weekly, or as soon as a meeting falls through.', 'arrival', -14, 'none', null, 205),
  ('Arrival Preparation: 1–2 weeks prior', 'Upon US arrival of group: collect media consent, flight info, dietary info', 'Record in the Participants tab.', 'arrival', -14, 'none', null, 210),
  ('Arrival Preparation: 1–2 weeks prior', 'Email home hospitality hosts: visitor bios, day/time, dietary info', '2 weeks prior, for home hospitality & homestays.', 'arrival', -14, 'home_hospitality', 'hh_host_details', 220),
  ('Arrival Preparation: 1–2 weeks prior', 'Have 1 additional staff member review draft itinerary', '', 'arrival', -10, 'none', null, 230),
  ('Arrival Preparation: 1–2 weeks prior', 'Confirm hotel reservation confirmation numbers and send flight arrival time to KC hotel', '', 'arrival', -10, 'none', null, 240),
  ('Arrival Preparation: 1–2 weeks prior', 'Staff conversation on media and video plan for this group', '', 'arrival', -10, 'none', null, 250),
  ('Arrival Preparation: 1–2 weeks prior', 'Cross-reference hotel confirmation list and final itinerary', '', 'arrival', -7, 'none', null, 260),
  ('Arrival Preparation: 1–2 weeks prior', 'Create packet labels on SharePoint (no printing)', '', 'arrival', -7, 'none', null, 270),
  ('Arrival Preparation: 1–2 weeks prior', 'Weekly itinerary update to NPA Program Officer', 'At least weekly, or as soon as a meeting falls through.', 'arrival', -7, 'none', null, 275),
  ('3 Days Before Arrival', 'Send NPA Program Officer final itinerary for review', 'OIV is required to return an edited itinerary to CBMs 24 hours prior to group arrival in KC.', 'arrival', -3, 'none', null, 310),
  ('Arrival & Program: 1–2 days prior', 'Create packets', 'Itinerary, KC brochures, GTKC social media card, evaluations, medical providers.', 'arrival', -2, 'none', null, 410),
  ('Arrival & Program: 1–2 days prior', 'IL packets: stamped envelopes', '', 'arrival', -2, 'none', null, 420),
  ('Arrival & Program: 1–2 days prior', 'Final email to home hospitality hosts', 'Biographies, dietary restrictions, OIV-approved itinerary, confirm address & time, arrival time.', 'arrival', -1, 'home_hospitality', 'hh_host_details', 430),
  ('Arrival & Program: 1–2 days prior', 'LinkedIn post', 'We can''t wait to welcome this group meeting with @resources @resource organization contacts.', 'arrival', -1, 'none', null, 440),
  ('Arrival & Program: 1–2 days prior', 'Send OIV-approved itinerary / final confirmations', 'To Agenda USA, interpreters, and meeting partners.', 'arrival', -1, 'none', null, 450),
  ('Arrival & Program: 1–2 days prior', 'Drop off packets at hotel', 'Check with front desk who is on the list; pre-key if possible.', 'arrival', 0, 'none', null, 460),
  ('Post-Program: Within 3 days of departure', 'Thank-you notes & emails to meeting partners with feedback survey', 'cc President & CEO.', 'departure', 3, 'none', 'partner_thanks', 510),
  ('Post-Program: Within 3 days of departure', 'Thank-you notes & emails to home hospitality hosts with feedback survey', 'cc President & CEO.', 'departure', 3, 'home_hospitality', 'hh_thanks', 520),
  ('Post-Program: Within 3 days of departure', 'Statistics: Salesforce and SharePoint Excel', '', 'departure', 3, 'none', null, 530),
  ('Post-Program: Within 3 days of departure', 'Thank-you email to NPA; send additional invoices if needed', '', 'departure', 3, 'none', null, 540),
  ('Post-Program: Within 3 days of departure', 'Thank liaison and request pictures', '', 'departure', 3, 'none', null, 550),
  ('Post-Program: Within 3 days of departure', 'Photos in SharePoint', 'Sub-folders per partner; sort pictures by partner meeting; rename to include visitor and resource partner names. Do not add pictures of visitors without media consent.', 'departure', 3, 'none', null, 560)
) as t(phase, title, details, anchor, offset_days, requires, email_key, sort);

insert into task_templates (program_type_id, phase, title, details, anchor, offset_days, requires, email_key, sort)
select (select id from program_types where name = 'Open World'), phase, title, details, anchor, offset_days, requires, email_key, sort
from task_templates where program_type_id = (select id from program_types where name = 'IVLP');
