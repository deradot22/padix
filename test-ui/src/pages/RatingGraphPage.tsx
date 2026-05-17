import { useMemo, useState } from "react";
import { Point, RatingGraph } from "../components/RatingGraph";

type Shape = "uptrend" | "downtrend" | "bullbear" | "wave" | "flat" | "random" | "spikes";

interface Cfg {
  shape: Shape;
  count: number;
  startRating: number;
  amplitude: number;
  noise: number;
  spanDays: number;
  seed: number;
  /** true → даты кластерами (паузы между матчами разные).
      В режиме «по времени» график выглядит иначе, чем «по матчам». */
  clusterDates: boolean;
}

const DEFAULT: Cfg = {
  shape: "uptrend",
  count: 30,
  startRating: 1500,
  amplitude: 200,
  noise: 30,
  spanDays: 30,
  seed: 1,
  clusterDates: false,
};

// Мини-генератор псевдослучайных чисел — детерминированный по seed
function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function generate(cfg: Cfg): Point[] {
  const rng = makeRng(cfg.seed);
  const now = Date.now();
  const out: Point[] = [];

  // Заранее сгенерируем «прогресс по времени» для каждой точки 0..1.
  // Равномерно — если clusterDates выключен; кластерами — если включён.
  const timeProgress: number[] = [];
  if (!cfg.clusterDates || cfg.count < 4) {
    for (let i = 0; i < cfg.count; i++) {
      timeProgress.push(cfg.count === 1 ? 0 : i / (cfg.count - 1));
    }
  } else {
    // Несколько случайных «точек кластеризации» — 3-5 пачек матчей
    // вокруг которых группируются даты, между ними длинные паузы.
    const clusters = 3 + Math.floor(rng() * 3); // 3..5
    const centers = Array.from({ length: clusters }, () => rng()); // 0..1
    centers.sort((a, b) => a - b);
    const rawTimes: number[] = [];
    for (let i = 0; i < cfg.count; i++) {
      const c = centers[Math.floor(rng() * clusters)];
      const spread = 0.04; // ±4% разброс внутри кластера
      const t = Math.max(0, Math.min(1, c + (rng() - 0.5) * 2 * spread));
      rawTimes.push(t);
    }
    rawTimes.sort((a, b) => a - b);
    // Растянем до диапазона [0..1] чтобы крайние точки были на границах
    const lo = rawTimes[0];
    const hi = rawTimes[rawTimes.length - 1] || 1;
    const range = hi - lo || 1;
    for (const t of rawTimes) timeProgress.push((t - lo) / range);
  }

  for (let i = 0; i < cfg.count; i++) {
    // t для shape — позиция в последовательности матчей (равномерная)
    const tShape = cfg.count === 1 ? 0 : i / (cfg.count - 1);
    const tTime = timeProgress[i];
    let base = 0;
    switch (cfg.shape) {
      case "uptrend":
        base = tShape * cfg.amplitude;
        break;
      case "downtrend":
        base = -tShape * cfg.amplitude;
        break;
      case "bullbear":
        base = (tShape < 0.5 ? tShape * 2 : (1 - tShape) * 2) * cfg.amplitude;
        break;
      case "wave":
        base = Math.sin(tShape * Math.PI * 3) * cfg.amplitude * 0.5;
        break;
      case "flat":
        base = 0;
        break;
      case "random":
        base = (rng() - 0.5) * cfg.amplitude;
        break;
      case "spikes":
        base = rng() < 0.2 ? (rng() - 0.5) * cfg.amplitude * 2 : 0;
        break;
    }
    const noise = (rng() - 0.5) * 2 * cfg.noise;
    const rating = Math.round(cfg.startRating + base + noise);
    // Дата: от (now - spanDays) до now, по tTime
    const date = new Date(now - (1 - tTime) * cfg.spanDays * 86400_000);
    out.push({ date: date.toISOString(), rating: Math.max(0, rating) });
  }
  return out;
}

export function RatingGraphPage() {
  const [cfg, setCfg] = useState<Cfg>(DEFAULT);
  const points = useMemo(() => generate(cfg), [cfg]);

  function update<K extends keyof Cfg>(key: K, value: Cfg[K]) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  return (
    <div>
      <div className="card">
        <h2>Превью графика рейтинга</h2>
        <p className="muted small" style={{ marginTop: -8, marginBottom: 16 }}>
          Тот же компонент <span className="mono">RatingGraph</span>, что и в прод-падиксе
          (на странице профиля). Палитра, LTTB до 60 точек, 2 режима оси, переключатель периодов,
          подписи только при ≤10 точках — всё по карте компонента из <span className="mono">memory/rating_graph.md</span>.
          Период по умолчанию «30д» (как в проде, не персистится), режим оси персистится в localStorage.
          Слева — мобильный (408×244), справа — десктопный (520×140).
        </p>

        <div className="row">
          <div className="field">
            <label>Форма траектории</label>
            <select value={cfg.shape} onChange={(e) => update("shape", e.target.value as Shape)}>
              <option value="uptrend">Рост (uptrend)</option>
              <option value="downtrend">Падение (downtrend)</option>
              <option value="bullbear">Рост → падение (bull-bear)</option>
              <option value="wave">Волна (sine)</option>
              <option value="flat">Плоский</option>
              <option value="random">Чистый шум</option>
              <option value="spikes">Редкие выбросы</option>
            </select>
          </div>
          <div className="field">
            <label>Кол-во точек</label>
            <input
              type="number"
              min={2}
              max={500}
              value={cfg.count}
              onChange={(e) => update("count", Math.max(2, Math.min(500, Number(e.target.value) || 2)))}
            />
          </div>
          <div className="field">
            <label>Стартовый рейтинг</label>
            <input
              type="number"
              value={cfg.startRating}
              onChange={(e) => update("startRating", Number(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label>Амплитуда</label>
            <input
              type="number"
              min={0}
              value={cfg.amplitude}
              onChange={(e) => update("amplitude", Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div className="field">
            <label>Шум</label>
            <input
              type="number"
              min={0}
              value={cfg.noise}
              onChange={(e) => update("noise", Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div className="field">
            <label>Период (дни)</label>
            <input
              type="number"
              min={1}
              value={cfg.spanDays}
              onChange={(e) => update("spanDays", Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="field">
            <label>Seed</label>
            <input
              type="number"
              value={cfg.seed}
              onChange={(e) => update("seed", Number(e.target.value) || 1)}
            />
          </div>
          <button className="secondary" onClick={() => update("seed", Math.floor(Math.random() * 100000))}>
            🎲 Новый seed
          </button>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={cfg.clusterDates}
              onChange={(e) => update("clusterDates", e.target.checked)}
            />
            Кластеризовать даты во времени (видно разницу режимов ⇄ оси)
          </label>
        </div>

        <div className="muted small" style={{ marginTop: 12 }}>
          Сгенерировано точек: <span className="mono">{points.length}</span>. Диапазон рейтинга:{" "}
          <span className="mono">
            {Math.min(...points.map((p) => p.rating))}–{Math.max(...points.map((p) => p.rating))}
          </span>
          . Внутри компонента после LTTB остаётся максимум 60 точек.
        </div>
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
          <Preview label="Mobile · 408 × 244" width={390} height="auto">
            <RatingGraph points={points} viewport="mobile" />
          </Preview>
          <Preview label="Desktop · 520 × 140" width="auto" height="auto">
            <RatingGraph points={points} viewport="desktop" />
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
  height: number | "auto";
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
          height: height === "auto" ? "auto" : height,
          background: "oklch(0.12 0 0)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 16,
        }}
      >
        {children}
      </div>
    </div>
  );
}
