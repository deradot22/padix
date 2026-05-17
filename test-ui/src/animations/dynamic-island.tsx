import { useEffect, useState } from "react";
import { RatingAnimationProps } from "./types";

/**
 * Dynamic Island — iOS 17 pill-toast сверху экрана.
 * 1. Появляется узкая «pill» в самом верху (0..0.3s).
 * 2. Expand в широкую карточку с было→стало (0.3..2.0s).
 * 3. Collapse обратно в pill (2.0..2.5s).
 * 4. Уезжает (2.5..2.8s).
 * Ненавязчивый, не блокирует контент.
 */
export function DynamicIslandAnimation({
  previousRating,
  newRating,
  delta,
  playKey,
}: RatingAnimationProps) {
  const [phase, setPhase] = useState<"enter" | "expanded" | "collapsed" | "gone">("enter");
  const cls = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  useEffect(() => {
    setPhase("enter");
    const t1 = setTimeout(() => setPhase("expanded"), 300);
    const t2 = setTimeout(() => setPhase("collapsed"), 2000);
    const t3 = setTimeout(() => setPhase("gone"), 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [playKey]);

  return (
    <div className="anim-stage" key={playKey}>
      {/* Затемнённый "фоновый" контент чтобы было видно что Island не блокирует UI */}
      <div className="island-bg">
        <div className="island-bg-blob" />
        <div className="island-bg-text">фон приложения</div>
      </div>
      <div className={`island ${phase} ${cls}`}>
        {phase === "expanded" && (
          <div className="island-expanded">
            <div className="island-icon">
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"}
            </div>
            <div className="island-text">
              <div className="island-was">было {previousRating}</div>
              <div className="island-now">
                {newRating} <span className={`island-delta ${cls}`}>{delta > 0 ? `+${delta}` : delta}</span>
              </div>
            </div>
          </div>
        )}
        {(phase === "enter" || phase === "collapsed") && <div className="island-pill-dot" />}
      </div>
    </div>
  );
}
