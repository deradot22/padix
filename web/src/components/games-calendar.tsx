"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Event } from "@/lib/api";

export interface GamesCalendarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectDate?: (date: Date) => void;
  events?: Event[];
  onMonthChange?: (date: Date) => void;
  inline?: boolean;
  loading?: boolean;
}

const WEEKDAYS = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];
const MONTHS = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

export function GamesCalendar({ open, onOpenChange, onSelectDate, events, onMonthChange, inline, loading }: GamesCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    const today = new Date();
    setCurrentDate(today);
    onMonthChange?.(today);
  }, [open, onMonthChange]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const prevMonthDays = getDaysInMonth(year, month - 1);
  const daysFromPrevMonth = firstDay;
  const totalCells = 42;
  const daysFromNextMonth = totalCells - daysInMonth - daysFromPrevMonth;

  const prevMonth = () => {
    const next = new Date(year, month - 1, 1);
    setCurrentDate(next);
    onMonthChange?.(next);
  };
  const nextMonth = () => {
    const next = new Date(year, month + 1, 1);
    setCurrentDate(next);
    onMonthChange?.(next);
  };

  const formatDateKey = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const gamesData = useMemo(() => {
    const map: Record<string, number> = {};
    (events ?? []).forEach((e) => {
      if (!map[e.date]) map[e.date] = 0;
      map[e.date] += 1;
    });
    return map;
  }, [events]);

  const handleDateClick = (day: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return;
    onSelectDate?.(new Date(year, month, day));
  };

  if (!open) return null;

  const calendarContent = (
    <div className={cn("relative", inline ? "w-full" : "w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl")}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-3">
        <button
          type="button"
          onClick={prevMonth}
          disabled={loading}
          className="h-10 w-10 sm:h-8 sm:w-8 rounded-xl sm:rounded-lg border border-border bg-secondary/50 flex items-center justify-center hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
        </button>
        <span className="px-5 py-2 sm:px-4 sm:py-1.5 rounded-full border border-border bg-secondary/50 text-sm font-medium flex items-center justify-center gap-2 min-w-[140px]">
          {MONTHS[month]} {year}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          disabled={loading}
          className="h-10 w-10 sm:h-8 sm:w-8 rounded-xl sm:rounded-lg border border-border bg-secondary/50 flex items-center justify-center hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-1 mb-1.5 sm:mb-1">
        {WEEKDAYS.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1.5 sm:py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-1">
        {Array.from({ length: daysFromPrevMonth }).map((_, i) => {
          const day = prevMonthDays - daysFromPrevMonth + i + 1;
          return (
            <div
              key={`prev-${day}`}
              className="aspect-square sm:aspect-auto sm:min-h-12 sm:py-2 rounded-xl sm:rounded-lg bg-secondary/20 flex flex-col items-center justify-center"
            >
              <span className="text-sm sm:text-xs text-muted-foreground/30">{day}</span>
            </div>
          );
        })}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateKey = formatDateKey(year, month, day);
          const gamesCount = gamesData[dateKey];
          const today = new Date();
          const isToday =
            day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
          const hasGames = !!gamesCount;

          return (
            <button
              key={`current-${day}`}
              onClick={() => handleDateClick(day, true)}
              className={cn(
                "aspect-square sm:aspect-auto sm:min-h-12 sm:py-2 rounded-xl sm:rounded-lg flex flex-col items-center justify-center transition-all relative",
                isToday
                  ? "bg-primary/20 border-2 border-white/70 hover:bg-primary/25"
                  : hasGames
                  ? "bg-gradient-to-br from-primary/20 to-primary/10 border-2 border-primary/30 text-primary hover:bg-primary/30"
                  : "bg-secondary/40 border border-transparent hover:bg-secondary/60",
              )}
            >
              <span
                className={cn(
                  "text-sm sm:text-xs font-medium leading-none",
                  (hasGames || isToday) ? "text-primary" : "text-foreground",
                )}
              >
                {day}
              </span>
              {hasGames && (
                <span className="mt-1 sm:mt-0.5 h-5 w-5 sm:h-4 sm:w-4 rounded-full bg-black/85 border border-primary/40 text-[10px] sm:text-[9px] font-semibold text-primary leading-none flex items-center justify-center">
                  {gamesCount}
                </span>
              )}
            </button>
          );
        })}

        {Array.from({ length: daysFromNextMonth }).map((_, i) => {
          const day = i + 1;
          return (
            <div
              key={`next-${day}`}
              className="aspect-square sm:aspect-auto sm:min-h-12 sm:py-2 rounded-xl sm:rounded-lg bg-secondary/20 flex flex-col items-center justify-center"
            >
              <span className="text-sm sm:text-xs text-muted-foreground/30">{day}</span>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="absolute inset-0 z-20 rounded-[inherit] bg-background/45 backdrop-blur-[2px] flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card/90 px-3 py-2 text-sm font-medium">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загрузка…
          </div>
        </div>
      ) : null}
    </div>
  );

  if (inline) return calendarContent;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 backdrop-blur-sm pt-8 px-4">
      {calendarContent}
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="mt-4 w-full max-w-md py-2.5 rounded-xl border border-border bg-secondary/50 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
      >
        Закрыть
      </button>
    </div>
  );
}
