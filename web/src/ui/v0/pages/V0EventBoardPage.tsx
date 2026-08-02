import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Maximize, Minimize, Trophy } from "lucide-react";
import { api, EventDetails, Match, Round } from "../../../lib/api";
import { Dict, useI18n } from "@/lib/i18n";

const TR = {
  "board.loading": { ru: "Загрузка табло…", en: "Loading board…" },
  "board.notFound": { ru: "Игра не найдена или нет доступа.", en: "Game not found or access denied." },
  "board.round": { ru: "Раунд {n}", en: "Round {n}" },
  "board.roundOf": { ru: "Раунд {n} из {total}", en: "Round {n} of {total}" },
  "board.court": { ru: "Корт", en: "Court" },
  "board.waitingScore": { ru: "идёт игра", en: "playing" },
  "board.prevRound": { ru: "Раунд {n}:", en: "Round {n}:" },
  "board.finished": { ru: "Итоги", en: "Final results" },
  "board.tournament": { ru: "Турнир", en: "Tournament" },
  "board.fullscreen": { ru: "На весь экран", en: "Fullscreen" },
  "board.exitFullscreen": { ru: "Выйти из полноэкранного режима", en: "Exit fullscreen" },
  "board.noRounds": { ru: "Раунды ещё не созданы — ждём старта.", en: "No rounds yet — waiting for start." },
} satisfies Dict;

/** Счёт матча строкой: POINTS → "16:8", SETS → "6:4  7:5". null — счёта нет. */
function matchScore(m: Match): string | null {
  const s = m.score;
  if (!s) return null;
  if (s.mode === "POINTS" && s.points) return `${s.points.teamAPoints}:${s.points.teamBPoints}`;
  if (s.sets && s.sets.length > 0) return s.sets.map((x) => `${x.teamAGames}:${x.teamBGames}`).join("  ");
  return null;
}

function hasScore(m: Match): boolean {
  return matchScore(m) !== null;
}

/**
 * Табло для телевизора: /events/:eventId/board (открывается кнопкой «На ТВ»).
 * Показывает крупно, кто с кем играет в текущем раунде (по кортам) и счёт —
 * только противостояния, без таблицы лидеров. Обновляется само каждые 5 секунд,
 * пока организатор вводит счёт с телефона. Тёмная всегда, без шапки и навигации.
 */
export function V0EventBoardPage() {
  const { eventId } = useParams();
  const [data, setData] = useState<EventDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { t } = useI18n(TR);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const d = await api.getEventDetails(eventId);
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled && !data) setError(e?.message ?? "error");
      }
    };
    load();
    const id = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      (rootRef.current ?? document.documentElement).requestFullscreen().catch(() => {});
    }
  };

  const rounds: Round[] = data?.rounds ?? [];
  // Активный раунд: первый, где не все матчи со счётом; если все сыграны — последний.
  const activeRound = useMemo(() => {
    if (rounds.length === 0) return null;
    return rounds.find((r) => r.matches.some((m) => !hasScore(m))) ?? rounds[rounds.length - 1];
  }, [rounds]);
  const prevRounds = useMemo(() => {
    if (!activeRound) return [];
    return rounds.filter((r) => r.roundNumber < activeRound.roundNumber);
  }, [rounds, activeRound]);
  const finished = data?.event.status === "FINISHED";

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090f] p-8 text-2xl text-zinc-400">
        {t("board.notFound")}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090f] p-8 text-2xl text-zinc-400">
        {t("board.loading")}
      </div>
    );
  }

  const e = data.event;

  const teamNames = (team: Match["teamA"]) => team.map((p) => p.name);

  return (
    <div ref={rootRef} className="flex min-h-screen flex-col bg-[#09090f] px-[2.5vw] py-[2.5vh] text-white">
      {/* Шапка табло */}
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-[clamp(1.6rem,3.2vw,3.4rem)] font-bold leading-tight tracking-tight">
              {e.title}
            </h1>
            {e.kind === "TOURNAMENT" && (
              <span className="hidden shrink-0 items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[clamp(0.8rem,1.2vw,1.2rem)] font-medium text-emerald-300 sm:inline-flex">
                <Trophy className="h-[1em] w-[1em]" />
                {t("board.tournament")}
              </span>
            )}
          </div>
          <div className="mt-1 text-[clamp(1rem,1.6vw,1.6rem)] text-zinc-400">
            {finished
              ? t("board.finished")
              : activeRound
                ? t("board.roundOf", { n: activeRound.roundNumber, total: rounds.length })
                : t("board.noRounds")}
          </div>
        </div>
        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? t("board.exitFullscreen") : t("board.fullscreen")}
          aria-label={isFullscreen ? t("board.exitFullscreen") : t("board.fullscreen")}
          className="shrink-0 rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          {isFullscreen ? <Minimize className="h-6 w-6" /> : <Maximize className="h-6 w-6" />}
        </button>
      </div>

      {/* Основная зона: только матчи текущего раунда, на всю ширину экрана */}
      <div className="mt-[2.5vh] flex flex-1">
        <div className="flex flex-1 flex-col justify-center gap-[2vh]">
          {activeRound ? (
            activeRound.matches
              .slice()
              .sort((a, b) => a.courtNumber - b.courtNumber)
              .map((m) => {
                const score = matchScore(m);
                const [a1, a2] = teamNames(m.teamA);
                const [b1, b2] = teamNames(m.teamB);
                return (
                  <div
                    key={m.id}
                    className="rounded-3xl border border-zinc-800 bg-zinc-900/60 px-[2vw] py-[2.2vh] shadow-xl"
                  >
                    <div className="mb-[1vh] text-center text-[clamp(0.9rem,1.3vw,1.3rem)] font-medium uppercase tracking-widest text-zinc-500">
                      {m.courtName?.trim() ? m.courtName : `${t("board.court")} ${m.courtNumber}`}
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[1.5vw]">
                      <div className="text-right">
                        {[a1, a2].map((n, i) => (
                          <div
                            key={i}
                            className="truncate text-[clamp(1.3rem,2.6vw,2.8rem)] font-semibold leading-snug"
                          >
                            {n ?? ""}
                          </div>
                        ))}
                      </div>
                      <div className="px-[1vw] text-center">
                        {score ? (
                          <div className="whitespace-nowrap text-[clamp(2.2rem,5.5vw,6rem)] font-bold leading-none tabular-nums text-primary">
                            {score}
                          </div>
                        ) : (
                          <div className="text-[clamp(1.6rem,3.4vw,3.6rem)] font-bold leading-none text-zinc-600">
                            VS
                          </div>
                        )}
                        {!score && (
                          <div className="mt-2 text-[clamp(0.8rem,1.1vw,1.1rem)] uppercase tracking-widest text-zinc-600">
                            {t("board.waitingScore")}
                          </div>
                        )}
                      </div>
                      <div className="text-left">
                        {[b1, b2].map((n, i) => (
                          <div
                            key={i}
                            className="truncate text-[clamp(1.3rem,2.6vw,2.8rem)] font-semibold leading-snug"
                          >
                            {n ?? ""}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
          ) : (
            <div className="text-center text-[clamp(1.2rem,2vw,2rem)] text-zinc-500">{t("board.noRounds")}</div>
          )}

          {/* Прошлые раунды: компактная лента результатов */}
          {prevRounds.length > 0 && (
            <div className="mt-[1vh] space-y-1">
              {prevRounds
                .slice()
                .sort((a, b) => b.roundNumber - a.roundNumber)
                .slice(0, 3)
                .map((r) => (
                  <div key={r.id} className="text-[clamp(0.9rem,1.3vw,1.3rem)] text-zinc-500">
                    <span className="font-medium text-zinc-400">{t("board.prevRound", { n: r.roundNumber })}</span>{" "}
                    {r.matches
                      .slice()
                      .sort((a, b) => a.courtNumber - b.courtNumber)
                      .map((m) => matchScore(m) ?? "—")
                      .join("  ·  ")}
                  </div>
                ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
