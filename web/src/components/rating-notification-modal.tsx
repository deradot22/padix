import { useEffect, useRef } from "react";
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
  onClose,
}: {
  newRating: number;
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
          У вас новый рейтинг!
        </h2>
        <div className="mt-6 flex flex-col items-center">
          <div className="text-6xl font-bold tabular-nums text-primary">{newRating}</div>
          <div className="mt-2 text-sm text-muted-foreground">NTRP {ntrpLevel(newRating)}</div>
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
