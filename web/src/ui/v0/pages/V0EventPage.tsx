import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, Clock, Globe, Lock, MapPin, Pencil, Repeat, Scale, Share2, Target, Trash2, Trophy, Tv, UserPlus, Users, Zap, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, BalancePreview, EventDetails, FriendItem, FriendsSnapshot, isUnauthorizedError, Match, Player } from "../../../lib/api";
import { AuthRequiredCard } from "@/components/auth-required-card";
import { PlayerTooltip } from "@/components/player-tooltip";
import { EventLeaderboard } from "@/components/event-leaderboard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ModalScrollArea } from "@/components/ui/modal-scroll-area";
import { EditGameScoresDialog } from "@/components/edit-game-scores-dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DatePicker, TimePicker } from "@/components/ui/date-picker";
import { cn, formatEventDate, timeRange } from "../utils";
import { Dict, Lang, plural, useI18n } from "@/lib/i18n";

const TR = {
  // Статусы события
  "status.draft": { ru: "Черновик", en: "Draft" },
  "status.registration": { ru: "Регистрация", en: "Registration" },
  "status.registrationClosed": { ru: "Регистрация закрыта", en: "Registration closed" },
  "status.inProgress": { ru: "Идёт", en: "Live" },
  "status.finished": { ru: "Завершено", en: "Finished" },
  "status.cancelled": { ru: "Отменено", en: "Cancelled" },
  "status.label": { ru: "Статус", en: "Status" },
  "status.gameInProgress": { ru: "Игра идёт", en: "Game in progress" },
  "status.gameFinished": { ru: "Игра завершена", en: "Game finished" },
  // Режим составления пар
  "pairing.balanced": { ru: "Равный бой", en: "Balanced" },
  "pairing.roundRobin": { ru: "Каждый с каждым", en: "Round robin" },
  // Общие
  "common.loading": { ru: "Загрузка…", en: "Loading…" },
  "common.loadFailed": { ru: "Не удалось загрузить", en: "Failed to load" },
  "common.loadError": { ru: "Ошибка загрузки", en: "Failed to load" },
  "auth.eventHint": {
    ru: "Эта игра доступна только участникам Padix. Войдите в аккаунт или зарегистрируйтесь — и увидите состав, расписание и счёт.",
    en: "This game is available to Padix members only. Sign in or create an account to see the line-up, schedule and scores.",
  },
  "common.notFound": { ru: "Событие не найдено.", en: "Event not found." },
  "common.backToGames": { ru: "Назад к играм", en: "Back to games" },
  "common.toGamesList": { ru: "К списку игр", en: "To games list" },
  "common.game": { ru: "Игра", en: "Game" },
  "common.cancel": { ru: "Отмена", en: "Cancel" },
  "common.save": { ru: "Сохранить", en: "Save" },
  "common.saving": { ru: "Сохраняем…", en: "Saving…" },
  "common.adding": { ru: "Добавляем…", en: "Adding…" },
  "common.delete": { ru: "Удалить", en: "Delete" },
  "common.add": { ru: "Добавить", en: "Add" },
  "common.later": { ru: "Позже", en: "Later" },
  "common.continue": { ru: "Продолжить", en: "Continue" },
  "common.cannotUndo": { ru: "Действие нельзя отменить.", en: "This action cannot be undone." },
  "common.rating": { ru: "Рейтинг", en: "Rating" },
  "common.loginToParticipate": { ru: "Войдите, чтобы участвовать и вводить счёт.", en: "Sign in to participate and enter scores." },
  // Заглушка приватной игры
  "private.title": { ru: "Приватная игра", en: "Private game" },
  "private.organizer": { ru: "Организатор", en: "Organizer" },
  "private.registered": { ru: "Записано", en: "Registered" },
  "private.accessNote": {
    ru: "Состав, раунды и счёт доступны только участникам игры и приглашённым. Попроси организатора пригласить тебя — приглашение придёт в раздел уведомлений.",
    en: "Players, rounds and scores are visible only to participants and invited players. Ask the organizer to invite you — the invitation will arrive in your notifications.",
  },
  // Шапка события
  "header.youAreAuthor": { ru: "Вы автор", en: "You're the author" },
  "header.author": { ru: "Автор", en: "Author" },
  "header.tournamentUnrated": { ru: "Турнир — вне рейтинга", en: "Tournament — unrated" },
  "header.mexicano": { ru: "Мексикано", en: "Mexicano" },
  "header.fixedPairs": { ru: "Фиксированные пары", en: "Fixed pairs" },
  "header.bySubscription": { ru: "По подписке", en: "By subscription" },
  "header.recurring": { ru: "Регулярная", en: "Recurring" },
  // Диапазон рейтинга
  "rating.from": { ru: "от {n}", en: "from {n}" },
  "rating.to": { ru: "до {n}", en: "up to {n}" },
  // Запись на игру
  "join.join": { ru: "Записаться", en: "Join" },
  "join.joining": { ru: "Запись…", en: "Joining…" },
  "join.youAreIn": { ru: "Вы записаны (отменить)", en: "You're in (cancel)" },
  "join.cancelling": { ru: "Отмена…", en: "Cancelling…" },
  "join.registered": { ru: "Вы записаны", en: "You're in" },
  "join.cancelled": { ru: "Регистрация отменена", en: "Registration cancelled" },
  "join.cancelError": { ru: "Ошибка отмены", en: "Failed to cancel" },
  "join.registerError": { ru: "Ошибка регистрации", en: "Failed to register" },
  "join.ratingMismatch": { ru: "Рейтинг не подходит", en: "Rating out of range" },
  "join.ratingOutOfRange": {
    ru: "Твой рейтинг {rating} вне диапазона {range}. Попроси организатора добавить тебя вручную.",
    en: "Your rating {rating} is outside the {range} range. Ask the organizer to add you manually.",
  },
  // Закрытие регистрации
  "close.closeRegistration": { ru: "Закрыть регистрацию", en: "Close registration" },
  "close.closing": { ru: "Закрываем…", en: "Closing…" },
  "close.error": { ru: "Ошибка закрытия", en: "Failed to close registration" },
  "close.confirmTitle": { ru: "Закрыть регистрацию?", en: "Close registration?" },
  "close.confirmDesc": {
    ru: "Новые игроки не смогут присоединиться к игре. После закрытия можно будет начать игру.",
    en: "New players won't be able to join. After closing you can start the game.",
  },
  "close.confirmLabel": { ru: "Закрыть", en: "Close" },
  // Старт игры
  "start.startGame": { ru: "Начать игру", en: "Start game" },
  "start.starting": { ru: "Стартуем…", en: "Starting…" },
  "start.error": { ru: "Ошибка старта", en: "Failed to start" },
  "start.readyTitle": { ru: "Готовы начать?", en: "Ready to start?" },
  "start.readyPrefix": { ru: "Игра", en: "The game" },
  "start.readySuffix": { ru: "готова к началу. Все участники зарегистрированы.", en: "is ready to start. All participants are registered." },
  // Действия в шапке
  "actions.enterScore": { ru: "Ввести счёт", en: "Enter score" },
  "actions.leaderboard": { ru: "Таблица лидеров", en: "Leaderboard" },
  "actions.onTv": { ru: "На ТВ", en: "On TV" },
  "actions.tvTitle": { ru: "Открыть табло для телевизора в новой вкладке", en: "Open the TV scoreboard in a new tab" },
  "actions.editScores": { ru: "Редактировать счет", en: "Edit scores" },
  "actions.invite": { ru: "Пригласить", en: "Invite" },
  "actions.editGame": { ru: "Редактировать игру", en: "Edit game" },
  "actions.deleteGame": { ru: "Удалить игру", en: "Delete game" },
  "actions.share": { ru: "Поделиться", en: "Share" },
  "share.copied": { ru: "Ссылка скопирована", en: "Link copied" },
  // Удаление игры
  "delete.confirmTitle": { ru: "Удалить игру?", en: "Delete game?" },
  "delete.gamePrefix": { ru: "Игра", en: "The game" },
  "delete.gameSuffix": { ru: "будет удалена со всеми регистрациями.", en: "will be deleted along with all registrations." },
  "delete.error": { ru: "Не удалось удалить игру", en: "Failed to delete game" },
  // Правка игры
  "edit.name": { ru: "Название", en: "Name" },
  "edit.date": { ru: "Дата", en: "Date" },
  "edit.start": { ru: "Начало", en: "Start" },
  "edit.end": { ru: "Окончание", en: "End" },
  "edit.scoringSystem": { ru: "Система счёта", en: "Scoring system" },
  "edit.points": { ru: "Очки", en: "Points" },
  "edit.sets": { ru: "Сеты", en: "Sets" },
  "edit.pointsPerPlayer": { ru: "Очков на игрока", en: "Points per player" },
  "edit.gamesPerSet": { ru: "Геймов в сете", en: "Games per set" },
  "edit.setsPerMatch": { ru: "Сетов в матче", en: "Sets per match" },
  "edit.courts": { ru: "Кортов", en: "Courts" },
  "edit.startedNote": {
    ru: "Игра уже стартовала — можно редактировать только название, дату, время и видимость.",
    en: "The game has already started — only the name, date, time and visibility can be edited.",
  },
  "edit.visibility": { ru: "Видимость", en: "Visibility" },
  "edit.public": { ru: "Открытая", en: "Public" },
  "edit.publicDesc": { ru: "Видна всем, любой может записаться", en: "Visible to everyone, anyone can join" },
  "edit.private": { ru: "Приватная", en: "Private" },
  "edit.privateDesc": { ru: "В /games видна, детали — только участникам", en: "Listed in /games, details for participants only" },
  "edit.updated": { ru: "Игра обновлена.", en: "Game updated." },
  "edit.saveError": { ru: "Не удалось сохранить", en: "Failed to save" },
  // Приглашение друзей
  "invite.title": { ru: "Пригласить друзей", en: "Invite friends" },
  "invite.noFriends": { ru: "Пока нет друзей для приглашения.", en: "No friends to invite yet." },
  "invite.addDirectTitle": { ru: "Добавить в игру сразу, без согласия друга", en: "Add to the game right away, without the friend's confirmation" },
  "invite.sendInviteTitle": { ru: "Отправить приглашение — друг сам решит присоединиться", en: "Send an invitation — the friend decides whether to join" },
  "invite.added": { ru: "Добавлен", en: "Added" },
  "invite.invited": { ru: "Приглашён", en: "Invited" },
  "invite.addError": { ru: "Не удалось добавить", en: "Failed to add" },
  "invite.inviteError": { ru: "Ошибка приглашения", en: "Failed to invite" },
  // Друзья
  "friends.loadError": { ru: "Ошибка загрузки друзей", en: "Failed to load friends" },
  "friends.noPublicId": { ru: "Не удалось определить публичный ID", en: "Couldn't determine the public ID" },
  "friends.requestSent": { ru: "Заявка отправлена", en: "Request sent" },
  // Модал баланса
  "balance.noEqualRounds": { ru: "Нет равных раундов", en: "No balanced rounds" },
  "balance.upTo": { ru: "Возможно", en: "Up to" },
  "balance.tooDiverse": {
    ru: "Состав слишком разнородный (разброс {spread}) — нет варианта, где команды получились бы равны по силе.",
    en: "The lineup is too uneven (spread {spread}) — there is no option where the teams would be equal in strength.",
  },
  "balance.maxReached": {
    ru: "Разброс рейтингов {spread}. С таким составом это максимум — больше равных раундов не получится. Запрошено {req}.",
    en: "Rating spread {spread}. This is the maximum for this lineup — more balanced rounds are not possible. Requested: {req}.",
  },
  "balance.allBalanced": {
    ru: "Разброс рейтингов {spread}, но команды получится сбалансировать во всех раундах.",
    en: "Rating spread {spread}, but the teams can be balanced in every round.",
  },
  "balance.switchedToRR": {
    ru: "Режим переключён на «Каждый с каждым». Теперь можно закрыть регистрацию.",
    en: "Mode switched to Round robin. You can close registration now.",
  },
  "balance.switchError": { ru: "Не удалось сменить режим", en: "Failed to switch mode" },
  "balance.switching": { ru: "Переключаем…", en: "Switching…" },
  // Карточки-сводка
  "stats.courts": { ru: "Корты", en: "Courts" },
  "stats.mode": { ru: "Режим", en: "Mode" },
  "stats.servesPerPlayer": { ru: "Подач на игрока", en: "Serves per player" },
  "stats.setsCount": { ru: "Сетов", en: "Sets" },
  "stats.players": { ru: "Игроков", en: "Players" },
  "stats.balance": { ru: "Баланс", en: "Balance" },
  "stats.spread": { ru: "разброс", en: "spread" },
  // Участники
  "participants.title": { ru: "Участники", en: "Participants" },
  "participants.minRequired": { ru: "Для старта нужно минимум {n} игроков", en: "At least {n} players are required to start" },
  "participants.count": { ru: "{a} из {b}", en: "{a} of {b}" },
  "participants.remove": { ru: "Исключить", en: "Remove" },
  "participants.removeConfirmTitle": { ru: "Исключить игрока?", en: "Remove player?" },
  "participants.removePrefix": { ru: "Игрок", en: "Player" },
  "participants.removeSuffix": { ru: "будет удалён из регистрации.", en: "will be removed from the registration." },
  "participants.removed": { ru: "Игрок исключен", en: "Player removed" },
  "participants.removeError": { ru: "Ошибка исключения", en: "Failed to remove player" },
  "participants.openSpot": { ru: "Свободно", en: "Open spot" },
  "participants.guest": { ru: "гость", en: "guest" },
  // Турнир: добавление участников
  "tournament.addParticipants": { ru: "Добавить участников турнира", en: "Add tournament participants" },
  "tournament.searchPlaceholder": { ru: "Найти зарегистрированного игрока по имени…", en: "Find a registered player by name…" },
  "tournament.nobodyFound": {
    ru: "Никого не нашли. Если человека нет в приложении — впишите его гостем ниже.",
    en: "Nobody found. If the person isn't in the app, add them as a guest below.",
  },
  "tournament.playerAdded": { ru: "{name} добавлен(а)", en: "{name} added" },
  "tournament.addPlayerError": { ru: "Ошибка добавления игрока", en: "Failed to add player" },
  "tournament.addBtn": { ru: "+ Добавить", en: "+ Add" },
  "tournament.guestPlaceholder": { ru: "Или впишите имя вручную (гость без аккаунта)…", en: "Or type a name manually (guest without an account)…" },
  "tournament.addGuest": { ru: "Вписать гостя", en: "Add guest" },
  "tournament.guestAdded": { ru: "Гость вписан", en: "Guest added" },
  "tournament.guestError": { ru: "Ошибка добавления гостя", en: "Failed to add guest" },
  "tournament.noRatingNote": {
    ru: "Турнир не влияет на рейтинг: итоговая таблица считается только по очкам.",
    en: "A tournament doesn't affect ratings: the final table is based on points only.",
  },
  // Фиксированные пары
  "pairs.addPair": { ru: "Добавить пару", en: "Add pair" },
  "pairs.player1": { ru: "Игрок 1…", en: "Player 1…" },
  "pairs.player2": { ru: "Игрок 2…", en: "Player 2…" },
  "pairs.pairAdded": { ru: "Пара добавлена", en: "Pair added" },
  "pairs.pairError": { ru: "Ошибка регистрации пары", en: "Failed to register the pair" },
  "pairs.note": {
    ru: "Пары играют круговую (каждая с каждой). Для {courts} кортов нужно {pairs} пар.",
    en: "Pairs play a round robin (each vs each). {courts} courts require {pairs} pairs.",
  },
  // Запросы на отмену
  "cancelRequests.title": { ru: "Запросы на отмену", en: "Cancellation requests" },
  "cancelRequests.subtitle": { ru: "Игроки хотят выйти из игры", en: "Players want to leave the game" },
  "cancelRequests.approve": { ru: "Подтвердить", en: "Approve" },
  "cancelRequests.approveError": { ru: "Ошибка подтверждения", en: "Failed to approve" },
  // Раунды
  "rounds.title": { ru: "Раунды", en: "Rounds" },
  "rounds.round": { ru: "Раунд", en: "Round" },
  "rounds.final": { ru: "Финальный", en: "Final" },
  "rounds.matches": { ru: "Матчей", en: "Matches" },
  "rounds.played": { ru: "Сыгран", en: "Played" },
  "rounds.deleteRound": { ru: "Удалить раунд", en: "Delete round" },
  "rounds.deleteConfirmTitle": { ru: "Удалить раунд?", en: "Delete round?" },
  "rounds.deleteWithMatches": { ru: "и его {n} {word} будут удалены.", en: "and its {n} {word} will be deleted." },
  "rounds.deleteAlone": { ru: "будет удалён.", en: "will be deleted." },
  "rounds.warnPlayedPrefix": { ru: "Из них", en: "Of these," },
  "rounds.playedOne": { ru: "сыгран", en: "played" },
  "rounds.playedMany": { ru: "сыграно", en: "played" },
  "rounds.warnPlayedSuffix": {
    ru: "— счёт будет потерян. Рейтинги ещё не применены (применяются только при завершении игры).",
    en: "— the score will be lost. Ratings are not applied yet (they apply only when the game is finished).",
  },
  "rounds.roundDeleted": { ru: "Раунд удалён.", en: "Round deleted." },
  "rounds.deleteError": { ru: "Не удалось удалить раунд", en: "Failed to delete round" },
  "rounds.roundAdded": { ru: "Раунд добавлен.", en: "Round added." },
  "rounds.seriesAdded": { ru: "Серия из {n} раундов добавлена.", en: "Series of {n} rounds added." },
  "rounds.addError": { ru: "Ошибка добавления раунда", en: "Failed to add round" },
  "rounds.nextRound": { ru: "Следующий раунд", en: "Next round" },
  "rounds.addRoundsTitle": { ru: "Добавить раунды", en: "Add rounds" },
  "rounds.oneRound": { ru: "Один раунд", en: "One round" },
  "rounds.oneRoundDesc": {
    ru: "Планировщик продолжит ротацию с учётом сыгранного",
    en: "The scheduler continues the rotation based on what's been played",
  },
  "rounds.seriesOf": { ru: "Серия из {n} раундов", en: "Series of {n} rounds" },
  "rounds.seriesDesc": { ru: "Ещё один полный цикл, как при старте игры", en: "Another full cycle, like at the game start" },
  "rounds.addRoundMexicano": { ru: "+ Раунд по таблице", en: "+ Round by standings" },
  "rounds.addRoundBtn": { ru: "+ Раунд", en: "+ Round" },
  "rounds.finalConfirmTitle": { ru: "Добавить финальный раунд?", en: "Add final round?" },
  "rounds.finalConfirmDesc": {
    ru: "Пары будут расставлены по турнирной таблице. После добавления финального раунда новые обычные раунды создавать нельзя.",
    en: "Pairs are seeded by the standings. After the final round is added, new regular rounds can't be created.",
  },
  "rounds.finalAdded": { ru: "Финальный раунд добавлен.", en: "Final round added." },
  "rounds.finalError": { ru: "Ошибка финального раунда", en: "Failed to add final round" },
  "rounds.finalRoundBtn": { ru: "Финальный раунд", en: "Final round" },
  // Ввод счёта
  "score.enteredPrefix": { ru: "Введён", en: "Entered" },
  "score.onlyOrganizerCanChange": { ru: "Изменить может только организатор.", en: "Only the organizer can change it." },
  "score.participantWillEnter": { ru: "Этот матч введёт его участник или организатор.", en: "This match will be entered by its participant or the organizer." },
  "score.enteredByYou": { ru: "Счёт введён вами — нажмите, чтобы исправить.", en: "You entered this score — tap to fix it." },
  "score.alreadyEnteredByOther": { ru: "Счёт уже введён другим участником", en: "The score was already entered by another participant" },
  "score.court": { ru: "Корт", en: "Court" },
  "score.set": { ru: "Сет", en: "Set" },
  "score.gamesHint": { ru: "Геймы слева : справа", en: "Games left : right" },
  "score.saved": { ru: "Счёт сохранён", en: "Score saved" },
  "score.saveError": { ru: "Не удалось сохранить счёт", en: "Failed to save score" },
  "score.saveScore": { ru: "Сохранить счёт", en: "Save score" },
  "score.pickValue": { ru: "Выберите значение для команды {side}", en: "Pick a value for the {side} team" },
  "score.sideLeft": { ru: "слева", en: "left" },
  "score.sideRight": { ru: "справа", en: "right" },
  "score.tapTeamHint": { ru: "Нажмите на счёт команды, чтобы выбрать очки.", en: "Tap a team's score to pick points." },
  // Завершение игры
  "finish.confirmTitleTournament": { ru: "Завершить турнир?", en: "Finish tournament?" },
  "finish.confirmTitleGame": { ru: "Завершить игру?", en: "Finish game?" },
  "finish.descTournament": {
    ru: "Турнир будет завершён. Рейтинг не пересчитывается — итоговая таблица считается по очкам.",
    en: "The tournament will be finished. Ratings are not recalculated — the final table is based on points.",
  },
  "finish.descGame": {
    ru: "Игра будет завершена, рейтинги участников пересчитаны. Дальше изменить счёт нельзя.",
    en: "The game will be finished and participants' ratings recalculated. Scores can't be changed afterwards.",
  },
  "finish.unevenMatches": { ru: "У игроков разное число сыгранных матчей", en: "Players have a different number of played matches" },
  "finish.ratingsWillBe": { ru: "Рейтинги будут", en: "Ratings will be" },
  "finish.normalized": { ru: "нормализованы", en: "normalized" },
  "finish.unevenTail": {
    ru: "у тех, кто сыграл больше, движения слегка уменьшатся; у тех, кто меньше — увеличатся.",
    en: "those who played more get slightly smaller rating moves; those who played less — slightly bigger.",
  },
  "finish.confirmLabel": { ru: "Завершить", en: "Finish" },
  "finish.doneTournament": { ru: "Турнир завершён.", en: "Tournament finished." },
  "finish.doneGame": { ru: "Игра завершена. Рейтинг обновится автоматически.", en: "Game finished. Ratings will update automatically." },
  "finish.error": { ru: "Ошибка завершения", en: "Failed to finish" },
  "finish.finishing": { ru: "Завершаем…", en: "Finishing…" },
  "finish.finishTournament": { ru: "Завершить турнир", en: "Finish tournament" },
  "finish.finishGame": { ru: "Завершить игру", en: "Finish game" },
  // Таблица лидеров
  "leaderboard.includesFinal": { ru: "Включает финальный раунд", en: "Includes the final round" },
  // Шансы на победу
  "prob.even": { ru: "Равные шансы ⚖️", en: "Even odds ⚖️" },
  "prob.slightFavorite": { ru: "Лёгкий фаворит", en: "Slight favorite" },
  "prob.favorite": { ru: "Фаворит", en: "Favorite" },
  "prob.strongFavorite": { ru: "Сильный фаворит", en: "Strong favorite" },
  "prob.davidGoliath": { ru: "Битва Давида и Голиафа 🎭", en: "David vs Goliath 🎭" },
} satisfies Dict;

type TFn = (key: keyof typeof TR & string, vars?: Record<string, string | number>) => string;

function statusLabel(status: string, t: TFn): string {
  switch (status) {
    case "DRAFT":
      return t("status.draft");
    case "OPEN_FOR_REGISTRATION":
      return t("status.registration");
    case "REGISTRATION_CLOSED":
      return t("status.registrationClosed");
    case "IN_PROGRESS":
      return t("status.inProgress");
    case "FINISHED":
      return t("status.finished");
    case "CANCELLED":
      return t("status.cancelled");
    default:
      return status;
  }
}

function roundWord(n: number, lang: Lang): string {
  return plural(lang, n, ["равный раунд", "равных раунда", "равных раундов"], ["balanced round", "balanced rounds"]);
}

function courtsWord(n: number, lang: Lang): string {
  return plural(lang, n, ["корт", "корта", "кортов"], ["court", "courts"]);
}

function matchWord(n: number, lang: Lang): string {
  return plural(lang, n, ["матч", "матча", "матчей"], ["match", "matches"]);
}

function pairingLabel(mode: string | undefined, t: TFn): string {
  if (mode === "BALANCED") return t("pairing.balanced");
  return t("pairing.roundRobin");
}

export function V0EventPage(props: { me: any; meLoaded?: boolean }) {
  const { t, lang } = useI18n(TR);
  const { eventId } = useParams();
  const location = useLocation();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editPoints, setEditPoints] = useState<number | "">("");
  const [editCourts, setEditCourts] = useState<number | "">("");
  const [editPairing, setEditPairing] = useState<"ROUND_ROBIN" | "BALANCED">("ROUND_ROBIN");
  const [editVisibility, setEditVisibility] = useState<"PRIVATE" | "PUBLIC">("PUBLIC");
  const [editScoringMode, setEditScoringMode] = useState<"POINTS" | "SETS">("POINTS");
  const [editSets, setEditSets] = useState<number | "">("");
  const [editGames, setEditGames] = useState<number | "">("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const editOpenRef = useRef(false);
  useEffect(() => { editOpenRef.current = editOpen; }, [editOpen]);
  const modalOpenRef = useRef(false);
  const [data, setData] = useState<EventDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 401 от API: не «ошибка загрузки», а «нужно войти» — показываем предложение авторизоваться.
  const [loadUnauthorized, setLoadUnauthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [canceling, setCanceling] = useState(false);
  // Fixed pairs: регистрация пары организатором.
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [pairP1, setPairP1] = useState("");
  const [pairP2, setPairP2] = useState("");
  const [pairBusy, setPairBusy] = useState(false);
  // Турнир: организатор добавляет зарегистрированных игроков (поиск по имени) и вписывает гостей.
  const [tournamentQuery, setTournamentQuery] = useState("");
  const [tournamentAddingId, setTournamentAddingId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestBusy, setGuestBusy] = useState(false);
  // Список всех игроков нужен организатору: для «Фиксированных пар» (собирать пары)
  // и для турнира (добавлять любых зарегистрированных).
  useEffect(() => {
    const ev = data?.event;
    if (
      (ev?.format === "FIXED_PAIRS" || ev?.kind === "TOURNAMENT") &&
      data?.isAuthor &&
      ev.status === "OPEN_FOR_REGISTRATION"
    ) {
      api.getRating().then(setAllPlayers).catch(() => {});
    }
  }, [data?.event?.format, data?.event?.kind, data?.isAuthor, data?.event?.status]);
  const [closing, setClosing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Авто-скрытие info-сообщений через 4 сек, чтобы не залипали
  useEffect(() => {
    if (!info) return;
    const t = setTimeout(() => setInfo(null), 4000);
    return () => clearTimeout(t);
  }, [info]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [friends, setFriends] = useState<FriendsSnapshot | null>(null);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [invited, setInvited] = useState<Record<string, boolean>>({});
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [startPromptOpen, setStartPromptOpen] = useState(false);
  const [roundsOpen, setRoundsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [finalRoundLocked, setFinalRoundLocked] = useState(false);
  // «+ Раунд»: выбор «один или серия» (только AMERICANA).
  const [addingRounds, setAddingRounds] = useState(false);
  const doAddRounds = async (count: number) => {
    if (!eventId) return;
    setAddingRounds(true);
    setInfo(null);
    setActionError(null);
    try {
      console.log("[EVENT] addRound", eventId, "count:", count);
      await api.addRound(eventId, count);
      const refreshed = await api.getEventDetails(eventId);
      setData(refreshed);
      setInfo(count > 1 ? t("rounds.seriesAdded", { n: count }) : t("rounds.roundAdded"));
      const rounds = refreshed.rounds ?? [];
      const newRound = rounds[rounds.length - 1];
      if (newRound?.id) {
        setExpandedRoundId(newRound.id);
        setTimeout(() => activeRoundRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 150);
      }
    } catch (err: any) {
      setActionError(err?.message ?? t("rounds.addError"));
    } finally {
      setAddingRounds(false);
    }
  };
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [activeTeam, setActiveTeam] = useState<"A" | "B">("A");
  const [scoreByMatch, setScoreByMatch] = useState<Record<string, { a: number; b: number }>>({});
  const [autoFilledByMatch, setAutoFilledByMatch] = useState<Record<string, boolean>>({});
  // Черновик счёта по сетам (scoringMode=SETS): matchId → массив геймов по сетам.
  const [setsByMatch, setSetsByMatch] = useState<Record<string, { a: number; b: number }[]>>({});
  const [scoreSavingId, setScoreSavingId] = useState<string | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [scorePadOpen, setScorePadOpen] = useState(false);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const activeMatchRef = useRef<HTMLDivElement | null>(null);
  const activeRoundRef = useRef<HTMLDivElement | null>(null);
  const roundsScrollRef = useRef<HTMLDivElement | null>(null);
  const userCollapsedRef = useRef(false);
  const [finishedMatchIds, setFinishedMatchIds] = useState<Set<string>>(new Set());
  const autoSavingRef = useRef<Set<string>>(new Set());
  const [editScoresOpen, setEditScoresOpen] = useState(false);
  const [balanceModalOpen, setBalanceModalOpen] = useState(false);
  const [balancePreview, setBalancePreview] = useState<BalancePreview | null>(null);
  const [switchingMode, setSwitchingMode] = useState(false);
  useEffect(() => {
    // Пауза polling'а ТОЛЬКО когда юзер реально что-то вводит/выбирает в форме:
    // editOpen (форма редактирования игры), inviteOpen (поиск друзей),
    // editScoresOpen (форма массовой правки счёта), scorePadOpen (открытая клавиатура).
    // Чисто «смотровые» модалы (Раунды, статистика, balance preview, prompt) НЕ паузят polling —
    // юзер хочет видеть live-обновления когда сам ничего не нажимает.
    modalOpenRef.current = editOpen || inviteOpen || editScoresOpen || scorePadOpen;
  }, [editOpen, inviteOpen, editScoresOpen, scorePadOpen]);

  const navigateAfterScore = (rounds: EventDetails["rounds"], savedMatchId: string) => {
    const currentIdx = rounds.findIndex((round) =>
      round.matches.some((m) => m.id === savedMatchId),
    );
    if (currentIdx < 0) return;
    const currentRound = rounds[currentIdx];
    // Find next unscored match in the same round (skip current)
    const nextUnscored = currentRound.matches.find(
      (m) => m.id !== savedMatchId && m.status !== "FINISHED" && !m.score?.points,
    );
    if (nextUnscored) {
      setActiveMatchId(nextUnscored.id);
      setScorePadOpen(false);
    } else {
      // Переход на следующий раунд — сразу помечаем сохранённый матч, чтобы «Сыгран» отобразился до следующего рендера
      setFinishedMatchIds((prev) => new Set([...prev, savedMatchId]));
      const nextRound = rounds[currentIdx + 1];
      if (nextRound) {
        setExpandedRoundId(nextRound.id);
        setActiveMatchId(nextRound.matches[0]?.id ?? null);
      }
      setScorePadOpen(false);
    }
  };

  useEffect(() => {
    // Load current user's avatar from backend (via props.me)
    setMyAvatar(props.me?.avatarUrl ?? null);
  }, [props.me?.avatarUrl]);

  /** Auto-save score as draft whenever the user enters/changes points */
  const lastAutoSavedRef = useRef<Record<string, string>>({});
  const prevActiveMatchIdRef = useRef<string | null>(null);
  // Оптимистично отправленный счёт, ещё не «устаканившийся» на сервере. Пока запись есть,
  // серверная синхронизация НЕ трогает этот матч — иначе протухший in-flight refresh
  // (getEventDetails, запущенный при переключении команды до сабмита) на миг возвращает
  // старую цифру после ввода второй. Снимается через таймаут (стрэглеры уже прилетели)
  // или при ошибке сабмита.
  const pendingScoreRef = useRef<Record<string, { a: number; b: number }>>({});

  const saveDraftIfNeeded = (matchId: string, a: number, b: number) => {
    const e = data?.event;
    if (!eventId || !data?.isAuthor || !e || e.status !== "IN_PROGRESS" || e.scoringMode !== "POINTS") return;
    const key = `${matchId}:${a},${b}`;
    if (lastAutoSavedRef.current[matchId] === key) return;
    api
      .saveDraftScore(matchId, { teamAPoints: a, teamBPoints: b })
      .then(() => {
        lastAutoSavedRef.current[matchId] = key;
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!activeMatchId) return;
    const prev = prevActiveMatchIdRef.current;
    if (prev && prev !== activeMatchId) {
      const s = scoreByMatch[prev];
      if (s && (s.a > 0 || s.b > 0)) saveDraftIfNeeded(prev, s.a, s.b);
    }
    prevActiveMatchIdRef.current = activeMatchId;
  }, [activeMatchId]);

  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollCancelledRef = useRef(false);
  const scrollToBottomRef = useRef(false);
  /** Scroll: при открытии — к раунду ("Раунд N"), при клике на счёт — к матчу с раскрытой клавиатурой */
  useEffect(() => {
    if (!roundsOpen) return;
    scrollCancelledRef.current = false;
    const scrollToBottom = scrollToBottomRef.current;
    const scrollToRound = !scorePadOpen && !scrollToBottom;
    const padOpening = scorePadOpen && !!activeMatchId;
    const delay = scrollToRound || scrollToBottom ? 300 : padOpening ? 20 : 80;
    const maxRetries = 20;
    let retries = 0;
    const attemptScroll = () => {
      if (scrollCancelledRef.current) return;
      const scrollEl = roundsScrollRef.current;
      if (!scrollEl) {
        if (retries < maxRetries) {
          retries++;
          scrollTimeoutRef.current = setTimeout(attemptScroll, 80);
        }
        return;
      }
      if (scrollToBottom) {
        scrollToBottomRef.current = false;
        scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: "smooth" });
        return;
      }
      const el = scrollToRound ? activeRoundRef.current : activeMatchRef.current;
      if (!el) {
        if (retries < maxRetries) {
          retries++;
          scrollTimeoutRef.current = setTimeout(attemptScroll, 80);
        }
        return;
      }
      const targetRect = el.getBoundingClientRect();
      const containerRect = scrollEl.getBoundingClientRect();
      if (padOpening) {
        const fitsCompletely = targetRect.height <= containerRect.height - 16;
        const newScrollTop = fitsCompletely
          ? scrollEl.scrollTop + (targetRect.top - containerRect.top) - 8
          : scrollEl.scrollTop + (targetRect.bottom - containerRect.bottom) + 16;
        const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
        scrollEl.scrollTo({
          top: Math.max(0, Math.min(maxScroll, newScrollTop)),
          behavior: "smooth",
        });
        return;
      }
      const targetOffset = scrollEl.scrollTop + (targetRect.top - containerRect.top);
      const topPadding = scrollToRound ? 25 : 8;
      const newScrollTop = Math.max(0, targetOffset - topPadding);
      scrollEl.scrollTo({ top: newScrollTop, behavior: "smooth" });
    };
    scrollTimeoutRef.current = setTimeout(attemptScroll, delay);
    return () => {
      scrollCancelledRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [activeMatchId, scorePadOpen, roundsOpen, expandedRoundId]);

  useEffect(() => {
    const e = data?.event;
    if (
      !eventId ||
      !activeMatchId ||
      !data?.isAuthor ||
      !e ||
      e.status !== "IN_PROGRESS" ||
      e.scoringMode !== "POINTS"
    ) return;
    const current = scoreByMatch[activeMatchId];
    if (!current) return;
    const key = `${activeMatchId}:${current.a},${current.b}`;
    if (lastAutoSavedRef.current[activeMatchId] === key) return;
    // Не плодим пустые {0,0} черновики: если оба нуля и на бэке черновика ещё нет —
    // сохранять нечего. Иначе бы автотаймер засорял БД нулями при простом открытии модала
    // (а handleSelectTeam раньше падал на этом конфликт-чеке).
    if (current.a === 0 && current.b === 0) {
      const matchInData = data?.rounds
        ?.flatMap((r) => r.matches)
        .find((mm) => mm.id === activeMatchId);
      if (!matchInData?.score?.points) return;
    }
    const timer = setTimeout(() => saveDraftIfNeeded(activeMatchId, current.a, current.b), 700);
    return () => clearTimeout(timer);
  }, [eventId, activeMatchId, scoreByMatch, data?.event, data?.isAuthor]);

  /** Проверка, сыгран ли матч (для allPlayed и поиска первого несыгранного) */
  const isMatchFinished = (m: Match) => {
    if (m.status === "FINISHED") return true;
    if (finishedMatchIds.has(m.id)) return true;
    if (data?.event?.scoringMode === "POINTS") {
      const totalPoints = (data.event.pointsPerPlayerPerMatch ?? 6) * 4;
      const local = scoreByMatch[m.id];
      if (local && local.a + local.b === totalPoints) return true;
      const pts = m.score?.points;
      if (pts) {
        const a = pts.teamAPoints ?? 0;
        const b = pts.teamBPoints ?? 0;
        if (a + b === totalPoints) return true;
      }
    }
    return false;
  };

  const nextButtonLabel = useMemo<string | null>(() => {
    if (!data?.rounds || !activeMatchId) return null;
    const currentRoundIdx = data.rounds.findIndex((r) => r.matches.some((m) => m.id === activeMatchId));
    if (currentRoundIdx < 0) return null;
    const isLastRound = currentRoundIdx === data.rounds.length - 1;
    return isLastRound ? null : t("rounds.nextRound");
  }, [data, activeMatchId, t]);

  const renderTeamScore = (team: Match["teamA"], score: number, side: "left" | "right") => {
    const first = team[0];
    const second = team[1];
    const currentPlayerId = props.me?.playerId;
    const renderAvatar = (p?: { id?: string; name?: string; avatarUrl?: string | null }) => {
      const isMe = !!p?.id && p.id === currentPlayerId;
      const src = p?.avatarUrl || (isMe ? myAvatar : null);
      if (src) {
        return <img src={src} alt="Avatar" className="h-full w-full object-cover" />;
      }
      return (
        <div className="h-full w-full rounded-lg bg-primary/20 text-primary text-sm font-semibold flex items-center justify-center">
          {p?.name?.[0]?.toUpperCase?.() ?? "?"}
        </div>
      );
    };
    const avatars = (
      <div className="flex flex-col gap-2">
        <div className="h-11 w-11 rounded-lg overflow-hidden border border-border/60 bg-secondary/40 flex items-center justify-center">
          {renderAvatar(first)}
        </div>
        <div className="h-11 w-11 rounded-lg overflow-hidden border border-border/60 bg-secondary/40 flex items-center justify-center">
          {renderAvatar(second)}
        </div>
      </div>
    );
    // В модале «Раунды» подсказку с инфой игрока не показываем — иначе она перехватывает
    // клик по карточке команды и мешает вводу счёта. Рейтинг игрока виден на других страницах.
    const makePlayerTooltip = (p: typeof first, center = false) => {
      if (!p) return <span className={center ? "truncate w-full text-center" : "truncate"}>?</span>;
      return <span className={center ? "truncate w-full text-center" : "truncate"}>{p.name}</span>;
    };
    const names = (
      <div className="grid w-full min-w-0 grid-rows-[44px_44px] items-center gap-2 px-1 text-xs text-muted-foreground text-left">
        <div className="flex h-full items-center w-full min-w-0">{makePlayerTooltip(first)}</div>
        <div className="flex h-full items-center w-full min-w-0">{makePlayerTooltip(second)}</div>
      </div>
    );
    const mobileCenter = (
      <div className="flex min-w-0 flex-col items-center justify-center text-xs text-muted-foreground">
        {makePlayerTooltip(first, true)}
        <div className="text-2xl font-semibold text-foreground">{score}</div>
        {makePlayerTooltip(second, true)}
      </div>
    );
    return (
      <div className="w-full">
        <div className="sm:hidden">
          {side === "left" ? (
            <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-2">
              <div className="flex items-center justify-center">{avatars}</div>
              {mobileCenter}
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-2">
              {mobileCenter}
              <div className="flex items-center justify-center">{avatars}</div>
            </div>
          )}
        </div>
        <div className="hidden sm:block">
          {side === "left" ? (
            <div className="grid grid-cols-[44px_minmax(0,1fr)_48px] items-center gap-2">
              <div className="flex items-center justify-center">{avatars}</div>
              <div className="min-w-0">{names}</div>
              <div className="text-center text-3xl font-semibold">{score}</div>
            </div>
          ) : (
            <div className="grid grid-cols-[48px_minmax(0,1fr)_44px] items-center gap-2">
              <div className="text-center text-3xl font-semibold">{score}</div>
              <div className="min-w-0">{names}</div>
              <div className="flex items-center justify-center">{avatars}</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (!props.me) return;
    if (friends) return;
    setFriendsError(null);
    api
      .getFriends()
      .then(setFriends)
      .catch((e: any) => setFriendsError(e?.message ?? t("friends.loadError")));
  }, [props.me, friends]);

  useEffect(() => {
    if (!inviteOpen) return;
    if (!props.me) return;
    if (friends) return;
    setFriendsError(null);
    api
      .getFriends()
      .then(setFriends)
      .catch((e: any) => setFriendsError(e?.message ?? t("friends.loadError")));
  }, [inviteOpen, props.me, friends]);


  useEffect(() => {
    if (props.me && !props.me.surveyCompleted) return;
    if (!eventId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setLoadUnauthorized(false);
    api
      .getEventDetails(eventId)
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadUnauthorized(isUnauthorizedError(e));
        setLoadError(e instanceof Error ? e.message : t("common.loadError"));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, props.me]);

  useEffect(() => {
    if (!eventId) return;
    const status = data?.event?.status;
    if (!status) return;
    const active = ["OPEN_FOR_REGISTRATION", "REGISTRATION_CLOSED", "IN_PROGRESS"];
    if (!active.includes(status)) return;

    const poll = () => {
      if (document.hidden) return;
      // Не обновляем data пока открыт любой модал — иначе ремаунт смажет state ввода
      // и/или заставляет тяжёлый ре-рендер прямо в момент взаимодействия (тормозит кнопки).
      if (editOpenRef.current) return;
      if (modalOpenRef.current) return;
      api.getEventDetails(eventId).then(setData).catch(() => {});
    };
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [eventId, data?.event?.status]);

  // Live-обновление прогноза баланса по мере регистрации игроков.
  // Дёргаем balance-preview при каждом изменении состава/режима/раундов в режиме BALANCED,
  // пока эвент ещё не стартовал.
  const registeredCount = data?.registeredPlayers?.length ?? 0;
  const evStatus = data?.event?.status;
  const evPairingMode = data?.event?.pairingMode;
  const evCourtsCount = data?.event?.courtsCount;
  const evRoundsPlanned = data?.event?.roundsPlanned;
  useEffect(() => {
    if (!eventId) return;
    const beforeStart = evStatus === "OPEN_FOR_REGISTRATION" || evStatus === "REGISTRATION_CLOSED";
    if (!beforeStart || evPairingMode !== "BALANCED" || registeredCount < 4) {
      setBalancePreview(null);
      return;
    }
    let cancelled = false;
    api.getBalancePreview(eventId)
      .then((p) => { if (!cancelled) setBalancePreview(p); })
      .catch(() => { if (!cancelled) setBalancePreview(null); });
    return () => { cancelled = true; };
  }, [eventId, evStatus, evPairingMode, evCourtsCount, evRoundsPlanned, registeredCount]);

  const prevEventIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    if (prevEventIdRef.current !== eventId) {
      prevEventIdRef.current = eventId ?? null;
      userCollapsedRef.current = false;
      setFinishedMatchIds(new Set());
    }
    if (data.event?.status === "FINISHED") setActionError(null);
    if (eventId) {
      const stored = localStorage.getItem(`padix_final_round_${eventId}`);
      setFinalRoundLocked(stored === "1");
    }
    const rounds = data.rounds ?? [];
    if (rounds.length > 0) {
      const fallbackRoundId = rounds[0].id;
      const currentValid = expandedRoundId && rounds.some((r) => r.id === expandedRoundId);
      const keepCollapsed = expandedRoundId === null && userCollapsedRef.current;
      const nextExpandedId = currentValid ? expandedRoundId : keepCollapsed ? null : fallbackRoundId;
      if (nextExpandedId !== expandedRoundId) {
        setExpandedRoundId(nextExpandedId);
      }
      const activeRound = rounds.find((r) => r.id === nextExpandedId) ?? rounds[0];
      if (activeRound?.matches?.length) {
        const stillInRound = activeMatchId && activeRound.matches.some((m) => m.id === activeMatchId);
        if (!stillInRound) {
          const totalPoints = (data.event?.pointsPerPlayerPerMatch ?? 6) * 4;
          const matchFinished = (m: Match) => {
            if (m.status === "FINISHED") return true;
            if (finishedMatchIds.has(m.id)) return true;
            if (data?.event?.scoringMode === "POINTS") {
              const local = scoreByMatch[m.id];
              if (local && local.a + local.b === totalPoints) return true;
              const pts = m.score?.points;
              if (pts && (pts.teamAPoints ?? 0) + (pts.teamBPoints ?? 0) === totalPoints) return true;
            }
            return false;
          };
          const firstUnscored = activeRound.matches.find((m) => !matchFinished(m));
          setActiveMatchId(firstUnscored?.id ?? activeRound.matches[0].id);
        }
      }
    }
    setScoreByMatch((prev) => {
      const next = { ...prev };
      rounds.flatMap((r) => r.matches).forEach((m) => {
        // Матч, который юзер прямо сейчас редактирует в паде, НЕ перетираем серверным счётом:
        // иначе фоновый refresh (polling каждые 5с или getEventDetails при переключении команды)
        // сбрасывает незасабмиченную правку — баг «меняешь A на 13, переключаешься на B, а A
        // возвращается к старому значению».
        if (scorePadOpen && activeMatchId === m.id) return;
        // Только что оптимистично отправленный счёт держим до устаканивания сервера — иначе
        // протухший in-flight refresh на миг моргает старой цифрой после ввода второй.
        if (pendingScoreRef.current[m.id]) return;
        const points = m.score?.points;
        if (points) {
          // Если API вернул итоговый счёт — синхронизируем локальный state, даже если уже была
          // инициализационная заглушка {0:0}. Иначе при polling'е счёт от другого игрока
          // не отображался у владельца — баг «зелёная обводка, а счёта нет».
          const a = points.teamAPoints ?? 0;
          const b = points.teamBPoints ?? 0;
          next[m.id] = { a, b };
          lastAutoSavedRef.current[m.id] = `${m.id}:${a},${b}`;
          return;
        }
        const sets = m.score?.sets;
        if (sets && sets.length) {
          // Для SETS в кнопках команд показываем геймы ПЕРВОГО сета (для 1-сетовых игр это
          // и есть итог, напр. 6:4). Полный счёт по сетам редактируется в паде.
          next[m.id] = { a: sets[0].teamAGames ?? 0, b: sets[0].teamBGames ?? 0 };
          return;
        }
        // API ещё не имеет счёта — НЕ перезаписываем то что юзер мог уже набрать локально.
        if (!next[m.id]) {
          next[m.id] = { a: 0, b: 0 };
        }
      });
      return next;
    });
  }, [data, expandedRoundId, activeMatchId, scorePadOpen]);

  /** Синхронизируем finishedMatchIds с данными API — чтобы «Сыгран» отображался сразу после сохранения */
  useEffect(() => {
    if (!data?.rounds) return;
    const fromApi = new Set(
      data.rounds.flatMap((r) => r.matches).filter((m) => m.status === "FINISHED").map((m) => m.id),
    );
    if (fromApi.size === 0) return;
    setFinishedMatchIds((prev) => {
      const merged = new Set([...prev, ...fromApi]);
      if (merged.size === prev.size && [...merged].every((id) => prev.has(id))) return prev;
      return merged;
    });
  }, [data]);


  const content = useMemo(() => {
    if (!props.me) {
      if (loading) return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;
      if (loadUnauthorized) return <AuthRequiredCard description={t("auth.eventHint")} />;
      if (loadError)
        return (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
            {t("common.loadFailed")}: {loadError}
          </div>
        );
      if (!data) return <div className="text-sm text-muted-foreground">{t("common.notFound")}</div>;
      const e = data.event;
      return (
        <div className="space-y-6 pb-8">
          <Link
            to="/games"
            state={location.state}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
            <span>{t("common.backToGames")}</span>
          </Link>

          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-border/50">
            <div className="relative p-6 lg:p-8">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                <div className="space-y-5">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="inline-flex items-center rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground">
                      {statusLabel(e.status, t)}
                    </span>
                  </div>

                  <div>
                    <h1 className="text-4xl lg:text-5xl font-bold tracking-tight">{e.title}</h1>
                    <p className="text-muted-foreground mt-2 text-lg">{formatEventDate(e.date)}</p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card/80 backdrop-blur-sm border border-border/50">
                      <Clock className="h-4 w-4 text-primary" />
                      <span className="font-medium">{timeRange(e.startTime, e.endTime)}</span>
                    </div>
                    <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card/80 backdrop-blur-sm border border-border/50">
                      <MapPin className="h-4 w-4 text-primary" />
                      <span className="font-medium">{e.courtsCount} {courtsWord(e.courtsCount, lang)}</span>
                    </div>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  {t("common.loginToParticipate")}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
    if (loading) return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;
    if (loadUnauthorized) return <AuthRequiredCard description={t("auth.eventHint")} />;
    if (loadError)
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
          {t("common.loadFailed")}: {loadError}
        </div>
      );
    if (!data) return <div className="text-sm text-muted-foreground">{t("common.notFound")}</div>;

    // PRIVATE-игра, к которой у юзера нет доступа: показываем заглушку без раундов/игроков.
    if (data.accessRestricted) {
      const ev = data.event;
      return (
        <div className="mx-auto max-w-xl space-y-4 py-6">
          <Link
            to="/games"
            state={location.state}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
            {t("common.toGamesList")}
          </Link>
          <div className="rounded-xl border border-border/60 bg-card p-6 space-y-4">
            <div className="flex items-center gap-2 text-2xl">
              <Lock className="h-6 w-6 text-muted-foreground" />
              <span className="font-semibold">{t("private.title")}</span>
            </div>
            <div className="space-y-1.5">
              <div className="text-lg font-medium">{ev.title || t("common.game")}</div>
              <div className="text-sm text-muted-foreground">
                {ev.date} · {ev.startTime}–{ev.endTime} · {t("edit.courts")}: {ev.courtsCount}
              </div>
              <div className="text-sm text-muted-foreground">
                {t("private.organizer")}: <span className="text-foreground font-medium">{data.authorName}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {t("private.registered")}: <span className="text-foreground font-medium tabular-nums">{ev.registeredCount}/{ev.courtsCount * 4}</span>
              </div>
            </div>
            <div className="rounded-lg border border-amber-500/40 dark:border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/5 p-3 text-sm text-amber-900 dark:text-amber-100">
              {t("private.accessNote")}
            </div>
          </div>
        </div>
      );
    }

    const e = data.event;
    const registered = data.registeredPlayers ?? [];
    const pending = data.pendingCancelRequests ?? [];
    const meId = props.me?.playerId;
    const myPublicId = props.me?.publicId;
    const isRegistered = !!meId && registered.some((p) => p.id === meId);
    const isAuthor = data.isAuthor;
    // Турнир: не влияет на рейтинг, автор может добавлять любых игроков и вписывать гостей.
    const isTournament = e.kind === "TOURNAMENT";

    // Ограничение по рейтингу (задача #9): применяется только к самозаписи не-автора.
    const meRating = props.me?.rating;
    const minR = e.minRating ?? null;
    const maxR = e.maxRating ?? null;
    const hasRatingLimit = minR != null || maxR != null;
    const ratingRangeLabel =
      minR != null && maxR != null
        ? `${minR}–${maxR}`
        : minR != null
          ? t("rating.from", { n: minR })
          : t("rating.to", { n: maxR! });
    const ratingOutOfRange =
      meRating != null && ((minR != null && meRating < minR) || (maxR != null && meRating > maxR));
    const ratingBlocked = hasRatingLimit && !isAuthor && ratingOutOfRange;

    // Совместный ввод счёта: участник матча может ввести счёт своего матча первым.
    // Автор может всё (включая перезапись и редактирование после FINISHED).
    const isMyMatch = (m: Match): boolean =>
      !!meId && (m.teamA.some((p) => p.id === meId) || m.teamB.some((p) => p.id === meId));
    // Финальный счёт = есть submittedByUserId ИЛИ матч уже FINISHED (для исторических данных без submittedBy).
    const hasFinalScore = (m: Match): boolean =>
      m.status === "FINISHED" || !!m.submittedByUserId;
    // Свой же счёт участник может исправить, пока событие идёт (бэкенд разрешает перезапись своей записи).
    const canSubmitScore = (m: Match): boolean =>
      isAuthor ||
      (isMyMatch(m) &&
        (!hasFinalScore(m) || (!!m.submittedByMe && e.status === "IN_PROGRESS")));
    // Доступ к модалу «Раунды» для всех зарегистрированных, не только тех, кто уже в текущем матче
    // (резервы тоже могут смотреть и ввести счёт в свой матч, когда их поставят).
    const isParticipantOfEvent =
      isRegistered ||
      (!!meId && (data.rounds ?? []).some((r) => r.matches.some(isMyMatch)));
    const progressPercent = Math.min(100, (registered.length / Math.max(1, e.courtsCount * 4)) * 100);
    const friendPublicIds = new Set((friends?.friends ?? []).map((f) => f.publicId));
    const outgoingPublicIds = new Set((friends?.outgoing ?? []).map((f) => f.publicId));

    return (
      <>
        <div className="space-y-8 pb-8">
        <Link
          to="/games"
          state={location.state}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          <span>{t("common.backToGames")}</span>
        </Link>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-border/50">
          <div className="relative p-6 lg:p-8">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div className="space-y-5">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground">
                    {statusLabel(e.status, t)}
                  </span>
                  {isAuthor ? (
                    <span className="inline-flex items-center rounded-md border border-primary/50 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                      {t("header.youAreAuthor")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">
                      {t("header.author")}: {data.authorName}
                    </span>
                  )}
                  {e.kind === "TOURNAMENT" && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                      <Trophy className="h-3.5 w-3.5" />
                      {t("header.tournamentUnrated")}
                    </span>
                  )}
                  {e.format === "MEXICANO" && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-700 dark:text-amber-300">
                      <Zap className="h-3.5 w-3.5" />
                      {t("header.mexicano")}
                    </span>
                  )}
                  {e.format === "FIXED_PAIRS" && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-sm font-medium text-violet-700 dark:text-violet-300">
                      <Users className="h-3.5 w-3.5" />
                      {t("header.fixedPairs")}
                    </span>
                  )}
                  {e.seriesId ? (
                    isAuthor ? (
                      <Link
                        to="/settings?tab=subscriptions"
                        className="inline-flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-sm font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-500/20 transition-colors"
                      >
                        <Repeat className="h-3.5 w-3.5" />
                        {t("header.bySubscription")}{e.seriesTitle ? `: ${e.seriesTitle}` : ""}
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/40 dark:border-sky-500/30 bg-sky-500/10 dark:bg-sky-500/5 px-3 py-1 text-sm font-medium text-sky-700/90 dark:text-sky-300/80">
                        <Repeat className="h-3.5 w-3.5" />
                        {t("header.recurring")}{e.seriesTitle ? `: ${e.seriesTitle}` : ""}
                      </span>
                    )
                  ) : null}
                </div>

                <div>
                  <h1 className="text-4xl lg:text-5xl font-bold tracking-tight">{e.title}</h1>
                  <p className="text-muted-foreground mt-2 text-lg">{formatEventDate(e.date)}</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card/80 backdrop-blur-sm border border-border/50">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="font-medium">{timeRange(e.startTime, e.endTime)}</span>
                  </div>
                  <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card/80 backdrop-blur-sm border border-border/50">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="font-medium">{e.courtsCount} {courtsWord(e.courtsCount, lang)}</span>
                  </div>
                  {hasRatingLimit && (
                    <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card/80 backdrop-blur-sm border border-border/50">
                      <Target className="h-4 w-4 text-primary" />
                      <span className="font-medium">{t("common.rating")} {ratingRangeLabel}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 items-start">
                {e.status === "OPEN_FOR_REGISTRATION" || e.status === "REGISTRATION_CLOSED" ? (
                  <>
                    {isRegistered ? (
                      <button
                        type="button"
                        className="h-11 w-full sm:w-[240px] px-6 rounded-md border border-primary bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors inline-flex items-center justify-center"
                        disabled={canceling}
                        onClick={async () => {
                          if (!eventId) return;
                          setCanceling(true);
                          setActionError(null);
                          setInfo(null);
                          try {
                            await api.cancelRegistration(eventId);
                            const refreshed = await api.getEventDetails(eventId);
                            setData(refreshed);
                            setInfo(t("join.cancelled"));
                          } catch (err: any) {
                            setActionError(err?.message ?? t("join.cancelError"));
                          } finally {
                            setCanceling(false);
                          }
                        }}
                      >
                        <Check className="h-5 w-5 mr-2" />
                        {canceling ? t("join.cancelling") : t("join.youAreIn")}
                      </button>
                    ) : e.status === "OPEN_FOR_REGISTRATION" ? (
                      ratingBlocked ? (
                        <div className="w-full sm:w-[240px] space-y-2">
                          <button
                            type="button"
                            disabled
                            className="h-11 w-full px-6 rounded-md border border-border bg-secondary text-muted-foreground text-sm font-medium cursor-not-allowed inline-flex items-center justify-center gap-2"
                          >
                            <Target className="h-4 w-4" />
                            {t("join.ratingMismatch")}
                          </button>
                          <p className="text-xs text-muted-foreground">
                            {t("join.ratingOutOfRange", { rating: meRating ?? "", range: ratingRangeLabel })}
                          </p>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="h-11 w-full sm:w-[240px] px-6 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                          disabled={registering}
                          onClick={async () => {
                            if (!eventId) return;
                            if (!meId) return;
                            setRegistering(true);
                            setActionError(null);
                            setInfo(null);
                            try {
                              await api.registerForEvent(eventId, meId);
                              const refreshed = await api.getEventDetails(eventId);
                              setData(refreshed);
                              setInfo(t("join.registered"));
                            } catch (err: any) {
                              setActionError(err?.message ?? t("join.registerError"));
                            } finally {
                              setRegistering(false);
                            }
                          }}
                        >
                          {registering ? t("join.joining") : t("join.join")}
                        </button>
                      )
                    ) : (
                      <div className="text-sm text-muted-foreground">{t("status.registrationClosed")}</div>
                    )}

                    {/* Кнопки организатора: та же колонка и ширина, что у кнопки записи выше —
                        всё выровнено по одной вертикали на десктопе и во всю ширину на мобиле. */}
                    <div className="flex w-full flex-col gap-2 sm:w-[240px]">
                      {isAuthor && e.status === "OPEN_FOR_REGISTRATION" ? (
                        <button
                          type="button"
                          className="h-11 w-full px-6 rounded-md border border-primary/40 bg-primary/5 text-primary text-sm font-medium hover:bg-primary/15 transition-colors inline-flex items-center justify-center gap-2"
                          disabled={closing}
                          onClick={async () => {
                            if (!eventId) return;
                            setClosing(true);
                            setActionError(null);
                            setInfo(null);
                            try {
                              const preview = await api.getBalancePreview(eventId);
                              if (preview.shouldWarn) {
                                setBalancePreview(preview);
                                setBalanceModalOpen(true);
                                setClosing(false);
                                return;
                              }
                            } catch (err: any) {
                              // Превью не критично — если упало, продолжаем по обычному пути
                              console.error("balance preview failed", err);
                            }
                            const ok = await confirm({
                              title: t("close.confirmTitle"),
                              description: t("close.confirmDesc"),
                              confirmLabel: t("close.confirmLabel"),
                            });
                            if (!ok) {
                              setClosing(false);
                              return;
                            }
                            try {
                              await api.closeRegistration(eventId);
                              const refreshed = await api.getEventDetails(eventId);
                              setData(refreshed);
                              setInfo(t("status.registrationClosed"));
                              setStartPromptOpen(true);
                            } catch (err: any) {
                              setActionError(err?.message ?? t("close.error"));
                            } finally {
                              setClosing(false);
                            }
                          }}
                        >
                          <Lock className="h-4 w-4" />
                          {closing ? t("close.closing") : t("close.closeRegistration")}
                        </button>
                      ) : null}

                      {isAuthor && e.status === "REGISTRATION_CLOSED" ? (
                        <button
                          type="button"
                          className="h-11 w-full px-6 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors inline-flex items-center justify-center gap-2"
                          disabled={starting}
                          onClick={() => setStartPromptOpen(true)}
                        >
                          <Zap className="h-4 w-4" />
                          {starting ? t("start.starting") : t("start.startGame")}
                        </button>
                      ) : null}

                    </div>

                    {info ? <div className="text-sm text-muted-foreground">{info}</div> : null}
                    {actionError ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                        {actionError}
                      </div>
                    ) : null}
                  </>
                ) : e.status === "IN_PROGRESS" ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      {isAuthor || isParticipantOfEvent ? (
                        <button
                          type="button"
                          className="h-11 w-full sm:w-auto px-6 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                          onClick={() => {
                            setActionError(null);
                            const rounds = data?.rounds ?? [];
                            const allMatches = rounds.flatMap((r) => r.matches);
                            // Для не-автора-участника приоритет — собственный неввёденный матч.
                            // Иначе (или для автора) — первый неввёденный.
                            const myUnscored = !isAuthor
                              ? allMatches.find((m) => isMyMatch(m) && !hasFinalScore(m))
                              : undefined;
                            const targetMatch = myUnscored ?? allMatches.find((m) => !isMatchFinished(m));
                            if (targetMatch) {
                              userCollapsedRef.current = false;
                              const round = rounds.find((r) => r.matches.some((m) => m.id === targetMatch.id));
                              if (round) {
                                setExpandedRoundId(round.id);
                                setActiveMatchId(targetMatch.id);
                              }
                            } else {
                              userCollapsedRef.current = true;
                              setExpandedRoundId(null);
                              setActiveMatchId(null);
                              scrollToBottomRef.current = true;
                            }
                            setScorePadOpen(false);
                            setRoundsOpen(true);
                          }}
                        >
                          {t("actions.enterScore")}
                        </button>
                      ) : (
                        <div className="text-sm text-muted-foreground">{t("status.gameInProgress")}</div>
                      )}
                      <button
                        type="button"
                        className="h-11 w-full sm:w-auto px-6 rounded-md border border-border bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors"
                        onClick={() => setStatsOpen(true)}
                      >
                        {t("actions.leaderboard")}
                      </button>
                      <button
                        type="button"
                        className="h-11 w-full sm:w-auto px-6 rounded-md border border-border bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors inline-flex items-center justify-center gap-2"
                        title={t("actions.tvTitle")}
                        onClick={() => window.open(`/events/${eventId}/board`, "_blank")}
                      >
                        <Tv className="h-4 w-4" />
                        {t("actions.onTv")}
                      </button>
                    </div>

                    {info ? <div className="text-sm text-muted-foreground">{info}</div> : null}
                    {actionError ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                        {actionError}
                      </div>
                    ) : null}
                  </>
                ) : e.status === "FINISHED" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm text-muted-foreground">{t("status.gameFinished")}</div>
                    {isAuthor && (
                      <button
                        type="button"
                        className="h-11 w-full sm:w-auto px-6 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                        onClick={() => setEditScoresOpen(true)}
                      >
                        {t("actions.editScores")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="h-11 w-full sm:w-auto px-6 rounded-md border border-border bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors"
                      onClick={() => setStatsOpen(true)}
                    >
                      {t("actions.leaderboard")}
                    </button>
                    <button
                      type="button"
                      className="h-11 w-full sm:w-auto px-6 rounded-md border border-border bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors inline-flex items-center justify-center gap-2"
                      title={t("actions.tvTitle")}
                      onClick={() => window.open(`/events/${eventId}/board`, "_blank")}
                    >
                      <Tv className="h-4 w-4" />
                      {t("actions.onTv")}
                    </button>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">{t("status.label")}: {statusLabel(e.status, t)}</div>
                )}

                <div className="flex items-center gap-2 self-start sm:self-end justify-start sm:justify-end flex-wrap">
                  <button
                    type="button"
                    className="h-10 w-10 rounded-md border border-border bg-transparent hover:bg-secondary transition-colors inline-flex items-center justify-center"
                    title={t("actions.invite")}
                    aria-label={t("actions.invite")}
                    onClick={() => setInviteOpen(true)}
                  >
                    <UserPlus className="h-4 w-4" />
                  </button>
                  {isAuthor && e.status !== "FINISHED" && (
                    <button
                      type="button"
                      className="h-10 w-10 rounded-md border border-border bg-transparent hover:bg-secondary transition-colors inline-flex items-center justify-center"
                      title={t("actions.editGame")}
                      aria-label={t("actions.editGame")}
                      onClick={() => {
                        setEditTitle(e.title ?? "");
                        setEditDate(typeof e.date === "string" ? e.date : "");
                        setEditStartTime(typeof e.startTime === "string" ? e.startTime.slice(0, 5) : "");
                        setEditEndTime(typeof e.endTime === "string" ? e.endTime.slice(0, 5) : "");
                        setEditPoints(typeof e.pointsPerPlayerPerMatch === "number" ? e.pointsPerPlayerPerMatch : "");
                        setEditCourts(typeof e.courtsCount === "number" ? e.courtsCount : "");
                        setEditPairing(e.pairingMode === "BALANCED" ? "BALANCED" : "ROUND_ROBIN");
                        setEditVisibility(e.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE");
                        setEditScoringMode(e.scoringMode === "SETS" ? "SETS" : "POINTS");
                        setEditSets(typeof e.setsPerMatch === "number" ? e.setsPerMatch : 1);
                        setEditGames(typeof e.gamesPerSet === "number" ? e.gamesPerSet : 6);
                        setEditError(null);
                        setEditOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {isAuthor && e.status === "OPEN_FOR_REGISTRATION" && (
                    <button
                      type="button"
                      className="h-10 w-10 rounded-md border border-border bg-transparent hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition-colors inline-flex items-center justify-center"
                      title={t("actions.deleteGame")}
                      aria-label={t("actions.deleteGame")}
                      onClick={async () => {
                        if (!eventId) return;
                        const ok = await confirm({
                          title: t("delete.confirmTitle"),
                          description: (
                            <>
                              {t("delete.gamePrefix")} <b>{e.title}</b> {t("delete.gameSuffix")}
                            </>
                          ),
                          warning: t("common.cannotUndo"),
                          confirmLabel: t("common.delete"),
                          confirmVariant: "destructive",
                        });
                        if (!ok) return;
                        setActionError(null);
                        try {
                          await api.deleteEvent(eventId);
                          navigate("/games");
                        } catch (err: any) {
                          setActionError(err?.message ?? t("delete.error"));
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="h-10 w-10 rounded-md border border-border bg-transparent hover:bg-secondary transition-colors inline-flex items-center justify-center"
                    title={t("actions.share")}
                    aria-label={t("actions.share")}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(window.location.href);
                        setInfo(t("share.copied"));
                      } catch {
                        setInfo(window.location.href);
                      }
                    }}
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Dialog open={editOpen} onOpenChange={(o) => { if (!editSaving) setEditOpen(o); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("actions.editGame")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block mb-1 text-muted-foreground">{t("edit.name")}</label>
                <input
                  type="text"
                  className="w-full rounded-md border border-border bg-transparent px-3 py-2"
                  value={editTitle}
                  onChange={(ev) => setEditTitle(ev.target.value)}
                />
              </div>
              <div>
                <label className="block mb-1 text-muted-foreground">{t("edit.date")}</label>
                <DatePicker value={editDate} onChange={setEditDate} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-muted-foreground">{t("edit.start")}</label>
                  <TimePicker value={editStartTime} onChange={setEditStartTime} />
                </div>
                <div>
                  <label className="block mb-1 text-muted-foreground">{t("edit.end")}</label>
                  <TimePicker value={editEndTime} onChange={setEditEndTime} />
                </div>
              </div>
              {e.status === "OPEN_FOR_REGISTRATION" ? (
                <>
                  <div>
                    <label className="block mb-1 text-muted-foreground">{t("edit.scoringSystem")}</label>
                    <div className="grid grid-cols-2 gap-2">
                      {([{ v: "POINTS" as const, label: t("edit.points") }, { v: "SETS" as const, label: t("edit.sets") }]).map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setEditScoringMode(o.v)}
                          className={cn(
                            "rounded-md border-2 py-2 text-sm font-medium transition-colors",
                            editScoringMode === o.v ? "border-primary bg-primary/10 text-primary" : "border-border bg-transparent text-muted-foreground hover:bg-secondary/30",
                          )}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {editScoringMode === "POINTS" ? (
                      <div>
                        <label className="block mb-1 text-muted-foreground">{t("edit.pointsPerPlayer")}</label>
                        <input
                          type="number"
                          min={1}
                          className="w-full rounded-md border border-border bg-transparent px-3 py-2"
                          value={editPoints}
                          onChange={(ev) => setEditPoints(ev.target.value === "" ? "" : Number(ev.target.value))}
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block mb-1 text-muted-foreground">{t("edit.gamesPerSet")}</label>
                        <input
                          type="number"
                          min={1}
                          className="w-full rounded-md border border-border bg-transparent px-3 py-2"
                          value={editGames}
                          onChange={(ev) => setEditGames(ev.target.value === "" ? "" : Number(ev.target.value))}
                        />
                      </div>
                    )}
                    <div>
                      <label className="block mb-1 text-muted-foreground">{t("edit.courts")}</label>
                      <input
                        type="number"
                        min={1}
                        className="w-full rounded-md border border-border bg-transparent px-3 py-2"
                        value={editCourts}
                        onChange={(ev) => setEditCourts(ev.target.value === "" ? "" : Number(ev.target.value))}
                      />
                    </div>
                    {editScoringMode === "SETS" && (
                      <div>
                        <label className="block mb-1 text-muted-foreground">{t("edit.setsPerMatch")}</label>
                        <input
                          type="number"
                          min={1}
                          className="w-full rounded-md border border-border bg-transparent px-3 py-2"
                          value={editSets}
                          onChange={(ev) => setEditSets(ev.target.value === "" ? "" : Number(ev.target.value))}
                        />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {t("edit.startedNote")}
                </div>
              )}
              <div>
                <label className="block mb-1 text-muted-foreground">{t("edit.visibility")}</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: "PUBLIC" as const, icon: Globe, title: t("edit.public"), desc: t("edit.publicDesc") },
                    { value: "PRIVATE" as const, icon: Lock, title: t("edit.private"), desc: t("edit.privateDesc") },
                  ]).map((opt) => {
                    const Icon = opt.icon;
                    const active = editVisibility === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEditVisibility(opt.value)}
                        className={cn(
                          "flex flex-col items-start gap-1 rounded-md border-2 p-3 text-left transition-colors",
                          active
                            ? "border-primary bg-primary/10"
                            : "border-border bg-transparent hover:bg-secondary/30",
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon className="h-4 w-4" />
                          <span className="text-sm font-medium">{opt.title}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground leading-snug">{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {editError && <div className="text-destructive text-xs">{editError}</div>}
            </div>
            <div className="mt-4 flex items-center gap-2 justify-end">
              <Button variant="outline" className="bg-transparent" disabled={editSaving} onClick={() => setEditOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                disabled={editSaving}
                onClick={async () => {
                  if (!eventId) return;
                  setEditSaving(true);
                  setEditError(null);
                  try {
                    const payload: Record<string, unknown> = {
                      title: editTitle.trim(),
                      date: editDate,
                      startTime: editStartTime.length === 5 ? `${editStartTime}:00` : editStartTime,
                      endTime: editEndTime.length === 5 ? `${editEndTime}:00` : editEndTime,
                    };
                    if (e.status === "OPEN_FOR_REGISTRATION") {
                      if (editCourts !== "") payload.courtsCount = editCourts;
                      payload.pairingMode = editPairing;
                      payload.scoringMode = editScoringMode;
                      if (editScoringMode === "POINTS") {
                        if (editPoints !== "") payload.pointsPerPlayerPerMatch = editPoints;
                      } else {
                        if (editSets !== "") payload.setsPerMatch = editSets;
                        if (editGames !== "") payload.gamesPerSet = editGames;
                      }
                    }
                    // Видимость можно менять на любой стадии (кроме FINISHED, и туда мы edit-dialog не пускаем).
                    payload.visibility = editVisibility;
                    await api.updateEvent(eventId, payload);
                    const refreshed = await api.getEventDetails(eventId);
                    setData(refreshed);
                    setInfo(t("edit.updated"));
                    setEditOpen(false);
                  } catch (err: any) {
                    setEditError(err?.message ?? t("edit.saveError"));
                  } finally {
                    setEditSaving(false);
                  }
                }}
              >
                {editSaving ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("invite.title")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 mt-4">
              {friendsError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">{friendsError}</div>
              ) : null}
              {(friends?.friends ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground">{t("invite.noFriends")}</div>
              ) : (
                (friends?.friends ?? []).map((friend: FriendItem) => (
                  <div
                    key={friend.userId}
                    className="flex flex-col gap-2 p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary font-semibold">
                        {friend.name?.[0]?.toUpperCase?.() ?? "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{friend.name}</p>
                        <p className="text-sm text-muted-foreground">{t("common.rating")}: {friend.rating}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:shrink-0">
                      {(() => {
                        const isInEvent = (data?.registeredPlayers ?? []).some(
                          (p) => p.publicId === friend.publicId
                        );
                        const sentInvite = !!invited[friend.publicId];
                        return (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              className="flex-1 sm:flex-none sm:w-[110px]"
                              disabled={!eventId || invitingId === friend.publicId || isInEvent}
                              title={t("invite.addDirectTitle")}
                              onClick={async () => {
                                if (!eventId) return;
                                setInvitingId(friend.publicId);
                                setFriendsError(null);
                                try {
                                  await api.addFriendToEvent(eventId, friend.publicId);
                                  const refreshed = await api.getEventDetails(eventId);
                                  setData(refreshed);
                                } catch (e: any) {
                                  setFriendsError(e?.message ?? t("invite.addError"));
                                } finally {
                                  setInvitingId(null);
                                }
                              }}
                            >
                              {isInEvent ? (
                                <>
                                  <Check className="h-4 w-4 mr-1" />
                                  {t("invite.added")}
                                </>
                              ) : (
                                t("common.add")
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 sm:flex-none sm:w-[110px]"
                              disabled={!eventId || invitingId === friend.publicId || isInEvent || sentInvite}
                              title={t("invite.sendInviteTitle")}
                              onClick={async () => {
                                if (!eventId) return;
                                setInvitingId(friend.publicId);
                                setFriendsError(null);
                                try {
                                  await api.inviteFriendToEvent(eventId, friend.publicId);
                                  setInvited((m) => ({ ...m, [friend.publicId]: true }));
                                } catch (e: any) {
                                  setFriendsError(e?.message ?? t("invite.inviteError"));
                                } finally {
                                  setInvitingId(null);
                                }
                              }}
                            >
                              {sentInvite ? t("invite.invited") : t("actions.invite")}
                            </Button>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={balanceModalOpen} onOpenChange={(o) => { if (!closing && !switchingMode) setBalanceModalOpen(o); }}>
          <DialogContent className="sm:max-w-md">
            {balancePreview ? (
              <div className="space-y-4">
                <div className="flex justify-center pt-2">
                  <div className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center ring-1",
                    balancePreview.severity === "LARGE" && "bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-rose-500/40 dark:ring-rose-500/30",
                    balancePreview.severity === "MEDIUM" && "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/40 dark:ring-amber-500/30",
                    balancePreview.severity === "SMALL" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/40 dark:ring-emerald-500/30",
                  )}>
                    <AlertTriangle className="h-7 w-7" />
                  </div>
                </div>

                <DialogHeader>
                  <DialogTitle className="text-center text-xl">
                    {balancePreview.maxGoodRounds === 0 ? (
                      t("balance.noEqualRounds")
                    ) : (
                      <>
                        {t("balance.upTo")}{" "}
                        <span className={cn(
                          balancePreview.severity === "LARGE" && "text-rose-700 dark:text-rose-400",
                          balancePreview.severity === "MEDIUM" && "text-amber-700 dark:text-amber-300",
                          balancePreview.severity === "SMALL" && "text-emerald-700 dark:text-emerald-300",
                        )}>
                          {balancePreview.maxGoodRounds}
                        </span>{" "}
                        {roundWord(balancePreview.maxGoodRounds, lang)}
                      </>
                    )}
                  </DialogTitle>
                </DialogHeader>

                <p className="text-center text-sm text-muted-foreground leading-relaxed px-2">
                  {(() => {
                    const N = balancePreview.maxGoodRounds;
                    const req = balancePreview.requestedRounds;
                    const spread = balancePreview.ratingSpread;
                    if (N === 0) {
                      return t("balance.tooDiverse", { spread });
                    }
                    if (req !== null && N < req) {
                      return t("balance.maxReached", { spread, req });
                    }
                    return t("balance.allBalanced", { spread });
                  })()}
                </p>

                <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap sm:items-center sm:justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setBalanceModalOpen(false)}
                    disabled={closing || switchingMode}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    variant="outline"
                    className="bg-transparent"
                    disabled={closing || switchingMode}
                    onClick={async () => {
                      if (!eventId) return;
                      setSwitchingMode(true);
                      setActionError(null);
                      try {
                        await api.updatePairingMode(eventId, "ROUND_ROBIN");
                        const refreshed = await api.getEventDetails(eventId);
                        setData(refreshed);
                        setBalanceModalOpen(false);
                        setInfo(t("balance.switchedToRR"));
                      } catch (err: any) {
                        setActionError(err?.message ?? t("balance.switchError"));
                      } finally {
                        setSwitchingMode(false);
                      }
                    }}
                  >
                    {switchingMode ? t("balance.switching") : t("pairing.roundRobin")}
                  </Button>
                  <Button
                    disabled={closing || switchingMode || balancePreview.maxGoodRounds === 0}
                    onClick={async () => {
                      if (!eventId) return;
                      setClosing(true);
                      setActionError(null);
                      setInfo(null);
                      try {
                        await api.closeRegistration(eventId);
                        const refreshed = await api.getEventDetails(eventId);
                        setData(refreshed);
                        setBalanceModalOpen(false);
                        setInfo(t("status.registrationClosed"));
                        setStartPromptOpen(true);
                      } catch (err: any) {
                        setActionError(err?.message ?? t("close.error"));
                      } finally {
                        setClosing(false);
                      }
                    }}
                  >
                    {closing ? t("close.closing") : t("common.continue")}
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog open={startPromptOpen} onOpenChange={setStartPromptOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("start.readyTitle")}</DialogTitle>
            </DialogHeader>
            <div className="text-sm text-muted-foreground">
              {t("start.readyPrefix")} <b>{data.event.title}</b> {t("start.readySuffix")}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 justify-end">
              <Button variant="outline" className="bg-transparent" onClick={() => setStartPromptOpen(false)}>
                {t("common.later")}
              </Button>
              <Button
                onClick={async () => {
                  if (!eventId) return;
                  setStarting(true);
                  setActionError(null);
                  setInfo(null);
                  try {
                    await api.startEvent(eventId);
                    const refreshed = await api.getEventDetails(eventId);
                    setData(refreshed);
                    setStartPromptOpen(false);
                    setRoundsOpen(true);
                  } catch (err: any) {
                    setActionError(err?.message ?? t("start.error"));
                  } finally {
                    setStarting(false);
                  }
                }}
                disabled={starting}
              >
                {starting ? t("start.starting") : t("start.startGame")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Компактная сводка на мобильном */}
        <div className="md:hidden">
          <button
            type="button"
            onClick={() => setInfoExpanded((v) => !v)}
            className="w-full flex items-center justify-between gap-3 p-4 rounded-xl bg-card border border-border/50 hover:bg-card/80 transition-colors"
            aria-expanded={infoExpanded}
          >
            <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap text-left">
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{e.courtsCount}</span>
              <span className="text-border">·</span>
              <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5" />{pairingLabel(e.pairingMode, t)}</span>
              <span className="text-border">·</span>
              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{registered.length}/{e.courtsCount * 4}</span>
              {balancePreview && balancePreview.severity !== "NONE" ? (
                <>
                  <span className="text-border">·</span>
                  <span className={cn(
                    "flex items-center gap-1",
                    balancePreview.severity === "LARGE" && "text-rose-700 dark:text-rose-300",
                    balancePreview.severity === "MEDIUM" && "text-amber-700 dark:text-amber-300",
                    balancePreview.severity === "SMALL" && "text-emerald-700 dark:text-emerald-300",
                  )}>
                    <Scale className="h-3.5 w-3.5" />
                    {balancePreview.maxGoodRounds} {roundWord(balancePreview.maxGoodRounds, lang)}
                  </span>
                </>
              ) : null}
            </div>
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", infoExpanded && "rotate-180")} />
          </button>
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-300 ease-in-out overflow-hidden",
              infoExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="grid grid-cols-2 gap-3 pt-3">
                <div className="p-4 rounded-xl bg-card border border-border/50 space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span className="text-sm">{t("stats.courts")}</span>
                  </div>
                  <p className="text-2xl font-bold">{e.courtsCount}</p>
                </div>
                <div className="p-4 rounded-xl bg-card border border-border/50 space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Zap className="h-4 w-4" />
                    <span className="text-sm">{t("stats.mode")}</span>
                  </div>
                  <p className="text-base font-bold leading-tight">{pairingLabel(e.pairingMode, t)}</p>
                </div>
                <div className="p-4 rounded-xl bg-card border border-border/50 space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Target className="h-4 w-4" />
                    <span className="text-sm">{e.scoringMode === "POINTS" ? t("stats.servesPerPlayer") : t("stats.setsCount")}</span>
                  </div>
                  <p className="text-2xl font-bold">{e.scoringMode === "POINTS" ? e.pointsPerPlayerPerMatch : e.setsPerMatch}</p>
                </div>
                <div className="p-4 rounded-xl bg-card border border-border/50 space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span className="text-sm">{t("stats.players")}</span>
                  </div>
                  <p className="text-2xl font-bold">
                    {registered.length}
                    <span className="text-base font-normal text-muted-foreground">/{e.courtsCount * 4}</span>
                  </p>
                </div>
                {balancePreview && balancePreview.severity !== "NONE" ? (
                  <div className={cn(
                    "p-4 rounded-xl bg-card border space-y-2 col-span-2",
                    balancePreview.severity === "LARGE" && "border-rose-500/40",
                    balancePreview.severity === "MEDIUM" && "border-amber-500/40",
                    balancePreview.severity === "SMALL" && "border-emerald-500/40",
                  )}>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Scale className="h-4 w-4" />
                      <span className="text-sm">{t("stats.balance")}</span>
                    </div>
                    <p className="text-2xl font-bold leading-none">
                      {balancePreview.maxGoodRounds}
                      <span className="text-sm font-normal text-muted-foreground ml-2">
                        {roundWord(balancePreview.maxGoodRounds, lang)}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("stats.spread")} {balancePreview.ratingSpread}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Полный grid на десктопе */}
        <div className={cn(
          "hidden md:grid grid-cols-2 gap-4",
          balancePreview && balancePreview.severity !== "NONE" ? "lg:grid-cols-5" : "lg:grid-cols-4"
        )}>
          <div className="p-5 rounded-xl bg-card border border-border/50 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span className="text-sm">{t("stats.courts")}</span>
            </div>
            <p className="text-2xl font-bold">{e.courtsCount}</p>
          </div>

          <div className="p-5 rounded-xl bg-card border border-border/50 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Zap className="h-4 w-4" />
              <span className="text-sm">{t("stats.mode")}</span>
            </div>
            <p className="text-lg font-bold">{pairingLabel(e.pairingMode, t)}</p>
          </div>

          <div className="p-5 rounded-xl bg-card border border-border/50 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Target className="h-4 w-4" />
              <span className="text-sm">{e.scoringMode === "POINTS" ? t("stats.servesPerPlayer") : t("stats.setsCount")}</span>
            </div>
            <p className="text-2xl font-bold">{e.scoringMode === "POINTS" ? e.pointsPerPlayerPerMatch : e.setsPerMatch}</p>
          </div>

          <div className="p-5 rounded-xl bg-card border border-border/50 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="text-sm">{t("stats.players")}</span>
            </div>
            <p className="text-2xl font-bold">
              {registered.length}
              <span className="text-base font-normal text-muted-foreground">/{e.courtsCount * 4}</span>
            </p>
          </div>

          {balancePreview && balancePreview.severity !== "NONE" ? (
            <div className={cn(
              "p-5 rounded-xl bg-card border space-y-2",
              balancePreview.severity === "LARGE" && "border-rose-500/40",
              balancePreview.severity === "MEDIUM" && "border-amber-500/40",
              balancePreview.severity === "SMALL" && "border-emerald-500/40",
            )}>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Scale className="h-4 w-4" />
                <span className="text-sm">{t("stats.balance")}</span>
              </div>
              <p className="text-2xl font-bold leading-none">
                {balancePreview.maxGoodRounds}
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  {roundWord(balancePreview.maxGoodRounds, lang)}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {t("stats.spread")} {balancePreview.ratingSpread}
              </p>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl bg-card border border-border/50 overflow-hidden">
          <div className="p-6 border-b border-border/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">{t("participants.title")}</h2>
                  <p className="text-sm text-muted-foreground">{t("participants.minRequired", { n: e.courtsCount * 4 })}</p>
                </div>
              </div>
              <span
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md whitespace-nowrap shrink-0",
                  registered.length >= e.courtsCount * 4 ? "bg-primary/20 text-primary" : "bg-secondary text-secondary-foreground",
                )}
              >
                {t("participants.count", { a: registered.length, b: e.courtsCount * 4 })}
              </span>
            </div>
            <div className="mt-4">
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="p-6">
            {isAuthor && e.status === "OPEN_FOR_REGISTRATION" && isTournament && e.format !== "FIXED_PAIRS" && (
              <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Trophy className="h-4 w-4 text-emerald-500" />
                  {t("tournament.addParticipants")}
                </div>
                <div className="space-y-2">
                  <input
                    value={tournamentQuery}
                    onChange={(ev) => setTournamentQuery(ev.target.value)}
                    placeholder={t("tournament.searchPlaceholder")}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  />
                  {tournamentQuery.trim() !== "" && (() => {
                    const q = tournamentQuery.trim().toLowerCase();
                    const found = allPlayers
                      .filter((p) => !registered.some((r) => r.id === p.id))
                      .filter((p) => p.name.toLowerCase().includes(q))
                      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
                    if (found.length === 0) {
                      return (
                        <p className="px-1 text-xs text-muted-foreground">
                          {t("tournament.nobodyFound")}
                        </p>
                      );
                    }
                    return (
                      <div className="max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border">
                        {found.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            disabled={tournamentAddingId !== null}
                            onClick={async () => {
                              if (!eventId) return;
                              setTournamentAddingId(p.id);
                              setActionError(null);
                              setInfo(null);
                              try {
                                await api.registerForEvent(eventId, p.id);
                                const refreshed = await api.getEventDetails(eventId);
                                setData(refreshed);
                                setTournamentQuery("");
                                setInfo(t("tournament.playerAdded", { name: p.name }));
                              } catch (err: any) {
                                setActionError(err?.message ?? t("tournament.addPlayerError"));
                              } finally {
                                setTournamentAddingId(null);
                              }
                            }}
                            className="flex w-full items-center gap-3 bg-background px-3 py-2 text-left text-sm hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-semibold">
                              {p.avatarUrl ? (
                                <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                p.name?.[0]?.toUpperCase?.() ?? "?"
                              )}
                            </span>
                            <span className="flex-1 truncate">{p.name}</span>
                            <span className="shrink-0 text-xs font-medium text-primary">
                              {tournamentAddingId === p.id ? t("common.adding") : t("tournament.addBtn")}
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={guestName}
                    onChange={(ev) => setGuestName(ev.target.value)}
                    placeholder={t("tournament.guestPlaceholder")}
                    maxLength={60}
                    className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm"
                  />
                  <button
                    type="button"
                    disabled={!guestName.trim() || guestBusy}
                    onClick={async () => {
                      if (!eventId || !guestName.trim()) return;
                      setGuestBusy(true);
                      setActionError(null);
                      setInfo(null);
                      try {
                        await api.addGuestToEvent(eventId, guestName.trim());
                        const refreshed = await api.getEventDetails(eventId);
                        setData(refreshed);
                        setGuestName("");
                        setInfo(t("tournament.guestAdded"));
                      } catch (err: any) {
                        setActionError(err?.message ?? t("tournament.guestError"));
                      } finally {
                        setGuestBusy(false);
                      }
                    }}
                    className="h-10 px-5 rounded-md border border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-sm font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {guestBusy ? "…" : t("tournament.addGuest")}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("tournament.noRatingNote")}
                </p>
              </div>
            )}
            {isAuthor && e.status === "OPEN_FOR_REGISTRATION" && e.format === "FIXED_PAIRS" && (
              <div className="mb-5 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4 text-violet-500" />
                  {t("pairs.addPair")}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    value={pairP1}
                    onChange={(ev) => setPairP1(ev.target.value)}
                    className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm"
                  >
                    <option value="">{t("pairs.player1")}</option>
                    {allPlayers
                      .filter((p) => !registered.some((r) => r.id === p.id) && p.id !== pairP2)
                      .map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.rating})</option>
                      ))}
                  </select>
                  <select
                    value={pairP2}
                    onChange={(ev) => setPairP2(ev.target.value)}
                    className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm"
                  >
                    <option value="">{t("pairs.player2")}</option>
                    {allPlayers
                      .filter((p) => !registered.some((r) => r.id === p.id) && p.id !== pairP1)
                      .map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.rating})</option>
                      ))}
                  </select>
                  <button
                    type="button"
                    disabled={!pairP1 || !pairP2 || pairP1 === pairP2 || pairBusy}
                    onClick={async () => {
                      if (!eventId || !pairP1 || !pairP2) return;
                      setPairBusy(true);
                      setActionError(null);
                      setInfo(null);
                      try {
                        await api.registerPair(eventId, pairP1, pairP2);
                        const refreshed = await api.getEventDetails(eventId);
                        setData(refreshed);
                        setPairP1("");
                        setPairP2("");
                        setInfo(t("pairs.pairAdded"));
                      } catch (err: any) {
                        setActionError(err?.message ?? t("pairs.pairError"));
                      } finally {
                        setPairBusy(false);
                      }
                    }}
                    className="h-10 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {pairBusy ? "…" : t("pairs.addPair")}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("pairs.note", { courts: e.courtsCount, pairs: e.courtsCount * 2 })}
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-5">
              {registered.map((p, idx) => (
                <PlayerTooltip
                  key={p.id}
                  player={{
                    id: p.id,
                    name: p.name,
                    // Турнир вне рейтинга: рейтинг не показываем (у гостей его и нет).
                    rating: isTournament || p.isGuest ? null : p.rating,
                    matches: p.gamesPlayed,
                    odid: p.publicId,
                    avatarUrl: p.avatarUrl,
                  }}
                  showAddFriend={p.id !== meId && !p.isGuest}
                  addFriendStatus={
                    !p.publicId
                      ? "none"
                      : friendPublicIds.has(p.publicId)
                        ? "friend"
                        : outgoingPublicIds.has(p.publicId)
                          ? "requested"
                          : "none"
                  }
                  onAddFriend={async () => {
                    if (!p.publicId) {
                      throw new Error(t("friends.noPublicId"));
                    }
                    await api.requestFriend(p.publicId);
                    const publicId = p.publicId;
                    if (publicId) {
                      setFriends((prev) =>
                        prev
                          ? {
                              ...prev,
                              outgoing: prev.outgoing.some((o) => o.publicId === publicId)
                                ? prev.outgoing
                                : [...prev.outgoing, { publicId, name: p.name }],
                            }
                          : prev,
                      );
                    }
                    return t("friends.requestSent");
                  }}
                >
                  <div className="group relative w-full p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 hover:border-primary/40 transition-all hover:shadow-lg hover:shadow-primary/10">
                    {isAuthor && data?.event?.status === "OPEN_FOR_REGISTRATION" ? (
                      <button
                        type="button"
                        className="absolute -top-2 -left-2 h-6 w-6 rounded-full bg-destructive text-white flex items-center justify-center shadow-sm z-10"
                        title={t("participants.remove")}
                        aria-label={t("participants.remove")}
                        onClick={async (ev) => {
                          ev.stopPropagation();
                          if (!eventId) return;
                          const ok = await confirm({
                            title: t("participants.removeConfirmTitle"),
                            description: <>{t("participants.removePrefix")} <b>{p.name}</b> {t("participants.removeSuffix")}</>,
                            confirmLabel: t("participants.remove"),
                            confirmVariant: "destructive",
                          });
                          if (!ok) return;
                          setActionError(null);
                          setInfo(null);
                          try {
                            await api.removePlayerFromEvent(eventId, p.id);
                            const refreshed = await api.getEventDetails(eventId);
                            setData(refreshed);
                            setInfo(t("participants.removed"));
                          } catch (err: any) {
                            setActionError(err?.message ?? t("participants.removeError"));
                          }
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                      {idx + 1}
                    </div>
                    <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary font-bold text-lg mb-2 overflow-hidden">
                      {p.avatarUrl || (p.id === meId && myAvatar) ? (
                        <img src={p.avatarUrl || myAvatar || ""} alt="Avatar" className="h-full w-full object-cover" />
                      ) : (
                        p.name?.[0]?.toUpperCase?.() ?? "?"
                      )}
                    </div>
                    <p className="text-sm font-medium text-center truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground text-center">
                      {p.isGuest ? t("participants.guest") : isTournament ? " " : p.rating}
                    </p>
                  </div>
                </PlayerTooltip>
              ))}

              {Array.from({ length: Math.max(0, e.courtsCount * 4 - registered.length) }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="p-4 rounded-xl border-2 border-dashed border-border/50 flex flex-col items-center justify-center text-muted-foreground hover:border-primary/30 hover:bg-primary/5 transition-colors cursor-pointer group"
                  role="button"
                  tabIndex={0}
                  onClick={() => setInviteOpen(true)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") setInviteOpen(true);
                  }}
                >
                  <div className="w-10 h-10 rounded-full border-2 border-dashed border-current flex items-center justify-center mb-2 group-hover:border-primary/50">
                    <UserPlus className="h-4 w-4 opacity-50" />
                  </div>
                  <p className="text-xs">{t("participants.openSpot")}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {isAuthor && pending.length > 0 ? (
          <div className="rounded-2xl bg-card border border-border/50 overflow-hidden">
            <div className="p-6 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-secondary">
                    <Users className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">{t("cancelRequests.title")}</h2>
                    <p className="text-sm text-muted-foreground">{t("cancelRequests.subtitle")}</p>
                  </div>
                </div>
                <span className="px-3 py-1.5 text-sm rounded-md bg-secondary text-secondary-foreground">
                  {pending.length}
                </span>
              </div>
            </div>
            <div className="p-6">
              <div className="flex flex-wrap gap-2">
                {pending.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-3 py-2">
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">({p.rating})</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        if (!eventId) return;
                        try {
                          await api.approveCancel(eventId, p.id);
                          const refreshed = await api.getEventDetails(eventId);
                          setData(refreshed);
                        } catch (err: any) {
                          setActionError(err?.message ?? t("cancelRequests.approveError"));
                        }
                      }}
                    >
                      {t("cancelRequests.approve")}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <Dialog
          open={roundsOpen}
          onOpenChange={(open) => {
            setRoundsOpen(open);
            if (!open) {
              setScorePadOpen(false);
            }
          }}
        >
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>{t("rounds.title")}</DialogTitle>
            </DialogHeader>

            <ModalScrollArea ref={roundsScrollRef} className="space-y-4 max-h-[70vh] overflow-y-auto pr-4">
              {(data.rounds ?? []).map((r, idx) => {
                const expanded = r.id === expandedRoundId;
                const isFinalRound = finalRoundLocked && idx === (data.rounds?.length ?? 0) - 1;
                const allPlayed = r.matches.every(isMatchFinished);
                const finishedCount = r.matches.filter(isMatchFinished).length;
                const canDeleteRound =
                  !!data.isAuthor &&
                  data.event?.status === "IN_PROGRESS" &&
                  (r.matches.length === 0 || finishedCount < r.matches.length);
                return (
                  <div
                    key={r.id}
                    ref={r.id === expandedRoundId ? activeRoundRef : undefined}
                    className={cn(
                      "rounded-xl border bg-card/50 shadow-sm p-0 transition-all scroll-mt-4 hover:shadow-md hover:bg-card",
                      allPlayed && !expanded ? "border-primary/30 bg-primary/5" : "border-border/70",
                    )}
                  >
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        className="flex-1 flex items-center justify-between gap-3 p-4 text-left"
                        onClick={() => {
                          setExpandedRoundId((prev) => {
                            if (prev === r.id) {
                              userCollapsedRef.current = true;
                              return null;
                            }
                            userCollapsedRef.current = false;
                            return r.id;
                          });
                          setScorePadOpen(false);
                        }}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <div>
                            <div className="text-lg font-semibold flex items-center gap-2">
                              {t("rounds.round")} {r.roundNumber}
                              {isFinalRound && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                                  <Trophy className="h-3.5 w-3.5" />
                                  {t("rounds.final")}
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {t("rounds.matches")}: {r.matches.length}
                              {allPlayed && r.matches.length > 0 && ` • ${t("rounds.played")}`}
                            </div>
                          </div>
                        </div>
                        <ChevronDown className={cn("h-5 w-5 transition-transform", expanded ? "rotate-180" : "")} />
                      </button>
                      {canDeleteRound && (
                        <button
                          type="button"
                          aria-label={t("rounds.deleteRound")}
                          className="px-3 my-3 mr-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          onClick={async (ev) => {
                            ev.stopPropagation();
                            if (!eventId) return;
                            const ok = await confirm({
                              title: t("rounds.deleteConfirmTitle"),
                              description: (
                                <>
                                  {t("rounds.round")} <b>{r.roundNumber}</b>
                                  {r.matches.length > 0
                                    ? ` ${t("rounds.deleteWithMatches", { n: r.matches.length, word: matchWord(r.matches.length, lang) })}`
                                    : ` ${t("rounds.deleteAlone")}`} {t("common.cannotUndo")}
                                </>
                              ),
                              warning: finishedCount > 0 ? (
                                <>
                                  {t("rounds.warnPlayedPrefix")} <b>{finishedCount} {finishedCount === 1 ? t("rounds.playedOne") : t("rounds.playedMany")}</b> {t("rounds.warnPlayedSuffix")}
                                </>
                              ) : undefined,
                              confirmLabel: t("common.delete"),
                              confirmVariant: "destructive",
                            });
                            if (!ok) return;
                            setActionError(null);
                            setInfo(null);
                            try {
                              await api.deleteRound(eventId, r.id);
                              const refreshed = await api.getEventDetails(eventId);
                              setData(refreshed);
                              if (expandedRoundId === r.id) setExpandedRoundId(null);
                              setInfo(t("rounds.roundDeleted"));
                            } catch (err: any) {
                              setActionError(err?.message ?? t("rounds.deleteError"));
                            }
                          }}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div
                      className={cn(
                        "grid transition-[grid-template-rows] duration-400 ease-in-out overflow-hidden",
                        expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                      )}
                    >
                      <div className="min-h-0 overflow-hidden">
                      <div className="px-4 pb-4">
                        <div className="space-y-3">
                          {r.matches.map((m) => {
                            const scores = scoreByMatch[m.id] ?? { a: 0, b: 0 };
                            const active = m.id === activeMatchId;
                            const finalScored = hasFinalScore(m);
                            const canEdit = canSubmitScore(m);
                            const showPadHere = active && scorePadOpen && canEdit;
                            // Подсказка для не-автора, почему карточка дизейблнута.
                            const lockHint = !canEdit && !isAuthor
                              ? finalScored
                                ? `${t("score.enteredPrefix")}${m.submittedByName ? `: ${m.submittedByName}` : ""}. ${t("score.onlyOrganizerCanChange")}`
                                : !isMyMatch(m)
                                  ? t("score.participantWillEnter")
                                  : null
                              : // свой финальный счёт во время игры можно исправить — подскажем это
                                canEdit && !isAuthor && finalScored && !!m.submittedByMe
                                ? t("score.enteredByYou")
                                : null;
                            const handleSelectTeam = (team: "A" | "B") => {
                              if (!canEdit) return;
                              // Открываем клавиатуру МГНОВЕННО — без ожидания сети. Раньше тут был
                              // блокирующий await getEventDetails (~1-2с), из-за чего ввод подвисал.
                              // Свежесть данных и так держит polling (5с). Anti-conflict проверку
                              // делаем оптимистично в фоне: если выяснится, что счёт уже финализирован
                              // другим участником — клавиатуру схлопнем и покажем баннер. В худшем
                              // случае submitScore вернёт 409, а .catch ниже уже это обрабатывает.
                              setActiveMatchId(m.id);
                              setActiveTeam(team);
                              setScorePadOpen(true);
                              if (eventId) {
                                api.getEventDetails(eventId).then((refreshed) => {
                                  setData(refreshed);
                                  const updatedMatch = refreshed.rounds
                                    .flatMap((r) => r.matches)
                                    .find((mm) => mm.id === m.id);
                                  // Закрываем клавиатуру, только если счёт финализирован и его правка нам недоступна
                                  // (т.е. ввёл кто-то другой). Свой же счёт во время игры править можно.
                                  if (updatedMatch && hasFinalScore(updatedMatch) && !canSubmitScore(updatedMatch)) {
                                    setScorePadOpen(false);
                                    setInfo(t("score.alreadyEnteredByOther"));
                                  }
                                }).catch(() => {
                                  /* сеть умерла — продолжаем оптимистично, submit поймает 409 если что */
                                });
                              }
                            };
                            return (
                              <div
                                key={m.id}
                                ref={(el) => {
                                  if (m.id === activeMatchId) {
                                    (activeMatchRef as { current: HTMLDivElement | null }).current = el;
                                  }
                                }}
                                className={cn(
                                  "rounded-lg border p-3 transition-colors scroll-mt-4",
                                  finalScored
                                    ? "border-emerald-500/40 bg-emerald-500/5"
                                    : active
                                      ? "border-primary/50 bg-secondary/30 shadow-sm"
                                      : "border-border/50 bg-secondary/10",
                                )}
                              >
                                <div className="text-sm text-muted-foreground">{m.courtName ?? `${t("score.court")} ${m.courtNumber}`}</div>
                                {lockHint && (
                                  <div className="mt-1 text-xs text-muted-foreground">{lockHint}</div>
                                )}
                                {props.me?.showWinProbability && typeof m.expectedA === "number" && !finalScored && (
                                  <WinProbabilityHint expectedA={m.expectedA} />
                                )}
                                <div className="mt-3 grid grid-cols-2 gap-3">
                                  <button
                                    type="button"
                                    disabled={!canEdit}
                                    aria-disabled={!canEdit}
                                    className={cn(
                                      "rounded-lg border px-3 py-3 text-center transition-colors",
                                      activeTeam === "A" && active && canEdit ? "border-primary text-primary" : "border-border",
                                      !canEdit && "opacity-70 cursor-not-allowed",
                                    )}
                                    onClick={() => handleSelectTeam("A")}
                                  >
                                    {renderTeamScore(m.teamA, scores.a, "left")}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!canEdit}
                                    aria-disabled={!canEdit}
                                    className={cn(
                                      "rounded-lg border px-3 py-3 text-center transition-colors",
                                      activeTeam === "B" && active && canEdit ? "border-primary text-primary" : "border-border",
                                      !canEdit && "opacity-70 cursor-not-allowed",
                                    )}
                                    onClick={() => handleSelectTeam("B")}
                                  >
                                    {renderTeamScore(m.teamB, scores.b, "right")}
                                  </button>
                                </div>
                                {showPadHere && e.scoringMode === "SETS" && (() => {
                                  const setsCount = e.setsPerMatch ?? 1;
                                  const maxGames = (e.gamesPerSet ?? 6) + 1; // +1 под тай-брейк (напр. 7)
                                  const cur = setsByMatch[m.id] ?? Array.from({ length: setsCount }, () => ({ a: 0, b: 0 }));
                                  const setGame = (i: number, team: "a" | "b", val: number) => {
                                    const v = Math.max(0, Math.min(maxGames, val));
                                    setSetsByMatch((prev) => {
                                      const arr = (prev[m.id] ?? Array.from({ length: setsCount }, () => ({ a: 0, b: 0 }))).map((x) => ({ ...x }));
                                      arr[i] = { ...arr[i], [team]: v };
                                      return { ...prev, [m.id]: arr };
                                    });
                                  };
                                  const Stepper = ({ i, team }: { i: number; team: "a" | "b" }) => {
                                    const val = cur[i]?.[team] ?? 0;
                                    return (
                                      <div className="flex items-center gap-2">
                                        <button type="button" className="h-9 w-9 rounded-lg border border-border bg-secondary/20 text-lg font-semibold hover:bg-secondary" onClick={() => setGame(i, team, val - 1)}>−</button>
                                        <span className="w-6 text-center text-lg font-bold tabular-nums">{val}</span>
                                        <button type="button" className="h-9 w-9 rounded-lg border border-border bg-secondary/20 text-lg font-semibold hover:bg-secondary" onClick={() => setGame(i, team, val + 1)}>+</button>
                                      </div>
                                    );
                                  };
                                  return (
                                    <div data-pad="1" className="mt-3 pt-3 border-t border-border/40 space-y-3">
                                      {Array.from({ length: setsCount }).map((_, i) => (
                                        <div key={i} className="flex items-center justify-center gap-3">
                                          {setsCount > 1 && <span className="w-12 text-xs text-muted-foreground">{t("score.set")} {i + 1}</span>}
                                          <Stepper i={i} team="a" />
                                          <span className="text-muted-foreground">:</span>
                                          <Stepper i={i} team="b" />
                                        </div>
                                      ))}
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-xs text-muted-foreground">
                                          {scoreError && active ? <span className="text-destructive">{scoreError}</span>
                                            : scoreSavingId === m.id ? t("common.saving") : t("score.gamesHint")}
                                        </span>
                                        <Button
                                          size="sm"
                                          disabled={scoreSavingId === m.id}
                                          onClick={() => {
                                            if (!eventId) return;
                                            const sets = (setsByMatch[m.id] ?? cur).map((s) => ({ teamAGames: s.a, teamBGames: s.b }));
                                            setScoreSavingId(m.id);
                                            setScoreError(null);
                                            api.submitSetsScore(m.id, sets)
                                              .then(async () => {
                                                setFinishedMatchIds((prev) => new Set([...prev, m.id]));
                                                setInfo(t("score.saved"));
                                                setScorePadOpen(false);
                                                setData(await api.getEventDetails(eventId));
                                              })
                                              .catch((err: any) => setScoreError(err?.message ?? t("score.saveError")))
                                              .finally(() => setScoreSavingId(null));
                                          }}
                                        >
                                          {t("score.saveScore")}
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })()}
                                {showPadHere && e.scoringMode !== "SETS" && (
                                  <div data-pad="1" className="mt-3 pt-3 border-t border-border/40">
                                      <div className="grid grid-cols-6 gap-2">
                                        {[0, ...Array.from({ length: (e.pointsPerPlayerPerMatch ?? 6) * 4 }, (_, i) => i + 1)].map((n) => (
                                          <button
                                            key={n}
                                            type="button"
                                            className="rounded-lg border border-border bg-secondary/20 py-2 text-sm font-semibold hover:bg-secondary"
                                            onClick={() => {
                                              const totalPoints = (e.pointsPerPlayerPerMatch ?? 6) * 4;
                                              const current = scoreByMatch[m.id] ?? { a: 0, b: 0 };
                                              let nextA = activeTeam === "A" ? n : current.a;
                                              let nextB = activeTeam === "B" ? n : current.b;
                                              const autoFilled = autoFilledByMatch[m.id];
                                              const canAutoFill =
                                                !autoFilled &&
                                                ((activeTeam === "A" && current.b === 0) ||
                                                  (activeTeam === "B" && current.a === 0));
                                              if (canAutoFill) {
                                                if (activeTeam === "A") {
                                                  nextB = Math.max(0, totalPoints - n);
                                                } else {
                                                  nextA = Math.max(0, totalPoints - n);
                                                }
                                                setAutoFilledByMatch((prev) => ({ ...prev, [m.id]: true }));
                                              }
                                              setScoreByMatch((prev) => ({
                                                ...prev,
                                                [m.id]: { a: nextA, b: nextB },
                                              }));
                                              if (nextA + nextB === totalPoints && eventId && !autoSavingRef.current.has(m.id)) {
                                                autoSavingRef.current.add(m.id);
                                                setScoreSavingId(m.id);
                                                setScoreError(null);
                                                // Помечаем оптимистичный счёт как «в полёте»: до устаканивания сервера
                                                // серверная синхронизация этот матч не трогает (защита от флика).
                                                pendingScoreRef.current[m.id] = { a: nextA, b: nextB };
                                                api.submitScore(m.id, { teamAPoints: nextA, teamBPoints: nextB })
                                                  .then(async () => {
                                                    setFinishedMatchIds((prev) => new Set([...prev, m.id]));
                                                    setInfo(t("score.saved"));
                                                    setScorePadOpen(false);
                                                    const refreshed = await api.getEventDetails(eventId);
                                                    setData(refreshed);
                                                    // Снимаем pending с запасом: к этому моменту протухшие in-flight
                                                    // refresh'и (запущенные до сабмита) уже прилетели и отфильтрованы.
                                                    setTimeout(() => {
                                                      delete pendingScoreRef.current[m.id];
                                                    }, 3000);
                                                  })
                                                  .catch(async (err: any) => {
                                                    delete pendingScoreRef.current[m.id];
                                                    setScoreError(err?.message ?? t("score.saveError"));
                                                    // Возможен 409 «уже введён» — обновим, чтобы UI показал актуальный счёт/автора.
                                                    if (eventId) {
                                                      try {
                                                        const refreshed = await api.getEventDetails(eventId);
                                                        setData(refreshed);
                                                      } catch {
                                                        /* ignore */
                                                      }
                                                    }
                                                  })
                                                  .finally(() => {
                                                    autoSavingRef.current.delete(m.id);
                                                    setScoreSavingId(null);
                                                  });
                                              }
                                            }}
                                          >
                                            {n}
                                          </button>
                                        ))}
                                      </div>
                                    <div className="mt-3 text-xs">
                                      {scoreError && active ? (
                                        <span className="text-destructive">{scoreError}</span>
                                      ) : scoreSavingId === m.id ? (
                                        <span className="text-muted-foreground">{t("common.saving")}</span>
                                      ) : (
                                        <span className="text-muted-foreground">
                                          {t("score.pickValue", { side: activeTeam === "A" ? t("score.sideLeft") : t("score.sideRight") })}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {r.matches.length > 0 && (!activeMatchId || !scorePadOpen) && (
                          <div className="mt-4 flex items-center justify-between gap-3">
                            <div className="text-xs text-muted-foreground">{t("score.tapTeamHint")}</div>
                          </div>
                        )}
                        {nextButtonLabel && expanded && (
                          <div className="mt-4 flex justify-end">
                            <Button
                              size="sm"
                              disabled={scoreSavingId === activeMatchId}
                              onClick={async () => {
                                if (!eventId) return;
                                const rounds = data?.rounds ?? [];
                                const curIdx = rounds.findIndex((rr) => rr.matches.some((mm) => mm.id === activeMatchId));
                                const nextRound = curIdx >= 0 ? rounds[curIdx + 1] : null;
                                if (nextRound) {
                                  setExpandedRoundId(nextRound.id);
                                  setActiveMatchId(nextRound.matches[0]?.id ?? null);
                                  setScorePadOpen(false);
                                  setScoreError(null);
                                }
                              }}
                            >
                              {nextButtonLabel}
                            </Button>
                          </div>
                        )}
                      </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </ModalScrollArea>

            {/* Футер прилипает к низу видимой области модала: на маленьких экранах
                контент скроллится, а кнопки организатора всегда на виду. */}
            <div className="sticky bottom-0 z-10 -mx-6 -mb-3 mt-5 border-t border-border bg-background px-6 pb-3 pt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {e.format === "FIXED_PAIRS" ? <div /> : (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={finalRoundLocked || addingRounds}
                  onClick={async () => {
                    if (e.format === "MEXICANO") {
                      void doAddRounds(1);
                      return;
                    }
                    const seriesLen = e.roundsPlanned ?? 0;
                    const choice = await confirm({
                      title: t("rounds.addRoundsTitle"),
                      choices: [
                        { id: "one", label: t("rounds.oneRound"), description: t("rounds.oneRoundDesc") },
                        ...(seriesLen > 1
                          ? [{ id: "series", label: t("rounds.seriesOf", { n: seriesLen }), description: t("rounds.seriesDesc") }]
                          : []),
                      ],
                    });
                    if (choice === "one") void doAddRounds(1);
                    else if (choice === "series") void doAddRounds(seriesLen);
                  }}
                >
                  {addingRounds
                    ? t("common.adding")
                    : e.format === "MEXICANO" ? t("rounds.addRoundMexicano") : t("rounds.addRoundBtn")}
                </Button>
                {e.format === "AMERICANA" && (
                <Button
                  variant="secondary"
                  disabled={finalRoundLocked}
                  onClick={async () => {
                    if (!eventId) return;
                    const ok = await confirm({
                      title: t("rounds.finalConfirmTitle"),
                      description: t("rounds.finalConfirmDesc"),
                      confirmLabel: t("common.add"),
                    });
                    if (!ok) return;
                    setInfo(null);
                    setActionError(null);
                    try {
                      console.log("[EVENT] Нажата кнопка: ФИНАЛЬНЫЙ РАУНД (addFinalRound)", eventId);
                      await api.addFinalRound(eventId);
                      const refreshed = await api.getEventDetails(eventId);
                      setData(refreshed);
                      setInfo(t("rounds.finalAdded"));
                      localStorage.setItem(`padix_final_round_${eventId}`, "1");
                      setFinalRoundLocked(true);
                      const rounds = refreshed.rounds ?? [];
                      const newRound = rounds[rounds.length - 1];
                      if (newRound?.id) {
                        setExpandedRoundId(newRound.id);
                        setTimeout(() => activeRoundRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 150);
                      }
                    } catch (err: any) {
                      setActionError(err?.message ?? t("rounds.finalError"));
                    }
                  }}
                >
                  {t("rounds.finalRoundBtn")}
                </Button>
                )}
              </div>
              )}
              <Button
                variant="destructive"
                disabled={finishing}
                onClick={async () => {
                  if (!eventId) return;
                  // Считаем матчи на игрока — для предупреждения о неравномерности.
                  const matchesPerPlayer = new Map<string, number>();
                  (data.rounds ?? []).forEach((rd) => {
                    rd.matches.forEach((mm) => {
                      if (!isMatchFinished(mm)) return;
                      [...(mm.teamA ?? []), ...(mm.teamB ?? [])].forEach((p) => {
                        if (!p?.id) return;
                        matchesPerPlayer.set(p.id, (matchesPerPlayer.get(p.id) ?? 0) + 1);
                      });
                    });
                  });
                  const counts = Array.from(matchesPerPlayer.values());
                  const minMatches = counts.length ? Math.min(...counts) : 0;
                  const maxMatches = counts.length ? Math.max(...counts) : 0;
                  const uneven = maxMatches - minMatches > 0;
                  const ok = await confirm({
                    title: isTournament ? t("finish.confirmTitleTournament") : t("finish.confirmTitleGame"),
                    description: isTournament ? t("finish.descTournament") : t("finish.descGame"),
                    warning: (
                      <>
                        {uneven && !isTournament ? (
                          <div>
                            {t("finish.unevenMatches")} (<b>{minMatches}–{maxMatches}</b>).
                            {" "}{t("finish.ratingsWillBe")} <b>{t("finish.normalized")}</b>: {t("finish.unevenTail")}
                          </div>
                        ) : null}
                        <div>{t("common.cannotUndo")}</div>
                      </>
                    ),
                    confirmLabel: t("finish.confirmLabel"),
                    confirmVariant: "destructive",
                  });
                  if (!ok) return;
                  setFinishing(true);
                  setActionError(null);
                  setInfo(null);
                  try {
                    await api.finishEvent(eventId);
                    const refreshed = await api.getEventDetails(eventId);
                    setData(refreshed);
                    setInfo(isTournament ? t("finish.doneTournament") : t("finish.doneGame"));
                    setRoundsOpen(false);
                  } catch (err: any) {
                    setActionError(err?.message ?? t("finish.error"));
                  } finally {
                    setFinishing(false);
                  }
                }}
              >
                {finishing ? t("finish.finishing") : isTournament ? t("finish.finishTournament") : t("finish.finishGame")}
              </Button>
            </div>

          </DialogContent>
        </Dialog>

        <Dialog open={statsOpen} onOpenChange={setStatsOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                {t("actions.leaderboard")}
              </DialogTitle>
              {finalRoundLocked && (data.rounds?.length ?? 0) > 0 && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  {t("leaderboard.includesFinal")}
                </p>
              )}
            </DialogHeader>
            <EventLeaderboard rounds={data.rounds ?? []} />
          </DialogContent>
        </Dialog>

        {/* info/actionError are now shown near the actions */}

        {editScoresOpen && eventId && data ? (
          <EditGameScoresDialog
            eventId={eventId}
            onClose={() => setEditScoresOpen(false)}
            onSave={async () => {
              setEditScoresOpen(false);
              if (eventId) {
                try {
                  const refreshed = await api.getEventDetails(eventId);
                  setData(refreshed);
                } catch {}
              }
            }}
          />
        ) : null}
      </div>
      </>
    );
  }, [
    actionError,
    canceling,
    closing,
    data,
    editScoresOpen,
    finishedMatchIds,
    finalRoundLocked,
    roundsOpen,
    statsOpen,
    expandedRoundId,
    activeMatchId,
    activeTeam,
    scoreByMatch,
    autoFilledByMatch,
    scoreError,
    scoreSavingId,
    scorePadOpen,
    friends,
    friendsError,
    info,
    inviteOpen,
    invitingId,
    invited,
    loadError,
    loadUnauthorized,
    loading,
    registering,
    finishing,
    starting,
    startPromptOpen,
    eventId,
    props.me,
    props.meLoaded,
    editOpen,
    editTitle,
    editDate,
    editStartTime,
    editEndTime,
    editPoints,
    editCourts,
    editPairing,
    editSaving,
    editError,
    infoExpanded,
    balanceModalOpen,
    balancePreview,
    switchingMode,
    // Добавление участников: пары (FIXED_PAIRS) и турнир (поиск игроков + гости).
    allPlayers,
    pairP1,
    pairP2,
    pairBusy,
    tournamentQuery,
    tournamentAddingId,
    guestName,
    guestBusy,
    // Смена языка обязана перестроить content — иначе страница остаётся на старом языке.
    t,
    lang,
  ]);

  return <>{content}</>;
}

/**
 * Шансы выигрыша (фаза 1). Полоска expectedA vs (1-expectedA) + текстовая метка.
 * Пороги в expectedA-шкале соответствуют разнице рейтингов 50/150/300/500 (см. spec).
 */
function WinProbabilityHint({ expectedA }: { expectedA: number }) {
  const { t } = useI18n(TR);
  const pctA = Math.round(expectedA * 100);
  const pctB = 100 - pctA;
  const absDelta = Math.abs(expectedA - 0.5);
  const favA = expectedA > 0.5;
  const arrow = favA ? "←" : "→";
  let label: string;
  if (absDelta < 0.07) label = t("prob.even");
  else if (absDelta < 0.20) label = `${t("prob.slightFavorite")} ${arrow}`;
  else if (absDelta < 0.34) label = `${t("prob.favorite")} ${arrow}`;
  else if (absDelta < 0.45) label = `${t("prob.strongFavorite")} ${arrow}`;
  else label = t("prob.davidGoliath");

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
        <span>{pctA}%</span>
        <span>{label}</span>
        <span>{pctB}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/40 flex">
        <div
          className="h-full bg-emerald-500/70 transition-all"
          style={{ width: `${pctA}%` }}
        />
        <div
          className="h-full bg-sky-500/60 transition-all"
          style={{ width: `${pctB}%` }}
        />
      </div>
    </div>
  );
}
