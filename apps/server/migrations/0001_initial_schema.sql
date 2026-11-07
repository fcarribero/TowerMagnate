create table users (
  id bigint generated always as identity primary key,
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table sessions (
  token text primary key,
  user_id bigint not null references users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index sessions_user_id_idx on sessions (user_id);

create table towers (
  id bigint generated always as identity primary key,
  user_id bigint not null unique references users (id) on delete cascade,
  seed bigint not null,
  created_at timestamptz not null default now()
);

create table tower_snapshots (
  tower_id bigint not null references towers (id) on delete cascade,
  step bigint not null check (step >= 0),
  state jsonb not null,
  saved_at timestamptz not null default now(),
  primary key (tower_id, step)
);
