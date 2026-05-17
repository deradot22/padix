import { useEffect, useMemo, useState } from "react";
import { RatingAnimationProps } from "./types";

/**
 * Sparkline — стиль финансовых приложений (Robinhood, Apple Stocks).
 * Маленький график «истории» рейтинга, последняя точка яркая и пульсирующая.
 * Большая цифра + delta справа.
 * Из всех 7 вариантов — самый «информативный»: даёт контекст.
 */
export function SparklineAnimation({
  previousRating,
  newRating,
  delta,
  playKey,
}: RatingAnimationProps) {
  const [progress, setProgress] = useState(0);
  const [value, setValue] = useState(previousRating);
  const cls = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  // Синтетическая «история» из 10 точек, заканчивающаяся на previousRating, и затем плавный переход к newRating.
  const points = useMemo(() => {
    const len = 9;
    const arr: number[] = [];
    let cur = previousRating - 60 + Math.random() * 20;
    for (let i = 0; i < len; i++) {
      cur += (previousRating - cur) * 0.2 + (Math.random() - 0.5) * 20;
      arr.push(cur);
    }
    arr.push(previousRating);
    arr.push(newRating);
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey, previousRating, newRating]);

  useEffect(() => {
    setValue(previousRating);
    setProgress(0);
    const start = performance.now();
    const dur = 1100;
    let rafId = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(eased);
      setValue(Math.round(previousRating + (newRating - previousRating) * eased));
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playKey, previousRating, newRating]);

  const W = 320;
  const H = 90;
  const PAD = 4;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(1, max - min);
  const toX = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const toY = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);

  // Анимация: рисуем только первые ceil(progress * (n-1)) сегментов + интерполяция к последней
  const lastIdx = points.length - 1;
  const cutIdx = Math.max(1, Math.floor(progress * lastIdx));
  const visible = points.slice(0, cutIdx + 1);

  const path = visible
    .map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`)
    .join(" ");

  const areaPath = visible.length > 1
    ? `${path} L${toX(visible.length - 1).toFixed(1)} ${(H - PAD).toFixed(1)} L${toX(0).toFixed(1)} ${(H - PAD).toFixed(1)} Z`
    : "";

  const stroke = cls === "up" ? "oklch(0.65 0.18 145)" : cls === "down" ? "oklch(0.55 0.22 25)" : "oklch(0.65 0 0)";

  return (
    <div className="anim-stage" key={playKey}>
      <div className="spark-overlay">
        <div className="spark-card">
          <div className="spark-header">
            <div>
              <div className="spark-label">Рейтинг</div>
              <div className="spark-value">{value}</div>
            </div>
            <div className={`spark-delta ${cls}`}>
              <span className="spark-delta-arrow">
                {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"}
              </span>
              <span>{delta > 0 ? `+${delta}` : delta}</span>
            </div>
          </div>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="spark-svg" preserveAspectRatio="none">
            <defs>
              <linearGradient id={`spark-grad-${playKey}-${cls}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity="0.3" />
                <stop offset="100%" stopColor={stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            {areaPath && <path d={areaPath} fill={`url(#spark-grad-${playKey}-${cls})`} />}
            <path
              d={path}
              fill="none"
              stroke={stroke}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {visible.length > 0 && (
              <circle
                cx={toX(visible.length - 1)}
                cy={toY(visible[visible.length - 1])}
                r={4}
                fill={stroke}
                className="spark-pulse"
              />
            )}
          </svg>
          <div className="spark-foot">последние 10 матчей</div>
        </div>
      </div>
    </div>
  );
}
