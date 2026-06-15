import { useMemo } from "react";
import { Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Round } from "../lib/api";

export type LeaderRow = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  /** Сырая сумма очков игрока за все матчи (как в классическом американо). */
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** Очки, нормализованные по числу матчей: points * (avgMatches / played). */
  norm: number;
};

/**
 * Считает таблицу лидеров американо из раундов.
 *
 * Нормализация (`norm`) повторяет ту же поправку на наигранность, что бэк применяет
 * к рейтингу (EventService.finishEvent): при 5 игроках кто-то отдыхает чаще и просто
 * физически недобирает очков — норма это выравнивает, не трогая очковую природу формата.
 * `normalized` = true только когда у игроков реально разное число сыгранных матчей.
 */
export function buildLeaderboard(rounds: Round[]): { rows: LeaderRow[]; normalized: boolean } {
  const totals = new Map<string, LeaderRow>();

  rounds.flatMap((r) => r.matches).forEach((m) => {
    const score = m.score;
    if (!score || score.mode !== "POINTS") return;
    const pointsA = score.points?.teamAPoints ?? 0;
    const pointsB = score.points?.teamBPoints ?? 0;

    const credit = (
      p: { id?: string | null; name: string; avatarUrl?: string | null },
      mine: number,
      theirs: number,
    ) => {
      if (!p?.id) return;
      const row =
        totals.get(p.id) ??
        { id: p.id, name: p.name, avatarUrl: p.avatarUrl, points: 0, played: 0, wins: 0, draws: 0, losses: 0, norm: 0 };
      row.points += mine;
      row.played += 1;
      if (mine > theirs) row.wins += 1;
      else if (mine === theirs) row.draws += 1;
      else row.losses += 1;
      totals.set(p.id, row);
    };

    m.teamA.forEach((p) => credit(p, pointsA, pointsB));
    m.teamB.forEach((p) => credit(p, pointsB, pointsA));
  });

  const rows = Array.from(totals.values());
  if (rows.length > 0) {
    const avgMatches = rows.reduce((s, r) => s + r.played, 0) / rows.length;
    rows.forEach((r) => {
      r.norm = r.played > 0 ? r.points * (avgMatches / r.played) : r.points;
    });
  }
  rows.sort((a, b) => b.norm - a.norm || b.points - a.points || a.name.localeCompare(b.name));

  const played = rows.map((r) => r.played);
  const normalized = rows.length >= 2 && Math.min(...played) !== Math.max(...played);
  return { rows, normalized };
}

const medalClass = (rank: number) =>
  rank === 1
    ? "bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30"
    : rank === 2
    ? "bg-slate-400/15 text-slate-300 ring-1 ring-slate-400/30"
    : rank === 3
    ? "bg-orange-600/15 text-orange-400 ring-1 ring-orange-600/30"
    : "bg-secondary/60 text-muted-foreground";

/**
 * Таблица лидеров игры. Места — по нормализованным очкам, сырая сумма показана рядом
 * (когда наигранность неравная). В-Н-П — справочный контекст, на место не влияет.
 * Используется и на странице игры, и в истории матчей профиля.
 */
export function EventLeaderboard({ rounds, className }: { rounds: Round[]; className?: string }) {
  const { rows, normalized } = useMemo(() => buildLeaderboard(rounds), [rounds]);

  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground">Нет данных по очкам.</div>;
  }

  return (
    <div className={className}>
      {normalized && (
        <p className="mb-2 flex items-start gap-1.5 text-left text-xs text-muted-foreground">
          <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Игроки сыграли разное число матчей — поэтому места по{" "}
            <b className="font-medium text-foreground">среднему счёту за матч</b> (честно при разной
            наигранности). Всего очков — рядом.
          </span>
        </p>
      )}

      <ul className="space-y-1.5">
        {rows.map((row, i) => {
          const rank = i + 1;
          const perMatch = row.played > 0 ? row.points / row.played : 0;
          return (
            <li
              key={row.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5",
                rank <= 3 ? "border-border/80 bg-secondary/50" : "border-border/50 bg-secondary/25",
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                  medalClass(rank),
                )}
                aria-hidden="true"
              >
                {rank}
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary/60 text-xs font-semibold">
                {row.avatarUrl ? (
                  <img src={row.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  row.name?.[0]?.toUpperCase() ?? "?"
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium leading-tight">{row.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-none text-muted-foreground">
                  <span className="tabular-nums">{row.played} матч.</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className="tabular-nums"
                    aria-label={`${row.wins} побед, ${row.draws} ничьих, ${row.losses} поражений`}
                  >
                    <span className="font-semibold text-emerald-500">{row.wins}</span>
                    <span className="opacity-40">–</span>
                    <span className="font-semibold text-muted-foreground">{row.draws}</span>
                    <span className="opacity-40">–</span>
                    <span className="font-semibold text-red-500">{row.losses}</span>
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-lg font-bold leading-none tabular-nums">
                  {perMatch.toFixed(1)}
                  <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">/матч</span>
                </div>
                <div className="mt-1 text-[11px] leading-none text-muted-foreground tabular-nums">
                  {row.points} очк.
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          победы
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/60" aria-hidden="true" />
          ничьи
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
          поражения
        </span>
      </div>
    </div>
  );
}
