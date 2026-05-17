import { useEffect, useState } from "react";
import { RatingAnimationProps } from "./types";

/**
 * Slot Machine — каждая цифра на своём «барабане».
 * Барабаны крутятся вниз, останавливаются по очереди слева-направо с физикой.
 * Похоже на анимацию Apple Pay при оплате или казино-слот.
 */
export function SlotMachineAnimation({
  previousRating,
  newRating,
  delta,
  playKey,
}: RatingAnimationProps) {
  const oldDigits = padDigits(previousRating);
  const newDigits = padDigits(newRating);
  const length = Math.max(oldDigits.length, newDigits.length);
  const cls = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  return (
    <div className="anim-stage" key={playKey}>
      <div className="slot-overlay">
        <div className="slot-card">
          <div className="slot-label">Новый рейтинг</div>
          <div className={`slot-row ${cls}`}>
            {Array.from({ length }).map((_, i) => (
              <Reel
                key={i}
                from={Number(oldDigits[oldDigits.length - length + i] ?? 0)}
                to={Number(newDigits[newDigits.length - length + i] ?? 0)}
                stopDelay={i * 0.18}
                playKey={playKey}
              />
            ))}
          </div>
          <div className={`slot-delta ${cls}`}>
            {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "±0"}
          </div>
        </div>
      </div>
    </div>
  );
}

function padDigits(n: number): string {
  return Math.abs(Math.round(n)).toString();
}

function Reel({
  from,
  to,
  stopDelay,
  playKey,
}: {
  from: number;
  to: number;
  stopDelay: number;
  playKey: number;
}) {
  const [pos, setPos] = useState<number>(0);
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    setStopped(false);
    setPos(0);

    const spinStart = performance.now();
    const totalSpinTime = 700 + stopDelay * 1000; // мс
    let rafId = 0;

    const tick = (now: number) => {
      const t = (now - spinStart) / totalSpinTime;
      if (t < 1) {
        // быстро крутимся, замедляясь
        const eased = 1 - Math.pow(1 - t, 3);
        setPos(eased * 10); // 0..10 виртуальных оборотов
        rafId = requestAnimationFrame(tick);
      } else {
        setPos(to);
        setStopped(true);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playKey, from, to, stopDelay]);

  // Во время кручения показываем «случайные» цифры, в конце — целевую
  const display = stopped ? to : Math.floor(pos * 7 + from) % 10;
  return (
    <div className={`slot-reel ${stopped ? "stopped" : ""}`}>
      <div className="slot-digit">{display}</div>
    </div>
  );
}
