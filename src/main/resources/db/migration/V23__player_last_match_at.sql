-- Дата последнего сыгранного матча — для алгоритма затухания (decay) рейтинга при бездействии.
-- NULL = игрок ещё не играл (или мы не знаем). Decay не применяется к NULL.
alter table players add column last_match_at timestamp;

-- Заполняем существующих игроков на основе даты последнего сыгранного эвента.
update players p set last_match_at = (
  select max(e.event_date)::timestamp
  from events e
  join rounds r on r.event_id = e.id
  join matches m on m.round_id = r.id
  where m.team_a_p1 = p.id
     or m.team_a_p2 = p.id
     or m.team_b_p1 = p.id
     or m.team_b_p2 = p.id
);

create index idx_players_last_match_at on players (last_match_at);
