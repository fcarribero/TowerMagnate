-- A row with neither column cannot be loaded. None should exist; drop any so the check applies.
delete from tower_snapshots where state is null and state_gz is null;
alter table tower_snapshots add constraint tower_snapshots_has_state check (state is not null or state_gz is not null);
