import { useMemo, useState } from "react";
import { ANIMATIONS } from "../animations/registry";
import "../animations/anim.css";

type Direction = "up" | "down" | "flat";

const PRESETS: { id: Direction; label: string; delta: number }[] = [
  { id: "up", label: "Повышение +20", delta: 20 },
  { id: "down", label: "Понижение −20", delta: -20 },
  { id: "flat", label: "Без изменений", delta: 0 },
];

export function AnimationsPage() {
  const [previousRating, setPreviousRating] = useState(1500);
  const [delta, setDelta] = useState(20);
  const [animationId, setAnimationId] = useState<string>(ANIMATIONS[0].id);
  const [playKey, setPlayKey] = useState(0);

  const newRating = previousRating + delta;
  const animation = useMemo(
    () => ANIMATIONS.find((a) => a.id === animationId) ?? ANIMATIONS[0],
    [animationId],
  );
  const Component = animation.component;

  function replay() {
    setPlayKey((k) => k + 1);
  }

  function applyPreset(p: (typeof PRESETS)[number]) {
    setDelta(p.delta);
    setPlayKey((k) => k + 1);
  }

  return (
    <div>
      <div className="card">
        <h2>Превью анимации рейтинга</h2>
        <p className="muted small" style={{ marginTop: -8, marginBottom: 16 }}>
          Полигон для разработки. Выбери анимацию, задай дельту, нажми «Replay». Левое окно — мобильный
          вид (390×800), правое — десктопный (760×500). Анимация перезапускается на каждом Replay.
          Чтобы добавить свой вариант — создай файл в <span className="mono">src/animations/</span> и
          зарегистрируй в <span className="mono">registry.ts</span>.
        </p>

        <div className="row">
          <div className="field">
            <label>Анимация</label>
            <select value={animationId} onChange={(e) => setAnimationId(e.target.value)}>
              {ANIMATIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Старый рейтинг</label>
            <input
              type="number"
              value={previousRating}
              onChange={(e) => setPreviousRating(Number(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label>Дельта</label>
            <input
              type="number"
              value={delta}
              onChange={(e) => setDelta(Number(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label>Новый рейтинг (расчёт)</label>
            <input type="number" value={newRating} readOnly />
          </div>
          <button onClick={replay}>▶ Replay</button>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          {PRESETS.map((p) => (
            <button key={p.id} className="secondary" onClick={() => applyPreset(p)}>
              {p.label}
            </button>
          ))}
        </div>

        {animation.description && (
          <div className="muted small" style={{ marginTop: 12 }}>
            {animation.description}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Превью</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: 24,
            alignItems: "flex-start",
          }}
        >
          <Preview label="Mobile · 390 × 800" width={390} height={800}>
            <Component
              previousRating={previousRating}
              newRating={newRating}
              delta={delta}
              viewport="mobile"
              playKey={playKey}
              onClose={replay}
            />
          </Preview>
          <Preview label="Desktop · 100% × 500" width="auto" height={500}>
            <Component
              previousRating={previousRating}
              newRating={newRating}
              delta={delta}
              viewport="desktop"
              playKey={playKey}
              onClose={replay}
            />
          </Preview>
        </div>
      </div>
    </div>
  );
}

function Preview({
  label,
  width,
  height,
  children,
}: {
  label: string;
  width: number | "auto";
  height: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="muted small" style={{ marginBottom: 6, fontFamily: "ui-monospace, monospace" }}>
        {label}
      </div>
      <div
        style={{
          width: width === "auto" ? "100%" : width,
          height,
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
          /* фон самого padix (dark) — чтобы виджеты выглядели так же, как в проде */
          background: "oklch(0.12 0 0)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
