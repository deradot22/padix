import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gamepad2, Users, Clock, Calendar, Lightbulb, Users2, MapPin, Zap, Send, MessageCircle, Users as UsersIcon, Lock, Globe, Repeat, Trophy } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api, EventFormat, EventVisibility, PairingMode, TelegramChat } from "../../../lib/api";
import { Dict, getCurrentLang, plural, useI18n } from "@/lib/i18n";

const TR = {
  "common.loading": { ru: "Загрузка…", en: "Loading…" },
  "common.error": { ru: "Ошибка", en: "Error" },
  "common.cancel": { ru: "Отменить", en: "Cancel" },
  "create.loadFailed": { ru: "Не удалось загрузить", en: "Failed to load" },
  "create.badgeTournament": { ru: "Создание турнира", en: "Creating a tournament" },
  "create.badgeGame": { ru: "Создание новой игры", en: "Creating a new game" },
  "create.titleTournament": { ru: "Организуйте турнир", en: "Host a tournament" },
  "create.titleGame": { ru: "Организуйте игру в падел", en: "Host a padel game" },
  "create.descTournament": {
    ru: "Турнир не влияет на рейтинг участников: итоговая таблица считается только по очкам. Кроме зарегистрированных игроков можно вписать участников вручную.",
    en: "A tournament does not affect players' ratings: the final standings are based on points only. Besides registered players, you can add participants manually.",
  },
  "create.descGame": {
    ru: "Выберите время, место и параметры игры. Система автоматически подберёт оптимальные раунды и режим.",
    en: "Pick the time, place and game settings. The system will automatically choose the optimal rounds and mode.",
  },
  "edit.backToSubscriptions": { ru: "← К подпискам", en: "← Back to subscriptions" },
  "edit.title": { ru: "Редактирование подписки", en: "Edit subscription" },
  "edit.note": {
    ru: "Изменения применятся к следующим автоматически созданным играм. Уже созданные игры останутся без изменений.",
    en: "Changes will apply to the next automatically created games. Games that are already created stay unchanged.",
  },
  "type.oneOff": { ru: "Разовая", en: "One-off" },
  "type.oneOffDesc": { ru: "Игра на конкретную дату.", en: "A game on a specific date." },
  "type.recurring": { ru: "Регулярная", en: "Recurring" },
  "type.recurringDesc": { ru: "Подписка: повторяется в выбранные дни недели.", en: "Subscription: repeats on the selected days of the week." },
  "basic.heading": { ru: "Основная информация", en: "Basic information" },
  "basic.gameName": { ru: "Название игры", en: "Game name" },
  "basic.gameNamePlaceholder": { ru: "Например: Американка в понедельник", en: "E.g.: Monday Americano" },
  "basic.defaultTitleGame": { ru: "Американка", en: "Americano" },
  "basic.defaultTitleTournament": { ru: "Турнир", en: "Tournament" },
  "materialize.label": { ru: "Открывать регистрацию", en: "Open registration" },
  "materialize.day1": { ru: "за 1 день до игры", en: "1 day before the game" },
  "materialize.days3": { ru: "за 3 дня до игры", en: "3 days before the game" },
  "materialize.week1": { ru: "за неделю до игры", en: "a week before the game" },
  "materialize.weeks2": { ru: "за 2 недели до игры", en: "2 weeks before the game" },
  "materialize.weeklySunday": { ru: "в конце недели", en: "at the end of the week" },
  "materialize.announceTime": { ru: "Время анонса", en: "Announcement time" },
  "date.label": { ru: "Дата проведения", en: "Date" },
  "days.label": { ru: "Дни недели", en: "Days of the week" },
  "days.mon": { ru: "Пн", en: "Mon" },
  "days.tue": { ru: "Вт", en: "Tue" },
  "days.wed": { ru: "Ср", en: "Wed" },
  "days.thu": { ru: "Чт", en: "Thu" },
  "days.fri": { ru: "Пт", en: "Fri" },
  "days.sat": { ru: "Сб", en: "Sat" },
  "days.sun": { ru: "Вс", en: "Sun" },
  "days.hint": {
    ru: "Игра автоматически создаётся для каждой выбранной даты, регистрация открывается в заданный момент.",
    en: "A game is created automatically for every selected date; registration opens at the configured time.",
  },
  "seriesNotif.heading": { ru: "Уведомления этой серии", en: "Notifications for this series" },
  "seriesNotif.hint": {
    ru: "Переопределяют глобальные настройки Telegram только для игр из этой серии.",
    en: "Override the global Telegram settings for games from this series only.",
  },
  "seriesNotif.reminder": { ru: "Напоминание участникам", en: "Reminder for participants" },
  "seriesNotif.global": { ru: "Как в общих настройках", en: "Same as global settings" },
  "seriesNotif.dontSend": { ru: "Не отправлять", en: "Do not send" },
  "seriesNotif.hours1": { ru: "За 1 час", en: "1 hour before" },
  "seriesNotif.hours2": { ru: "За 2 часа", en: "2 hours before" },
  "seriesNotif.hours6": { ru: "За 6 часов", en: "6 hours before" },
  "seriesNotif.hours24": { ru: "За сутки", en: "A day before" },
  "seriesNotif.hours48": { ru: "За двое суток", en: "Two days before" },
  "seriesNotif.pin": { ru: "Закреплять анонс в группах", en: "Pin the announcement in groups" },
  "seriesNotif.pinYes": { ru: "Закреплять", en: "Pin" },
  "seriesNotif.pinNo": { ru: "Не закреплять", en: "Do not pin" },
  "time.heading": { ru: "Время проведения", en: "Time" },
  "time.start": { ru: "Начало", en: "Start" },
  "time.end": { ru: "Окончание", en: "End" },
  "time.hourOption": { ru: "{h}ч", en: "{h}h" },
  "courts.count": { ru: "Количество кортов", en: "Number of courts" },
  "courts.namePrefix": { ru: "Корт", en: "Court" },
  "courts.names": { ru: "Названия кортов", en: "Court names" },
  "score.servesPerPlayer": { ru: "Подач на игрока", en: "Serves per player" },
  "score.gamesPerSet": { ru: "Геймов в сете", en: "Games per set" },
  "players.minStrong": { ru: "Минимум {n} игроков", en: "Minimum {n} players" },
  "players.minRest": { ru: "требуется для старта игры", en: "required to start the game" },
  "rules.heading": { ru: "Правила игры", en: "Game rules" },
  "format.label": { ru: "Формат игры", en: "Game format" },
  "format.americano": { ru: "Американка", en: "Americano" },
  "format.americanoDesc": { ru: "Партнёры меняются каждый раунд. Классический микс.", en: "Partners change every round. The classic mix." },
  "format.mexicano": { ru: "Мексикано", en: "Mexicano" },
  "format.mexicanoDesc": {
    ru: "Пары каждый раунд по текущей таблице лидеров; раунды добавляются по ходу.",
    en: "Pairs are formed every round from the current leaderboard; rounds are added as you go.",
  },
  "format.fixedPairs": { ru: "Фиксированные пары", en: "Fixed pairs" },
  "format.fixedPairsDesc": {
    ru: "Партнёр не меняется весь матч; пары играют круговую (каждая с каждой).",
    en: "Your partner stays the same for the whole match; pairs play a round robin (each vs each).",
  },
  "scoring.label": { ru: "Система счёта", en: "Scoring system" },
  "scoring.points": { ru: "Очки (американка)", en: "Points (americano)" },
  "scoring.pointsDesc": { ru: "Фиксированное число очков на матч, счёт вида 16:8", en: "A fixed number of points per match, scores like 16:8" },
  "scoring.sets": { ru: "Сеты (как в теннисе)", en: "Sets (as in tennis)" },
  "scoring.setsDesc": { ru: "Счёт по геймам и сетам, вида 6:4", en: "Scoring by games and sets, like 6:4" },
  "sets.one": { ru: "1 сет", en: "1 set" },
  "sets.upToGames": { ru: "До {n} геймов", en: "Up to {n} games" },
  "sets.bestOf3": { ru: "До 2 побед", en: "First to 2 wins" },
  "sets.bestOf3Desc": { ru: "Лучший из 3 сетов", en: "Best of 3 sets" },
  "visibility.label": { ru: "Видимость", en: "Visibility" },
  "visibility.public": { ru: "Открытая", en: "Public" },
  "visibility.publicDesc": { ru: "Видна всем в /games. Любой может записаться. По умолчанию.", en: "Visible to everyone in /games. Anyone can join. Default." },
  "visibility.private": { ru: "Приватная", en: "Private" },
  "visibility.privateDesc": {
    ru: "В /games видна, но детали (состав, раунды) — только участникам, приглашённым и автору.",
    en: "Listed in /games, but the details (lineup, rounds) are visible only to participants, invitees and the organizer.",
  },
  "rating.limit": { ru: "Ограничение по рейтингу", en: "Rating limit" },
  "rating.limitDesc": {
    ru: "Пускать только игроков с рейтингом в заданном диапазоне. Организатор может добавить любого вручную.",
    en: "Admit only players whose rating is within the given range. The organizer can add anyone manually.",
  },
  "rating.min": { ru: "Минимум", en: "Minimum" },
  "rating.minPlaceholder": { ru: "напр. 1000", en: "e.g. 1000" },
  "rating.max": { ru: "Максимум", en: "Maximum" },
  "rating.maxPlaceholder": { ru: "напр. 1400", en: "e.g. 1400" },
  "rounds.label": { ru: "Раунды", en: "Rounds" },
  "rounds.auto": { ru: "Автоматически", en: "Automatic" },
  "rounds.autoDesc": { ru: "Система подберёт оптимальное число раундов", en: "The system will pick the optimal number of rounds" },
  "rounds.manual": { ru: "Вручную", en: "Manual" },
  "rounds.manualDesc": { ru: "Вы укажете количество раундов сами", en: "You set the number of rounds yourself" },
  "rounds.autoHint": {
    ru: "Количество раундов будет рассчитано автоматически при старте игры.",
    en: "The number of rounds will be calculated automatically when the game starts.",
  },
  "confirm.heading": { ru: "Подтверждение", en: "Confirmation" },
  "confirm.dateTime": { ru: "Дата и время", en: "Date & time" },
  "confirm.courts": { ru: "Кортов", en: "Courts" },
  "confirm.playersPlus": { ru: "{n}+ игроков", en: "{n}+ players" },
  "confirm.format": { ru: "Формат", en: "Format" },
  "confirm.formatAmericano": { ru: "Каждый с каждым", en: "Round robin" },
  "confirm.formatMexicano": { ru: "По таблице лидеров", en: "By the leaderboard" },
  "confirm.formatFixed": { ru: "Круговая по парам", en: "Round robin by pairs" },
  "confirm.score": { ru: "Счёт", en: "Scoring" },
  "confirm.pointsSummary": { ru: "{n} подач · очки", en: "{n} serves · points" },
  "confirm.toTwoWins": { ru: "до 2 побед", en: "first to 2 wins" },
  "confirm.upToGames": { ru: "до {n} геймов", en: "up to {n} games" },
  "tg.announce": { ru: "Отправить анонс в Telegram", en: "Send an announcement to Telegram" },
  "submit.saving": { ru: "Сохраняем…", en: "Saving…" },
  "submit.saveSubscription": { ru: "Сохранить подписку", en: "Save subscription" },
  "submit.createTournament": { ru: "Создать турнир", en: "Create tournament" },
  "submit.createGame": { ru: "Создать игру", en: "Create game" },
  "errors.pickDay": { ru: "Выберите хотя бы один день недели", en: "Select at least one day of the week" },
  "errors.dateInPast": { ru: "Дата игры не может быть в прошлом", en: "The game date cannot be in the past" },
  "errors.ratingRange": {
    ru: "Укажите минимум и/или максимум рейтинга, либо отключите ограничение",
    en: "Set a minimum and/or maximum rating, or turn the limit off",
  },
  "errors.minRating": { ru: "Минимальный рейтинг должен быть числом ≥ 0", en: "The minimum rating must be a number ≥ 0" },
  "errors.maxRating": { ru: "Максимальный рейтинг должен быть числом ≥ 0", en: "The maximum rating must be a number ≥ 0" },
  "errors.minAboveMax": { ru: "Минимальный рейтинг не может быть больше максимального", en: "The minimum rating cannot be greater than the maximum" },
} satisfies Dict;

function todayIso(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function V0CreateEventPage(props: {
  me: any;
  meLoaded?: boolean;
}) {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, lang } = useI18n(TR);
  const editSeriesId = searchParams.get("editSeries");
  const isEditing = !!editSeriesId;
  // Турнир (?kind=tournament): та же форма, но событие не влияет на рейтинг,
  // всегда разовое, а на странице события можно вписывать гостей.
  const isTournament = searchParams.get("kind") === "tournament";
  const [recurring, setRecurring] = useState(!isTournament && (searchParams.get("recurring") === "1" || isEditing));
  const [daysOfWeek, setDaysOfWeek] = useState<Set<string>>(new Set());
  const [materializeHoursBefore, setMaterializeHoursBefore] = useState(168);
  const [materializeAtHour, setMaterializeAtHour] = useState(9);
  const [materializeMode, setMaterializeMode] = useState<"HOURS_BEFORE" | "WEEKLY_SUNDAY">("HOURS_BEFORE");
  // Per-series уведомления (override глобальных Telegram-настроек).
  // null = использовать глобальные. Конкретное значение = переопределить для этой серии.
  const [seriesReminderHours, setSeriesReminderHours] = useState<number | null>(null);
  const [seriesPinAnnouncement, setSeriesPinAnnouncement] = useState<boolean | null>(null);
  const [title, setTitle] = useState(() => (isTournament ? t("basic.defaultTitleTournament") : t("basic.defaultTitleGame")));
  const [date, setDate] = useState(todayIso());
  const [startHour, setStartHour] = useState("19");
  const [startMinute, setStartMinute] = useState("00");
  const [endHour, setEndHour] = useState("21");
  const [endMinute, setEndMinute] = useState("00");
  const [pairingMode, setPairingMode] = useState<PairingMode>("ROUND_ROBIN");
  const [format, setFormat] = useState<EventFormat>("AMERICANA");
  const [courts, setCourts] = useState(2);
  const [courtNames, setCourtNames] = useState<string[]>(() => [`${t("courts.namePrefix")} A`, `${t("courts.namePrefix")} B`]);
  const [autoRounds, setAutoRounds] = useState(true);
  const [rounds, setRounds] = useState(6);
  const [pointsPerPlayer, setPointsPerPlayer] = useState(6);
  // Система счёта: POINTS (американка, очки) или SETS (сеты/геймы как в теннисе).
  const [scoringMode, setScoringMode] = useState<"POINTS" | "SETS">("POINTS");
  const [gamesPerSet, setGamesPerSet] = useState(6);
  const [setsPerMatch, setSetsPerMatch] = useState(1);
  const [visibility, setVisibility] = useState<EventVisibility>("PUBLIC");
  const [ratingLimitEnabled, setRatingLimitEnabled] = useState(false);
  const [minRatingStr, setMinRatingStr] = useState("");
  const [maxRatingStr, setMaxRatingStr] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [roundsMode, setRoundsMode] = useState<"auto" | "manual">("auto");
  const [step] = useState(1);
  const [telegramChats, setTelegramChats] = useState<TelegramChat[]>([]);
  const [selectedTgChatIds, setSelectedTgChatIds] = useState<Set<string>>(new Set());

  // Initial-загрузка: параллельно тянем telegram-чаты и (если редактируем) серию,
  // и только когда оба готовы — снимаем initialLoading и показываем форму.
  // Без этого «Отправить анонс в Telegram» подгружался позже самой формы; плюс был
  // race между TG-эффектом (set всех) и series-эффектом (set сохранённого).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tgStatus, tgList, series] = await Promise.all([
          api.getTelegramStatus().catch(() => null),
          api.getTelegramChats().catch(() => [] as TelegramChat[]),
          editSeriesId ? api.getEventSeries(editSeriesId) : Promise.resolve(null),
        ]);
        if (cancelled) return;

        const groupOnly = (tgStatus?.enabled ? tgList : []).filter((c) => c.chatType !== "PRIVATE");
        setTelegramChats(groupOnly);

        if (series && editSeriesId) {
          // Редактируем существующую серию: заполняем поля её данными.
          setTitle(series.title);
          setDaysOfWeek(new Set(series.daysOfWeek.split(",").map((d) => d.trim()).filter(Boolean)));
          const [sh, sm] = series.startTime.slice(0, 5).split(":");
          const [eh, em] = series.endTime.slice(0, 5).split(":");
          setStartHour(sh); setStartMinute(sm);
          setEndHour(eh); setEndMinute(em);
          setCourts(series.courtsCount);
          setPointsPerPlayer(series.pointsPerPlayerPerMatch);
          setVisibility(series.visibility);
          setMaterializeHoursBefore(series.materializeHoursBefore);
          const matH = parseInt(series.materializeAtTime?.slice(0, 2) ?? "9", 10);
          if (!Number.isNaN(matH)) setMaterializeAtHour(matH);
          setMaterializeMode(series.materializeMode ?? "HOURS_BEFORE");
          setSeriesReminderHours(series.reminderHours ?? null);
          setSeriesPinAnnouncement(series.pinAnnouncement ?? null);
          // Галки чатов = ровно сохранённое (пусто → ничего не выбрано).
          setSelectedTgChatIds(new Set(series.targetChatIds ?? []));
        } else {
          // Создание новой игры/серии: по умолчанию выбираем все доступные группы.
          setSelectedTgChatIds(new Set(groupOnly.map((c) => c.id)));
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? TR["create.loadFailed"][getCurrentLang()]);
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [editSeriesId]);

  useEffect(() => {
    if (!props.meLoaded) return;
    if (!props.me) nav("/login");
    else if (!props.me.surveyCompleted) nav("/survey");
  }, [props.me, props.meLoaded, nav]);


  useEffect(() => {
    setAutoRounds(roundsMode === "auto");
  }, [roundsMode]);

  useEffect(() => {
    if (date !== todayIso()) return;
    const now = new Date();
    const nextStartHour = now.getHours().toString().padStart(2, "0");
    setStartHour(nextStartHour);
    setStartMinute("00");
    const end = Math.min(now.getHours() + 2, 23).toString().padStart(2, "0");
    setEndHour(end);
    setEndMinute("00");
  }, [date]);

  useEffect(() => {
    setCourtNames((prev) => {
      const next = [...prev];
      if (next.length < courts) {
        for (let i = next.length; i < courts; i += 1) {
          next.push(`${t("courts.namePrefix")} ${String.fromCharCode(65 + i)}`);
        }
      } else if (next.length > courts) {
        next.length = courts;
      }
      return next;
    });
  }, [courts, t]);

  const minPlayers = useMemo(() => Math.max(1, courts) * 4, [courts]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const startTime = `${startHour}:${startMinute}`;
      const endTime = `${endHour}:${endMinute}`;

      // Регулярная игра (подписка): создаём или обновляем EventSeries.
      if (recurring) {
        if (daysOfWeek.size === 0) {
          throw new Error(t("errors.pickDay"));
        }
        const tz = (() => {
          try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
        })();
        if (editSeriesId) {
          await api.updateEventSeries(editSeriesId, {
            title,
            daysOfWeek: Array.from(daysOfWeek).join(","),
            startTime,
            endTime,
            timezone: tz,
            courtsCount: courts,
            pairingMode,
            scoringMode: "POINTS",
            pointsPerPlayerPerMatch: pointsPerPlayer,
            visibility,
            materializeHoursBefore,
            materializeMode,
            // Per-series override уведомлений. null = сбросить (использовать глобальные).
            ...(seriesReminderHours === null
              ? { clearReminderHours: true }
              : { reminderHours: seriesReminderHours }),
            ...(seriesPinAnnouncement === null
              ? { clearPinAnnouncement: true }
              : { pinAnnouncement: seriesPinAnnouncement }),
            targetChatIds: Array.from(selectedTgChatIds),
          });
          nav(`/settings?tab=subscriptions&highlight=${editSeriesId}`);
          return;
        }
        const created = await api.createEventSeries({
          title,
          daysOfWeek: Array.from(daysOfWeek).join(","),
          startTime,
          endTime,
          timezone: tz,
          courtsCount: courts,
          pairingMode,
          scoringMode: "POINTS",
          pointsPerPlayerPerMatch: pointsPerPlayer,
          visibility,
          materializeHoursBefore,
          materializeAtTime: `${String(materializeAtHour).padStart(2, "0")}:00`,
          materializeMode,
          // Per-series override уведомлений (null → бэк сохранит null → использует глобальные).
          reminderHours: seriesReminderHours,
          pinAnnouncement: seriesPinAnnouncement,
          targetChatIds: Array.from(selectedTgChatIds),
        });
        nav(`/settings?tab=subscriptions&highlight=${created.id}`);
        return;
      }

      const startDt = new Date(`${date}T${startTime}`);
      let endDt = new Date(`${date}T${endTime}`);
      // Если окончание раньше начала — значит игра переходит за полночь
      if (endDt.getTime() <= startDt.getTime()) {
        endDt = new Date(endDt.getTime() + 24 * 60 * 60 * 1000);
      }
      const todayStr = todayIso();
      if (Number.isNaN(startDt.getTime()) || date < todayStr) {
        throw new Error(t("errors.dateInPast"));
      }
      // Ограничение по рейтингу (задача #9): опционально, обе границы необязательны.
      let minRating: number | undefined;
      let maxRating: number | undefined;
      if (ratingLimitEnabled) {
        const minRaw = minRatingStr.trim();
        const maxRaw = maxRatingStr.trim();
        if (minRaw === "" && maxRaw === "") {
          throw new Error(t("errors.ratingRange"));
        }
        if (minRaw !== "") {
          const v = Number(minRaw);
          if (!Number.isFinite(v) || v < 0) throw new Error(t("errors.minRating"));
          minRating = Math.round(v);
        }
        if (maxRaw !== "") {
          const v = Number(maxRaw);
          if (!Number.isFinite(v) || v < 0) throw new Error(t("errors.maxRating"));
          maxRating = Math.round(v);
        }
        if (minRating != null && maxRating != null && minRating > maxRating) {
          throw new Error(t("errors.minAboveMax"));
        }
      }
      const created = await api.createEvent({
        title,
        date,
        startTime,
        endTime,
        format,
        pairingMode,
        courtsCount: courts,
        courtNames: courtNames.map((name, idx) => (name?.trim() ? name.trim() : `${t("courts.namePrefix")} ${idx + 1}`)),
        autoRounds,
        roundsPlanned: autoRounds ? undefined : rounds,
        scoringMode,
        pointsPerPlayerPerMatch: pointsPerPlayer,
        ...(scoringMode === "SETS"
          ? { setsPerMatch, gamesPerSet, tiebreakEnabled: true }
          : {}),
        visibility,
        minRating,
        maxRating,
        telegramChatIds: selectedTgChatIds.size > 0 ? Array.from(selectedTgChatIds) : undefined,
        ...(isTournament ? { kind: "TOURNAMENT" as const } : {}),
      });
      nav(`/events/${created.id}`);
    } catch (err: any) {
      setError(err?.message ?? t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  if (initialLoading) {
    return (
      <TooltipProvider>
        <div className="mx-auto max-w-3xl py-16 text-center text-sm text-muted-foreground">
          {t("common.loading")}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-8">
        {isEditing ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => nav("/settings?tab=subscriptions")}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("edit.backToSubscriptions")}
            </button>
            <h1 className="text-3xl font-bold tracking-tight">{t("edit.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("edit.note")}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2">
                {isTournament ? <Trophy className="h-4 w-4 text-primary" /> : <Lightbulb className="h-4 w-4 text-primary" />}
                <span className="text-sm font-medium text-primary">
                  {isTournament ? t("create.badgeTournament") : t("create.badgeGame")}
                </span>
              </div>
              <h1 className="text-4xl font-bold tracking-tight">
                {isTournament ? t("create.titleTournament") : t("create.titleGame")}
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl">
                {isTournament ? t("create.descTournament") : t("create.descGame")}
              </p>
            </div>

            <div className="flex gap-2">
              {[1, 2, 3].map((s) => (
                <div key={s} className={cn("h-1.5 flex-1 rounded-full transition-all", s <= step ? "bg-primary" : "bg-secondary")} />
              ))}
            </div>

            {/* Тип: разовая или регулярная (подписка). От этого зависит, выбираем
                ли мы конкретную дату или дни недели + горизонт материализации.
                Турнир всегда разовый — переключатель не показываем. */}
            <div className={cn("grid gap-3 sm:grid-cols-2", isTournament && "hidden")}>
              {[
                { id: false, icon: Calendar, title: t("type.oneOff"), desc: t("type.oneOffDesc") },
                { id: true, icon: Repeat, title: t("type.recurring"), desc: t("type.recurringDesc") },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = recurring === opt.id;
                return (
                  <button
                    key={String(opt.id)}
                    type="button"
                    onClick={() => setRecurring(opt.id)}
                    className={cn(
                      "relative rounded-lg border-2 p-4 text-left transition-all",
                      active ? "border-primary bg-primary/5" : "border-border bg-secondary/50 hover:border-border/80",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
                      <div className="font-semibold">{opt.title}</div>
                    </div>
                    <div className="text-sm text-muted-foreground mt-2">{opt.desc}</div>
                    {active ? (
                      <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                        <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="space-y-6">
          <div className="space-y-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                1
              </span>
              {t("basic.heading")}
            </h2>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="font-medium">
                    {t("basic.gameName")}
                  </Label>
                  <Input
                    id="name"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="bg-secondary border-border h-11"
                    placeholder={t("basic.gameNamePlaceholder")}
                  />
                </div>

                {recurring ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="font-medium">{t("materialize.label")}</Label>
                      <Select
                        value={materializeMode === "WEEKLY_SUNDAY" ? "weekly_sunday" : materializeHoursBefore.toString()}
                        onValueChange={(v) => {
                          if (v === "weekly_sunday") {
                            setMaterializeMode("WEEKLY_SUNDAY");
                          } else {
                            setMaterializeMode("HOURS_BEFORE");
                            setMaterializeHoursBefore(Number(v));
                          }
                        }}
                      >
                        <SelectTrigger className="bg-secondary border-border h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="24">{t("materialize.day1")}</SelectItem>
                          <SelectItem value="72">{t("materialize.days3")}</SelectItem>
                          <SelectItem value="168">{t("materialize.week1")}</SelectItem>
                          <SelectItem value="336">{t("materialize.weeks2")}</SelectItem>
                          <SelectItem value="weekly_sunday">{t("materialize.weeklySunday")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-medium">{t("materialize.announceTime")}</Label>
                      <Select
                        value={materializeAtHour.toString()}
                        onValueChange={(v) => setMaterializeAtHour(Number(v))}
                      >
                        <SelectTrigger className="bg-secondary border-border h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => (
                            <SelectItem key={h} value={h.toString()}>
                              {h.toString().padStart(2, "0")}:00
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="date" className="font-medium">
                      {t("date.label")}
                    </Label>
                    <div
                      className="relative flex items-center gap-2 rounded-md border border-border bg-secondary px-3 h-11 cursor-pointer"
                      onClick={() => (document.getElementById("date-hidden") as HTMLInputElement)?.showPicker?.()}
                    >
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm flex-1">
                        {new Date(date + "T00:00:00").toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </span>
                      <input
                        id="date-hidden"
                        type="date"
                        value={date}
                        onChange={(e) => { if (e.target.value) setDate(e.target.value); }}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              {recurring && (
                <div className="space-y-2">
                  <Label className="font-medium">{t("days.label")}</Label>
                  <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                    {[
                      { id: "MON", label: t("days.mon") },
                      { id: "TUE", label: t("days.tue") },
                      { id: "WED", label: t("days.wed") },
                      { id: "THU", label: t("days.thu") },
                      { id: "FRI", label: t("days.fri") },
                      { id: "SAT", label: t("days.sat") },
                      { id: "SUN", label: t("days.sun") },
                    ].map((d) => {
                      const selected = daysOfWeek.has(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setDaysOfWeek((prev) => {
                              const next = new Set(prev);
                              if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
                              return next;
                            });
                          }}
                          className={cn(
                            "h-10 rounded-md border-2 text-sm font-medium transition-all",
                            selected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-secondary/50 text-muted-foreground hover:border-border/80",
                          )}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("days.hint")}
                  </p>
                </div>
              )}

              {recurring && (
                <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t("seriesNotif.heading")}
                  </div>
                  <p className="text-xs text-muted-foreground -mt-1">
                    {t("seriesNotif.hint")}
                  </p>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <div className="text-sm sm:flex-1">{t("seriesNotif.reminder")}</div>
                    <Select
                      value={seriesReminderHours === null ? "global" : String(seriesReminderHours)}
                      onValueChange={(v) =>
                        setSeriesReminderHours(v === "global" ? null : Number(v))
                      }
                    >
                      <SelectTrigger className="w-full sm:w-[200px] h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">{t("seriesNotif.global")}</SelectItem>
                        <SelectItem value="0">{t("seriesNotif.dontSend")}</SelectItem>
                        <SelectItem value="1">{t("seriesNotif.hours1")}</SelectItem>
                        <SelectItem value="2">{t("seriesNotif.hours2")}</SelectItem>
                        <SelectItem value="6">{t("seriesNotif.hours6")}</SelectItem>
                        <SelectItem value="24">{t("seriesNotif.hours24")}</SelectItem>
                        <SelectItem value="48">{t("seriesNotif.hours48")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <div className="text-sm sm:flex-1">{t("seriesNotif.pin")}</div>
                    <Select
                      value={
                        seriesPinAnnouncement === null
                          ? "global"
                          : seriesPinAnnouncement
                            ? "yes"
                            : "no"
                      }
                      onValueChange={(v) =>
                        setSeriesPinAnnouncement(
                          v === "global" ? null : v === "yes" ? true : false,
                        )
                      }
                    >
                      <SelectTrigger className="w-full sm:w-[200px] h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">{t("seriesNotif.global")}</SelectItem>
                        <SelectItem value="yes">{t("seriesNotif.pinYes")}</SelectItem>
                        <SelectItem value="no">{t("seriesNotif.pinNo")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Label className="font-medium">{t("time.heading")}</Label>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl p-5 border border-primary/20">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">{t("time.start")}</span>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                      <Select value={startHour} onValueChange={setStartHour}>
                        <SelectTrigger className="w-full bg-background border-primary/30 h-12 text-base font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem key={i} value={i.toString().padStart(2, "0")}>
                              {t("time.hourOption", { h: i.toString().padStart(2, "0") })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center text-muted-foreground font-semibold">:</div>
                      <Select value={startMinute} onValueChange={setStartMinute}>
                        <SelectTrigger className="w-full bg-background border-primary/30 h-12 text-base font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["00", "15", "30", "45"].map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-accent/10 to-accent/5 rounded-xl p-5 border border-accent/20">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="h-4 w-4 text-accent" />
                      <span className="text-sm font-semibold text-foreground">{t("time.end")}</span>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                      <Select value={endHour} onValueChange={setEndHour}>
                        <SelectTrigger className="w-full bg-background border-accent/30 h-12 text-base font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem key={i} value={i.toString().padStart(2, "0")}>
                              {t("time.hourOption", { h: i.toString().padStart(2, "0") })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center text-muted-foreground font-semibold">:</div>
                      <Select value={endMinute} onValueChange={setEndMinute}>
                        <SelectTrigger className="w-full bg-background border-accent/30 h-12 text-base font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["00", "15", "30", "45"].map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="courts" className="font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    {t("courts.count")}
                  </Label>
                  <Select value={courts.toString()} onValueChange={(value) => setCourts(Number(value))}>
                    <SelectTrigger id="courts" className="bg-secondary border-border h-10 text-sm font-semibold px-4 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="text-sm max-h-40 overflow-y-auto">
                      {Array.from({ length: 12 }, (_, i) => {
                        const value = (i + 1).toString();
                        return (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                {scoringMode === "POINTS" ? (
                <div className="space-y-2">
                  <Label htmlFor="serves" className="font-medium flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    {t("score.servesPerPlayer")}
                  </Label>
                  <Select value={pointsPerPlayer.toString()} onValueChange={(value) => setPointsPerPlayer(Number(value))}>
                    <SelectTrigger id="serves" className="bg-secondary border-border h-10 text-sm font-semibold px-4 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="text-sm max-h-72 overflow-y-auto">
                      {Array.from({ length: 20 }, (_, i) => {
                        const value = (i + 1).toString();
                        return (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                ) : (
                <div className="space-y-2">
                  <Label htmlFor="gamesPerSet" className="font-medium flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    {t("score.gamesPerSet")}
                  </Label>
                  <Select value={gamesPerSet.toString()} onValueChange={(value) => setGamesPerSet(Number(value))}>
                    <SelectTrigger id="gamesPerSet" className="bg-secondary border-border h-10 text-sm font-semibold px-4 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="text-sm max-h-72 overflow-y-auto">
                      {[4, 6, 8, 9].map((v) => (
                        <SelectItem key={v} value={v.toString()}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                )}
                <div className="space-y-2 pt-2 md:col-span-2">
                  <div className="text-xs text-muted-foreground">{t("courts.names")}</div>
                  <div className="grid gap-2 md:grid-cols-4">
                    {courtNames.map((name, idx) => (
                      <Input
                        key={`court-${idx}`}
                        value={name}
                        onChange={(e) => {
                          const next = [...courtNames];
                          next[idx] = e.target.value;
                          setCourtNames(next);
                        }}
                        className="bg-secondary border-border h-10"
                        placeholder={`${t("courts.namePrefix")} ${String.fromCharCode(65 + idx)}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 rounded-lg border border-amber-500/40 dark:border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                <Users className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0" />
                <p className="text-amber-800 dark:text-amber-200">
                  <strong>{t("players.minStrong", { n: minPlayers })}</strong> {t("players.minRest")}
                </p>
              </div>
            </div>

            <div className="border-t border-border pt-8 space-y-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                  2
                </span>
                {t("rules.heading")}
              </h2>

              {!recurring && (
                <div className="space-y-3">
                  <Label className="font-medium flex items-center gap-2">
                    <Gamepad2 className="h-4 w-4 text-primary" />
                    {t("format.label")}
                  </Label>
                  <div className="grid gap-3 md:grid-cols-3">
                    {[
                      { id: "AMERICANA" as EventFormat, title: t("format.americano"), desc: t("format.americanoDesc") },
                      { id: "MEXICANO" as EventFormat, title: t("format.mexicano"), desc: t("format.mexicanoDesc") },
                      { id: "FIXED_PAIRS" as EventFormat, title: t("format.fixedPairs"), desc: t("format.fixedPairsDesc") },
                    ].map((opt) => {
                      const active = format === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setFormat(opt.id)}
                          className={cn(
                            "relative rounded-lg border-2 p-4 text-left transition-all",
                            active ? "border-primary bg-primary/5" : "border-border bg-secondary/50 hover:border-border/80",
                          )}
                        >
                          <div className="font-semibold">{opt.title}</div>
                          <div className="text-sm text-muted-foreground mt-1">{opt.desc}</div>
                          {active ? (
                            <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                              <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Label className="font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  {t("scoring.label")}
                </Label>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { id: "POINTS" as const, title: t("scoring.points"), desc: t("scoring.pointsDesc") },
                    { id: "SETS" as const, title: t("scoring.sets"), desc: t("scoring.setsDesc") },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setScoringMode(mode.id)}
                      className={cn(
                        "relative rounded-lg border-2 p-4 text-left transition-all",
                        scoringMode === mode.id ? "border-primary bg-primary/5" : "border-border bg-secondary/50 hover:border-border/80",
                      )}
                    >
                      <div className="font-semibold">{mode.title}</div>
                      <div className="text-sm text-muted-foreground mt-1">{mode.desc}</div>
                      {scoringMode === mode.id ? (
                        <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                          <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
                {scoringMode === "SETS" && (
                  <div className="grid gap-3 md:grid-cols-2 pt-1">
                    {[
                      { v: 1, title: t("sets.one"), desc: t("sets.upToGames", { n: gamesPerSet }) },
                      { v: 3, title: t("sets.bestOf3"), desc: t("sets.bestOf3Desc") },
                    ].map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setSetsPerMatch(opt.v)}
                        className={cn(
                          "relative rounded-lg border-2 p-3 text-left transition-all",
                          setsPerMatch === opt.v ? "border-primary bg-primary/5" : "border-border bg-secondary/50 hover:border-border/80",
                        )}
                      >
                        <div className="font-semibold text-sm">{opt.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Label className="font-medium">{t("visibility.label")}</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { id: "PUBLIC" as EventVisibility, icon: Globe, title: t("visibility.public"), desc: t("visibility.publicDesc") },
                    { id: "PRIVATE" as EventVisibility, icon: Lock, title: t("visibility.private"), desc: t("visibility.privateDesc") },
                  ].map((opt) => {
                    const Icon = opt.icon;
                    const active = visibility === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setVisibility(opt.id)}
                        className={cn(
                          "relative rounded-lg border-2 p-4 text-left transition-all",
                          active ? "border-primary bg-primary/5" : "border-border bg-secondary/50 hover:border-border/80",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
                          <div className="font-semibold">{opt.title}</div>
                        </div>
                        <div className="text-sm text-muted-foreground mt-2">{opt.desc}</div>
                        {active ? (
                          <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                            <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {!recurring && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Label className="font-medium">{t("rating.limit")}</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t("rating.limitDesc")}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={ratingLimitEnabled}
                      aria-label={t("rating.limit")}
                      onClick={() => setRatingLimitEnabled((v) => !v)}
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                        ratingLimitEnabled ? "bg-primary" : "bg-input",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform",
                          ratingLimitEnabled ? "translate-x-5" : "translate-x-0.5",
                        )}
                      />
                    </button>
                  </div>
                  {ratingLimitEnabled && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="minRating" className="text-sm text-muted-foreground">{t("rating.min")}</Label>
                        <Input
                          id="minRating"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          placeholder={t("rating.minPlaceholder")}
                          value={minRatingStr}
                          onChange={(e) => setMinRatingStr(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="maxRating" className="text-sm text-muted-foreground">{t("rating.max")}</Label>
                        <Input
                          id="maxRating"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          placeholder={t("rating.maxPlaceholder")}
                          value={maxRatingStr}
                          onChange={(e) => setMaxRatingStr(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-3">
                <Label className="font-medium">{t("rounds.label")}</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { id: "auto" as const, title: t("rounds.auto"), desc: t("rounds.autoDesc") },
                    { id: "manual" as const, title: t("rounds.manual"), desc: t("rounds.manualDesc") },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setRoundsMode(mode.id)}
                      className={cn(
                        "relative rounded-lg border-2 p-4 text-left transition-all",
                        roundsMode === mode.id ? "border-primary bg-primary/5" : "border-border bg-secondary/50 hover:border-border/80",
                      )}
                    >
                      <div className="font-semibold">{mode.title}</div>
                      <div className="text-sm text-muted-foreground mt-1">{mode.desc}</div>
                      {roundsMode === mode.id ? (
                        <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                          <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
                {roundsMode === "manual" ? (
                  <Input type="number" min={1} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} className="bg-secondary border-border h-11" />
                ) : (
                  <div className="text-sm text-muted-foreground">{t("rounds.autoHint")}</div>
                )}
              </div>
            </div>

            <div className="border-t border-border pt-8 space-y-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                  3
                </span>
                {t("confirm.heading")}
              </h2>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg bg-secondary/50 p-4 border border-border/50">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{t("confirm.dateTime")}</div>
                  <div className="font-semibold text-lg">{date}</div>
                  <div className="text-sm text-muted-foreground">
                    {startHour}:{startMinute} - {endHour}:{endMinute}
                  </div>
                </div>
                <div className="rounded-lg bg-secondary/50 p-4 border border-border/50">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{t("confirm.courts")}</div>
                  <div className="font-semibold text-lg">{courts} {plural(lang, courts, ["корт", "корта", "кортов"], ["court", "courts"])}</div>
                  <div className="text-sm text-muted-foreground">{t("confirm.playersPlus", { n: minPlayers })}</div>
                </div>
                <div className="rounded-lg bg-secondary/50 p-4 border border-border/50">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{t("confirm.format")}</div>
                  <div className="font-semibold text-lg">{format === "AMERICANA" ? t("format.americano") : format === "MEXICANO" ? t("format.mexicano") : t("format.fixedPairs")}</div>
                  <div className="text-sm text-muted-foreground">{format === "AMERICANA" ? t("confirm.formatAmericano") : format === "MEXICANO" ? t("confirm.formatMexicano") : t("confirm.formatFixed")}</div>
                </div>
                <div className="rounded-lg bg-secondary/50 p-4 border border-border/50">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{t("confirm.score")}</div>
                  {scoringMode === "POINTS" ? (
                    <div className="font-semibold text-lg">{t("confirm.pointsSummary", { n: pointsPerPlayer })}</div>
                  ) : (
                    <div className="font-semibold text-lg">{setsPerMatch === 1 ? t("sets.one") : t("confirm.toTwoWins")} · {t("confirm.upToGames", { n: gamesPerSet })}</div>
                  )}
                </div>
              </div>

              {telegramChats.length > 0 && (
                <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    <div className="text-sm font-medium">{t("tg.announce")}</div>
                  </div>
                  <div className="space-y-2">
                    {telegramChats.map((chat) => {
                      const checked = selectedTgChatIds.has(chat.id);
                      const Icon = chat.chatType === "PRIVATE" ? MessageCircle : chat.chatType === "CHANNEL" ? Send : UsersIcon;
                      return (
                        <label
                          key={chat.id}
                          className="flex items-center gap-3 rounded-md bg-background/60 hover:bg-background px-3 py-2 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-sky-500"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedTgChatIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(chat.id);
                                else next.delete(chat.id);
                                return next;
                              });
                            }}
                          />
                          <Icon className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                          <span className="text-sm flex-1 truncate">{chat.title}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1 h-12 bg-transparent" type="button" onClick={() => nav(isEditing ? "/settings?tab=subscriptions" : "/games")} disabled={loading}>
                  {t("common.cancel")}
                </Button>
                <Button className="flex-1 h-12 bg-primary text-primary-foreground" size="lg" disabled={loading}>
                  {isTournament ? <Trophy className="mr-2 h-5 w-5" /> : <Gamepad2 className="mr-2 h-5 w-5" />}
                  {loading ? t("submit.saving") : isEditing ? t("submit.saveSubscription") : isTournament ? t("submit.createTournament") : t("submit.createGame")}
                </Button>
              </div>

            {error ? (
              <CardContent className="px-0">
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">{error}</div>
              </CardContent>
            ) : null}
          </div>
        </div>
      </form>
    </TooltipProvider>
  );
}

