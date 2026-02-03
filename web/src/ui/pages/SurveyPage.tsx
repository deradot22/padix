import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";

export function SurveyPage(props: { me: any; onDone: (me: any) => void; onResult: (r: { rating: number; remaining: number }) => void }) {
  const nav = useNavigate();
  const me = props.me;
  const [def, setDef] = useState<any | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0); // 0..N-1 question index
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) nav("/login");
    // Если тест уже пройден и мы не показываем результат — уводим с /survey.
    // В момент завершения теста мы сначала показываем модалку, поэтому редиректим только если модалки нет.
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
          // no default answer
          initial[q.id] = "";
        });
        setAnswers(initial);
      })
      .catch((e: any) => setError(e?.message ?? "Не удалось загрузить тест"));
  }, [me]);

  const totalSteps = useMemo(() => {
    return (def?.questions ?? []).length;
  }, [def]);

  const progress = useMemo(() => {
    if (!def) return 0;
    if (totalSteps <= 1) return 0;
    return Math.round((step / (totalSteps - 1)) * 100);
  }, [def, step, totalSteps]);

  const questions: any[] = useMemo(() => def?.questions ?? [], [def]);
  const currentQuestion = useMemo(() => {
    return questions[step] ?? null;
  }, [questions, step]);

  const readyToSubmit = useMemo(() => {
    if (!def) return false;
    const qIds: string[] = (def.questions ?? []).map((q: any) => q.id);
    return qIds.every((id) => !!answers[id]);
  }, [answers, def]);

  const canNext = useMemo(() => {
    if (!def) return false;
    if (!currentQuestion) return false;
    return !!answers[currentQuestion.id];
  }, [answers, currentQuestion, def]);

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
      const payload = {
        version: def.version,
        answers,
      };
      await api.submitSurvey(payload);
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
    <>
      <div className="section-title">Тест: предварительный рейтинг</div>
      <div className="muted" style={{ marginBottom: 14 }}>
        Это обязательный шаг (один раз), чтобы подобрать тебе стартовый рейтинг. Вопросы будут идти по одному.
      </div>

      {!def ? (
        <div className="card muted">Загрузка теста…</div>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="split">
          <h2>Шаг {Math.min(step + 1, totalSteps)} из {Math.max(totalSteps, 1)}</h2>
          <span className="pill">Прогресс: {progress}%</span>
        </div>
        <div className="muted" style={{ marginTop: 10 }}>
          Выбери один вариант ответа и нажми «Далее».
        </div>
      </div>

      <form onSubmit={onSubmit}>
        <div className="card" style={{ marginBottom: 16 }}>
          {currentQuestion ? (
            <>
              <div className="split">
                <h2>{currentQuestion.title}</h2>
                <span className="pill">{answers[currentQuestion.id] ? "ответ выбран" : "нужно выбрать"}</span>
              </div>
              <div className="row stack" style={{ marginTop: 12 }}>
                {currentQuestion.options.map((o: any) => (
                  <button
                    type="button"
                    key={o.id}
                    className={answers[currentQuestion.id] === o.id ? "btn primary" : "btn"}
                    onClick={() => setAnswers((prev) => ({ ...prev, [currentQuestion.id]: o.id }))}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="muted">Нет вопросов</div>
          )}
        </div>

        <div className="row stack">
          <button type="button" className="btn" onClick={back} disabled={loading || step === 0}>
            Назад
          </button>

          {step < totalSteps - 1 ? (
            <button type="button" className="btn primary" onClick={next} disabled={loading || !canNext}>
              Далее
            </button>
          ) : (
            <button className="btn primary" disabled={loading || !readyToSubmit}>
              {loading ? "Сохраняем…" : "Завершить тест"}
            </button>
          )}

          {step === totalSteps - 1 && !readyToSubmit ? (
            <span className="muted">Нужно выбрать уровень и ответить на все вопросы</span>
          ) : null}
        </div>
        {error ? (
          <div style={{ marginTop: 12 }} className="error">
            {error}
          </div>
        ) : null}
      </form>
    </>
  );
}

