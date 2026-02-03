"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface GamesCalendarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectDate?: (date: Date) => void;
}

// Mock data for games per day (kept from design; can be wired later)
const gamesData: Record<string, number> = {
  "2026-01-17": 1,
  "2026-01-18": 5,
  "2026-01-19": 1,
  "2026-01-22": 3,
  "2026-01-28": 2,
  "2026-01-29": 1,
};

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
  return day === 0 ? 6 : day - 1; // Monday-first
}

export function GamesCalendar({ open, onOpenChange, onSelectDate }: GamesCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 0, 1));

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const prevMonthDays = getDaysInMonth(year, month - 1);
  const daysFromPrevMonth = firstDay;

  const totalCells = 42;
  const daysFromNextMonth = totalCells - daysInMonth - daysFromPrevMonth;

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const formatDateKey = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const handleDateClick = (day: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return;
    onSelectDate?.(new Date(year, month, day));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] p-0 bg-card border-border">
        <DialogHeader className="p-6 pb-0 flex flex-row items-center justify-between">
          <DialogTitle className="text-2xl font-bold">Календарь</DialogTitle>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </DialogHeader>

        <div className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 bg-transparent"
              onClick={prevMonth}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-4 py-2 rounded-lg bg-secondary text-sm font-medium min-w-[140px] text-center">
              {MONTHS[month]} {year} г.
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 bg-transparent"
              onClick={nextMonth}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-2">
            {WEEKDAYS.map((day) => (
              <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: daysFromPrevMonth }).map((_, i) => {
              const day = prevMonthDays - daysFromPrevMonth + i + 1;
              return (
                <div
                  key={`prev-${day}`}
                  className="aspect-square rounded-xl bg-secondary/30 p-2 flex flex-col items-start justify-start"
                >
                  <span className="text-sm text-muted-foreground/50">{day}</span>
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

              return (
                <button
                  key={`current-${day}`}
                  onClick={() => handleDateClick(day, true)}
                  className={cn(
                    "aspect-square rounded-xl bg-secondary/50 p-2 flex flex-col items-start justify-between transition-all hover:bg-secondary hover:scale-[1.02]",
                    isToday && "ring-2 ring-primary",
                    gamesCount && "bg-secondary",
                  )}
                >
                  <span className={cn("text-sm font-medium", isToday && "text-primary")}>{day}</span>
                  {gamesCount ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-background/80 text-foreground">
                      {gamesCount} игр
                    </span>
                  ) : null}
                </button>
              );
            })}

            {Array.from({ length: daysFromNextMonth }).map((_, i) => {
              const day = i + 1;
              return (
                <div
                  key={`next-${day}`}
                  className="aspect-square rounded-xl bg-secondary/30 p-2 flex flex-col items-start justify-start"
                >
                  <span className="text-sm text-muted-foreground/50">{day}</span>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

