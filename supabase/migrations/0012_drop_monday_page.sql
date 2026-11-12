-- The Monday Meeting page was removed; checklist steps no longer point to it.
update task_templates set details = '' where details = 'See the Monday Meeting page.';
update tasks set details = '' where details = 'See the Monday Meeting page.';
