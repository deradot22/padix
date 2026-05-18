package com.padelgo.api

import com.padelgo.domain.Event
import com.padelgo.domain.EventFormat
import com.padelgo.domain.EventStatus
import com.padelgo.domain.PairingMode
import com.padelgo.domain.Match
import com.padelgo.domain.Player
import com.padelgo.domain.Round
import com.padelgo.domain.ScoringMode
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

data class CreatePlayerRequest(
    @field:NotBlank
    val name: String
)

@Schema(description = "Игрок")
data class PlayerResponse(
    @Schema(description = "Внутренний UUID игрока")
    val id: UUID,

    @Schema(description = "Отображаемое имя")
    val name: String,

    @Schema(description = "Рейтинг ELO игрока")
    val rating: Int,

    @Schema(description = "Уровень NTRP: 1.0 / 1.5 / 2.0 / 2.5 / 3.0 / 3.5 / 4.0 / 4.5 / 5.0+")
    val ntrp: String,

    @Schema(description = "Общее количество сыгранных матчей")
    val gamesPlayed: Int,

    @Schema(description = "Осталось матчей до конца калибровки. null — данные недоступны, 0 — калибровка пройдена, >0 — ещё в калибровке")
    val calibrationEventsRemaining: Int? = null,

    @Schema(description = "Публичный ID для добавления в друзья, формат «#123456789»")
    val publicId: String? = null,

    @Schema(description = "URL аватара или null")
    val avatarUrl: String? = null
) {
    companion object {
        fun from(p: Player, calibrationEventsRemaining: Int? = null, publicId: String? = null) = PlayerResponse(
            id = p.id!!,
            name = p.name,
            rating = p.rating,
            ntrp = p.ntrp,
            gamesPlayed = p.gamesPlayed,
            calibrationEventsRemaining = calibrationEventsRemaining,
            publicId = publicId,
            avatarUrl = p.avatarUrl
        )
    }
}

@Schema(description = "Запрос на создание игры")
data class CreateEventRequest(
    @field:NotBlank
    @Schema(description = "Название игры", example = "Воскресный падел")
    val title: String,

    @field:NotNull
    @Schema(description = "Дата игры", example = "2026-05-01")
    val date: LocalDate,

    @field:NotNull
    @Schema(description = "Время начала", example = "10:00")
    val startTime: LocalTime,

    @field:NotNull
    @Schema(description = "Время окончания", example = "12:00")
    val endTime: LocalTime,

    @Schema(description = "Формат игры. Сейчас только AMERICANA")
    val format: EventFormat = EventFormat.AMERICANA,

    @Schema(description = "Режим расстановки: ROUND_ROBIN — все играют со всеми, BALANCED — по рейтингу")
    val pairingMode: PairingMode = PairingMode.ROUND_ROBIN,

    @field:Min(1)
    @Schema(description = "Количество кортов (определяет вместимость: courtsCount × 4 игроков)", example = "2")
    val courtsCount: Int = 2,

    @Schema(description = "Названия кортов. Если null — генерируются автоматически («Корт 1», «Корт 2» …)", example = "[\"Корт A\", \"Корт B\"]")
    val courtNames: List<String>? = null,

    @Schema(description = "true — раунды создаются автоматически при старте игры")
    val autoRounds: Boolean = true,

    @field:Min(1)
    @Schema(description = "Количество раундов (используется если autoRounds = false)", example = "6")
    val roundsPlanned: Int = 6,

    @Schema(description = "Система счёта: SETS — геймы/сеты, POINTS — очки (американка)")
    val scoringMode: ScoringMode = ScoringMode.SETS,

    @field:Min(1)
    @Schema(description = "Очков на каждого игрока за матч при scoringMode=POINTS. Сумма очков двух команд = pointsPerPlayerPerMatch × 4", example = "6")
    val pointsPerPlayerPerMatch: Int = 6,

    @field:Min(1)
    @Schema(description = "Сетов в матче при scoringMode=SETS", example = "1")
    val setsPerMatch: Int = 1,

    @field:Min(1)
    @Schema(description = "Геймов в сете при scoringMode=SETS", example = "6")
    val gamesPerSet: Int = 6,

    @Schema(description = "Тайбрейк при равном счёте в сете")
    val tiebreakEnabled: Boolean = true,

    @Schema(description = "ID привязанных Telegram-чатов, в которые нужно отправить анонс игры сразу после создания. Чаты, не принадлежащие текущему пользователю, игнорируются.")
    val telegramChatIds: List<UUID>? = null
)

@Schema(description = "Запрос на обновление игры")
data class UpdateEventRequest(
    @Schema(description = "Новое название игры")
    val title: String? = null,

    @Schema(description = "Новая дата", example = "2026-05-01")
    val date: LocalDate? = null,

    @Schema(description = "Новое время начала", example = "10:00")
    val startTime: LocalTime? = null,

    @Schema(description = "Новое время окончания", example = "12:00")
    val endTime: LocalTime? = null,

    @field:Min(1)
    @Schema(description = "Новое значение очков на игрока за матч (только до старта)")
    val pointsPerPlayerPerMatch: Int? = null,

    @field:Min(1)
    @Schema(description = "Новое количество кортов (только до старта)")
    val courtsCount: Int? = null,

    @Schema(description = "Новый режим расстановки (только до старта)")
    val pairingMode: com.padelgo.domain.PairingMode? = null
)

@Schema(description = "Игра (краткая информация)")
data class EventResponse(
    @Schema(description = "UUID игры")
    val id: UUID,

    @Schema(description = "Название")
    val title: String,

    @Schema(description = "Дата", example = "2026-05-01")
    val date: LocalDate,

    @Schema(description = "Время начала", example = "10:00")
    val startTime: LocalTime,

    @Schema(description = "Время окончания", example = "12:00")
    val endTime: LocalTime,

    @Schema(description = "Формат игры")
    val format: EventFormat,

    @Schema(description = "Режим расстановки")
    val pairingMode: PairingMode,

    @Schema(
        description = "Статус игры:\n" +
            "- `DRAFT` — черновик\n" +
            "- `OPEN_FOR_REGISTRATION` — открыта регистрация\n" +
            "- `REGISTRATION_CLOSED` — регистрация закрыта\n" +
            "- `IN_PROGRESS` — идёт, можно вводить счёт\n" +
            "- `FINISHED` — завершена\n" +
            "- `CANCELLED` — отменена"
    )
    val status: EventStatus,

    @Schema(description = "Количество зарегистрированных игроков")
    val registeredCount: Int,

    @Schema(description = "Количество кортов")
    val courtsCount: Int,

    @Schema(description = "Запланировано раундов")
    val roundsPlanned: Int,

    @Schema(description = "Автоматическое создание раундов")
    val autoRounds: Boolean,

    @Schema(description = "Система счёта")
    val scoringMode: ScoringMode,

    @Schema(description = "Очков на игрока за матч (при scoringMode=POINTS)")
    val pointsPerPlayerPerMatch: Int,

    @Schema(description = "Сетов в матче (при scoringMode=SETS)")
    val setsPerMatch: Int,

    @Schema(description = "Геймов в сете (при scoringMode=SETS)")
    val gamesPerSet: Int,

    @Schema(description = "Тайбрейк включён")
    val tiebreakEnabled: Boolean
) {
    companion object {
        fun from(e: Event, registeredCount: Int = 0) = EventResponse(
            id = e.id!!,
            title = e.title,
            date = e.date,
            startTime = e.startTime,
            endTime = e.endTime,
            format = e.format,
            pairingMode = e.pairingMode,
            status = e.status,
            registeredCount = registeredCount,
            courtsCount = e.courtsCount,
            roundsPlanned = e.roundsPlanned,
            autoRounds = e.autoRounds,
            scoringMode = e.scoringMode,
            pointsPerPlayerPerMatch = e.pointsPerPlayerPerMatch,
            setsPerMatch = e.setsPerMatch,
            gamesPerSet = e.gamesPerSet,
            tiebreakEnabled = e.tiebreakEnabled
        )
    }
}

@Schema(description = "Запрос на регистрацию игрока в игре")
data class RegisterRequest(
    @field:NotNull
    @Schema(description = "UUID игрока (из PlayerResponse.id)")
    val playerId: UUID
)

@Schema(description = "Запрос на смену режима спаривания эвента")
data class UpdatePairingModeRequest(
    @field:NotNull
    @Schema(description = "Новый режим: BALANCED или ROUND_ROBIN")
    val pairingMode: PairingMode
)

@Schema(description = "Счёт одного сета (при scoringMode=SETS)")
data class SetScoreRequest(
    @field:Min(0)
    @Schema(description = "Геймы команды A", example = "6")
    val teamAGames: Int,

    @field:Min(0)
    @Schema(description = "Геймы команды B", example = "4")
    val teamBGames: Int
)

@Schema(description = "Счёт в очках (при scoringMode=POINTS)")
data class PointsScoreRequest(
    @field:Min(0)
    @Schema(description = "Очки команды A. teamAPoints + teamBPoints = pointsPerPlayerPerMatch × 4", example = "16")
    val teamAPoints: Int,

    @field:Min(0)
    @Schema(description = "Очки команды B", example = "8")
    val teamBPoints: Int
)

@Schema(description = "Черновой счёт (промежуточный, до финиша игры)")
data class DraftScoreRequest(
    @field:Min(0)
    @Schema(description = "Очки команды A")
    val teamAPoints: Int,

    @field:Min(0)
    @Schema(description = "Очки команды B")
    val teamBPoints: Int
)

@Schema(description = "Запрос на запись итогового счёта матча. Заполни только одно поле — sets или points — в зависимости от scoringMode игры")
data class SubmitScoreRequest(
    @Schema(description = "Счёт по сетам (если scoringMode=SETS)")
    val sets: List<SetScoreRequest>? = null,

    @Schema(description = "Счёт в очках (если scoringMode=POINTS)")
    val points: PointsScoreRequest? = null
)

@Schema(description = "Матч")
data class MatchResponse(
    @Schema(description = "UUID матча")
    val id: UUID,

    @Schema(description = "Номер корта (начиная с 1)")
    val courtNumber: Int,

    @Schema(description = "Название корта")
    val courtName: String? = null,

    @Schema(description = "Игроки команды A (всегда 2)")
    val teamA: List<PlayerResponse>,

    @Schema(description = "Игроки команды B (всегда 2)")
    val teamB: List<PlayerResponse>,

    @Schema(description = "Статус матча: SCHEDULED — ещё не сыгран, FINISHED — завершён")
    val status: String,

    @Schema(description = "Счёт матча. null — счёт не введён")
    val score: ScoreResponse?
) {
    companion object {
        fun from(m: Match, players: Map<UUID, PlayerResponse>, score: ScoreResponse?, courtName: String? = null) = MatchResponse(
            id = m.id!!,
            courtNumber = m.courtNumber,
            courtName = courtName,
            teamA = listOf(players[m.teamAPlayer1Id]!!, players[m.teamAPlayer2Id]!!),
            teamB = listOf(players[m.teamBPlayer1Id]!!, players[m.teamBPlayer2Id]!!),
            status = m.status.name,
            score = score
        )
    }
}

@Schema(description = "Счёт матча")
data class ScoreResponse(
    @Schema(description = "Система счёта")
    val mode: ScoringMode,

    @Schema(description = "Счёт по сетам (если mode=SETS)")
    val sets: List<SetScoreRequest>? = null,

    @Schema(description = "Счёт в очках (если mode=POINTS)")
    val points: PointsScoreRequest? = null
)

@Schema(description = "Раунд игры")
data class RoundResponse(
    @Schema(description = "UUID раунда")
    val id: UUID,

    @Schema(description = "Номер раунда (начиная с 1)")
    val roundNumber: Int,

    @Schema(description = "Матчи раунда")
    val matches: List<MatchResponse>
) {
    companion object {
        fun from(r: Round, matches: List<MatchResponse>) = RoundResponse(
            id = r.id!!,
            roundNumber = r.roundNumber,
            matches = matches
        )
    }
}

@Schema(description = "Детальная информация об игре")
data class EventDetailsResponse(
    @Schema(description = "Основные данные игры")
    val event: EventResponse,

    @Schema(description = "Раунды с матчами (пусто пока игра не стартовала)")
    val rounds: List<RoundResponse>,

    @Schema(description = "Зарегистрированные игроки")
    val registeredPlayers: List<PlayerResponse>,

    @Schema(description = "Игроки, запросившие отмену регистрации (ожидают подтверждения организатора)")
    val pendingCancelRequests: List<PlayerResponse>,

    @Schema(description = "true — текущий пользователь является организатором игры")
    val isAuthor: Boolean,

    @Schema(description = "Имя организатора игры")
    val authorName: String
)

@Schema(description = "Результат запроса отмены регистрации")
data class CancelRegistrationResponse(
    @Schema(description = "CANCELLED — отменена сразу (если игра ещё не стартовала), PENDING — ожидает подтверждения организатора")
    val status: String,

    @Schema(description = "Человекочитаемое сообщение")
    val message: String
)

@Schema(description = "Превью режима «Равный бой»: сколько раундов реально можно сыграть с текущим составом без повторов партнёрств и в пределах cap")
data class BalancePreviewResponse(
    @Schema(description = "Количество зарегистрированных игроков")
    val playerCount: Int,

    @Schema(description = "Минимально нужно игроков для старта (courtsCount * 4)")
    val capacity: Int,

    @Schema(description = "Разброс рейтингов = max(rating) - min(rating)")
    val ratingSpread: Int,

    @Schema(description = "SMALL <200 / MEDIUM 200-400 / LARGE ≥400. NONE — если игроков меньше capacity или режим не BALANCED")
    val severity: String,

    @Schema(description = "Максимум раундов без повторов партнёрств и нарушений cap maxTeamDiff")
    val maxGoodRounds: Int,

    @Schema(description = "Сколько раундов запрошено юзером (manual режим). null в auto.")
    val requestedRounds: Int?,

    @Schema(description = "Текущий режим pairing для эвента (BALANCED / ROUND_ROBIN)")
    val currentPairingMode: PairingMode,

    @Schema(description = "true — стоит показать модалку предупреждения перед закрытием регистрации")
    val shouldWarn: Boolean
)
