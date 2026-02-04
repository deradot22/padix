package com.padelgo.api

import com.padelgo.domain.Event
import com.padelgo.domain.ScoringMode
import com.padelgo.repo.MatchRepository
import com.padelgo.repo.MatchSetScoreRepository
import com.padelgo.repo.PlayerRepository
import com.padelgo.repo.RoundRepository
import com.padelgo.service.EventService
import jakarta.validation.Valid
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

@RestController
@RequestMapping("/api/players")
class PlayerController(
    private val service: EventService,
    private val userRepo: com.padelgo.auth.UserRepository
) {
    @GetMapping("/rating")
    fun rating(): List<PlayerResponse> {
        val players = service.listPlayersByRating()
        val usersByPlayerId = userRepo.findAllByPlayerIdIn(players.mapNotNull { it.id })
            .associateBy { it.playerId!! }
        return players.map { p ->
            val calibration = usersByPlayerId[p.id]?.calibrationEventsRemaining
            val publicId = formatPublicId(usersByPlayerId[p.id]?.publicId)
            PlayerResponse.from(p, calibration, publicId)
        }
    }
}

@RestController
@RequestMapping("/api/events")
class EventController(
    private val service: EventService,
    private val roundRepo: RoundRepository,
    private val matchRepo: MatchRepository,
    private val scoreRepo: MatchSetScoreRepository,
    private val playerRepo: PlayerRepository,
    private val userRepo: com.padelgo.auth.UserRepository,
    private val courtRepo: com.padelgo.repo.EventCourtRepository
) {
    @PostMapping
    fun create(@Valid @RequestBody req: CreateEventRequest): EventResponse =
        EventResponse.from(
            service.createEvent(
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
                principalUserId(),
                req.courtNames
            )
        )

    @GetMapping("/today")
    fun today(): List<EventResponse> =
        service.getToday(LocalDate.now()).map { e ->
            EventResponse.from(e, service.getRegisteredCount(e.id!!))
        }

    @GetMapping("/upcoming")
    fun upcoming(
        @org.springframework.web.bind.annotation.RequestParam(required = false) from: String?,
        @org.springframework.web.bind.annotation.RequestParam(required = false) to: String?
    ): List<EventResponse> {
        val start = from?.let { LocalDate.parse(it) } ?: LocalDate.now()
        val end = to?.let { LocalDate.parse(it) } ?: start.plusDays(14)
        return service.getUpcoming(start, end).map { e ->
            EventResponse.from(e, service.getRegisteredCount(e.id!!))
        }
    }

    @PatchMapping("/{eventId}")
    fun update(@PathVariable eventId: UUID, @Valid @RequestBody req: UpdateEventRequest): EventResponse =
        EventResponse.from(service.updateEvent(eventId, req))

    @PostMapping("/{eventId}/register")
    fun register(@PathVariable eventId: UUID, @Valid @RequestBody req: RegisterRequest) =
        service.register(eventId, req.playerId)

    @PostMapping("/{eventId}/close-registration")
    fun closeRegistration(@PathVariable eventId: UUID) {
        service.closeRegistration(eventId, principalUserId())
    }

    @PostMapping("/{eventId}/cancel")
    fun cancelRegistration(@PathVariable eventId: UUID): CancelRegistrationResponse {
        return service.cancelRegistration(eventId, principalUserId())
    }

    @PostMapping("/{eventId}/cancel/{playerId}/approve")
    fun approveCancel(@PathVariable eventId: UUID, @PathVariable playerId: UUID) {
        service.approveCancel(eventId, principalUserId(), playerId)
    }

    @DeleteMapping("/{eventId}")
    fun deleteEvent(@PathVariable eventId: UUID) {
        service.deleteEvent(eventId, principalUserId())
    }

    @PostMapping("/{eventId}/start")
    fun start(@PathVariable eventId: UUID) {
        service.startEvent(eventId, principalUserId())
    }

    @PostMapping("/matches/{matchId}/score")
    fun submitScore(@PathVariable matchId: UUID, @Valid @RequestBody req: SubmitScoreRequest) {
        service.submitScore(matchId, principalUserId(), req)
    }

    @PostMapping("/{eventId}/finish")
    fun finish(@PathVariable eventId: UUID) {
        service.finishEvent(eventId, principalUserId())
    }

    @GetMapping("/{eventId}")
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
            val calibration = usersByPlayerId[id]?.calibrationEventsRemaining
            val publicId = formatPublicId(usersByPlayerId[id]?.publicId)
            PlayerResponse.from(p, calibration, publicId)
        }
        val scoresByMatch = matches.values.flatten().associate { m ->
            m.id!! to scoreRepo.findAllByMatchIdOrderBySetNumberAsc(m.id!!)
        }

        val roundDtos = rounds.map { r ->
            val ms = matches[r.id!!].orEmpty().map { m ->
                val setEntities = scoresByMatch[m.id!!].orEmpty()
                    .sortedBy { it.setNumber }
                    .map { SetScoreRequest(it.teamAGames, it.teamBGames) }

                val score = if (setEntities.isEmpty()) {
                    null
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
                val calibration = usersByPlayerId[p.id]?.calibrationEventsRemaining
                val publicId = formatPublicId(usersByPlayerId[p.id]?.publicId)
                PlayerResponse.from(p, calibration, publicId)
            },
            pending.map { p ->
                val calibration = usersByPlayerId[p.id]?.calibrationEventsRemaining
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

