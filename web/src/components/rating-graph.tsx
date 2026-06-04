import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Point = { date: string; rating: number };
type Period = "7d" | "30d" | "3m" | "all";
type Mode = "matches" | "time";

const PERIOD_LABELS: { value: Period; label: string }[] = [
  { value: "7d", label: "7д" },
  { value: "30d", label: "30д" },
  { value: "3m", label: "3м" },
  { value: "all", label: "Всё" },
];

const MODE_STORAGE_KEY = "padix:rating-graph:mode";
const MAX_POINTS = 60;

function filterByPeriod(points: Point[], period: Period): Point[] {
  if (period === "all" || points.length === 0) return points;
  const now = Date.now();
  const cutoff =
    period === "7d" ? now - 7 * 86400_000 :
    period === "30d" ? now - 30 * 86400_000 :
    now - 90 * 86400_000;
  return points.filter((p) => new Date(p.date).getTime() >= cutoff);
}

// Largest-Triangle-Three-Buckets downsample — сохраняет визуальные пики
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

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()] ?? ""}`;
}

export function RatingGraph(props: { points: Point[] }) {
  const [period, setPeriod] = useState<Period>("30d");
  // Интерактивность: индекс точки под курсором/пальцем (в системе sampled).
  const [hovered, setHovered] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === "undefined") return "matches";
    const saved = window.localStorage.getItem(MODE_STORAGE_KEY);
    return saved === "time" ? "time" : "matches";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    }
  }, [mode]);

  const filtered = useMemo(() => filterByPeriod(props.points, period), [props.points, period]);

  // Координаты в нормализованной системе (0..1 по X, реальный рейтинг по Y)
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

  if (props.points.length < 2) return null;

  const ratings = sampled.map((p) => p.y);
  const minR = ratings.length ? Math.min(...ratings) : 1500;
  const maxR = ratings.length ? Math.max(...ratings) : 1500;
  const range = maxR - minR || 1;
  const pad = range * 0.1;
  const lo = Math.floor(minR - pad);
  const hi = Math.ceil(maxR + pad);

  // Прореживание подписей: показываем ~10 равномерно распределённых лейблов,
  // первая и последняя всегда видны.
  const TARGET_LABELS = 10;
  const labelStep = Math.max(1, Math.ceil(sampled.length / TARGET_LABELS));
  const shouldShowLabel = (i: number) =>
    i === 0 || i === sampled.length - 1 || i % labelStep === 0;

  const renderGraph = (opts: {
    width: number;
    height: number;
    padTop: number;
    padBottom: number;
    padLeft: number;
    padRight: number;
    pointR: number;
    labelFs: number;
    gradientId: string;
  }) => {
    const { width, height, padTop, padBottom, padLeft, padRight, pointR, labelFs, gradientId } = opts;
    const graphW = width - padLeft - padRight;
    const graphH = height - padTop - padBottom;
    const toX = (x: number) => padLeft + x * graphW;
    const toY = (r: number) => padTop + graphH - ((r - lo) / (hi - lo)) * graphH;
    const bottomY = padTop + graphH;
    const linePts = sampled.map((p) => `${toX(p.x)},${toY(p.y)}`).join(" ");
    const areaPath = sampled.length
      ? `M ${toX(sampled[0].x)},${bottomY} L ${sampled.map((p) => `${toX(p.x)},${toY(p.y)}`).join(" L ")} L ${toX(sampled[sampled.length - 1].x)},${bottomY} Z`
      : "";
    const labelOffset = Math.max(10, labelFs);
    const getLabelY = (i: number, y: number) => (i % 2 === 0 ? y - labelOffset : y + labelOffset);

    // Restyle B: горизонтальный грид с подписями оси Y (вид «табло»).
    const GRID = 4;
    const gridVals = Array.from({ length: GRID + 1 }, (_, k) => lo + ((hi - lo) * k) / GRID);
    const lastIdx = sampled.length - 1;

    return (
      <>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.30" />
            <stop offset="55%" stopColor="var(--primary)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* грид-линии + подписи рейтинга по оси Y */}
        {gridVals.map((v, k) => {
          const gy = toY(v);
          return (
            <g key={`grid-${k}`}>
              <line
                x1={padLeft}
                y1={gy}
                x2={width - padRight}
                y2={gy}
                stroke="var(--border)"
                strokeWidth="0.5"
                strokeDasharray="2 3"
                opacity="0.55"
              />
              <text
                x={padLeft - 6}
                y={gy + labelFs * 0.34}
                textAnchor="end"
                style={{ fontSize: labelFs * 0.85, fill: "var(--muted-foreground)", fontFamily: "var(--font-display)" }}
              >
                {Math.round(v)}
              </text>
            </g>
          );
        })}

        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
        <polyline
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={linePts}
        />
        {sampled.map((p, i) => {
          const y = toY(p.y);
          const x = toX(p.x);
          const isLast = i === lastIdx;
          const labelY = Math.max(padTop - 2, Math.min(height - padBottom + labelFs, getLabelY(i, y)));
          return (
            <g key={i}>
              {/* последняя точка — акцентный маркер «ты сейчас здесь» с кольцом */}
              {isLast && (
                <circle cx={x} cy={y} r={pointR + 5} fill="none" stroke="var(--accent)" strokeWidth="1.2" opacity="0.35" />
              )}
              <circle
                cx={x}
                cy={y}
                r={isLast ? pointR + 1.5 : pointR}
                fill={isLast ? "var(--accent)" : "var(--background)"}
                stroke={isLast ? "var(--accent)" : "var(--primary)"}
                strokeWidth="1.8"
              />
              {(shouldShowLabel(i) || isLast) && (
                <text
                  x={x}
                  y={isLast ? y - labelOffset : labelY}
                  textAnchor="middle"
                  className="tabular-nums"
                  style={{
                    fontSize: isLast ? labelFs * 1.25 : labelFs,
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fill: isLast ? "var(--accent)" : "var(--foreground)",
                    stroke: "var(--background)",
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

        {/* интерактив: crosshair + подсветка + тултип для точки под курсором/пальцем */}
        {hovered != null && hovered < sampled.length && (() => {
          const hp = sampled[hovered];
          const hx = toX(hp.x);
          const hy = toY(hp.y);
          const delta = hovered > 0 ? hp.y - sampled[hovered - 1].y : null;
          const tipW = 96;
          const tipH = 34;
          const tipX = Math.max(padLeft, Math.min(width - padRight - tipW, hx - tipW / 2));
          const above = hy - tipH - 12 > padTop;
          const tipY = above ? hy - tipH - 12 : hy + 12;
          const deltaStr = delta == null ? "" : `${delta > 0 ? "▲" : delta < 0 ? "▼" : ""}${delta > 0 ? "+" : ""}${delta}`;
          const deltaColor = delta == null ? "var(--muted-foreground)" : delta > 0 ? "var(--primary)" : delta < 0 ? "var(--destructive)" : "var(--muted-foreground)";
          return (
            <g style={{ pointerEvents: "none" }}>
              <circle cx={hx} cy={hy} r={pointR + 2.5} fill="var(--accent)" stroke="var(--background)" strokeWidth="2" />
              <g transform={`translate(${tipX},${tipY})`}>
                <rect width={tipW} height={tipH} rx="6" fill="var(--popover)" stroke="var(--border)" strokeWidth="1" />
                <text x={8} y={14} className="tabular-nums" style={{ fontSize: labelFs, fontFamily: "var(--font-display)", fontWeight: 700, fill: "var(--foreground)" }}>
                  {hp.y}
                  {deltaStr ? <tspan dx={6} style={{ fontSize: labelFs * 0.85, fill: deltaColor }}>{deltaStr}</tspan> : null}
                </text>
                <text x={8} y={tipH - 8} style={{ fontSize: labelFs * 0.8, fill: "var(--muted-foreground)" }}>
                  {formatShortDate(hp.original.date)}
                </text>
              </g>
            </g>
          );
        })()}

        {/* невидимые зоны для перехвата наведения/тапа по точкам */}
        {sampled.map((p, i) => {
          const cx = toX(p.x);
          const prevMid = i === 0 ? padLeft : (toX(sampled[i - 1].x) + cx) / 2;
          const nextMid = i === sampled.length - 1 ? width - padRight : (cx + toX(sampled[i + 1].x)) / 2;
          return (
            <rect
              key={`hit-${i}`}
              x={prevMid}
              y={padTop}
              width={Math.max(1, nextMid - prevMid)}
              height={graphH}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHovered(i)}
              onTouchStart={() => setHovered(i)}
            />
          );
        })}
      </>
    );
  };

  const firstDate = filtered[0]?.date?.slice(0, 10) ?? "";
  const lastDate = filtered[filtered.length - 1]?.date?.slice(0, 10) ?? "";

  const Controls = (
    <div className="flex items-center justify-between gap-2 mb-2">
      <div className="flex items-center gap-1">
        {PERIOD_LABELS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPeriod(p.value)}
            className={cn(
              "px-2.5 py-1 text-xs rounded-md transition-colors",
              period === p.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setMode((m) => (m === "matches" ? "time" : "matches"))}
        title={mode === "matches" ? "По матчам (нажмите для оси времени)" : "По времени (нажмите для оси матчей)"}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        aria-label="Переключить режим оси X"
      >
        <ArrowLeftRight className="h-4 w-4" />
      </button>
    </div>
  );

  if (filtered.length < 2) {
    return (
      <div>
        {Controls}
        <div className="text-sm text-muted-foreground text-center py-8">
          Недостаточно данных за выбранный период
        </div>
      </div>
    );
  }

  return (
    <div>
      {Controls}

      {/* Мобильная */}
      <div className="overflow-x-auto md:hidden">
        <svg viewBox="0 0 408 244" className="w-full min-h-[260px]" preserveAspectRatio="xMidYMid meet" onMouseLeave={() => setHovered(null)}>
          <g className="text-primary">
            {renderGraph({
              width: 408,
              height: 244,
              padTop: 32,
              padBottom: 32,
              padLeft: 44,
              padRight: 20,
              pointR: 4,
              labelFs: 12,
              gradientId: "graphGradientMobile",
            })}
          </g>
        </svg>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{firstDate}</span>
          <span>{lastDate}</span>
        </div>
      </div>

      {/* Десктоп */}
      <div className="hidden md:block overflow-x-auto w-full rounded-xl border border-border/40 bg-secondary/10 p-4">
        <svg
          viewBox="0 0 520 140"
          className="w-full block"
          style={{ aspectRatio: `520/140` }}
          preserveAspectRatio="xMidYMid meet"
          onMouseLeave={() => setHovered(null)}
        >
          <g className="text-primary">
            {renderGraph({
              width: 520,
              height: 140,
              padTop: 22,
              padBottom: 22,
              padLeft: 44,
              padRight: 20,
              pointR: 3,
              labelFs: 10,
              gradientId: "graphGradientDesktop",
            })}
          </g>
        </svg>
        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
          <span>{firstDate}</span>
          <span>{lastDate}</span>
        </div>
      </div>
    </div>
  );
}
