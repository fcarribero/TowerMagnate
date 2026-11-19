alter table towers add column play_token text;
alter table tower_snapshots add column state_gz bytea;
alter table tower_snapshots alter column state drop not null;
