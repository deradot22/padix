create table players (
  id uuid primary key,
  name varchar(200) not null unique,
  rating integer not null,
  games_played integer not null,
  created_at timestamp not null
);

create table events (
  id uuid primary key,
  title varchar(250) not null,
  event_date date not null,
  start_time time not null,
  format varchar(50) not null,
  status varchar(50) not null,
  courts_count integer not null,
  rounds_planned integer not null,
  created_at timestamp not null
);

create table registrations (
  id uuid primary key,
  event_id uuid not null,
  player_id uuid not null,
  status varchar(50) not null,
  created_at timestamp not null,
  constraint uk_registration unique (event_id, player_id)
);

create index idx_registrations_event on registrations(event_id);
create index idx_registrations_player on registrations(player_id);

create table rounds (
  id uuid primary key,
  event_id uuid not null,
  round_number integer not null,
  constraint uk_round unique (event_id, round_number)
);

create index idx_rounds_event on rounds(event_id);

create table matches (
  id uuid primary key,
  round_id uuid not null,
  court_number integer not null,
  team_a_p1 uuid not null,
  team_a_p2 uuid not null,
  team_b_p1 uuid not null,
  team_b_p2 uuid not null,
  status varchar(50) not null
);

create index idx_matches_round on matches(round_id);

create table match_scores (
  match_id uuid primary key,
  team_a_games integer not null,
  team_b_games integer not null
);

create table rating_changes (
  id uuid primary key,
  event_id uuid not null,
  player_id uuid not null,
  old_rating integer not null,
  delta integer not null,
  new_rating integer not null,
  created_at timestamp not null
);

create index idx_rating_changes_event on rating_changes(event_id);
create index idx_rating_changes_player on rating_changes(player_id);

