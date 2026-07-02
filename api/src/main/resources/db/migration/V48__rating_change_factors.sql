-- Факторы расчёта рейтинга на момент матча.
-- Нужны, чтобы пересчёт эвента при правке счёта (recomputeFinishedEvent) воспроизводил
-- те же K-фактор / калибровочный множитель / нормировку, что и оригинальный finishEvent,
-- а не выводил их заново от текущего (уже изменившегося) состояния игрока.
-- NULL — записи, созданные до этой миграции (для них recompute использует fallback).
alter table rating_changes add column k_factor double precision;
alter table rating_changes add column calib_mult double precision;
alter table rating_changes add column norm_factor double precision;
