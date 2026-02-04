package com.padelgo.service

import com.padelgo.api.ApiException
import com.padelgo.domain.Event
import com.padelgo.domain.EventStatus
import com.padelgo.domain.Match
import com.padelgo.domain.MatchSetScore
import com.padelgo.domain.MatchStatus
import com.padelgo.domain.Player
import com.padelgo.domain.RatingChange
import com.padelgo.domain.Registration
import com.padelgo.domain.RegistrationStatus
import com.padelgo.domain.Round
import com.padelgo.domain.InviteStatus
import com.padelgo.domain.ScoringMode
import com.padelgo.repo.EventRepository
import com.padelgo.repo.MatchRepository
import com.padelgo.repo.MatchSetScoreRepository
import com.padelgo.repo.PlayerRepository
import com.padelgo.repo.RatingChangeRepository
import com.padelgo.repo.RegistrationRepository
import com.padelgo.repo.RoundRepository
import jakarta.transaction.Transactional
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.LocalDate
import java.util.UUID
import kotlin.math.abs

@Service
class EventService(
    private val playerRepo: PlayerRepository,
    private val eventRepo: EventRepository,
    private val regRepo: RegistrationRepository,
    private val roundRepo: RoundRepository,
    private val matchRepo: MatchRepository,
    private val scoreRepo: MatchSetScoreRepository,
    private val ratingChangeRepo: RatingChangeRepository,
    private val userRepo: com.padelgo.auth.UserRepository,
    private val inviteRepo: com.padelgo.repo.EventInviteRepository
) {
    fun getToday(date: LocalDate = LocalDate.now()): List<Event> =
        eventRepo.findAllByDateOrderByStartTimeAsc(date)

    fun getUpcoming(from: LocalDate, to: LocalDate): List<Event> =
        eventRepo.findAllByDateBetweenOrderByDateAscStartTimeAsc(from, to)

    @Transactional
    fun createPlayer(name: String): Player {
        val normalized = name.trim()
        if (normalized.isBlank()) throw ApiException(HttpStatus.BAD_REQUEST, "Player name is required")
        playerRepo.findByNameIgnoreCase(normalized)?.let {
            throw ApiException(HttpStatus.CONFLICT, "Player '$normalized' already exists")
        }
        return playerRepo.save(Player(name = normalized))
    }

    fun listPlayersByRating(): List<Player> =
        playerRepo.findAll().sortedWith(compareByDescending<Player> { it.rating }.thenBy { it.name.lowercase() })

    @Transactional
    fun createEvent(event: Event, creatorUserId: UUID): Event {
        val now = java.time.LocalDateTime.now()
        val eventDateTime = java.time.LocalDateTime.of(event.date, event.startTime)
        val eventEndDateTime = java.time.LocalDateTime.of(event.date, event.endTime)
        if (eventDateTime.isBefore(now)) {
            throw ApiException(HttpStatus.BAD_REQUEST, "Event date/time must be in the future")
        }
        if (!eventEndDateTime.isAfter(eventDateTime)) {
            throw ApiException(HttpStatus.BAD_REQUEST, "endTime must be after startTime")
        }
        if (event.courtsCount <= 0) throw ApiException(HttpStatus.BAD_REQUEST, "courtsCount must be > 0")
        if (!event.autoRounds && event.roundsPlanned <= 0) {
            throw ApiException(HttpStatus.BAD_REQUEST, "roundsPlanned must be > 0 when autoRounds=false")
        }
        if (event.pointsPerPlayerPerMatch <= 0) throw ApiException(HttpStatus.BAD_REQUEST, "pointsPerPlayerPerMatch must be > 0")
        if (event.setsPerMatch <= 0) throw ApiException(HttpStatus.BAD_REQUEST, "setsPerMatch must be > 0")
        if (event.gamesPerSet <= 0) throw ApiException(HttpStatus.BAD_REQUEST, "gamesPerSet must be > 0")
        if (event.scoringMode == ScoringMode.POINTS) {
            // В режиме "24 очка" мы храним один "сет" как контейнер очков
            event.setsPerMatch = 1
        }
        if (event.title.isBlank()) throw ApiException(HttpStatus.BAD_REQUEST, "title is required")
        event.status = EventStatus.OPEN_FOR_REGISTRATION
        if (event.autoRounds && event.roundsPlanned <= 0) {
            event.roundsPlanned = 1 // placeholder, будет пересчитано на старте
        }
        event.createdByUserId = creatorUserId
        return eventRepo.save(event)
    }

    fun getEvent(eventId: UUID): Event =
        eventRepo.findById(eventId).orElseThrow { ApiException(HttpStatus.NOT_FOUND, "Event not found") }

    fun getRegisteredPlayers(eventId: UUID): List<Player> {
        val regs = regRepo.findAllByEventIdAndStatus(eventId)
        if (regs.isEmpty()) return emptyList()
        val ids = regs.mapNotNull { it.playerId }.toSet()
        return playerRepo.findAllById(ids).sortedBy { it.name.lowercase() }
    }

    fun getPendingCancelRequests(eventId: UUID): List<Player> {
        val regs = regRepo.findAllByEventIdAndCancelRequestedTrueAndStatus(eventId)
        if (regs.isEmpty()) return emptyList()
        val ids = regs.mapNotNull { it.playerId }.toSet()
        return playerRepo.findAllById(ids).sortedBy { it.name.lowercase() }
    }

    fun getRegisteredCount(eventId: UUID): Int =
        regRepo.countByEventIdAndStatus(eventId).toInt()

    fun isAuthor(eventId: UUID, userId: UUID): Boolean {
        val event = getEvent(eventId)
        return event.createdByUserId == userId
    }

    fun getAuthorName(eventId: UUID): String? {
        val event = getEvent(eventId)
        val authorId = event.createdByUserId ?: return null
        val user = userRepo.findById(authorId).orElse(null) ?: return null
        val player = user.playerId?.let { playerRepo.findById(it).orElse(null) }
        return player?.name ?: user.email
    }

    private fun requireAuthor(event: Event, userId: UUID) {
        if (event.createdByUserId != userId) {
            throw ApiException(HttpStatus.FORBIDDEN, "Only author can perform this action")
        }
    }

    @Transactional
    fun updateEvent(eventId: UUID, req: com.padelgo.api.UpdateEventRequest): Event {
        val event = getEvent(eventId)
        if (event.status != EventStatus.OPEN_FOR_REGISTRATION) {
            throw ApiException(HttpStatus.CONFLICT, "Event can be updated only before start (status=${event.status})")
        }

        req.pointsPerPlayerPerMatch?.let { p ->
            if (p <= 0) throw ApiException(HttpStatus.BAD_REQUEST, "pointsPerPlayerPerMatch must be > 0")
            event.pointsPerPlayerPerMatch = p
        }

        return eventRepo.save(event)
    }

    @Transactional
    fun register(eventId: UUID, playerId: UUID): Registration {
        val event = getEvent(eventId)
        if (event.status != EventStatus.OPEN_FOR_REGISTRATION) {
            throw ApiException(HttpStatus.CONFLICT, "Registration is closed (status=${event.status})")
        }
        playerRepo.findById(playerId).orElseThrow { ApiException(HttpStatus.NOT_FOUND, "Player not found") }

        val user = userRepo.findByPlayerId(playerId)
        if (user != null) {
            val invite = inviteRepo.findByEventIdAndToUserIdAndStatus(eventId, user.id!!, InviteStatus.PENDING)
            if (invite != null) {
                invite.status = InviteStatus.ACCEPTED
                inviteRepo.save(invite)
            }
        }

        val existing = regRepo.findByEventIdAndPlayerId(eventId, playerId)
        if (existing != null) {
            if (existing.status == RegistrationStatus.REGISTERED) return existing
            existing.status = RegistrationStatus.REGISTERED
            existing.cancelRequested = false
            existing.cancelApproved = false
            existing.cancelRequestedAt = null
            return regRepo.save(existing)
        }
        return regRepo.save(Registration(eventId = eventId, playerId = playerId))
    }

    @Transactional
    fun closeRegistration(eventId: UUID, userId: UUID) {
        val event = getEvent(eventId)
        if (event.createdByUserId != userId) throw ApiException(HttpStatus.FORBIDDEN, "Only author can close registration")
        if (event.status != EventStatus.OPEN_FOR_REGISTRATION) return
        val registeredCount = regRepo.findAllByEventIdAndStatus(eventId).size
        val capacity = event.courtsCount * 4
        if (registeredCount < capacity) {
            throw ApiException(HttpStatus.CONFLICT, "Нужно минимум $capacity игроков, сейчас $registeredCount")
        }
        event.status = EventStatus.REGISTRATION_CLOSED
        eventRepo.save(event)
    }

    @Transactional
    fun cancelRegistration(eventId: UUID, userId: UUID): com.padelgo.api.CancelRegistrationResponse {
        val event = getEvent(eventId)
        if (event.status != EventStatus.OPEN_FOR_REGISTRATION && event.status != EventStatus.REGISTRATION_CLOSED) {
            throw ApiException(HttpStatus.CONFLICT, "Cancellation is closed (status=${event.status})")
        }

        val user = userRepo.findById(userId).orElseThrow { ApiException(HttpStatus.NOT_FOUND, "User not found") }
        val playerId = user.playerId ?: throw ApiException(HttpStatus.NOT_FOUND, "Player not found")
        val reg = regRepo.findByEventIdAndPlayerId(eventId, playerId)
            ?: throw ApiException(HttpStatus.NOT_FOUND, "Registration not found")
        if (reg.status == RegistrationStatus.CANCELLED) {
            return com.padelgo.api.CancelRegistrationResponse("CANCELLED", "Already cancelled")
        }

        val eventStart = java.time.LocalDateTime.of(event.date, event.startTime)
        val now = java.time.LocalDateTime.now()
        val deadline = eventStart.minusDays(1)

        val isAuthor = event.createdByUserId == userId
        return if (now.isBefore(deadline) || isAuthor) {
            reg.status = RegistrationStatus.CANCELLED
            reg.cancelApproved = true
            reg.cancelRequested = false
            reg.cancelRequestedAt = now.toInstant(java.time.ZoneOffset.UTC)
            regRepo.save(reg)
            com.padelgo.api.CancelRegistrationResponse("CANCELLED", "Cancelled")
        } else {
            reg.cancelRequested = true
            reg.cancelRequestedAt = now.toInstant(java.time.ZoneOffset.UTC)
            regRepo.save(reg)
            com.padelgo.api.CancelRegistrationResponse("REQUESTED", "Cancellation requested from author")
        }
    }

    @Transactional
    fun approveCancel(eventId: UUID, userId: UUID, playerId: UUID) {
        val event = getEvent(eventId)
        if (event.createdByUserId != userId) throw ApiException(HttpStatus.FORBIDDEN, "Only author can approve cancellations")
        val reg = regRepo.findByEventIdAndPlayerId(eventId, playerId)
            ?: throw ApiException(HttpStatus.NOT_FOUND, "Registration not found")
        if (!reg.cancelRequested) {
            throw ApiException(HttpStatus.CONFLICT, "Cancellation was not requested")
        }
        reg.status = RegistrationStatus.CANCELLED
        reg.cancelApproved = true
        reg.cancelRequested = false
        regRepo.save(reg)
    }

    @Transactional
    fun deleteEvent(eventId: UUID, userId: UUID) {
        val event = getEvent(eventId)
        if (event.createdByUserId != userId) throw ApiException(HttpStatus.FORBIDDEN, "Only author can delete event")
        if (event.status == EventStatus.FINISHED) throw ApiException(HttpStatus.CONFLICT, "Finished event cannot be deleted")

        // Delete matches + scores + rounds
        val rounds = roundRepo.findAllByEventIdOrderByRoundNumberAsc(eventId)
        val matchesForEvent = rounds.flatMap { r -> matchRepo.findAllByRoundIdOrderByCourtNumberAsc(r.id!!) }
        if (matchesForEvent.any { it.status == MatchStatus.FINISHED }) {
            throw ApiException(HttpStatus.CONFLICT, "Event with finished matches cannot be deleted")
        }
        if (matchesForEvent.any { m -> scoreRepo.findAllByMatchIdOrderBySetNumberAsc(m.id!!).isNotEmpty() }) {
            throw ApiException(HttpStatus.CONFLICT, "Event with scores cannot be deleted")
        }
        rounds.forEach { r ->
            val matches = matchRepo.findAllByRoundIdOrderByCourtNumberAsc(r.id!!)
            matches.forEach { m -> scoreRepo.deleteAllByMatchId(m.id!!) }
            matchRepo.deleteAll(matches)
        }
        roundRepo.deleteAll(rounds)

        // Delete registrations and rating changes linked to event
        regRepo.deleteAllByEventId(eventId)
        ratingChangeRepo.deleteAllByEventId(eventId)

        eventRepo.delete(event)
    }

    @Transactional
    fun startEvent(eventId: UUID, userId: UUID) {
        val event = getEvent(eventId)
        requireAuthor(event, userId)
        if (event.status == EventStatus.IN_PROGRESS) return
        if (event.status != EventStatus.REGISTRATION_CLOSED) {
            throw ApiException(HttpStatus.CONFLICT, "Can't start event in status=${event.status}")
        }

        val regs = regRepo.findAllByEventIdAndStatus(eventId)
        val playerIds = regs.mapNotNull { it.playerId }
        val capacity = event.courtsCount * 4
        if (playerIds.size < capacity) {
            throw ApiException(HttpStatus.CONFLICT, "Need at least $capacity players, currently ${playerIds.size}")
        }

        // cleanup previous schedule if any (safety)
        roundRepo.findAllByEventIdOrderByRoundNumberAsc(eventId).forEach { r ->
            matchRepo.findAllByRoundIdOrderByCourtNumberAsc(r.id!!).forEach { m ->
                scoreRepo.deleteAllByMatchId(m.id!!)
                matchRepo.delete(m)
            }
            roundRepo.delete(r)
        }

        val players = playerRepo.findAllById(playerIds).associateBy { it.id!! }
        if (event.autoRounds) {
            val ratings = players.values.map { it.rating }
            event.roundsPlanned = if (event.pairingMode == com.padelgo.domain.PairingMode.ROUND_ROBIN) {
                computeRoundRobinRounds(capacity)
            } else {
                computeAutoRounds(ratings)
            }
            eventRepo.save(event)
        }
        val ratings = players.values.map { it.rating }
        val maxDiff = if (event.pairingMode == com.padelgo.domain.PairingMode.BALANCED && ratings.isNotEmpty()) {
            val max = ratings.maxOrNull() ?: 0
            val min = ratings.minOrNull() ?: 0
            maxOf(150, (max - min) / 2)
        } else {
            null
        }
        val planner = PairingPlanner(
            ratingByPlayer = players.mapValues { it.value.rating },
            courtsCount = event.courtsCount,
            pairingMode = event.pairingMode,
            maxTeamDiff = maxDiff
        )
        val plannedRounds = planner.planRounds(playerIds, event.roundsPlanned)

        plannedRounds.forEachIndexed { idx, roundMatches ->
            val round = roundRepo.save(Round(eventId = eventId, roundNumber = idx + 1))
            roundMatches.forEach { pm ->
                matchRepo.save(
                    Match(
                        roundId = round.id!!,
                        courtNumber = pm.courtNumber,
                        teamAPlayer1Id = pm.teamA.first,
                        teamAPlayer2Id = pm.teamA.second,
                        teamBPlayer1Id = pm.teamB.first,
                        teamBPlayer2Id = pm.teamB.second,
                        status = MatchStatus.SCHEDULED
                    )
                )
            }
        }

        event.status = EventStatus.IN_PROGRESS
        eventRepo.save(event)
    }

    private fun computeAutoRounds(ratings: List<Int>): Int {
        if (ratings.isEmpty()) return 6
        val avg = ratings.average()
        val base = when {
            avg < 900 -> 4
            avg < 1050 -> 6
            avg < 1200 -> 7
            avg < 1350 -> 8
            avg < 1500 -> 9
            else -> 10
        }
        return base.coerceIn(4, 12)
    }

    private fun computeRoundRobinRounds(playersInRound: Int): Int =
        maxOf(1, playersInRound - 1)

    @Transactional
    fun submitScore(matchId: UUID, userId: UUID, req: com.padelgo.api.SubmitScoreRequest) {
        val match = matchRepo.findById(matchId).orElseThrow { ApiException(HttpStatus.NOT_FOUND, "Match not found") }

        val round = roundRepo.findById(match.roundId!!).orElseThrow { ApiException(HttpStatus.NOT_FOUND, "Round not found") }
        val event = getEvent(round.eventId!!)
        requireAuthor(event, userId)
        if (event.status != EventStatus.IN_PROGRESS) {
            throw ApiException(HttpStatus.CONFLICT, "Event is not in progress (status=${event.status})")
        }

        val setEntities: List<MatchSetScore> = when (event.scoringMode) {
            ScoringMode.POINTS -> {
                val (aPoints, bPoints) = when {
                    req.points != null -> req.points.teamAPoints to req.points.teamBPoints
                    req.sets != null && req.sets.size == 1 -> req.sets[0].teamAGames to req.sets[0].teamBGames
                    else -> throw ApiException(HttpStatus.BAD_REQUEST, "Provide points or single set for POINTS mode")
                }
                if (aPoints < 0 || bPoints < 0) throw ApiException(HttpStatus.BAD_REQUEST, "Score must be >= 0")
                val total = aPoints + bPoints
                val expectedTotal = event.pointsPerPlayerPerMatch * 4
                if (total != expectedTotal) {
                    throw ApiException(HttpStatus.BAD_REQUEST, "Total points must be $expectedTotal (now $total)")
                }
                listOf(
                    MatchSetScore(
                        matchId = matchId,
                        setNumber = 1,
                        teamAGames = aPoints,
                        teamBGames = bPoints
                    )
                )
            }

            ScoringMode.SETS -> {
                val sets = req.sets ?: throw ApiException(HttpStatus.BAD_REQUEST, "sets is required for SETS mode")
                if (sets.isEmpty()) throw ApiException(HttpStatus.BAD_REQUEST, "sets is required for SETS mode")
                if (sets.any { it.teamAGames < 0 || it.teamBGames < 0 }) throw ApiException(HttpStatus.BAD_REQUEST, "Score must be >= 0")
                if (sets.size > event.setsPerMatch) throw ApiException(HttpStatus.BAD_REQUEST, "Too many sets: ${sets.size}, max ${event.setsPerMatch}")
                sets.mapIndexed { idx, s ->
                    MatchSetScore(
                        matchId = matchId,
                        setNumber = idx + 1,
                        teamAGames = s.teamAGames,
                        teamBGames = s.teamBGames
                    )
                }
            }
        }

        // overwrite existing set scores for match
        scoreRepo.deleteAllByMatchId(matchId)
        scoreRepo.saveAll(setEntities)

        match.status = MatchStatus.FINISHED
        matchRepo.save(match)
    }

    @Transactional
    fun finishEvent(eventId: UUID, userId: UUID) {
        val event = getEvent(eventId)
        requireAuthor(event, userId)
        if (event.status == EventStatus.FINISHED) return
        if (event.status != EventStatus.IN_PROGRESS) throw ApiException(HttpStatus.CONFLICT, "Event is not in progress")

        val matches = matchRepo.findAllByEventId(eventId)
        if (matches.isEmpty()) throw ApiException(HttpStatus.CONFLICT, "No matches scheduled")

        val setsByMatch = matches.associate { m -> m.id!! to scoreRepo.findAllByMatchIdOrderBySetNumberAsc(m.id!!) }
        val notFinished = matches.filter { it.status != MatchStatus.FINISHED || setsByMatch[it.id!!].isNullOrEmpty() }
        if (notFinished.isNotEmpty()) {
            throw ApiException(HttpStatus.CONFLICT, "Not all matches are finished (${notFinished.size} remaining)")
        }

        val playerIds = matches.flatMap {
            listOf(it.teamAPlayer1Id!!, it.teamAPlayer2Id!!, it.teamBPlayer1Id!!, it.teamBPlayer2Id!!)
        }.toSet()
        val players = playerRepo.findAllById(playerIds).associateBy { it.id!! }.toMutableMap()
        val accounts = userRepo.findAllByPlayerIdIn(playerIds.toList())

        val calibrationByPlayer = accounts.associate { it.playerId!! to it.calibrationEventsRemaining }

        matches.forEach { m ->
            val sets = setsByMatch[m.id!!]!!.sortedBy { it.setNumber }
            val a1 = players[m.teamAPlayer1Id!!]!!
            val a2 = players[m.teamAPlayer2Id!!]!!
            val b1 = players[m.teamBPlayer1Id!!]!!
            val b2 = players[m.teamBPlayer2Id!!]!!

            val teamARating = (a1.rating + a2.rating) / 2
            val teamBRating = (b1.rating + b2.rating) / 2
            val kTeam = ((EloRating.kFactor(a1.gamesPlayed) + EloRating.kFactor(a2.gamesPlayed)) / 2.0).toInt()

            val scoreA = scoreAFromSets(event.scoringMode, sets)

            val deltaTeamA = EloRating.teamDelta(teamARating, teamBRating, kTeam, scoreA)
            applyDelta(eventId, m.id!!, a1, a2, deltaTeamA, calibrationByPlayer)
            applyDelta(eventId, m.id!!, b1, b2, -deltaTeamA, calibrationByPlayer)

            // gamesPlayed: считаем матч как 1 игру
            listOf(a1, a2, b1, b2).forEach { it.gamesPlayed += 1 }
        }

        playerRepo.saveAll(players.values)

        // Calibration: 1 "калибровочная игра" = 1 завершённый Event, не каждый матч внутри.
        val participantIds = playerIds.toList()
        accounts.forEach { u ->
            if (u.calibrationEventsRemaining > 0) {
                u.calibrationEventsRemaining = (u.calibrationEventsRemaining - 1).coerceAtLeast(0)
            }
        }
        userRepo.saveAll(accounts)

        event.status = EventStatus.FINISHED
        eventRepo.save(event)
    }

    private fun scoreAFromSets(mode: ScoringMode, sets: List<MatchSetScore>): Double {
        if (mode == ScoringMode.POINTS) {
            val s1 = sets.first()
            return when {
                s1.teamAGames > s1.teamBGames -> 1.0
                s1.teamAGames < s1.teamBGames -> 0.0
                else -> 0.5
            }
        }
        var aSets = 0
        var bSets = 0
        sets.forEach { s ->
            when {
                s.teamAGames > s.teamBGames -> aSets += 1
                s.teamAGames < s.teamBGames -> bSets += 1
            }
        }
        return when {
            aSets > bSets -> 1.0
            aSets < bSets -> 0.0
            else -> 0.5
        }
    }

    private fun applyDelta(
        eventId: UUID,
        matchId: UUID,
        p1: Player,
        p2: Player,
        deltaTeam: Int,
        calibrationByPlayer: Map<UUID, Int>
    ) {
        // делим нечетный delta "в пользу" игрока с меньшим количеством игр (чтобы новичков быстрее калибровало)
        val firstGetsMore = p1.gamesPlayed <= p2.gamesPlayed
        val d1 = deltaTeam / 2 + if (deltaTeam % 2 != 0 && firstGetsMore) deltaTeam.sign() else 0
        val d2 = deltaTeam - d1

        val m1 = if ((calibrationByPlayer[p1.id] ?: 0) > 0) 2 else 1
        val m2 = if ((calibrationByPlayer[p2.id] ?: 0) > 0) 2 else 1
        applyDeltaSingle(eventId, matchId, p1, d1 * m1)
        applyDeltaSingle(eventId, matchId, p2, d2 * m2)
    }

    private fun Int.sign(): Int = when {
        this > 0 -> 1
        this < 0 -> -1
        else -> 0
    }

    private fun applyDeltaSingle(eventId: UUID, matchId: UUID, p: Player, delta: Int) {
        val old = p.rating
        val newRating = (old + delta).coerceAtLeast(0)
        p.rating = newRating
        p.ntrp = Ntrp.fromRating(newRating)
        ratingChangeRepo.save(
            RatingChange(
                eventId = eventId,
                matchId = matchId,
                playerId = p.id!!,
                oldRating = old,
                delta = delta,
                newRating = newRating
            )
        )
    }

    fun getMatchesForPlayer(playerId: UUID): List<PlayerMatchHistoryItem> {
        val allMatches = matchRepo.findAll()
        val my = allMatches.filter { m ->
            m.teamAPlayer1Id == playerId || m.teamAPlayer2Id == playerId || m.teamBPlayer1Id == playerId || m.teamBPlayer2Id == playerId
        }
        if (my.isEmpty()) return emptyList()

        val playerIds = my.flatMap {
            listOf(it.teamAPlayer1Id!!, it.teamAPlayer2Id!!, it.teamBPlayer1Id!!, it.teamBPlayer2Id!!)
        }.toSet()
        val playersById = playerRepo.findAllById(playerIds).associateBy { it.id!! }
        val roundIds = my.mapNotNull { it.roundId }.toSet()
        val rounds = roundRepo.findAllById(roundIds).associateBy { it.id!! }
        val eventIds = rounds.values.mapNotNull { it.eventId }.toSet()
        val events = eventRepo.findAllById(eventIds).associateBy { it.id!! }

        val scores = my.associate { m ->
            m.id!! to scoreRepo.findAllByMatchIdOrderBySetNumberAsc(m.id!!)
        }
        val ratingByMatch = ratingChangeRepo.findAllByPlayerId(playerId)
            .filter { it.matchId != null }
            .groupBy { it.matchId!! }
            .mapValues { (_, v) -> v.sumOf { it.delta } }

        return my.mapNotNull { m ->
            val r = rounds[m.roundId] ?: return@mapNotNull null
            val e = events[r.eventId] ?: return@mapNotNull null
            val s = scores[m.id!!].orEmpty()
            val teamA = listOf(m.teamAPlayer1Id!!, m.teamAPlayer2Id!!).mapNotNull { playersById[it]?.name }
            val teamB = listOf(m.teamBPlayer1Id!!, m.teamBPlayer2Id!!).mapNotNull { playersById[it]?.name }
            val isTeamA = m.teamAPlayer1Id == playerId || m.teamAPlayer2Id == playerId
            val teamText = if (isTeamA) teamA.joinToString(" + ") else teamB.joinToString(" + ")
            val opponentText = if (isTeamA) teamB.joinToString(" + ") else teamA.joinToString(" + ")
            val result = if (s.isEmpty()) {
                "—"
            } else {
                val scoreA = scoreAFromSets(e.scoringMode, s)
                when {
                    scoreA == 0.5 -> "Ничья"
                    isTeamA && scoreA > 0.5 -> "Победа"
                    isTeamA && scoreA < 0.5 -> "Поражение"
                    !isTeamA && scoreA < 0.5 -> "Победа"
                    else -> "Поражение"
                }
            }
            PlayerMatchHistoryItem(
                eventId = e.id!!,
                eventTitle = e.title,
                eventDate = e.date,
                roundNumber = r.roundNumber,
                matchId = m.id!!,
                courtNumber = m.courtNumber,
                scoringMode = e.scoringMode.name,
                score = if (s.isEmpty()) null else scoreToText(e.scoringMode, s),
                status = m.status.name,
                ratingDelta = ratingByMatch[m.id!!],
                teamText = teamText,
                opponentText = opponentText,
                result = result
            )
        }.sortedWith(compareByDescending<PlayerMatchHistoryItem> { it.eventDate }.thenByDescending { it.roundNumber })
    }

    fun getMatchesForPlayerInEvent(playerId: UUID, eventId: UUID): List<PlayerMatchHistoryItem> {
        return getMatchesForPlayer(playerId).filter { it.eventId == eventId }
    }

    fun getEventHistoryForPlayer(playerId: UUID): List<PlayerEventHistoryItem> {
        val matches = getMatchesForPlayer(playerId)
        if (matches.isEmpty()) return emptyList()

        val eventIds = matches.map { it.eventId }.toSet()
        val events = eventRepo.findAllById(eventIds).associateBy { it.id!! }
        val ratingDeltas = ratingChangeRepo.findAllByPlayerId(playerId)
            .groupBy { it.eventId }
            .mapValues { (_, v) -> v.sumOf { it.delta } }

        val scoresByMatch = matches.associate { m ->
            m.matchId to scoreRepo.findAllByMatchIdOrderBySetNumberAsc(m.matchId)
        }

        return matches
            .groupBy { it.eventId }
            .mapNotNull { (eventId, items) ->
                val e = events[eventId] ?: return@mapNotNull null
                val totalPoints = if (e.scoringMode == ScoringMode.POINTS) {
                    items.sumOf { item ->
                        val sets = scoresByMatch[item.matchId].orEmpty()
                        val s1 = sets.firstOrNull() ?: return@sumOf 0
                        val match = matchRepo.findById(item.matchId).orElse(null) ?: return@sumOf 0
                        val isTeamA = match.teamAPlayer1Id == playerId || match.teamAPlayer2Id == playerId
                        if (isTeamA) s1.teamAGames else s1.teamBGames
                    }
                } else {
                    null
                }
                PlayerEventHistoryItem(
                    eventId = eventId,
                    eventTitle = e.title,
                    eventDate = e.date,
                    matchesCount = items.size,
                    totalPoints = totalPoints,
                    ratingDelta = ratingDeltas[eventId] ?: 0
                )
            }
            .sortedWith(compareByDescending<PlayerEventHistoryItem> { it.eventDate })
    }

    private fun scoreToText(mode: com.padelgo.domain.ScoringMode, sets: List<com.padelgo.domain.MatchSetScore>): String =
        if (mode == com.padelgo.domain.ScoringMode.POINTS) {
            val s1 = sets.first()
            "${s1.teamAGames}:${s1.teamBGames}"
        } else {
            sets.sortedBy { it.setNumber }.joinToString(" ") { "${it.teamAGames}:${it.teamBGames}" }
        }
}

data class PlayerMatchHistoryItem(
    val eventId: UUID,
    val eventTitle: String,
    val eventDate: java.time.LocalDate,
    val roundNumber: Int,
    val matchId: UUID,
    val courtNumber: Int,
    val scoringMode: String,
    val score: String?,
    val status: String,
    val ratingDelta: Int?,
    val teamText: String,
    val opponentText: String,
    val result: String
)

data class PlayerEventHistoryItem(
    val eventId: UUID,
    val eventTitle: String,
    val eventDate: java.time.LocalDate,
    val matchesCount: Int,
    val totalPoints: Int?,
    val ratingDelta: Int
)

