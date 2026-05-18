package com.padelgo.api

import com.padelgo.domain.Event
import com.padelgo.domain.ScoringMode
import com.padelgo.repo.MatchRepository
import com.padelgo.repo.MatchSetScoreRepository
import com.padelgo.repo.PlayerRepository
import com.padelgo.repo.RoundRepository
import com.padelgo.service.EventService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.slf4j.LoggerFactory
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate
import java.util.UUID

private val logger = LoggerFactory.getLogger("EventController")

@Tag(name = "Players", description = "Список игроков платформы")
@RestController
@RequestMapping("/api/players")
class PlayerController(
    private val service: EventService,
    private val userRepo: com.padelgo.auth.UserRepository
) {
    @Operation(
        summary = "Список игроков по рейтингу (убывание)",
        description = "Публичный эндпоинт — токен не нужен. Используется для выбора игроков при регистрации на игру."
    )
    @GetMapping("/rating")
    fun rating(): List<PlayerResponse> {
        val players = service.listPlayersByRating()
        val usersByPlayerId = userRepo.findAllByPlayerIdIn(players.mapNotNull { it.id })
            .associateBy { it.playerId!! }
        return players.map { p ->
            val calibration = usersByPlayerId[p.id]?.calibrationMatchesRemaining
            val publicId = formatPublicId(usersByPlayerId[p.id]?.publicId)
            PlayerResponse.from(p, calibration, publicId)
        }
    }
}

@Tag(name = "Events", description = "Управление играми: создание, регистрация, старт, счёт, финиш")
@SecurityRequirement(name = "BearerAuth")
@RestController
@RequestMapping("/api/events")
class EventController(
    private val service: EventService,
    private val roundRepo: RoundRepository,
    private val matchRepo: MatchRepository,
    private val scoreRepo: MatchSetScoreRepository,
    private val draftScoreRepo: com.padelgo.repo.MatchDraftScoreRepository,
    private val playerRepo: PlayerRepository,
    private val userRepo: com.padelgo.auth.UserRepository,
    private val courtRepo: com.padelgo.repo.EventCourtRepository,
    private val botClient: com.padelgo.service.BotClient
) {
    @Operation(
        summary = "Создать игру",
        description = "Создаёт игру со статусом OPEN_FOR_REGISTRATION. Создатель становится организатором."
    )
    @PostMapping
    fun create(@Valid @RequestBody req: CreateEventRequest): EventResponse {
        val userId = principalUserId()
        val saved = service.createEvent(
            Event(
                title = req.title.trim(),
                date = req.date,
                startTime = req.startTime,
                endTime = req.endTime,
                format = req.format,
                pairingMode = req.pairingMode,
                courtsCount = req.courtsCount,
                roundsPlanned = req.roundsPlanned,
                autoRounds = req.autoRounds,
                scoringMode = req.scoringMode,
                pointsPerPlayerPerMatch = req.pointsPerPlayerPerMatch,
                setsPerMatch = req.setsPerMatch,
                gamesPerSet = req.gamesPerSet,
                tiebreakEnabled = req.tiebreakEnabled
            ),
            userId,
            req.courtNames
        )
        val chatIds = req.telegramChatIds
        if (!chatIds.isNullOrEmpty()) {
            try {
                botClient.notifyEventCreated(
                    com.padelgo.service.EventCreatedNotify(
                        eventId = saved.id!!,
                        ownerUserId = userId,
                        chatIds = chatIds,
                        title = saved.title,
                        date = saved.date,
                        startTime = saved.startTime,
                        endTime = saved.endTime,
                        courtsCount = saved.courtsCount,
                        registeredCount = 0
                    )
                )
            } catch (e: Exception) {
                logger.warn("Failed to notify bot about created event ${saved.id}: ${e.message}")
            }
        }
        return EventResponse.from(saved)
    }

    @Operation(summary = "Игры на сегодня")
    @GetMapping("/today")
    fun today(): List<EventResponse> =
        service.getToday(LocalDate.now()).map { e ->
            EventResponse.from(e, service.getRegisteredCount(e.id!!))
        }

    @Operation(
        summary = "Предстоящие игры",
        description = "По умолчанию: от сегодня до +14 дней. Параметры from/to задают диапазон дат (YYYY-MM-DD)."
    )
    @GetMapping("/upcoming")
    fun upcoming(
        @Parameter(description = "Начало диапазона (YYYY-MM-DD), по умолчанию сегодня")
        @org.springframework.web.bind.annotation.RequestParam(required = false) from: String?,
        @Parameter(description = "Конец диапазона (YYYY-MM-DD), по умолчанию from + 14 дней")
        @org.springframework.web.bind.annotation.RequestParam(required = false) to: String?
    ): List<EventResponse> {
        val start = from?.let { LocalDate.parse(it) } ?: LocalDate.now()
        val end = to?.let { LocalDate.parse(it) } ?: start.plusDays(14)
        return service.getUpcoming(start, end).map { e ->
            EventResponse.from(e, service.getRegisteredCount(e.id!!))
        }
    }

    @Operation(summary = "Обновить параметры игры (только организатор)")
    @PatchMapping("/{eventId}")
    fun update(@PathVariable eventId: UUID, @Valid @RequestBody req: UpdateEventRequest): EventResponse =
        EventResponse.from(service.updateEvent(eventId, principalUserId(), req))

    @Operation(
        summary = "Зарегистрировать игрока на игру",
        description = "Организатор регистрирует любого игрока по его UUID. Игра должна быть в статусе OPEN_FOR_REGISTRATION."
    )
    @PostMapping("/{eventId}/register")
    fun register(@PathVariable eventId: UUID, @Valid @RequestBody req: RegisterRequest) =
        service.register(eventId, req.playerId)

    @Operation(
        summary = "Закрыть регистрацию",
        description = "Переводит игру в REGISTRATION_CLOSED. Только организатор."
    )
    @PostMapping("/{eventId}/close-registration")
    fun closeRegistration(@PathVariable eventId: UUID) {
        service.closeRegistration(eventId, principalUserId())
    }

    @Operation(
        summary = "Превью BALANCED режима",
        description = "Считает максимум хороших раундов (без повторов партнёрств и в пределах cap maxTeamDiff) с текущим составом. " +
            "Фронт вызывает перед закрытием регистрации чтобы решить, показывать ли модалку предупреждения."
    )
    @GetMapping("/{eventId}/balance-preview")
    fun balancePreview(@PathVariable eventId: UUID): BalancePreviewResponse =
        service.previewBalancedRounds(eventId)

    @Operation(
        summary = "Сменить режим спаривания (BALANCED ↔ ROUND_ROBIN)",
        description = "Только до старта эвента (OPEN_FOR_REGISTRATION или REGISTRATION_CLOSED). Только организатор."
    )
    @PatchMapping("/{eventId}/pairing-mode")
    fun updatePairingMode(
        @PathVariable eventId: UUID,
        @Valid @RequestBody req: UpdatePairingModeRequest
    ): EventResponse =
        EventResponse.from(service.updatePairingMode(eventId, principalUserId(), req.pairingMode))

    @Operation(
        summary = "Отменить свою регистрацию",
        description = "Если игра ещё не стартовала — отмена немедленная. Иначе создаётся запрос на отмену, который должен подтвердить организатор."
    )
    @PostMapping("/{eventId}/cancel")
    fun cancelRegistration(@PathVariable eventId: UUID): CancelRegistrationResponse {
        return service.cancelRegistration(eventId, principalUserId())
    }

    @Operation(summary = "Подтвердить запрос на отмену регистрации игрока (только организатор)")
    @PostMapping("/{eventId}/cancel/{playerId}/approve")
    fun approveCancel(@PathVariable eventId: UUID, @PathVariable playerId: UUID) {
        service.approveCancel(eventId, principalUserId(), playerId)
    }

    @Operation(summary = "Удалить игрока из игры (только организатор)")
    @PostMapping("/{eventId}/remove/{playerId}")
    fun removePlayer(@PathVariable eventId: UUID, @PathVariable playerId: UUID) {
        service.removePlayer(eventId, principalUserId(), playerId)
    }

    @Operation(summary = "Удалить игру (только организатор, до старта)")
    @DeleteMapping("/{eventId}")
    fun deleteEvent(@PathVariable eventId: UUID) {
        service.deleteEvent(eventId, principalUserId())
    }

    @Operation(
        summary = "Стартовать игру",
        description = "Создаёт раунды и расстановку матчей. Переводит игру в IN_PROGRESS. Только организатор."
    )
    @PostMapping("/{eventId}/start")
    fun start(@PathVariable eventId: UUID) {
        service.startEvent(eventId, principalUserId())
    }

    @Operation(
        summary = "Записать итоговый счёт матча",
        description = "Доступно только пока игра в статусе IN_PROGRESS. " +
            "При scoringMode=POINTS заполни поле points; при scoringMode=SETS — поле sets."
    )
    @PostMapping("/matches/{matchId}/score")
    fun submitScore(@PathVariable matchId: UUID, @Valid @RequestBody req: SubmitScoreRequest) {
        service.submitScore(matchId, principalUserId(), req)
    }

    @Operation(
        summary = "Сохранить черновой счёт матча",
        description = "Черновой счёт отображается в интерфейсе игры, но не влияет на рейтинг до финиша."
    )
    @PostMapping("/matches/{matchId}/draft-score")
    fun saveDraftScore(@PathVariable matchId: UUID, @Valid @RequestBody req: DraftScoreRequest) {
        service.saveDraftScore(matchId, principalUserId(), req)
    }

    @Operation(
        summary = "Завершить игру",
        description = "Переводит игру в FINISHED, пересчитывает рейтинги игроков. Только организатор. " +
            "Если не все матчи завершены — автоматически вызывается force-finish."
    )
    @PostMapping("/{eventId}/finish")
    fun finish(@PathVariable eventId: UUID) {
        val userId = principalUserId()
        try {
            service.finishEvent(eventId, userId)
        } catch (e: ApiException) {
            if (e.message?.contains("Not all matches are finished") == true) {
                service.forceFinishEvent(eventId, userId)
                return
            }
            throw e
        }
    }

    @Operation(summary = "Добавить раунд вручную (только организатор, autoRounds=false)")
    @PostMapping("/{eventId}/rounds/add")
    fun addRound(@PathVariable eventId: UUID) {
        service.addRound(eventId, principalUserId())
    }

    @Operation(summary = "Добавить финальный раунд (только организатор)")
    @PostMapping("/{eventId}/rounds/final")
    fun addFinalRound(@PathVariable eventId: UUID) {
        service.addFinalRound(eventId, principalUserId())
    }

    @Operation(summary = "Удалить последний пустой раунд (только организатор)")
    @DeleteMapping("/{eventId}/rounds/{roundId}")
    fun deleteRound(@PathVariable eventId: UUID, @PathVariable roundId: UUID) {
        service.deleteRound(eventId, roundId, principalUserId())
    }

    @Operation(
        summary = "Детали игры",
        description = "Возвращает всю информацию: раунды, матчи, счёт, зарегистрированных игроков. " +
            "Публичный эндпоинт (GET), токен нужен только для флага isAuthor."
    )
    @GetMapping("/{eventId}")
    @Transactional(readOnly = true)
    fun getDetails(@PathVariable eventId: UUID): EventDetailsResponse {
        val event = service.getEvent(eventId)
        val courts = courtRepo.findAllByEventIdOrderByCourtNumberAsc(eventId)
        val courtNameByNumber = courts.associate { it.courtNumber to it.name }
        val rounds = roundRepo.findAllByEventIdOrderByRoundNumberAsc(eventId)
        val matches = rounds.associate { r -> r.id!! to matchRepo.findAllByRoundIdOrderByCourtNumberAsc(r.id!!) }
        val regs = service.getRegisteredPlayers(eventId)
        val pending = service.getPendingCancelRequests(eventId)
        val matchPlayerIds = matches.values.flatten().flatMap {
            listOf(it.teamAPlayer1Id!!, it.teamAPlayer2Id!!, it.teamBPlayer1Id!!, it.teamBPlayer2Id!!)
        }
        val playerIds = (matchPlayerIds + regs.mapNotNull { it.id } + pending.mapNotNull { it.id }).toSet()
        val players = playerRepo.findAllById(playerIds).associateBy { it.id!! }
        val usersByPlayerId = userRepo.findAllByPlayerIdIn(playerIds).associateBy { it.playerId!! }
        val playerResponses = players.mapValues { (id, p) ->
            val calibration = usersByPlayerId[id]?.calibrationMatchesRemaining
            val publicId = formatPublicId(usersByPlayerId[id]?.publicId)
            PlayerResponse.from(p, calibration, publicId)
        }
        val scoresByMatch = matches.values.flatten().associate { m ->
            m.id!! to scoreRepo.findAllByMatchIdOrderBySetNumberAsc(m.id!!)
        }
        val draftScoresByMatch = matches.values.flatten().associate { m ->
            m.id!! to draftScoreRepo.findByMatchId(m.id!!)
        }

        val roundDtos = rounds.map { r ->
            val ms = matches[r.id!!].orEmpty().map { m ->
                val setEntities = scoresByMatch[m.id!!].orEmpty()
                    .sortedBy { it.setNumber }
                    .map { SetScoreRequest(it.teamAGames, it.teamBGames) }

                val score = if (setEntities.isEmpty()) {
                    if (event.scoringMode == ScoringMode.POINTS) {
                        val draft = draftScoresByMatch[m.id!!]
                        if (draft == null) {
                            null
                        } else {
                            ScoreResponse(
                                mode = ScoringMode.POINTS,
                                points = PointsScoreRequest(teamAPoints = draft.teamAPoints, teamBPoints = draft.teamBPoints)
                            )
                        }
                    } else {
                        null
                    }
                } else if (event.scoringMode == ScoringMode.POINTS) {
                    val s1 = setEntities.first()
                    ScoreResponse(
                        mode = ScoringMode.POINTS,
                        points = PointsScoreRequest(teamAPoints = s1.teamAGames, teamBPoints = s1.teamBGames)
                    )
                } else {
                    ScoreResponse(
                        mode = ScoringMode.SETS,
                        sets = setEntities
                    )
                }
                val courtName = courtNameByNumber[m.courtNumber] ?: "Корт ${m.courtNumber}"
                MatchResponse.from(m, playerResponses, score, courtName)
            }
            RoundResponse.from(r, ms)
        }
        val isAuthor = service.isAuthor(eventId, principalUserId())
        val authorName = service.getAuthorName(eventId) ?: if (isAuthor) "Вы" else "Не указан"
        val registeredCount = service.getRegisteredCount(eventId)
        return EventDetailsResponse(
            EventResponse.from(event, registeredCount),
            roundDtos,
            regs.map { p ->
                val calibration = usersByPlayerId[p.id]?.calibrationMatchesRemaining
                val publicId = formatPublicId(usersByPlayerId[p.id]?.publicId)
                PlayerResponse.from(p, calibration, publicId)
            },
            pending.map { p ->
                val calibration = usersByPlayerId[p.id]?.calibrationMatchesRemaining
                val publicId = formatPublicId(usersByPlayerId[p.id]?.publicId)
                PlayerResponse.from(p, calibration, publicId)
            },
            isAuthor,
            authorName
        )
    }

    private fun principalUserId(): UUID {
        val p = org.springframework.security.core.context.SecurityContextHolder.getContext().authentication?.principal
        if (p is com.padelgo.auth.JwtPrincipal) return p.userId
        throw com.padelgo.api.ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED, "Unauthorized")
    }
}

private fun formatPublicId(publicId: Long?): String? = publicId?.let { "#$it" }
