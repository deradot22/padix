alter table users add column if not exists gender varchar(1);
comment on column users.gender is 'M or F for tournaments';
