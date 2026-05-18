create sequence if not exists user_public_id_seq start 100000000;

alter table users add column if not exists public_id bigint;
update users set public_id = nextval('user_public_id_seq') where public_id is null;
alter table users alter column public_id set not null;
create unique index if not exists ux_users_public_id on users(public_id);

create table if not exists friend_requests (
    id uuid primary key,
    from_user_id uuid not null,
    to_user_id uuid not null,
    status varchar(20) not null,
    created_at timestamp with time zone not null default now(),
    constraint fk_friend_requests_from_user foreign key (from_user_id) references users(id),
    constraint fk_friend_requests_to_user foreign key (to_user_id) references users(id)
);

create unique index if not exists ux_friend_requests_pair on friend_requests(from_user_id, to_user_id);

create table if not exists friends (
    id uuid primary key,
    user_id uuid not null,
    friend_user_id uuid not null,
    created_at timestamp with time zone not null default now(),
    constraint fk_friends_user foreign key (user_id) references users(id),
    constraint fk_friends_friend foreign key (friend_user_id) references users(id)
);

create unique index if not exists ux_friends_pair on friends(user_id, friend_user_id);

create table if not exists event_invites (
    id uuid primary key,
    event_id uuid not null,
    from_user_id uuid not null,
    to_user_id uuid not null,
    status varchar(20) not null,
    created_at timestamp with time zone not null default now(),
    constraint fk_event_invites_event foreign key (event_id) references events(id),
    constraint fk_event_invites_from_user foreign key (from_user_id) references users(id),
    constraint fk_event_invites_to_user foreign key (to_user_id) references users(id)
);

create unique index if not exists ux_event_invites_unique on event_invites(event_id, to_user_id);
