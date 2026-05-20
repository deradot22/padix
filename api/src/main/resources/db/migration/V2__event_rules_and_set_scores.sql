alter table events add column sets_per_match integer not null default 1;
alter table events add column games_per_set integer not null default 6;
alter table events add column tiebreak_enabled boolean not null default true;

drop table if exists match_scores;

create table match_set_scores (
  id uuid primary key,
  match_id uuid not null,
  set_number integer not null,
  team_a_games integer not null,
  team_b_games integer not null,
  constraint uk_match_set unique (match_id, set_number)
);

create index idx_match_set_scores_match on match_set_scores(match_id);

