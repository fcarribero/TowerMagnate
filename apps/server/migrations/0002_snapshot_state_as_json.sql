alter table tower_snapshots
  alter column state type json using state::json,
  alter column state set compression lz4;
