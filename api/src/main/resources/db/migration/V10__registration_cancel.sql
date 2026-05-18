alter table registrations add column cancel_requested boolean not null default false;
alter table registrations add column cancel_approved boolean not null default false;
alter table registrations add column cancel_requested_at timestamp;

