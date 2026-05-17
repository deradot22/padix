import { useMemo } from "react";
import { RatingAnimationProps } from "./types";

/**
 * Classic — 1:1 копия web/src/components/rating-notification-modal.tsx.
 * Размеры/цвета/иконки совпадают с прод-компонентом, чтобы превью отражало,
 * что увидит пользователь после игры в реальном Padix.
 *
 * Единственное отличие — шарики стартуют «уже в полёте» (отрицательный
 * animation-delay), чтобы дождь был сразу. В проде это можно тоже добавить.
 */
const BALL_COUNT = 24;
const FALL_DURATION = 4;

export function ClassicAnimation({
  previousRating,
  newRating,
  delta,
  playKey,
  onClose,
}: RatingAnimationProps) {
  const isUp = delta > 0;
  const isDown = delta < 0;
  const isFlat = delta === 0;
  const cls = isUp ? "up" : isDown ? "down" : "flat";

  const title = isUp
    ? "Рейтинг вырос! 🎉"
    : isDown
    ? "Рейтинг изменился"
    : isFlat
    ? "Рейтинг не изменился"
    : "У вас новый рейтинг!";

  const balls = useMemo(
    () =>
      Array.from({ length: BALL_COUNT }, (_, i) => ({
        left: (i * 37) % 100,
        // отрицательный delay → старт сразу из середины анимации
        delay: -((i / BALL_COUNT) * FALL_DURATION + Math.random() * 0.4),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playKey],
  );

  return (
    <div className="anim-stage" key={playKey}>
      <div className="classic-balls" aria-hidden>
        {balls.map((b, i) => (
          <span
            key={i}
            className="classic-ball"
            style={{ left: `${b.left}%`, animationDelay: `${b.delay}s` }}
          >
            🎾
          </span>
        ))}
      </div>
      <div className="classic-overlay">
        <div className="classic-card">
          <h2 className="classic-title">{title}</h2>

          <div className="classic-body">
            {delta !== 0 && (
              <div className="classic-was">было {previousRating}</div>
            )}
            <div className="classic-new">{newRating}</div>
            <div className="classic-ntrp">NTRP {ntrpLevel(newRating)}</div>

            <div className={`classic-delta ${cls}`}>
              <DeltaIcon kind={cls} />
              <span>
                {delta > 0 ? `+${delta}` : delta}
              </span>
            </div>
          </div>

          <p className="classic-foot">Рейтинг обновлён после последней игры</p>
          {onClose && (
            <button className="classic-btn" onClick={onClose}>
              Понятно
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Inline SVG-иконки, эквивалентны lucide ArrowUp / ArrowDown / Minus
 * (h-5 w-5 = 20×20, stroke 2px, round join).
 */
function DeltaIcon({ kind }: { kind: "up" | "down" | "flat" }) {
  const props = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (kind === "up") {
    return (
      <svg {...props} aria-hidden>
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    );
  }
  if (kind === "down") {
    return (
      <svg {...props} aria-hidden>
        <path d="M12 5v14" />
        <path d="m19 12-7 7-7-7" />
      </svg>
    );
  }
  return (
    <svg {...props} aria-hidden>
      <path d="M5 12h14" />
    </svg>
  );
}

/** Точная копия web/src/lib/rating.ts */
function ntrpLevel(rating: number): string {
  if (rating < 900) return "1.0";
  if (rating < 1000) return "1.5";
  if (rating < 1100) return "2.0";
  if (rating < 1200) return "2.5";
  if (rating < 1500) return "3.0";
  if (rating < 1700) return "3.5";
  if (rating < 1900) return "4.0";
  if (rating < 2100) return "4.5";
  return "5.0+";
}
