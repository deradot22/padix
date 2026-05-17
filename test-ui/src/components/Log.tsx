import { useEffect, useRef } from "react";

export type LogLevel = "info" | "ok" | "err" | "warn";
export interface LogEntry {
  level: LogLevel;
  text: string;
  ts: number;
}

export function Log({ entries }: { entries: LogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries.length]);

  if (entries.length === 0) {
    return <div className="log muted">Лог пуст</div>;
  }
  return (
    <div className="log" ref={ref}>
      {entries.map((e, i) => (
        <div key={i} className={`log-line ${e.level}`}>
          {new Date(e.ts).toLocaleTimeString()} {e.text}
        </div>
      ))}
    </div>
  );
}
