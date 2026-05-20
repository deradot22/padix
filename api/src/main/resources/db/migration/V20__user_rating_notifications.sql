create table if not exists user_rating_notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    event_id uuid not null,
    new_rating int not null,
    created_at timestamptz not null default now(),
    seen_at timestamptz
);
create index if not exists idx_user_rating_notifications_user_id on user_rating_notifications(user_id);
create index if not exists idx_user_rating_notifications_user_unseen on user_rating_notifications(user_id) where seen_at is null;
