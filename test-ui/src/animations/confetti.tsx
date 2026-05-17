import { useMemo } from "react";
import { RatingAnimationProps } from "./types";

const PIECE_COUNT = 60;
// Палитры в стиле padix: акценты — primary (зелёный) или destructive (красный)
const COLORS_UP = [
  "oklch(0.65 0.18 145)",   // primary (зелёный)
  "oklch(0.75 0.15 145)",   // primary lighter
  "oklch(0.55 0.18 145)",   // primary darker
  "oklch(0.85 0.10 145)",   // мятный
];
const COLORS_DOWN = [
  "oklch(0.55 0.22 25)",    // destructive
  "oklch(0.65 0.20 25)",
  "oklch(0.75 0.15 40)",    // оранжевый акцент
  "oklch(0.45 0.20 25)",
];

/**
 * "Confetti" — баннер снизу + конфетти-дождь с разных углов.
 * Подходит когда хочется лёгкого «toast»-вида вместо большого модала.
 */
export function ConfettiAnimation({
  previousRating,
  newRating,
  delta,
  viewport,
  playKey,
}: RatingAnimationProps) {
  const palette = delta < 0 ? COLORS_DOWN : COLORS_UP;
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        dx: `${(Math.random() - 0.5) * (viewport === "mobile" ? 60 : 200)}px`,
        color: palette[i % palette.length],
        rotate: Math.random() * 360,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playKey, viewport, delta],
  );

  const cls = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  return (
    <div className="anim-stage" key={playKey}>
      <div className="confetti-pieces" aria-hidden>
        {pieces.map((p, i) => (
          <span
            key={i}
            className="confetti-piece"
            style={
              {
                left: `${p.left}%`,
                background: p.color,
                transform: `rotate(${p.rotate}deg)`,
                animationDelay: `${p.delay}s`,
                ["--dx" as never]: p.dx,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="confetti-overlay">
        <div className="confetti-banner">
          <div>
            <div style={{ fontSize: 11, color: "#8b94a6" }}>было {previousRating}</div>
            <div className="rating">{newRating}</div>
          </div>
          <div className={`delta ${cls}`}>
            {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "±0"}
          </div>
        </div>
      </div>
    </div>
  );
}
