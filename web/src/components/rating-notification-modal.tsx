import { useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { ntrpLevel } from "../lib/rating";

const BALL_COUNT = 24;

function TennisBall({ delay, left }: { delay: number; left: number }) {
  return (
    <span
      className="rating-ball"
      style={{
        left: `${left}%`,
        animationDelay: `${delay}s`,
      }}
      aria-hidden
    >
      🎾
    </span>
  );
}

export function RatingNotificationModal({
  newRating,
  delta,
  onClose,
}: {
  newRating: number;
  delta?: number;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes rating-ball-fall {
        0% { transform: translateY(-100%) rotate(0deg); opacity: 0.8; }
        100% { transform: translateY(100vh) rotate(720deg); opacity: 0.3; }
      }
      .rating-ball {
        position: fixed;
        top: 0;
        font-size: 1.5rem;
        pointer-events: none;
        animation: rating-ball-fall 4s linear infinite;
        z-index: 99;
      }
      @keyframes rating-delta-pop {
        0% { transform: scale(0.5); opacity: 0; }
        60% { transform: scale(1.15); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      .rating-delta-pop {
        animation: rating-delta-pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const balls = Array.from({ length: BALL_COUNT }, (_, i) => ({
    id: i,
    delay: (i / BALL_COUNT) * 2,
    left: (i * 37) % 100,
  }));

  const hasDelta = typeof delta === "number";
  const isUp = hasDelta && delta! > 0;
  const isDown = hasDelta && delta! < 0;
  const isFlat = hasDelta && delta === 0;

  const previousRating = hasDelta ? newRating - delta! : null;

  const title = isUp
    ? "Рейтинг вырос! 🎉"
    : isDown
    ? "Рейтинг изменился"
    : isFlat
    ? "Рейтинг не изменился"
    : "У вас новый рейтинг!";

  const deltaColor = isUp
    ? "text-emerald-700 dark:text-emerald-400"
    : isDown
    ? "text-rose-700 dark:text-rose-400"
    : "text-muted-foreground";

  const DeltaIcon = isUp ? ArrowUp : isDown ? ArrowDown : Minus;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6"
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rating-modal-title"
    >
      {/* Tennis balls rain */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {balls.map((b) => (
          <TennisBall key={b.id} delay={b.delay} left={b.left} />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-primary/30 bg-card p-8 shadow-2xl">
        <h2 id="rating-modal-title" className="text-center text-xl font-semibold text-foreground">
          {title}
        </h2>

        <div className="mt-6 flex flex-col items-center">
          {hasDelta && previousRating !== null && delta !== 0 && (
            <div className="text-sm text-muted-foreground tabular-nums">
              было {previousRating}
            </div>
          )}
          <div className="mt-1 text-6xl font-bold tabular-nums text-foreground">
            {newRating}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">NTRP {ntrpLevel(newRating)}</div>

          {hasDelta && (
            <div
              className={`rating-delta-pop mt-5 inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-lg font-semibold tabular-nums ${
                isUp
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : isDown
                  ? "border-rose-500/40 bg-rose-500/10"
                  : "border-border bg-secondary/30"
              } ${deltaColor}`}
            >
              <DeltaIcon className="h-5 w-5" />
              {delta! > 0 ? `+${delta}` : delta}
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Рейтинг обновлён после последней игры
        </p>
        <button
          type="button"
          className="mt-8 w-full rounded-lg bg-primary px-4 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          onClick={onClose}
        >
          Понятно
        </button>
      </div>
    </div>
  );
}
