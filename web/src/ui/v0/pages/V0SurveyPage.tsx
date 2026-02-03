import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../lib/api";

export function V0SurveyPage(props: {
  me: any;
  onDone: (me: any) => void;
  onResult: (r: { rating: number; remaining: number }) => void;
}) {
  const nav = useNavigate();
  const me = props.me;
  const [def, setDef] = useState<any | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) nav("/login");
    else if (me.surveyCompleted) nav("/");
  }, [me, nav]);

  useEffect(() => {
    if (!me) return;
    api
      .getSurvey()
      .then((d) => {
        setDef(d);
        const initial: Record<string, string> = {};
        (d.questions ?? []).forEach((q: any) => {
          initial[q.id] = "";
        });
        setAnswers(initial);
      })
      .catch((e: any) => setError(e?.message ?? "Не удалось загрузить тест"));
  }, [me]);

  const questions: any[] = useMemo(() => def?.questions ?? [], [def]);
  const totalSteps = questions.length;
  const currentQuestion = questions[step] ?? null;

  const progress = useMemo(() => {
    if (!totalSteps || totalSteps <= 1) return 0;
    return Math.round((step / (totalSteps - 1)) * 100);
  }, [step, totalSteps]);

  const canNext = useMemo(() => {
    if (!currentQuestion) return false;
    return !!answers[currentQuestion.id];
  }, [answers, currentQuestion]);

  const readyToSubmit = useMemo(() => {
    if (!def) return false;
    const qIds: string[] = (def.questions ?? []).map((q: any) => q.id);
    return qIds.every((id) => !!answers[id]);
  }, [answers, def]);

  function next() {
    if (!canNext) return;
    setStep((s) => Math.min(totalSteps - 1, s + 1));
  }

  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!def) return;
    setLoading(true);
    setError(null);
    try {
      await api.submitSurvey({ version: def.version, answers });
      const fresh = await api.me();
      props.onDone(fresh);
      props.onResult({
        rating: fresh.rating,
        remaining: fresh.calibrationEventsRemaining ?? 0,
      });
      nav("/profile");
    } catch (err: any) {
      setError(err?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Тест: предварительный рейтинг</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Это обязательный шаг (один раз), чтобы подобрать стартовый рейтинг. Вопросы идут по одному.
        </p>
      </div>

      {!def ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Загрузка теста…</div>
      ) : null}

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium">
            Шаг {Math.min(step + 1, Math.max(totalSteps, 1))} из {Math.max(totalSteps, 1)}
          </div>
          <div className="text-sm text-muted-foreground">Прогресс: {progress}%</div>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-6">
          {currentQuestion ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="text-lg font-semibold">{currentQuestion.title}</div>
                <div className="text-xs text-muted-foreground">
                  {answers[currentQuestion.id] ? "ответ выбран" : "нужно выбрать"}
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                {currentQuestion.options.map((o: any) => {
                  const active = answers[currentQuestion.id] === o.id;
                  return (
                    <button
                      type="button"
                      key={o.id}
                      className={
                        active
                          ? "h-11 rounded-md bg-primary px-4 text-left text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                          : "h-11 rounded-md border border-border bg-secondary/40 px-4 text-left text-sm font-medium hover:bg-secondary transition-colors"
                      }
                      onClick={() => setAnswers((prev) => ({ ...prev, [currentQuestion.id]: o.id }))}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Нет вопросов</div>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="h-11 rounded-md border border-border bg-transparent px-4 text-sm font-medium hover:bg-secondary transition-colors"
            onClick={back}
            disabled={loading || step === 0}
          >
            Назад
          </button>

          {step < totalSteps - 1 ? (
            <button
              type="button"
              className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              onClick={next}
              disabled={loading || !canNext}
            >
              Далее
            </button>
          ) : (
            <button
              className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              disabled={loading || !readyToSubmit}
            >
              {loading ? "Сохраняем…" : "Завершить тест"}
            </button>
          )}
        </div>

        {step === totalSteps - 1 && def && !readyToSubmit ? (
          <div className="text-sm text-muted-foreground">Нужно ответить на все вопросы</div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">{error}</div>
        ) : null}
      </form>
    </div>
  );
}

