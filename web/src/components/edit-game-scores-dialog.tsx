import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { api, EventDetails, Match, Round } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalScrollArea } from "@/components/ui/modal-scroll-area";
import { Dict, useI18n } from "@/lib/i18n";

const TR = {
  "scores.loadError": { ru: "Ошибка загрузки события", en: "Failed to load event" },
  "scores.saveError": { ru: "Ошибка сохранения счёта", en: "Failed to save score" },
  "scores.close": { ru: "Закрыть", en: "Close" },
  "scores.editTitle": { ru: "Редактирование счёта", en: "Edit score" },
  "scores.viewTitle": { ru: "Счёт игры", en: "Game score" },
  "scores.loading": { ru: "Загрузка...", en: "Loading..." },
  "scores.onlyOrganizer": {
    ru: "Изменить счёт может только организатор игры.",
    en: "Only the game organizer can edit the score.",
  },
  "scores.round": { ru: "Раунд {n}", en: "Round {n}" },
  "scores.court": { ru: "Корт {n}", en: "Court {n}" },
  "scores.teamA": { ru: "Команда A", en: "Team A" },
  "scores.teamB": { ru: "Команда B", en: "Team B" },
  "scores.set": { ru: "Сет {n}", en: "Set {n}" },
  "scores.gamesA": { ru: "Геймы A", en: "Games A" },
  "scores.gamesB": { ru: "Геймы B", en: "Games B" },
  "scores.pointsA": { ru: "Точки Team A", en: "Team A points" },
  "scores.pointsB": { ru: "Точки Team B", en: "Team B points" },
  "scores.cancel": { ru: "Отмена", en: "Cancel" },
  "scores.saving": { ru: "Сохранение...", en: "Saving..." },
  "scores.save": { ru: "Сохранить", en: "Save" },
} satisfies Dict;

// Значения держим строками, чтобы поле можно было очистить (пусто), а не залипало на 0,
// и чтобы не появлялись ведущие нули («055»). В число парсим только при сохранении.
type ScoreMap = Record<string, { teamAPoints: string; teamBPoints: string }>;

/** Чистим ввод: только цифры, без ведущих нулей (но одиночный «0» и пустую строку разрешаем). */
function sanitizeScore(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}
type FlatMatch = Match & { roundNumber: number };

// Сплющиваем раунды → матчи, протаскивая номер раунда и корт.
// Сортировка по раунду возрастающая, внутри раунда — по корту, чтобы порядок в модалке
// совпадал с тем, как игры проходили (раунд 1 сверху).
function flattenMatches(data: EventDetails | null): FlatMatch[] {
  return (data?.rounds ?? [])
    .slice()
    .sort((a: Round, b: Round) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0))
    .flatMap((r: Round) =>
      (r.matches ?? [])
        .slice()
        .sort((m1: Match, m2: Match) => (m1.courtNumber ?? 0) - (m2.courtNumber ?? 0))
        .map((m: Match): FlatMatch => ({ ...m, roundNumber: r.roundNumber })),
    );
}

/**
 * Единая форма редактирования счёта (используется и на странице эвента, и в истории игр профиля).
 * Править счёт может только организатор — для остальных форма открывается в режиме «только чтение».
 */
export function EditGameScoresDialog(props: {
  eventId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useI18n(TR);
  const [eventData, setEventData] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<ScoreMap>({});
  const originalScoresRef = useRef<ScoreMap>({});
  // SETS: matchId → массив геймов по сетам (строки, чтобы поле можно было очистить).
  const [setsMap, setSetsMap] = useState<Record<string, { a: string; b: string }[]>>({});
  const originalSetsRef = useRef<Record<string, { a: string; b: string }[]>>({});

  const isAuthor = eventData?.isAuthor ?? false;
  const canEdit = isAuthor && !saving;
  const isSets = eventData?.event?.scoringMode === "SETS";
  const setsPerMatch = eventData?.event?.setsPerMatch ?? 1;

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getEventDetails(props.eventId);
        setEventData(data);
        const sets = data.event?.scoringMode === "SETS";
        const perMatch = data.event?.setsPerMatch ?? 1;
        const initialScores: ScoreMap = {};
        const initialSets: Record<string, { a: string; b: string }[]> = {};
        flattenMatches(data).forEach((m) => {
          const score = m.score?.points;
          initialScores[m.id] = {
            teamAPoints: String(score?.teamAPoints ?? 0),
            teamBPoints: String(score?.teamBPoints ?? 0),
          };
          if (sets) {
            const existing = m.score?.sets ?? [];
            initialSets[m.id] = Array.from({ length: perMatch }, (_, i) => ({
              a: String(existing[i]?.teamAGames ?? 0),
              b: String(existing[i]?.teamBGames ?? 0),
            }));
          }
        });
        setScores(initialScores);
        originalScoresRef.current = initialScores;
        setSetsMap(initialSets);
        originalSetsRef.current = JSON.parse(JSON.stringify(initialSets));
      } catch (e: any) {
        setError(e?.message ?? t("scores.loadError"));
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t меняется только со сменой языка, перезагрузка не нужна
  }, [props.eventId]);

  const handleSave = async () => {
    if (!isAuthor) return;
    try {
      setSaving(true);
      setError(null);
      const matches = flattenMatches(eventData);
      for (const match of matches) {
        if (isSets) {
          const cur = setsMap[match.id];
          if (!cur) continue;
          const orig = originalSetsRef.current[match.id];
          const changed = !orig || cur.some((s, i) => s.a !== orig[i]?.a || s.b !== orig[i]?.b);
          if (changed) {
            const payload = cur.map((s) => ({ teamAGames: parseInt(s.a || "0", 10), teamBGames: parseInt(s.b || "0", 10) }));
            await api.submitSetsScore(match.id, payload);
          }
          continue;
        }
        const newScore = scores[match.id];
        const originalScore = originalScoresRef.current[match.id];
        if (!newScore) continue;

        // Пустое поле трактуем как 0. Парсим строки в числа для отправки и сравнения.
        const a = parseInt(newScore.teamAPoints || "0", 10);
        const b = parseInt(newScore.teamBPoints || "0", 10);
        const oa = parseInt(originalScore?.teamAPoints || "0", 10);
        const ob = parseInt(originalScore?.teamBPoints || "0", 10);

        // Отправляем только реально изменённые матчи.
        if (a !== oa || b !== ob) {
          const points = { teamAPoints: a, teamBPoints: b };
          await api.saveDraftScore(match.id, points);
          await api.submitScore(match.id, points);
        }
      }
      props.onSave();
    } catch (e: any) {
      setError(e?.message ?? t("scores.saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (!eventData && !loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={props.onClose}>
        <div className="bg-card border border-border rounded-lg p-6 max-w-md" onClick={(e) => e.stopPropagation()}>
          <div className="text-red-500">{t("scores.loadError")}</div>
          <Button variant="outline" size="sm" className="mt-4 w-full" onClick={props.onClose}>
            {t("scores.close")}
          </Button>
        </div>
      </div>
    );
  }

  const matches = flattenMatches(eventData);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={props.onClose}>
      <ModalScrollArea
        className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="text-lg font-semibold">{isAuthor ? t("scores.editTitle") : t("scores.viewTitle")}</div>
          <Button variant="outline" size="sm" onClick={props.onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        {loading ? (
          <div className="text-center py-6 text-muted-foreground">{t("scores.loading")}</div>
        ) : (
          <>
            {!isAuthor && (
              <div className="mb-4 p-3 rounded-md bg-secondary/40 text-muted-foreground text-sm">
                {t("scores.onlyOrganizer")}
              </div>
            )}
            <div className="space-y-4">
              {matches.map((match) => (
                <div key={match.id} className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                    <span>{t("scores.round", { n: match.roundNumber ?? "—" })}</span>
                    {match.courtNumber != null && (
                      <>
                        <span className="text-border">·</span>
                        <span>{t("scores.court", { n: match.courtNumber })}</span>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium mb-1">{t("scores.teamA")}</div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        {match.teamA?.map((p) => p.name).join(" + ")}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium mb-1">{t("scores.teamB")}</div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        {match.teamB?.map((p) => p.name).join(" + ")}
                      </div>
                    </div>
                  </div>

                  {isSets ? (
                    <div className="space-y-2">
                      {Array.from({ length: setsPerMatch }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                          {setsPerMatch > 1 && <span className="w-12 text-xs text-muted-foreground">{t("scores.set", { n: i + 1 })}</span>}
                          <div className="flex-1">
                            {i === 0 && <label className="text-xs text-muted-foreground">{t("scores.gamesA")}</label>}
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={setsMap[match.id]?.[i]?.a ?? ""}
                              onChange={(e) =>
                                setSetsMap((prev) => {
                                  const arr = (prev[match.id] ?? Array.from({ length: setsPerMatch }, () => ({ a: "0", b: "0" }))).map((x) => ({ ...x }));
                                  arr[i] = { ...arr[i], a: sanitizeScore(e.target.value) };
                                  return { ...prev, [match.id]: arr };
                                })
                              }
                              disabled={!canEdit}
                            />
                          </div>
                          <div className="text-xl font-bold mt-5">:</div>
                          <div className="flex-1">
                            {i === 0 && <label className="text-xs text-muted-foreground">{t("scores.gamesB")}</label>}
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={setsMap[match.id]?.[i]?.b ?? ""}
                              onChange={(e) =>
                                setSetsMap((prev) => {
                                  const arr = (prev[match.id] ?? Array.from({ length: setsPerMatch }, () => ({ a: "0", b: "0" }))).map((x) => ({ ...x }));
                                  arr[i] = { ...arr[i], b: sanitizeScore(e.target.value) };
                                  return { ...prev, [match.id]: arr };
                                })
                              }
                              disabled={!canEdit}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground">{t("scores.pointsA")}</label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={scores[match.id]?.teamAPoints ?? ""}
                        onChange={(e) =>
                          setScores({
                            ...scores,
                            [match.id]: {
                              ...scores[match.id],
                              teamAPoints: sanitizeScore(e.target.value),
                            },
                          })
                        }
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="text-xl font-bold mt-5">:</div>
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground">{t("scores.pointsB")}</label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={scores[match.id]?.teamBPoints ?? ""}
                        onChange={(e) =>
                          setScores({
                            ...scores,
                            [match.id]: {
                              ...scores[match.id],
                              teamBPoints: sanitizeScore(e.target.value),
                            },
                          })
                        }
                        disabled={!canEdit}
                      />
                    </div>
                  </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-6">
              <Button variant="outline" onClick={props.onClose} disabled={saving} className="flex-1">
                {isAuthor ? t("scores.cancel") : t("scores.close")}
              </Button>
              {isAuthor && (
                <Button onClick={handleSave} disabled={saving} className="flex-1">
                  {saving ? t("scores.saving") : t("scores.save")}
                </Button>
              )}
            </div>
          </>
        )}
      </ModalScrollArea>
    </div>
  );
}
