alter table events add column scoring_mode varchar(50) not null default 'SETS';
alter table events add column points_per_player_per_match integer not null default 6;

