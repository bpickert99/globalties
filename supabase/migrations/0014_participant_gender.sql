-- Shown as a marker when placing visitors with home hospitality hosts and host families.
alter table participants add column gender text not null default '' check (gender in ('', 'female', 'male'));
