import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../lib/api";
import { Dict, useI18n } from "@/lib/i18n";

const TR = {
  "survey.title": { ru: "Тест: предварительный рейтинг", en: "Survey: preliminary rating" },
  "survey.intro": {
    ru: "Это обязательный шаг (один раз), чтобы подобрать стартовый рейтинг. Вопросы идут по одному.",
    en: "This is a required one-time step to set your starting rating. Questions come one at a time.",
  },
  "survey.loading": { ru: "Загрузка теста…", en: "Loading survey…" },
  "survey.step": { ru: "Шаг {n} из {total}", en: "Step {n} of {total}" },
  "survey.progress": { ru: "Прогресс: {p}%", en: "Progress: {p}%" },
  "survey.answered": { ru: "ответ выбран", en: "answer selected" },
  "survey.needAnswer": { ru: "нужно выбрать", en: "select an answer" },
  "survey.noQuestions": { ru: "Нет вопросов", en: "No questions" },
  "survey.back": { ru: "Назад", en: "Back" },
  "survey.next": { ru: "Далее", en: "Next" },
  "survey.saving": { ru: "Сохраняем…", en: "Saving…" },
  "survey.finish": { ru: "Завершить тест", en: "Finish survey" },
  "survey.answerAll": { ru: "Нужно ответить на все вопросы", en: "Please answer all the questions" },
  "survey.errLoad": { ru: "Не удалось загрузить тест", en: "Couldn't load the survey" },
  "survey.errGeneric": { ru: "Ошибка", en: "Error" },
} satisfies Dict;

export function V0SurveyPage(props: {
  me: any;
  onDone: (me: any) => void;
  onResult: (r: { rating: number; remaining: number }) => void;
}) {
  const nav = useNavigate();
  const me = props.me;
  const { t, lang } = useI18n(TR);
  const [def, setDef] = useState<any | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) nav("/login");
    else if (me.surveyCompleted) nav("/");
  }, [me, nav]);

  // Тексты вопросов живут на бэке (их же читает мобильное приложение), поэтому
  // при смене языка перезапрашиваем определение теста. Ответы не сбрасываем:
  // id вопросов и вариантов от языка не зависят.
  useEffect(() => {
    if (!me) return;
    api
      .getSurvey(lang)
      .then((d) => {
        setDef(d);
        setAnswers((prev) => {
          const initial: Record<string, string> = {};
          (d.questions ?? []).forEach((q: any) => {
            initial[q.id] = prev[q.id] ?? "";
          });
          return initial;
        });
      })
      .catch((e: any) => setError(e?.message ?? t("survey.errLoad")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, lang]);

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
        remaining: fresh.calibrationMatchesRemaining ?? 0,
      });
      nav("/profile");
    } catch (err: any) {
      setError(err?.message ?? t("survey.errGeneric"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("survey.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("survey.intro")}
        </p>
      </div>

      {!def ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">{t("survey.loading")}</div>
      ) : null}

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium">
            {t("survey.step", { n: Math.min(step + 1, Math.max(totalSteps, 1)), total: Math.max(totalSteps, 1) })}
          </div>
          <div className="text-sm text-muted-foreground">{t("survey.progress", { p: progress })}</div>
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
                  {answers[currentQuestion.id] ? t("survey.answered") : t("survey.needAnswer")}
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
            <div className="text-sm text-muted-foreground">{t("survey.noQuestions")}</div>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="h-11 rounded-md border border-border bg-transparent px-4 text-sm font-medium hover:bg-secondary transition-colors"
            onClick={back}
            disabled={loading || step === 0}
          >
            {t("survey.back")}
          </button>

          {step < totalSteps - 1 ? (
            <button
              type="button"
              className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              onClick={next}
              disabled={loading || !canNext}
            >
              {t("survey.next")}
            </button>
          ) : (
            <button
              className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              disabled={loading || !readyToSubmit}
            >
              {loading ? t("survey.saving") : t("survey.finish")}
            </button>
          )}
        </div>

        {step === totalSteps - 1 && def && !readyToSubmit ? (
          <div className="text-sm text-muted-foreground">{t("survey.answerAll")}</div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">{error}</div>
        ) : null}
      </form>
    </div>
  );
}
