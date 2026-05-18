create table users (
  id uuid primary key,
  email varchar(250) not null unique,
  password_hash varchar(255) not null,
  player_id uuid not null unique,
  survey_completed boolean not null default false,
  created_at timestamp not null
);

create index idx_users_player on users(player_id);

