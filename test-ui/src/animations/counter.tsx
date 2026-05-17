import { useEffect, useState } from "react";
import { RatingAnimationProps } from "./types";

/**
 * "Counter" — minimalist:
 *  - центральная цифра «отсчитывает» от старого рейтинга к новому за 800мс
 *  - цвет градиента подсказывает направление
 *  - снизу — крупная delta
 */
export function CounterAnimation({
  previousRating,
  newRating,
  delta,
  playKey,
}: RatingAnimationProps) {
  const [value, setValue] = useState(previousRating);

  useEffect(() => {
    setValue(previousRating);
    const duration = 800;
    const start = performance.now();
    let rafId = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = Math.round(previousRating + (newRating - previousRating) * eased);
      setValue(cur);
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playKey, previousRating, newRating]);

  const cls = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  return (
    <div className="anim-stage" key={playKey}>
      <div className="counter-overlay">
        <div className="counter-card">
          <div className="counter-label">Новый рейтинг</div>
          <div className={`counter-value ${cls}`}>{value}</div>
          <div className={`counter-delta ${cls}`}>
            {delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : "± 0"}
          </div>
        </div>
      </div>
    </div>
  );
}
