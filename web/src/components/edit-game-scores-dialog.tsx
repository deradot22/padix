import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { api, EventDetails, Match, Round } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalScrollArea } from "@/components/ui/modal-scroll-area";

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
  const [eventData, setEventData] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<ScoreMap>({});
  const originalScoresRef = useRef<ScoreMap>({});

  const isAuthor = eventData?.isAuthor ?? false;
  const canEdit = isAuthor && !saving;

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getEventDetails(props.eventId);
        setEventData(data);
        const initialScores: ScoreMap = {};
        flattenMatches(data).forEach((m) => {
          const score = m.score?.points;
          initialScores[m.id] = {
            teamAPoints: String(score?.teamAPoints ?? 0),
            teamBPoints: String(score?.teamBPoints ?? 0),
          };
        });
        setScores(initialScores);
        originalScoresRef.current = initialScores;
      } catch (e: any) {
        setError(e?.message ?? "Ошибка загрузки события");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [props.eventId]);

  const handleSave = async () => {
    if (!isAuthor) return;
    try {
      setSaving(true);
      setError(null);
      const matches = flattenMatches(eventData);
      for (const match of matches) {
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
      setError(e?.message ?? "Ошибка сохранения счёта");
    } finally {
      setSaving(false);
    }
  };

  if (!eventData && !loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={props.onClose}>
        <div className="bg-card border border-border rounded-lg p-6 max-w-md" onClick={(e) => e.stopPropagation()}>
          <div className="text-red-500">Ошибка загрузки события</div>
          <Button variant="outline" size="sm" className="mt-4 w-full" onClick={props.onClose}>
            Закрыть
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
          <div className="text-lg font-semibold">{isAuthor ? "Редактирование счёта" : "Счёт игры"}</div>
          <Button variant="outline" size="sm" onClick={props.onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        {loading ? (
          <div className="text-center py-6 text-muted-foreground">Загрузка...</div>
        ) : (
          <>
            {!isAuthor && (
              <div className="mb-4 p-3 rounded-md bg-secondary/40 text-muted-foreground text-sm">
                Изменить счёт может только организатор игры.
              </div>
            )}
            <div className="space-y-4">
              {matches.map((match) => (
                <div key={match.id} className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                    <span>Раунд {match.roundNumber ?? "—"}</span>
                    {match.courtNumber != null && (
                      <>
                        <span className="text-border">·</span>
                        <span>Корт {match.courtNumber}</span>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium mb-1">Команда A</div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        {match.teamA?.map((p) => p.name).join(" + ")}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium mb-1">Команда B</div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        {match.teamB?.map((p) => p.name).join(" + ")}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground">Точки Team A</label>
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
                      <label className="text-xs text-muted-foreground">Точки Team B</label>
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
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-6">
              <Button variant="outline" onClick={props.onClose} disabled={saving} className="flex-1">
                {isAuthor ? "Отмена" : "Закрыть"}
              </Button>
              {isAuthor && (
                <Button onClick={handleSave} disabled={saving} className="flex-1">
                  {saving ? "Сохранение..." : "Сохранить"}
                </Button>
              )}
            </div>
          </>
        )}
      </ModalScrollArea>
    </div>
  );
}
