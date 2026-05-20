alter table events
    add column pairing_mode varchar(32) not null default 'ROUND_ROBIN';
