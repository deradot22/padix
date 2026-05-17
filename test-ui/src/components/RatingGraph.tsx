/**
 * RatingGraph — копия web/src/components/rating-graph.tsx без Tailwind.
 * Логика 1:1 с прод-версией (см. карту компонента в memory/rating_graph.md).
 *
 * Прод-поведение, которое тут воспроизводится:
 *  - period дефолт "30d", **не персистится** (by design)
 *  - mode персистится в localStorage (ключ свой, чтобы не конфликтовать с прод-приложением)
 *  - LTTB downsample при > 60 точек
 *  - Подписи над точками только если sampled.length <= 10
 *  - Адаптив: 408×244 mobile / 520×140 desktop
 *
 * Отличие от прода:
 *  - viewport prop вместо `md:hidden / hidden md:block` (test-ui рендерит обе
 *    версии бок-о-бок в preview-окнах).
 */
import { useEffect, useMemo, useState } from "react";
import "./rating-graph.css";

export type Point = { date: string; rating: number };
export type Period = "7d" | "30d" | "3m" | "all";
export type Mode = "matches" | "time";

const PERIOD_LABELS: { value: Period; label: string }[] = [
  { value: "7d", label: "7д" },
  { value: "30d", label: "30д" },
  { value: "3m", label: "3м" },
  { value: "all", label: "Всё" },
];

const MAX_POINTS = 60;
// Свой ключ test-ui — чтобы не конфликтовать с прод-приложением,
// если оно открыто в том же браузере.
const MODE_STORAGE_KEY = "padix-test-ui:rating-graph:mode";

function filterByPeriod(points: Point[], period: Period): Point[] {
  if (period === "all" || points.length === 0) return points;
  const now = Date.now();
  const cutoff =
    period === "7d" ? now - 7 * 86400_000 :
    period === "30d" ? now - 30 * 86400_000 :
    now - 90 * 86400_000;
  return points.filter((p) => new Date(p.date).getTime() >= cutoff);
}

// Largest-Triangle-Three-Buckets — сохраняет визуальные пики при downsampling
function lttb(points: { x: number; y: number; original: Point }[], threshold: number) {
  if (points.length <= threshold || threshold < 3) return points;
  const sampled: typeof points = [];
  const bucketSize = (points.length - 2) / (threshold - 2);
  let a = 0;
  sampled.push(points[0]);
  for (let i = 0; i < threshold - 2; i++) {
    const rangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const rangeEnd = Math.floor((i + 2) * bucketSize) + 1;
    const rangeEndClamped = Math.min(rangeEnd, points.length);
    let avgX = 0, avgY = 0;
    const rangeLen = rangeEndClamped - rangeStart;
    for (let j = rangeStart; j < rangeEndClamped; j++) {
      avgX += points[j].x;
      avgY += points[j].y;
    }
    avgX /= rangeLen || 1;
    avgY /= rangeLen || 1;
    const rangeOffs = Math.floor(i * bucketSize) + 1;
    const rangeTo = Math.floor((i + 1) * bucketSize) + 1;
    const pa = points[a];
    let maxArea = -1;
    let nextA = rangeOffs;
    for (let j = rangeOffs; j < rangeTo; j++) {
      const area = Math.abs(
        (pa.x - avgX) * (points[j].y - pa.y) -
        (pa.x - points[j].x) * (avgY - pa.y)
      ) * 0.5;
      if (area > maxArea) {
        maxArea = area;
        nextA = j;
      }
    }
    sampled.push(points[nextA]);
    a = nextA;
  }
  sampled.push(points[points.length - 1]);
  return sampled;
}

export function RatingGraph({
  points,
  viewport,
  initialPeriod = "30d",
  initialMode,
}: {
  points: Point[];
  viewport: "mobile" | "desktop";
  initialPeriod?: Period;
  initialMode?: Mode;
}) {
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [mode, setMode] = useState<Mode>(() => {
    if (initialMode) return initialMode;
    if (typeof window === "undefined") return "matches";
    const saved = window.localStorage.getItem(MODE_STORAGE_KEY);
    return saved === "time" ? "time" : "matches";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    }
  }, [mode]);

  const filtered = useMemo(() => filterByPeriod(points, period), [points, period]);

  const rawPoints = useMemo(() => {
    if (filtered.length === 0) return [];
    if (mode === "matches") {
      const denom = Math.max(1, filtered.length - 1);
      return filtered.map((p, i) => ({ x: i / denom, y: p.rating, original: p }));
    }
    const times = filtered.map((p) => new Date(p.date).getTime());
    const minT = times[0];
    const maxT = times[times.length - 1];
    const range = maxT - minT || 1;
    return filtered.map((p, i) => ({ x: (times[i] - minT) / range, y: p.rating, original: p }));
  }, [filtered, mode]);

  const sampled = useMemo(() => lttb(rawPoints, MAX_POINTS), [rawPoints]);

  const ratings = sampled.map((p) => p.y);
  const minR = ratings.length ? Math.min(...ratings) : 1500;
  const maxR = ratings.length ? Math.max(...ratings) : 1500;
  const r = maxR - minR || 1;
  const pad = r * 0.1;
  const lo = Math.floor(minR - pad);
  const hi = Math.ceil(maxR + pad);

  const TARGET_LABELS = 10;
  const labelStep = Math.max(1, Math.ceil(sampled.length / TARGET_LABELS));
  const shouldShowLabel = (i: number) =>
    i === 0 || i === sampled.length - 1 || i % labelStep === 0;
  const firstDate = filtered[0]?.date?.slice(0, 10) ?? "";
  const lastDate = filtered[filtered.length - 1]?.date?.slice(0, 10) ?? "";

  const dims = viewport === "mobile"
    ? { w: 408, h: 244, padTop: 32, padBottom: 32, padLeft: 24, padRight: 24, pointR: 4, labelFs: 12 }
    : { w: 520, h: 140, padTop: 22, padBottom: 22, padLeft: 24, padRight: 24, pointR: 3, labelFs: 10 };

  const gradId = `rg-grad-${viewport}`;
  const graphW = dims.w - dims.padLeft - dims.padRight;
  const graphH = dims.h - dims.padTop - dims.padBottom;
  const toX = (x: number) => dims.padLeft + x * graphW;
  const toY = (rating: number) => dims.padTop + graphH - ((rating - lo) / (hi - lo)) * graphH;
  const bottomY = dims.padTop + graphH;
  const linePts = sampled.map((p) => `${toX(p.x)},${toY(p.y)}`).join(" ");
  const areaPath = sampled.length
    ? `M ${toX(sampled[0].x)},${bottomY} L ${sampled.map((p) => `${toX(p.x)},${toY(p.y)}`).join(" L ")} L ${toX(sampled[sampled.length - 1].x)},${bottomY} Z`
    : "";
  const labelOffset = Math.max(10, dims.labelFs);
  const getLabelY = (i: number, y: number) => (i % 2 === 0 ? y - labelOffset : y + labelOffset);

  const controls = (
    <div className="rg-controls">
      <div className="rg-periods">
        {PERIOD_LABELS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPeriod(p.value)}
            className={`rg-period ${period === p.value ? "active" : ""}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setMode((m) => (m === "matches" ? "time" : "matches"))}
        className="rg-mode"
        title={mode === "matches" ? "По матчам" : "По времени"}
        aria-label="Переключить режим оси X"
      >
        ⇄
      </button>
    </div>
  );

  if (points.length < 2) {
    return (
      <div className="rg-wrap">
        {controls}
        <div className="rg-empty">Нужно ≥2 точек</div>
      </div>
    );
  }

  if (filtered.length < 2) {
    return (
      <div className="rg-wrap">
        {controls}
        <div className="rg-empty">Недостаточно данных за выбранный период</div>
      </div>
    );
  }

  return (
    <div className={`rg-wrap ${viewport}`}>
      {controls}
      <div className={`rg-svg-box ${viewport}`}>
        <svg viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid meet" className="rg-svg">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--padix-primary)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--padix-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
          <polyline
            fill="none"
            stroke="var(--padix-primary)"
            strokeWidth={viewport === "mobile" ? 2 : 1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={linePts}
          />
          {sampled.map((p, i) => {
            const y = toY(p.y);
            const labelY = Math.max(
              dims.padTop - 2,
              Math.min(dims.h - dims.padBottom + dims.labelFs, getLabelY(i, y)),
            );
            return (
              <g key={i}>
                <circle
                  cx={toX(p.x)}
                  cy={y}
                  r={dims.pointR}
                  fill="var(--padix-background)"
                  stroke="var(--padix-primary)"
                  strokeWidth={1.8}
                />
                {shouldShowLabel(i) && (
                  <text
                    x={toX(p.x)}
                    y={labelY}
                    textAnchor="middle"
                    style={{
                      fontSize: dims.labelFs,
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                      fill: "var(--padix-foreground)",
                      stroke: "var(--padix-background)",
                      strokeWidth: 7,
                      paintOrder: "stroke",
                      strokeLinejoin: "round",
                    }}
                  >
                    {p.y}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <div className="rg-dates">
          <span>{firstDate}</span>
          <span>{lastDate}</span>
        </div>
      </div>
    </div>
  );
}
