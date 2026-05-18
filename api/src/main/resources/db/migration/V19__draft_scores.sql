create table if not exists match_draft_scores (
    id uuid primary key,
    match_id uuid not null unique,
    team_a_points int not null,
    team_b_points int not null,
    updated_at timestamptz not null default now()
);

create index if not exists idx_match_draft_scores_match_id on match_draft_scores(match_id);
