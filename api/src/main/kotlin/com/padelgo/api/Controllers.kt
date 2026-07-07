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
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate
import java.util.UUID

private val logger = LoggerFactory.getLogger("EventController")

@Tag(name = "Players", description = "Список игроков платформы")
@RestController
@RequestMapping("/api/players")
class PlayerController(
    private val service: EventService,
    private val userRepo: com.padelgo.auth.UserRepository,
    private val playerRepo: PlayerRepository
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

    @Operation(
        summary = "Аватар игрока (картинкой)",
        description = "Отдаёт аватар игрока как изображение с кешированием. Если аватар хранится как " +
            "base64 data-URL — декодирует в байты; если это внешняя ссылка — редиректит на неё; иначе 404. " +
            "Публичный эндпоинт (рендерится тегом <img>), чтобы списочные JSON-ответы не таскали base64."
    )
    @GetMapping("/{id}/avatar")
    fun avatar(@PathVariable id: UUID): org.springframework.http.ResponseEntity<ByteArray> {
        val player = playerRepo.findById(id).orElse(null)
            ?: return org.springframework.http.ResponseEntity.status(org.springframework.http.HttpStatus.NOT_FOUND).build()
        val url = player.avatarUrl
            ?: return org.springframework.http.ResponseEntity.status(org.springframework.http.HttpStatus.NOT_FOUND).build()
        if (!url.startsWith("data:")) {
            // Внешний URL (dicebear/telegram/...) — редиректим, чтобы фронт мог единообразно
            // указывать на /avatar для любого игрока.
            return org.springframework.http.ResponseEntity.status(org.springframework.http.HttpStatus.FOUND)
                .location(java.net.URI.create(url))
                .build()
        }
        val comma = url.indexOf(',')
        if (comma < 0) return org.springframework.http.ResponseEntity.status(org.springframework.http.HttpStatus.NOT_FOUND).build()
        // "data:image/jpeg;base64,...."  ->  mime = image/jpeg
        val mime = url.substring("data:".length, comma).substringBefore(";").ifBlank { "image/jpeg" }
        val bytes = try {
            java.util.Base64.getDecoder().decode(url.substring(comma + 1))
        } catch (e: IllegalArgumentException) {
            return org.springframework.http.ResponseEntity.status(org.springframework.http.HttpStatus.NOT_FOUND).build()
        }
        val etag = "\"" + Integer.toHexString(bytes.contentHashCode()) + "\""
        return org.springframework.http.ResponseEntity.ok()
            .contentType(org.springframework.http.MediaType.parseMediaType(mime))
            .cacheControl(org.springframework.http.CacheControl.maxAge(java.time.Duration.ofDays(7)).cachePublic())
            .eTag(etag)
            .body(bytes)
    }

    @Operation(
        summary = "Лучшие напарники игрока (ТОП по балансу побед и наигранности)",
        description = "Партнёры, с которыми игрок чаще всего и успешнее всего играл, отсортированные по полю score — " +
            "баланс качества и наигранности (winsTogether − поражения×0.5 + log2(games+1)): " +
            "частые успешные напарники стоят выше редких, но частые проигрышные наверх не лезут. " +
            "Учитываются только сыгранные матчи (с зафиксированным счётом). " +
            "В выдачу попадают только откалиброванные напарники с минимум " +
            "${com.padelgo.service.EventService.MIN_GAMES_TOGETHER} совместными играми, " +
            "с которыми была хотя бы одна совместная игра за последние " +
            "${com.padelgo.service.EventService.RECENT_DAYS} дней."
    )
    @GetMapping("/{id}/top-partners")
    fun topPartners(
        @PathVariable id: UUID,
        @Parameter(description = "Сколько напарников вернуть (ТОП-N), по умолчанию 3")
        @org.springframework.web.bind.annotation.RequestParam(required = false, defaultValue = "3") limit: Int
    ): List<TopPartnerResponse> = service.getTopPartners(id, limit)
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
                tiebreakEnabled = req.tiebreakEnabled,
                visibility = req.visibility,
                minRating = req.minRating,
                maxRating = req.maxRating
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

    @Operation(summary = "Игры на сегодня (включая PRIVATE — детали закрыты в getDetails)")
    @GetMapping("/today")
    fun today(): List<EventResponse> {
        // Все эвенты светятся в листинге (включая PRIVATE c бэйджиком 🔒).
        // Доступ к деталям контролирует getDetails (см. accessRestricted).
        val events = service.getToday(LocalDate.now())
        val titles = service.seriesTitles(events)
        return events.map { e -> EventResponse.from(e, service.getRegisteredCount(e.id!!), titles[e.seriesId]) }
    }

    @Operation(
        summary = "Предстоящие игры",
        description = "По умолчанию: от сегодня до +14 дней. Параметры from/to задают диапазон дат (YYYY-MM-DD). " +
            "PRIVATE-игры тоже включаются в листинг (с visibility=PRIVATE), но детали в getDetails " +
            "недоступны не-участникам (вернётся accessRestricted=true)."
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
        val events = service.getUpcoming(start, end)
        val titles = service.seriesTitles(events)
        return events.map { e -> EventResponse.from(e, service.getRegisteredCount(e.id!!), titles[e.seriesId]) }
    }

    private fun currentUserIdOrNull(): UUID? {
        val p = org.springframework.security.core.context.SecurityContextHolder.getContext().authentication?.principal
        return if (p is com.padelgo.auth.JwtPrincipal) p.userId else null
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
        service.register(eventId, req.playerId, currentUserIdOrNull())

    @Operation(
        summary = "Зарегистрировать пару (формат «Фиксированные пары»)",
        description = "Организатор регистрирует двух игроков как фиксированную пару (общий team_id). Только для FIXED_PAIRS."
    )
    @PostMapping("/{eventId}/register-pair")
    fun registerPair(@PathVariable eventId: UUID, @Valid @RequestBody req: RegisterPairRequest) {
        service.registerPair(eventId, principalUserId(), req.player1Id, req.player2Id)
    }

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

    @Operation(summary = "Добавить раунд(ы) вручную (только организатор). count=1 — один раунд, count=N — серия (полный цикл, как при старте); серия только для AMERICANA")
    @PostMapping("/{eventId}/rounds/add")
    fun addRound(
        @PathVariable eventId: UUID,
        @RequestParam(name = "count", defaultValue = "1") count: Int
    ) {
        service.addRound(eventId, principalUserId(), count)
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
            "Публичный эндпоинт (GET), токен нужен только для флага isAuthor. " +
            "Для PRIVATE-игр не-участникам возвращается облегчённый ответ с accessRestricted=true и " +
            "пустыми массивами rounds/registeredPlayers/pendingCancelRequests."
    )
    @GetMapping("/{eventId}")
    @Transactional(readOnly = true)
    fun getDetails(@PathVariable eventId: UUID): EventDetailsResponse {
        val event = service.getEvent(eventId)
        val currentUserId = currentUserIdOrNull()

        // Access control для PRIVATE: если юзер не имеет доступа, возвращаем заглушку.
        // PUBLIC проходит всегда. Реальная проверка делегирована filterVisibleFor (та же логика что и в листинге).
        val accessible = service.filterVisibleFor(listOf(event), currentUserId).isNotEmpty()
        if (!accessible) {
            val authorName = service.getAuthorName(eventId) ?: "Не указан"
            val seriesTitle = service.seriesTitles(listOf(event))[event.seriesId]
            // registeredCount можно показывать — это просто число «N/M», не утечка.
            val registeredCount = service.getRegisteredCount(eventId)
            return EventDetailsResponse(
                event = EventResponse.from(event, registeredCount, seriesTitle),
                rounds = emptyList(),
                registeredPlayers = emptyList(),
                pendingCancelRequests = emptyList(),
                isAuthor = false,
                authorName = authorName,
                accessRestricted = true
            )
        }

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

        // Резолвим имена тех, кто ввёл счёт (для UI-метки "Введён: X").
        // Берём submitted_by_user_id из первой строки сетов матча — для всех сетов он одинаков (один и тот же upsert).
        val submitterUserIds = scoresByMatch.values
            .mapNotNull { sets -> sets.firstOrNull()?.submittedByUserId }
            .toSet()
        val submittersById = if (submitterUserIds.isNotEmpty()) {
            userRepo.findAllById(submitterUserIds).associateBy { it.id!! }
        } else emptyMap()
        // Имя: предпочитаем имя игрока (если у юзера есть player), иначе email.
        val submitterPlayerIds = submittersById.values.mapNotNull { it.playerId }.toSet()
        val submitterPlayers = if (submitterPlayerIds.isNotEmpty()) {
            playerRepo.findAllById(submitterPlayerIds).associateBy { it.id!! }
        } else emptyMap()
        val submitterNameByUserId: Map<UUID, String> = submittersById.mapValues { (_, u) ->
            u.playerId?.let { submitterPlayers[it]?.name } ?: u.email ?: "Пользователь"
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
                val submittedByUserId = scoresByMatch[m.id!!]?.firstOrNull()?.submittedByUserId
                val submittedByName = submittedByUserId?.let { submitterNameByUserId[it] }
                val submittedByMe = submittedByUserId != null && submittedByUserId == currentUserId
                // Шансы выигрыша (фаза 1): статичный Elo expectedScore для команды A.
                // Считаем только пока матч не сыгран — после финиша скрываем (есть фактический результат).
                val isFinalScored = m.status.name == "FINISHED" || submittedByUserId != null
                val expectedA: Double? = if (isFinalScored) null else {
                    val pA1 = players[m.teamAPlayer1Id]?.rating
                    val pA2 = players[m.teamAPlayer2Id]?.rating
                    val pB1 = players[m.teamBPlayer1Id]?.rating
                    val pB2 = players[m.teamBPlayer2Id]?.rating
                    if (pA1 != null && pA2 != null && pB1 != null && pB2 != null) {
                        val ra = com.padelgo.service.EloRating.teamRating(pA1, pA2)
                        val rb = com.padelgo.service.EloRating.teamRating(pB1, pB2)
                        com.padelgo.service.EloRating.expectedScore(ra, rb)
                    } else null
                }
                MatchResponse.from(m, playerResponses, score, courtName, submittedByUserId, submittedByName, submittedByMe, expectedA)
            }
            RoundResponse.from(r, ms)
        }
        val isAuthor = service.isAuthor(eventId, principalUserId())
        val authorName = service.getAuthorName(eventId) ?: if (isAuthor) "Вы" else "Не указан"
        val registeredCount = service.getRegisteredCount(eventId)
        val seriesTitle = service.seriesTitles(listOf(event))[event.seriesId]
        return EventDetailsResponse(
            EventResponse.from(event, registeredCount, seriesTitle),
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
