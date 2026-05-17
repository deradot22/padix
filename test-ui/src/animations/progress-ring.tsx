import { useEffect, useState } from "react";
import { RatingAnimationProps } from "./types";

/**
 * Progress Ring — Apple Watch Activity / Strava стиль.
 * Кольцо заполняется снизу по часовой за ~1.2с,
 * в центре идёт счётчик, под кольцом — delta plate.
 */
export function ProgressRingAnimation({
  previousRating,
  newRating,
  delta,
  viewport,
  playKey,
}: RatingAnimationProps) {
  const [value, setValue] = useState(previousRating);
  const [progress, setProgress] = useState(0); // 0..1
  const cls = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const size = viewport === "mobile" ? 240 : 280;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    setValue(previousRating);
    setProgress(0);
    const duration = 1200;
    const start = performance.now();
    let rafId = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4); // ease-out quart
      setValue(Math.round(previousRating + (newRating - previousRating) * eased));
      setProgress(eased);
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playKey, previousRating, newRating]);

  const dashOffset = circumference * (1 - progress);

  return (
    <div className="anim-stage" key={playKey}>
      <div className="ring-overlay">
        <div className="ring-wrap">
          <svg width={size} height={size} className="ring-svg">
            <defs>
              <linearGradient id={`ring-grad-${playKey}-${cls}`} x1="0%" y1="0%" x2="100%" y2="100%">
                {cls === "up" && (
                  <>
                    <stop offset="0%" stopColor="oklch(0.65 0.18 145)" />
                    <stop offset="100%" stopColor="oklch(0.85 0.10 145)" />
                  </>
                )}
                {cls === "down" && (
                  <>
                    <stop offset="0%" stopColor="oklch(0.55 0.22 25)" />
                    <stop offset="100%" stopColor="oklch(0.75 0.18 40)" />
                  </>
                )}
                {cls === "flat" && (
                  <>
                    <stop offset="0%" stopColor="oklch(0.55 0 0)" />
                    <stop offset="100%" stopColor="oklch(0.75 0 0)" />
                  </>
                )}
              </linearGradient>
            </defs>
            {/* фоновое кольцо */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--padix-secondary)"
              strokeWidth={stroke}
            />
            {/* прогресс */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={`url(#ring-grad-${playKey}-${cls})`}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ transition: "stroke-dashoffset 60ms linear" }}
            />
          </svg>
          <div className="ring-center">
            <div className="ring-label">Рейтинг</div>
            <div className="ring-value">{value}</div>
          </div>
        </div>
        <div className={`ring-delta ${cls}`}>
          {delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : "± 0"}
        </div>
      </div>
    </div>
  );
}
