import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS_RU = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const WEEKDAYS_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromIso(s: string): Date | null {
  if (!s) return null;
  const [y, m, dd] = s.split("-").map(Number);
  if (!y || !m || !dd) return null;
  return new Date(y, m - 1, dd);
}

function formatRu(d: Date): string {
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()].toLowerCase()} ${d.getFullYear()}`;
}

export interface DatePickerProps {
  value: string; // ISO yyyy-MM-dd
  onChange: (iso: string) => void;
  placeholder?: string;
  className?: string;
}

/** Кастомный date picker в стиле сайта. Popover с месячной сеткой. */
export function DatePicker({ value, onChange, placeholder = "Выберите дату", className }: DatePickerProps) {
  const selected = fromIso(value);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => selected ?? new Date());
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (selected) setViewMonth(selected);
  }, [value]);

  // Закрытие по клику снаружи
  useEffect(() => {
    if (!open) return;
    const onDown = (ev: PointerEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const days = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const last = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
    const firstWeekday = (first.getDay() + 6) % 7; // Пн=0
    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < firstWeekday; i++) {
      const d = new Date(first);
      d.setDate(d.getDate() - (firstWeekday - i));
      cells.push({ date: d, inMonth: false });
    }
    for (let i = 1; i <= last.getDate(); i++) {
      cells.push({ date: new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const tail = cells[cells.length - 1].date;
      const d = new Date(tail);
      d.setDate(d.getDate() + 1);
      cells.push({ date: d, inMonth: false });
    }
    return cells;
  }, [viewMonth]);

  const today = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-transparent px-3 py-2 text-sm hover:bg-secondary/30 transition-colors"
      >
        <span className={cn(selected ? "text-foreground" : "text-muted-foreground")}>
          {selected ? formatRu(selected) : placeholder}
        </span>
        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 w-[280px] rounded-md border border-border bg-popover text-popover-foreground p-3 shadow-lg"
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              className="h-7 w-7 rounded-md hover:bg-secondary inline-flex items-center justify-center"
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
              aria-label="Предыдущий месяц"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-medium">
              {MONTHS_RU[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </div>
            <button
              type="button"
              className="h-7 w-7 rounded-md hover:bg-secondary inline-flex items-center justify-center"
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
              aria-label="Следующий месяц"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS_RU.map((w) => (
              <div key={w} className="text-[11px] text-muted-foreground text-center py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map(({ date, inMonth }, idx) => {
              const isSelected = selected && sameDay(date, selected);
              const isToday = sameDay(date, today);
              return (
                <button
                  type="button"
                  key={idx}
                  onClick={() => { onChange(toIso(date)); setOpen(false); }}
                  className={cn(
                    "h-8 w-8 rounded-md text-sm inline-flex items-center justify-center transition-colors",
                    !inMonth && "text-muted-foreground/40",
                    inMonth && !isSelected && "hover:bg-secondary",
                    isSelected && "bg-primary text-primary-foreground font-semibold",
                    isToday && !isSelected && "ring-1 ring-primary/50",
                  )}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-xs">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => { onChange(toIso(new Date())); setOpen(false); }}
            >
              Сегодня
            </button>
            {selected && (
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => { onChange(""); setOpen(false); }}
              >
                Очистить
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export interface TimePickerProps {
  value: string; // HH:mm
  onChange: (hhmm: string) => void;
  placeholder?: string;
  className?: string;
  step?: number; // минут, по умолчанию 15
}

/** Кастомный time picker в стиле сайта. Popover со слотами. */
export function TimePicker({ value, onChange, placeholder = "Время", className, step = 15 }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: PointerEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const slots = useMemo(() => {
    const arr: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += step) arr.push(`${pad(h)}:${pad(m)}`);
    }
    return arr;
  }, [step]);

  // Прокрутить к выбранному при открытии
  useEffect(() => {
    if (!open || !listRef.current || !value) return;
    const el = listRef.current.querySelector<HTMLButtonElement>(`[data-time="${value}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [open, value]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-transparent px-3 py-2 text-sm hover:bg-secondary/30 transition-colors"
      >
        <span className={cn(value ? "text-foreground" : "text-muted-foreground")}>
          {value || placeholder}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[120px] rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
          <div ref={listRef} className="max-h-[240px] overflow-y-auto p-1">
            {slots.map((t) => (
              <button
                type="button"
                key={t}
                data-time={t}
                onClick={() => { onChange(t); setOpen(false); }}
                className={cn(
                  "w-full rounded-sm px-3 py-1.5 text-sm text-left transition-colors",
                  t === value ? "bg-primary text-primary-foreground font-medium" : "hover:bg-secondary",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
