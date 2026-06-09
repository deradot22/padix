package com.padelgo.service

import com.padelgo.api.ApiException
import io.swagger.v3.oas.annotations.media.Schema
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
import com.padelgo.repo.EventCourtRepository
import com.padelgo.repo.MatchRepository
import com.padelgo.repo.MatchSetScoreRepository
import com.padelgo.repo.PlayerRepository
import com.padelgo.repo.RatingChangeRepository
import com.padelgo.repo.RegistrationRepository
import com.padelgo.repo.RoundRepository
import jakarta.transaction.Transactional
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.LocalDate
import java.util.UUID
import kotlin.math.abs
import kotlin.math.roundToInt

@Service
class EventService(
    private val playerRepo: PlayerRepository,
    private val eventRepo: EventRepository,
    private val regRepo: RegistrationRepository,
    private val roundRepo: RoundRepository,
    private val matchRepo: MatchRepository,
    private val scoreRepo: MatchSetScoreRepository,
    private val draftScoreRepo: com.padelgo.repo.MatchDraftScoreRepository,
    private val ratingChangeRepo: RatingChangeRepository,
    private val userRepo: com.padelgo.auth.UserRepository,
    private val inviteRepo: com.padelgo.repo.EventInviteRepository,
    private val courtRepo: EventCourtRepository,
    private val ratingNotificationRepo: com.padelgo.repo.UserRatingNotificationRepository,
    private val botClient: BotClient,
    private val seriesRepo: com.padelgo.repo.EventSeriesRepository
) {
    private val log = LoggerFactory.getLogger(EventService::class.java)

    companion object {
        /**
         * Жёсткий порог «равного боя» по teamRating-разнице (Elo, weighted 60/40 в пользу слабого).
         * 80 ≈ expectedScore 0.61 у лучшей команды — это «реально равный бой, ~50/50 ± 10%».
         * Подняв cap до 100+ пропускаются матчи с заметным фаворитом (64-70%).
         * Опустив до 60 — будут видны только идеальные матчи, но на разнородных составах планируется
         * мало раундов.
         */
        const val BALANCED_TEAM_DIFF_CAP = 60

        /** Минимум совместных сыгранных матчей, чтобы напарник попал в «Лучшие напарники». */
        const val MIN_GAMES_TOGETHER = 3

        /** Сколько напарников отдаём по умолчанию (ТОП-N). */
        const val DEFAULT_TOP_PARTNERS_LIMIT = 3

        /**
         * Окно «активности»: напарник попадёт в ТОП, только если хотя бы один совместный матч
         * сыгран за последние столько дней. Иначе старые связки (давно не играли вместе)
         * вытесняли бы актуальных партнёров.
         */
        const val RECENT_DAYS = 90L

        /**
         * Ранжирующий балл напарника — баланс «качества» (доли побед) и «наигранности»
         * (объёма совместных игр):
         *
         *     score = winsTogether − поражения × 0.5 + log2(gamesTogether + 1)
         *
         * - каждая совместная победа добавляет балл, поэтому частые успешные напарники
         *   поднимаются выше редких (даже если у редкого выше сырой процент);
         * - каждое поражение снимает полбалла, поэтому «много играли, но часто проигрывали»
         *   наверх не лезет;
         * - log2(games+1) — мягкий бонус за объём (быстро растёт на первых играх, потом плавно).
         *
         * Пример: 20 игр / 67% даёт больший балл, чем 9 игр / 78% — наигранность перевешивает
         * небольшую разницу в проценте; но 30 игр / 40% остаётся внизу из-за штрафа за поражения.
         */
        fun partnerScore(wins: Int, games: Int): Double {
            if (games <= 0) return 0.0
            val losses = games - wins
            return wins - losses * 0.5 + kotlin.math.log2((games + 1).toDouble())
        }
    }

    fun getToday(date: LocalDate = LocalDate.now()): List<Event> =
        eventRepo.findAllByDateOrderByStartTimeAsc(date)

    /**
     * Возвращает title серии по seriesId одним запросом для группы событий.
     * Используется при формировании EventResponse в листингах.
     */
    fun seriesTitles(events: List<Event>): Map<UUID, String> {
        val ids = events.mapNotNull { it.seriesId }.toSet()
        if (ids.isEmpty()) return emptyMap()
        return seriesRepo.findAllById(ids).associate { it.id!! to it.title }
    }

    fun getUpcoming(from: LocalDate, to: LocalDate): List<Event> =
        eventRepo.findAllByDateBetweenOrderByDateAscStartTimeAsc(from, to)

    /**
     * Фильтрует список игр по доступности для пользователя:
     * - PUBLIC видны всем (включая анонимных)
     * - PRIVATE видны только автору, зарегистрированным игрокам и приглашённым
     */
    fun filterVisibleFor(events: List<Event>, userId: UUID?): List<Event> {
        if (events.isEmpty()) return events
        val publicEvents = events.filter { it.visibility == com.padelgo.domain.EventVisibility.PUBLIC }
        val privateEvents = events.filter { it.visibility == com.padelgo.domain.EventVisibility.PRIVATE }
        if (privateEvents.isEmpty()) return publicEvents
        if (userId == null) return publicEvents

        val user = userRepo.findById(userId).orElse(null) ?: return publicEvents
        val playerId = user.playerId

        val accessiblePrivate = privateEvents.filter { ev ->
            val evId = ev.id ?: return@filter false
            if (ev.createdByUserId == userId) return@filter true
            if (playerId != null) {
                val reg = regRepo.findByEventIdAndPlayerId(evId, playerId)
                if (reg?.status == com.padelgo.domain.RegistrationStatus.REGISTERED) return@filter true
            }
            val pendingInvite = inviteRepo.findByEventIdAndToUserIdAndStatus(evId, userId, com.padelgo.domain.InviteStatus.PENDING)
            if (pendingInvite != null) return@filter true
            val acceptedInvite = inviteRepo.findByEventIdAndToUserIdAndStatus(evId, userId, com.padelgo.domain.InviteStatus.ACCEPTED)
            acceptedInvite != null
        }
        // Сохраняем порядок исходного списка (он отсортирован репозиторием по дате/времени).
        val accessibleIds = (publicEvents + accessiblePrivate).mapNotNull { it.id }.toSet()
        return events.filter { it.id in accessibleIds }
    }

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
    fun createEvent(event: Event, creatorUserId: UUID, courtNames: List<String>? = null): Event {
        val now = java.time.LocalDateTime.now()
        val eventDateTime = java.time.LocalDateTime.of(event.date, event.startTime)
        var eventEndDateTime = java.time.LocalDateTime.of(event.date, event.endTime)
        // Если время окончания <= времени начала — игра переходит за полночь
        if (!eventEndDateTime.isAfter(eventDateTime)) {
            eventEndDateTime = eventEndDateTime.plusDays(1)
        }
        if (event.date.isBefore(java.time.LocalDate.now())) {
            throw ApiException(HttpStatus.BAD_REQUEST, "Дата игры не может быть в прошлом")
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
        val saved = eventRepo.save(event)

        val provided = courtNames?.map { it.trim() }
        if (provided != null && provided.size != saved.courtsCount) {
            throw ApiException(HttpStatus.BAD_REQUEST, "courtNames size must match courtsCount")
        }
        val resolved = (1..saved.courtsCount).map { idx ->
            val name = provided?.getOrNull(idx - 1)
            if (name.isNullOrBlank()) "Корт ${courtLabel(idx)}" else name
        }
        resolved.forEachIndexed { idx, name ->
            courtRepo.save(
                com.padelgo.domain.EventCourt(
                    eventId = saved.id,
                    courtNumber = idx + 1,
                    name = name
                )
            )
        }
        return saved
    }

    private fun courtLabel(index: Int): String {
        val alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        val zeroBased = index - 1
        val first = zeroBased / alphabet.length
        val second = zeroBased % alphabet.length
        return if (first == 0) {
            alphabet[second].toString()
        } else {
            "${alphabet[first - 1]}${alphabet[second]}"
        }
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
    fun addRound(eventId: UUID, userId: UUID) {
        log.info("[ACTION] addRound called | eventId={} userId={}", eventId, userId)
        val event = getEvent(eventId)
        requireAuthor(event, userId)
        if (event.status != EventStatus.IN_PROGRESS) throw ApiException(HttpStatus.CONFLICT, "Event is not in progress")

        val regs = regRepo.findAllByEventIdAndStatus(eventId)
        val playerIds = regs.mapNotNull { it.playerId }
        val capacity = event.courtsCount * 4
        if (playerIds.size < capacity) {
            throw ApiException(HttpStatus.CONFLICT, "Нужно минимум $capacity игроков, сейчас ${playerIds.size}")
        }
        val players = playerRepo.findAllById(playerIds).associateBy { it.id!! }
        val ratings = players.mapValues { it.value.rating }
        val maxDiff = if (event.pairingMode == com.padelgo.domain.PairingMode.BALANCED) BALANCED_TEAM_DIFF_CAP else null
        val planner = PairingPlanner(ratingByPlayer = ratings, courtsCount = event.courtsCount, pairingMode = event.pairingMode, maxTeamDiff = maxDiff)
        val existingMatches = matchRepo.findAllByEventId(eventId)
        planner.seedFromMatches(existingMatches)
        val planned = planner.planRounds(playerIds, 1).firstOrNull().orEmpty()

        val lastRound = roundRepo.findAllByEventIdOrderByRoundNumberAsc(eventId).maxByOrNull { it.roundNumber }
        val round = roundRepo.save(Round(eventId = eventId, roundNumber = (lastRound?.roundNumber ?: 0) + 1))
        planned.forEach { pm ->
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

    @Transactional
    fun deleteRound(eventId: UUID, roundId: UUID, userId: UUID) {
        log.info("[ACTION] deleteRound called | eventId={} roundId={} userId={}", eventId, roundId, userId)
        val event = getEvent(eventId)
        requireAuthor(event, userId)
        if (event.status != EventStatus.IN_PROGRESS) throw ApiException(HttpStatus.CONFLICT, "Event is not in progress")

        val rounds = roundRepo.findAllByEventIdOrderByRoundNumberAsc(eventId)
        val round = rounds.firstOrNull { it.id == roundId }
            ?: throw ApiException(HttpStatus.NOT_FOUND, "Round not found")
        val matches = matchRepo.findAllByRoundIdOrderByCourtNumberAsc(round.id!!)
        if (matches.isNotEmpty() && matches.all { it.status == MatchStatus.FINISHED }) {
            throw ApiException(HttpStatus.CONFLICT, "Нельзя удалить раунд, в котором все матчи сыграны")
        }
        for (m in matches) {
            draftScoreRepo.deleteByMatchId(m.id!!)
            scoreRepo.deleteAllByMatchId(m.id!!)
            ratingChangeRepo.deleteAllByMatchId(m.id!!)
            matchRepo.delete(m)
        }
        roundRepo.delete(round)
    }

    @Transactional
    fun addFinalRound(eventId: UUID, userId: UUID) {
        log.info("[ACTION] addFinalRound called | eventId={} userId={}", eventId, userId)
        val event = getEvent(eventId)
        requireAuthor(event, userId)
        if (event.status != EventStatus.IN_PROGRESS) throw ApiException(HttpStatus.CONFLICT, "Event is not in progress")

        val regs = regRepo.findAllByEventIdAndStatus(eventId)
        val playerIds = regs.mapNotNull { it.playerId }
        val capacity = event.courtsCount * 4
        if (playerIds.size < capacity) {
            throw ApiException(HttpStatus.CONFLICT, "Нужно минимум $capacity игроков, сейчас ${playerIds.size}")
        }

        val lastRound = roundRepo.findAllByEventIdOrderByRoundNumberAsc(eventId).maxByOrNull { it.roundNumber }
        val pointsByPlayer = computeTournamentStandings(eventId, playerIds, event.scoringMode, maxRoundNumber = lastRound?.roundNumber)

        val players = playerRepo.findAllById(playerIds).associateBy { it.id!! }
        val leaderboard = playerIds.sortedWith(
            compareByDescending<UUID> { pointsByPlayer[it] ?: 0 }
                .thenByDescending { players[it]?.rating ?: 0 }
                .thenBy { players[it]?.name?.lowercase() ?: "" }
        )

        val selected = leaderboard.take(capacity)
        val groups = selected.chunked(4).filter { it.size == 4 }
        log.info("[addFinalRound] points={}", selected.map { players[it]?.name to (pointsByPlayer[it] ?: 0) })
        log.info("[addFinalRound] leaderboard={}", selected.map { players[it]?.name ?: it.toString() })
        log.info("[addFinalRound] groups={}", groups.map { g -> g.map { players[it]?.name ?: it.toString() } })
        val round = roundRepo.save(Round(eventId = eventId, roundNumber = (lastRound?.roundNumber ?: 0) + 1))
        groups.forEachIndexed { idx, quad ->
            val a = quad[0]
            val b = quad[1]
            val c = quad[2]
            val d = quad[3]
            // Snake: 1+4 vs 2+3, 5+8 vs 6+7
            val teamANames = listOf(players[a]?.name, players[d]?.name).joinToString(" + ")
            val teamBNames = listOf(players[b]?.name, players[c]?.name).joinToString(" + ")
            log.info("[addFinalRound] Court {}: {} vs {}", idx + 1, teamANames, teamBNames)
            matchRepo.save(
                Match(
                    roundId = round.id!!,
                    courtNumber = idx + 1,
                    teamAPlayer1Id = a,
                    teamAPlayer2Id = d,
                    teamBPlayer1Id = b,
                    teamBPlayer2Id = c,
                    status = MatchStatus.SCHEDULED
                )
            )
        }
    }

    private fun computeTournamentStandings(eventId: UUID, playerIds: List<UUID>, scoringMode: ScoringMode, maxRoundNumber: Int? = null): Map<UUID, Int> {
        val matches = matchRepo.findAllByEventId(eventId)
        val rounds = if (maxRoundNumber != null) {
            roundRepo.findAllByEventIdOrderByRoundNumberAsc(eventId).filter { it.roundNumber <= maxRoundNumber }.map { it.id!! }.toSet()
        } else null
        val matchesToUse = if (rounds != null) matches.filter { it.roundId in rounds } else matches
        val scoresByMatch = matchesToUse.associate { m -> m.id!! to scoreRepo.findAllByMatchIdOrderBySetNumberAsc(m.id!!) }
        val pointsByPlayer = mutableMapOf<UUID, Int>()
        playerIds.forEach { pointsByPlayer[it] = 0 }

        matchesToUse.forEach { m ->
            val scores = scoresByMatch[m.id!!].orEmpty()
            val (teamAPoints, teamBPoints) = if (scoringMode == ScoringMode.POINTS) {
                if (scores.isNotEmpty()) {
                    val s1 = scores.first()
                    s1.teamAGames to s1.teamBGames
                } else {
                    val draft = draftScoreRepo.findByMatchId(m.id!!)
                    if (draft != null) draft.teamAPoints to draft.teamBPoints else return@forEach
                }
            } else {
                if (scores.isEmpty()) return@forEach
                scores.sumOf { it.teamAGames } to scores.sumOf { it.teamBGames }
            }
            listOf(m.teamAPlayer1Id, m.teamAPlayer2Id).forEach { pid ->
                if (pid != null) pointsByPlayer[pid] = (pointsByPlayer[pid] ?: 0) + teamAPoints
            }
            listOf(m.teamBPlayer1Id, m.teamBPlayer2Id).forEach { pid ->
                if (pid != null) pointsByPlayer[pid] = (pointsByPlayer[pid] ?: 0) + teamBPoints
            }
        }

        return pointsByPlayer
    }

    private fun clearSchedule(eventId: UUID) {
        roundRepo.findAllByEventIdOrderByRoundNumberAsc(eventId).forEach { r ->
            matchRepo.findAllByRoundIdOrderByCourtNumberAsc(r.id!!).forEach { m ->
                scoreRepo.deleteAllByMatchId(m.id!!)
                matchRepo.delete(m)
            }
            roundRepo.delete(r)
        }
    }

    private fun planSchedule(event: Event, playerIds: List<UUID>) {
        val players = playerRepo.findAllById(playerIds).associateBy { it.id!! }
        if (event.autoRounds) {
            val ratings = players.values.map { it.rating }
            event.roundsPlanned = if (event.pairingMode == com.padelgo.domain.PairingMode.ROUND_ROBIN) {
                computeRoundRobinRounds(playerIds.size, event.courtsCount)
            } else {
                computeAutoRounds(ratings)
            }
            eventRepo.save(event)
        }
        val ratings = players.values.map { it.rating }
        val maxDiff = if (event.pairingMode == com.padelgo.domain.PairingMode.BALANCED) BALANCED_TEAM_DIFF_CAP else null
        val ratingMap = players.mapValues { it.value.rating }
        val planner = PairingPlanner(
            ratingByPlayer = ratingMap,
            courtsCount = event.courtsCount,
            pairingMode = event.pairingMode,
            maxTeamDiff = maxDiff
        )

        // В BALANCED берём только «хорошие» раунды (без повторов партнёрств и в пределах cap).
        // Юзер уже подтвердил это в модалке перед закрытием регистрации — если их меньше чем
        // requestedRounds, это и есть строгая семантика варианта B.
        val plannedRounds = if (event.pairingMode == com.padelgo.domain.PairingMode.BALANCED && maxDiff != null) {
            val raw = planner.planRounds(playerIds, event.roundsPlanned)
            val good = takeGoodRounds(raw, ratingMap, maxDiff)
            val actualCount = good.size.coerceAtLeast(1) // хотя бы 1 раунд всё равно делаем
            if (actualCount != event.roundsPlanned) {
                event.roundsPlanned = actualCount
                eventRepo.save(event)
            }
            raw.take(actualCount)
        } else {
            planner.planRounds(playerIds, event.roundsPlanned)
        }

        plannedRounds.forEachIndexed { idx, roundMatches ->
            val round = roundRepo.save(Round(eventId = event.id!!, roundNumber = idx + 1))
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
    }

    /**
     * Из последовательности раундов берёт префикс, в котором каждый раунд не содержит
     * ни повторов партнёрств с предыдущих раундов, ни матчей с balance > cap.
     */
    private fun takeGoodRounds(
        rounds: List<List<PlannedMatch>>,
        ratings: Map<UUID, Int>,
        cap: Int
    ): List<List<PlannedMatch>> {
        val seen = mutableSetOf<Set<UUID>>()
        val result = mutableListOf<List<PlannedMatch>>()
        for (roundMatches in rounds) {
            val ok = roundMatches.all { m ->
                val ra = EloRating.teamRating(ratings[m.teamA.first] ?: 1000, ratings[m.teamA.second] ?: 1000)
                val rb = EloRating.teamRating(ratings[m.teamB.first] ?: 1000, ratings[m.teamB.second] ?: 1000)
                val pairA = setOf(m.teamA.first, m.teamA.second)
                val pairB = setOf(m.teamB.first, m.teamB.second)
                abs(ra - rb) <= cap && pairA !in seen && pairB !in seen
            }
            if (!ok) break
            roundMatches.forEach { m ->
                seen.add(setOf(m.teamA.first, m.teamA.second))
                seen.add(setOf(m.teamB.first, m.teamB.second))
            }
            result.add(roundMatches)
        }
        return result
    }

    private fun requireAuthorOrParticipant(event: Event, userId: UUID) {
        if (event.createdByUserId == userId) return
        val user = userRepo.findById(userId).orElseThrow {
            ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized")
        }
        val playerId = user.playerId ?: throw ApiException(HttpStatus.FORBIDDEN, "Only participants can perform this action")
        val reg = regRepo.findByEventIdAndPlayerId(event.id!!, playerId)
        if (reg != null && reg.status == RegistrationStatus.REGISTERED) return
        val matches = matchRepo.findAllByEventId(event.id!!)
        val inMatch = matches.any { m ->
            m.teamAPlayer1Id == playerId ||
                m.teamAPlayer2Id == playerId ||
                m.teamBPlayer1Id == playerId ||
                m.teamBPlayer2Id == playerId
        }
        if (!inMatch) {
            throw ApiException(HttpStatus.FORBIDDEN, "Only participants can perform this action")
        }
    }

    @Transactional
    fun updateEvent(eventId: UUID, userId: UUID, req: com.padelgo.api.UpdateEventRequest): Event {
        val event = getEvent(eventId)
        if (event.createdByUserId != userId) {
            throw ApiException(HttpStatus.FORBIDDEN, "Only author can update event")
        }
        if (event.status == EventStatus.FINISHED) {
            throw ApiException(HttpStatus.CONFLICT, "Finished event cannot be edited")
        }

        val isBeforeStart = event.status == EventStatus.OPEN_FOR_REGISTRATION

        // Snapshot до изменений — нужен для diff'а в Telegram-уведомлении.
        val oldTitle = event.title
        val oldDate = event.date
        val oldStartTime = event.startTime
        val oldEndTime = event.endTime
        val oldPoints = event.pointsPerPlayerPerMatch
        val oldCourts = event.courtsCount
        val oldPairing = event.pairingMode
        val oldVisibility = event.visibility

        // Поля доступные на любой стадии (кроме FINISHED): название, дата, время, видимость.
        req.title?.let { t ->
            val trimmed = t.trim()
            if (trimmed.isBlank()) throw ApiException(HttpStatus.BAD_REQUEST, "Title can't be empty")
            event.title = trimmed
        }
        req.date?.let { event.date = it }
        req.startTime?.let { event.startTime = it }
        req.endTime?.let { event.endTime = it }
        req.visibility?.let { event.visibility = it }
        if (event.endTime <= event.startTime) {
            throw ApiException(HttpStatus.BAD_REQUEST, "endTime must be after startTime")
        }

        // Поля доступные только до старта.
        if (req.pointsPerPlayerPerMatch != null || req.courtsCount != null || req.pairingMode != null) {
            if (!isBeforeStart) {
                throw ApiException(
                    HttpStatus.CONFLICT,
                    "pointsPerPlayerPerMatch / courtsCount / pairingMode can be changed only before start"
                )
            }
            req.pointsPerPlayerPerMatch?.let { p ->
                if (p <= 0) throw ApiException(HttpStatus.BAD_REQUEST, "pointsPerPlayerPerMatch must be > 0")
                event.pointsPerPlayerPerMatch = p
            }
            req.courtsCount?.let { c ->
                if (c <= 0) throw ApiException(HttpStatus.BAD_REQUEST, "courtsCount must be > 0")
                event.courtsCount = c
            }
            req.pairingMode?.let { event.pairingMode = it }
        }

        // Любое изменение даты/времени делает старое напоминание неактуальным — сбрасываем
        // флаг, чтобы scheduler пересчитал момент и при необходимости отправил повторно.
        val datetimeChanged = oldDate != event.date ||
            oldStartTime != event.startTime ||
            oldEndTime != event.endTime
        if (datetimeChanged) event.reminderSentAt = null

        val saved = eventRepo.save(event)

        val changes = buildList {
            if (oldTitle != saved.title) add("Название: \"$oldTitle\" → \"${saved.title}\"")
            if (oldDate != saved.date) add("Дата: ${formatShortDate(oldDate)} → ${formatShortDate(saved.date)}")
            if (oldStartTime != saved.startTime) add("Начало: $oldStartTime → ${saved.startTime}")
            if (oldEndTime != saved.endTime) add("Конец: $oldEndTime → ${saved.endTime}")
            if (oldPoints != saved.pointsPerPlayerPerMatch) add("Подач на игрока: $oldPoints → ${saved.pointsPerPlayerPerMatch}")
            if (oldCourts != saved.courtsCount) add("Кортов: $oldCourts → ${saved.courtsCount}")
            if (oldPairing != saved.pairingMode) add("Режим: ${humanPairing(oldPairing)} → ${humanPairing(saved.pairingMode)}")
            if (oldVisibility != saved.visibility) add("Видимость: ${humanVisibility(oldVisibility)} → ${humanVisibility(saved.visibility)}")
        }
        if (changes.isNotEmpty()) {
            // Откладываем до afterCommit: бот при notifyEventUpdated делает
            // eventRepo.findById, и если транзакция ещё не закоммичена — читает старую
            // версию (баг «на 2-м апдейте подтягиваются изменения 1-го»).
            val payload = EventUpdatedNotify(
                eventId = saved.id!!,
                ownerUserId = userId,
                title = saved.title,
                date = saved.date,
                startTime = saved.startTime,
                endTime = saved.endTime,
                courtsCount = saved.courtsCount,
                changes = changes
            )
            runAfterCommit {
                try { botClient.notifyEventUpdated(payload) }
                catch (e: Exception) { log.warn("Failed to notify bot about UPDATED: {}", e.message) }
            }
        }

        return saved
    }

    private fun formatShortDate(d: LocalDate): String =
        "%02d.%02d".format(d.dayOfMonth, d.monthValue)

    private fun humanPairing(mode: com.padelgo.domain.PairingMode): String = when (mode) {
        com.padelgo.domain.PairingMode.ROUND_ROBIN -> "Каждый с каждым"
        com.padelgo.domain.PairingMode.BALANCED -> "Равный бой"
    }

    private fun humanVisibility(v: com.padelgo.domain.EventVisibility): String = when (v) {
        com.padelgo.domain.EventVisibility.PRIVATE -> "Приватная"
        com.padelgo.domain.EventVisibility.PUBLIC -> "Открытая"
    }

    /**
     * Считает кол-во активных регистраций до и после операции и уведомляет bot.
     * `before` снимается ДО изменения, метод вызывается ПОСЛЕ regRepo.save/delete.
     * Если число не изменилось — не шлём (повторный register того же игрока).
     */
    fun notifyRosterChanged(event: Event, before: Int) {
        val eventId = event.id ?: return
        val ownerId = event.createdByUserId ?: return
        val newCount = regRepo.countByEventIdAndStatus(eventId).toInt()
        if (before == newCount) return
        val capacity = event.courtsCount * 4
        // Откладываем до afterCommit: иначе бот вытащит из БД устаревшее значение
        // registrations (api-транзакция ещё не закоммитила insert/delete).
        val payload = RosterChangedNotify(
            eventId = eventId,
            ownerUserId = ownerId,
            title = event.title,
            date = event.date,
            startTime = event.startTime,
            endTime = event.endTime,
            courtsCount = event.courtsCount,
            oldCount = before,
            newCount = newCount,
            capacity = capacity
        )
        runAfterCommit {
            try { botClient.notifyRosterChanged(payload) }
            catch (e: Exception) { log.warn("Failed to notify bot about roster change for event {}: {}", eventId, e.message) }
        }
    }

    fun rosterCount(eventId: UUID): Int = regRepo.countByEventIdAndStatus(eventId).toInt()

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

        val before = regRepo.countByEventIdAndStatus(eventId).toInt()
        val existing = regRepo.findByEventIdAndPlayerId(eventId, playerId)
        val saved = if (existing != null) {
            if (existing.status == RegistrationStatus.REGISTERED) return existing
            existing.status = RegistrationStatus.REGISTERED
            existing.cancelRequested = false
            existing.cancelApproved = false
            existing.cancelRequestedAt = null
            regRepo.save(existing)
        } else {
            regRepo.save(Registration(eventId = eventId, playerId = playerId))
        }
        notifyRosterChanged(event, before)
        return saved
    }

    @Transactional
    fun updatePairingMode(eventId: UUID, userId: UUID, mode: com.padelgo.domain.PairingMode): Event {
        val event = getEvent(eventId)
        if (event.createdByUserId != userId) {
            throw ApiException(HttpStatus.FORBIDDEN, "Only author can change pairing mode")
        }
        if (event.status != EventStatus.OPEN_FOR_REGISTRATION && event.status != EventStatus.REGISTRATION_CLOSED) {
            throw ApiException(HttpStatus.CONFLICT, "Pairing mode can be changed only before the event starts (status=${event.status})")
        }
        if (event.pairingMode == mode) return event
        event.pairingMode = mode
        return eventRepo.save(event)
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
            val before = regRepo.countByEventIdAndStatus(eventId).toInt()
            reg.status = RegistrationStatus.CANCELLED
            reg.cancelApproved = true
            reg.cancelRequested = false
            reg.cancelRequestedAt = now.toInstant(java.time.ZoneOffset.UTC)
            regRepo.save(reg)
            notifyRosterChanged(event, before)
            com.padelgo.api.CancelRegistrationResponse("CANCELLED", "Cancelled")
        } else {
            reg.cancelRequested = true
            reg.cancelRequestedAt = now.toInstant(java.time.ZoneOffset.UTC)
            regRepo.save(reg)
            com.padelgo.api.CancelRegistrationResponse("REQUESTED", "Cancellation requested from author")
        }
    }

    @Transactional
    fun removePlayer(eventId: UUID, userId: UUID, playerId: UUID) {
        val event = getEvent(eventId)
        requireAuthor(event, userId)
        if (event.status == EventStatus.FINISHED || event.status == EventStatus.CANCELLED) {
            throw ApiException(HttpStatus.CONFLICT, "Event is already завершено")
        }
        val reg = regRepo.findByEventIdAndPlayerId(eventId, playerId)
            ?: throw ApiException(HttpStatus.NOT_FOUND, "Registration not found")
        if (reg.status == RegistrationStatus.CANCELLED) return
        val before = regRepo.countByEventIdAndStatus(eventId).toInt()
        reg.status = RegistrationStatus.CANCELLED
        reg.cancelApproved = true
        reg.cancelRequested = false
        regRepo.save(reg)
        notifyRosterChanged(event, before)

        if (event.status == EventStatus.IN_PROGRESS) {
            val matches = matchRepo.findAllByEventId(eventId)
            val hasFinished = matches.any { it.status == MatchStatus.FINISHED }
            val hasScores = matches.any { m -> scoreRepo.findAllByMatchIdOrderBySetNumberAsc(m.id!!).isNotEmpty() }
            if (hasFinished || hasScores) {
                throw ApiException(HttpStatus.CONFLICT, "Нельзя перестроить план после ввода счета")
            }
            val regs = regRepo.findAllByEventIdAndStatus(eventId)
            val remainingIds = regs.mapNotNull { it.playerId }
            val capacity = event.courtsCount * 4
            if (remainingIds.size < capacity) {
                throw ApiException(HttpStatus.CONFLICT, "Нужно минимум $capacity игроков для перестроения")
            }
            clearSchedule(eventId)
            planSchedule(event, remainingIds)
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
        val before = regRepo.countByEventIdAndStatus(eventId).toInt()
        reg.status = RegistrationStatus.CANCELLED
        reg.cancelApproved = true
        reg.cancelRequested = false
        regRepo.save(reg)
        notifyRosterChanged(event, before)
    }

    @Transactional
    fun deleteEvent(eventId: UUID, userId: UUID) {
        val event = getEvent(eventId)
        if (event.createdByUserId != userId) throw ApiException(HttpStatus.FORBIDDEN, "Only author can delete event")
        if (event.status == EventStatus.FINISHED) throw ApiException(HttpStatus.CONFLICT, "Finished event cannot be deleted")

        // Готовим план отмены ДО удаления — event_telegram_post каскадно очистится.
        val cancellationPlan = try {
            botClient.prepareCancellation(
                PrepareCancellationRequest(eventId = eventId, ownerUserId = userId, title = event.title)
            )
        } catch (e: Exception) {
            log.warn("Failed to prepare Telegram cancellation: {}", e.message)
            null
        }

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
        // event_invites: FK без CASCADE — без явного удаления Postgres падает с FK violation
        // и api возвращает 500 (фронт может неудачно интерпретировать как logout).
        inviteRepo.deleteAllByEventId(eventId)

        eventRepo.delete(event)

        // sendCancellation откладываем до afterCommit — событие будет удалено
        // окончательно, и бот не будет пытаться editMessage/unpin сообщения,
        // ссылающиеся на entry в event_telegram_post которое только что
        // каскадно удалилось (но коммит ещё не прошёл — мы могли бы получить
        // неожиданные эффекты, если транзакция откатится).
        if (cancellationPlan != null &&
            (cancellationPlan.targetTgChatIds.isNotEmpty() || cancellationPlan.originalPosts.isNotEmpty())) {
            runAfterCommit {
                try { botClient.sendCancellation(cancellationPlan) }
                catch (e: Exception) { log.warn("Failed to send Telegram cancellation: {}", e.message) }
            }
        }
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
        clearSchedule(eventId)
        planSchedule(event, playerIds)

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

    private fun computeRoundRobinRounds(totalPlayers: Int, courtsCount: Int): Int {
        val uniquePairs = totalPlayers * (totalPlayers - 1) / 2
        val pairsPerRound = courtsCount * 2
        return maxOf(1, (uniquePairs + pairsPerRound - 1) / pairsPerRound)
    }

    /**
     * Превью режима BALANCED для эвента в стадии OPEN_FOR_REGISTRATION / REGISTRATION_CLOSED.
     * Возвращает максимальное число раундов, которые можно сыграть с текущим составом
     * без повторов партнёрств и без матчей вне cap maxTeamDiff.
     *
     * Не имеет побочных эффектов — не создаёт раунды, не меняет состояние эвента.
     */
    fun previewBalancedRounds(eventId: UUID): com.padelgo.api.BalancePreviewResponse {
        val event = getEvent(eventId)
        val regs = regRepo.findAllByEventIdAndStatus(eventId)
        val playerIds = regs.mapNotNull { it.playerId }
        val capacity = event.courtsCount * 4
        val requestedRounds = if (event.autoRounds) null else event.roundsPlanned

        // Меньше чем на 1 корт — ничего полезного посчитать нельзя
        if (playerIds.size < 4) {
            return com.padelgo.api.BalancePreviewResponse(
                playerCount = playerIds.size,
                capacity = capacity,
                ratingSpread = 0,
                severity = "NONE",
                maxGoodRounds = 0,
                requestedRounds = requestedRounds,
                currentPairingMode = event.pairingMode,
                shouldWarn = false
            )
        }

        val players = playerRepo.findAllById(playerIds).associateBy { it.id!! }
        val ratings = players.mapValues { it.value.rating }
        val spread = ratings.values.max() - ratings.values.min()
        val maxDiff = BALANCED_TEAM_DIFF_CAP

        // На промежуточной регистрации (4-7 при 2 кортах) симулируем тем количеством кортов,
        // на которое реально хватает игроков. Это даёт честный прогноз «сколько хороших раундов
        // получится с тем что есть сейчас», даже если эвент создан для большего числа кортов.
        val effectiveCourts = minOf(event.courtsCount, playerIds.size / 4)
        val pairsPerRound = effectiveCourts * 2
        val theoreticalMax = (playerIds.size * (playerIds.size - 1)) / (2 * pairsPerRound)
        val simulationRounds = minOf(12, maxOf(theoreticalMax, 1))

        val planner = PairingPlanner(
            ratingByPlayer = ratings,
            courtsCount = effectiveCourts,
            pairingMode = com.padelgo.domain.PairingMode.BALANCED,
            maxTeamDiff = maxDiff
        )
        val planned = planner.planRounds(playerIds, simulationRounds)
        val goodRounds = takeGoodRounds(planned, ratings, maxDiff).size

        val severity = when {
            spread < 200 -> "SMALL"
            spread < 400 -> "MEDIUM"
            else -> "LARGE"
        }
        val shouldWarn = event.pairingMode == com.padelgo.domain.PairingMode.BALANCED && (
            severity != "SMALL" ||
                (requestedRounds != null && goodRounds < requestedRounds)
            )

        return com.padelgo.api.BalancePreviewResponse(
            playerCount = playerIds.size,
            capacity = capacity,
            ratingSpread = spread,
            severity = severity,
            maxGoodRounds = goodRounds,
            requestedRounds = requestedRounds,
            currentPairingMode = event.pairingMode,
            shouldWarn = shouldWarn
        )
    }

    @Transactional
    fun submitScore(matchId: UUID, userId: UUID, req: com.padelgo.api.SubmitScoreRequest) {
        val match = matchRepo.findById(matchId).orElseThrow { ApiException(HttpStatus.NOT_FOUND, "Match not found") }

        val round = roundRepo.findById(match.roundId!!).orElseThrow { ApiException(HttpStatus.NOT_FOUND, "Round not found") }
        val event = getEvent(round.eventId!!)
        if (event.status != EventStatus.IN_PROGRESS && event.status != EventStatus.FINISHED) {
            throw ApiException(HttpStatus.CONFLICT, "Event is not in progress or finished (status=${event.status})")
        }

        // Авторизация: автор может всё (включая редактирование после FINISHED и перезапись).
        // Не-автор-участник матча может только ПЕРВЫЙ раз ввести счёт пока игра IN_PROGRESS.
        val isAuthor = event.createdByUserId == userId
        if (!isAuthor) {
            if (event.status != EventStatus.IN_PROGRESS) {
                throw ApiException(HttpStatus.FORBIDDEN, "Изменить счёт завершённой игры может только организатор")
            }
            val user = userRepo.findById(userId).orElseThrow {
                ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized")
            }
            val playerId = user.playerId ?: throw ApiException(
                HttpStatus.FORBIDDEN, "Только участник матча или организатор может вводить счёт"
            )
            val inMatch = playerId == match.teamAPlayer1Id || playerId == match.teamAPlayer2Id ||
                playerId == match.teamBPlayer1Id || playerId == match.teamBPlayer2Id
            if (!inMatch) {
                throw ApiException(
                    HttpStatus.FORBIDDEN, "Только участник матча или организатор может вводить счёт"
                )
            }
            val existing = scoreRepo.findAllByMatchIdOrderBySetNumberAsc(matchId)
            if (existing.isNotEmpty()) {
                throw ApiException(
                    HttpStatus.CONFLICT, "Счёт уже введён. Изменить может только организатор."
                )
            }
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

        val keepNumbers = setEntities.map { it.setNumber }
        setEntities.forEach { s ->
            scoreRepo.upsertScore(matchId, s.setNumber, s.teamAGames, s.teamBGames, userId)
        }
        if (keepNumbers.isNotEmpty()) {
            scoreRepo.deleteAllByMatchIdAndSetNumberNotIn(matchId, keepNumbers)
        } else {
            scoreRepo.deleteAllByMatchId(matchId)
        }

        draftScoreRepo.deleteByMatchId(matchId)
        match.status = MatchStatus.FINISHED
        matchRepo.save(match)

        if (event.status == EventStatus.FINISHED) {
            recalculateMatchRatings(event, match, setEntities)
        }
    }

    @Transactional
    fun saveDraftScore(matchId: UUID, userId: UUID, req: com.padelgo.api.DraftScoreRequest) {
        val match = matchRepo.findById(matchId).orElseThrow { ApiException(HttpStatus.NOT_FOUND, "Match not found") }
        val round = roundRepo.findById(match.roundId!!).orElseThrow { ApiException(HttpStatus.NOT_FOUND, "Round not found") }
        val event = getEvent(round.eventId!!)
        requireAuthor(event, userId)
        if (event.status != EventStatus.IN_PROGRESS && event.status != EventStatus.FINISHED) {
            throw ApiException(HttpStatus.CONFLICT, "Event is not in progress or finished (status=${event.status})")
        }
        if (event.scoringMode != ScoringMode.POINTS) {
            throw ApiException(HttpStatus.BAD_REQUEST, "Draft score is supported only for POINTS mode")
        }
        val total = req.teamAPoints + req.teamBPoints
        val expectedTotal = event.pointsPerPlayerPerMatch * 4
        if (total > expectedTotal) {
            throw ApiException(HttpStatus.BAD_REQUEST, "Total points must be <= $expectedTotal (now $total)")
        }
        val existing = draftScoreRepo.findByMatchId(matchId)
        val draft = existing ?: com.padelgo.domain.MatchDraftScore(matchId = matchId)
        draft.teamAPoints = req.teamAPoints
        draft.teamBPoints = req.teamBPoints
        draftScoreRepo.save(draft)
    }

    @Transactional
    fun finishEvent(eventId: UUID, userId: UUID) {
        log.info("[ACTION] finishEvent called | eventId={} userId={}", eventId, userId)
        val event = getEvent(eventId)
        requireAuthor(event, userId)
        if (event.status == EventStatus.FINISHED) return
        if (event.status != EventStatus.IN_PROGRESS) throw ApiException(HttpStatus.CONFLICT, "Event is not in progress")

        // Promote draft scores to actual scores before finishing
        val matches = matchRepo.findAllByEventId(eventId)
        matches.forEach { m ->
            if (m.status == MatchStatus.SCHEDULED) {
                val existingScores = scoreRepo.findAllByMatchIdOrderBySetNumberAsc(m.id!!)
                if (existingScores.isEmpty()) {
                    val draft = draftScoreRepo.findByMatchId(m.id!!)
                    if (draft != null && (draft.teamAPoints > 0 || draft.teamBPoints > 0)) {
                        // Драфт принадлежит автору — финализирует тоже автор (finishEvent гарантирует requireAuthor выше).
                        scoreRepo.upsertScore(m.id!!, 1, draft.teamAPoints, draft.teamBPoints, userId)
                        draftScoreRepo.deleteByMatchId(m.id!!)
                        m.status = MatchStatus.FINISHED
                        matchRepo.save(m)
                    }
                }
            }
        }

        val setsByMatch = matches.associate { m -> m.id!! to scoreRepo.findAllByMatchIdOrderBySetNumberAsc(m.id!!) }
        val finishedMatches = matches.filter { it.status == MatchStatus.FINISHED && !setsByMatch[it.id!!].isNullOrEmpty() }

        if (finishedMatches.isEmpty()) {
            event.status = EventStatus.FINISHED
            eventRepo.save(event)
            return
        }

        val playerIds = finishedMatches.flatMap {
            listOf(it.teamAPlayer1Id!!, it.teamAPlayer2Id!!, it.teamBPlayer1Id!!, it.teamBPlayer2Id!!)
        }.toSet()
        val players = playerRepo.findAllById(playerIds).associateBy { it.id!! }.toMutableMap()
        val accounts = userRepo.findAllByPlayerIdIn(playerIds.toList())

        // Сохраняем стартовые рейтинги ДО любых изменений — чтобы потом посчитать delta в уведомлении.
        val ratingBefore: Map<UUID, Int> = players.mapValues { (_, p) -> p.rating }

        val calibrationByPlayer = accounts.associate { it.playerId!! to it.calibrationMatchesRemaining }
        val accountByPlayerId = accounts.associateBy { it.playerId!! }

        // Нормализация по количеству сыгранных в эвенте матчей: если один сыграл 6 матчей,
        // другой 4 — у первого каждая дельта × (avg/6), у второго × (avg/4). Так суммарное
        // движение рейтинга пропорционально качеству игры, а не «времени за столом».
        val matchCountByPlayer: Map<UUID, Int> = finishedMatches.flatMap {
            listOf(it.teamAPlayer1Id!!, it.teamAPlayer2Id!!, it.teamBPlayer1Id!!, it.teamBPlayer2Id!!)
        }.groupingBy { it }.eachCount()
        val avgMatches: Double = if (matchCountByPlayer.isEmpty()) 1.0
            else matchCountByPlayer.values.average()
        val normByPlayer: Map<UUID, Double> = matchCountByPlayer.mapValues { (_, count) ->
            if (count == 0) 1.0 else avgMatches / count.toDouble()
        }

        try {
            finishedMatches.forEach { m ->
                val sets = setsByMatch[m.id!!]!!.sortedBy { it.setNumber }
                val a1 = players[m.teamAPlayer1Id!!] ?: return@forEach
                val a2 = players[m.teamAPlayer2Id!!] ?: return@forEach
                val b1 = players[m.teamBPlayer1Id!!] ?: return@forEach
                val b2 = players[m.teamBPlayer2Id!!] ?: return@forEach

                val teamARating = EloRating.teamRating(a1.rating, a2.rating)
                val teamBRating = EloRating.teamRating(b1.rating, b2.rating)
                // K-фактор — среднее по ВСЕМ 4 игрокам, не только команде A (раньше был баг).
                val kTeam = ((
                    EloRating.kFactor(a1.gamesPlayed) +
                        EloRating.kFactor(a2.gamesPlayed) +
                        EloRating.kFactor(b1.gamesPlayed) +
                        EloRating.kFactor(b2.gamesPlayed)
                    ) / 4.0).toInt()

                val scoreA = scoreAFromSets(event.scoringMode, sets)
                val (teamAPoints, teamBPoints, expectedTotal) = when (event.scoringMode) {
                    ScoringMode.POINTS -> {
                        val s1 = sets.first()
                        Triple(s1.teamAGames, s1.teamBGames, event.pointsPerPlayerPerMatch * 4)
                    }
                    ScoringMode.SETS -> {
                        val totalA = sets.sumOf { it.teamAGames }
                        val totalB = sets.sumOf { it.teamBGames }
                        val maxGames = (event.gamesPerSet * event.setsPerMatch) * 2
                        Triple(totalA, totalB, maxOf(maxGames, 1))
                    }
                }
                val marginMult = EloRating.marginMultiplier(teamAPoints, teamBPoints, expectedTotal)
                val baseDelta = EloRating.teamDelta(teamARating, teamBRating, kTeam, scoreA)
                val deltaTeamA = (baseDelta * marginMult).roundToInt()

                applyDelta(eventId, m.id!!, a1, a2, deltaTeamA, calibrationByPlayer, normByPlayer)
                applyDelta(eventId, m.id!!, b1, b2, -deltaTeamA, calibrationByPlayer, normByPlayer)

                val matchNow = java.time.Instant.now()
                listOf(a1, a2, b1, b2).forEach { p ->
                    p.gamesPlayed += 1
                    p.lastMatchAt = matchNow
                    accountByPlayerId[p.id]?.let { acc ->
                        if (acc.calibrationMatchesRemaining > 0) {
                            acc.calibrationMatchesRemaining -= 1
                        }
                    }
                }
            }

            playerRepo.saveAll(players.values)

            accounts.forEach { u ->
                if (u.calibrationEventsRemaining > 0) {
                    u.calibrationEventsRemaining = (u.calibrationEventsRemaining - 1).coerceAtLeast(0)
                }
            }
            userRepo.saveAll(accounts)

            accounts.forEach { acc ->
                val player = acc.playerId?.let { players[it] } ?: return@forEach
                val before = ratingBefore[player.id] ?: player.rating
                ratingNotificationRepo.save(
                    com.padelgo.domain.UserRatingNotification(
                        userId = acc.id!!,
                        eventId = eventId,
                        newRating = player.rating,
                        delta = player.rating - before
                    )
                )
            }
        } finally {
            event.status = EventStatus.FINISHED
            eventRepo.save(event)
        }

        // Telegram: после успешного финиша шлём сводку — полная таблица лидеров
        // (по сумме очков игроков, как «Таблица лидеров» в UI). Топ-3 по приросту
        // рейтинга всё ещё кладём в payload для bw-compat, но bot использует
        // leaderboard как основной блок.
        try {
            val ownerId = event.createdByUserId
            if (ownerId != null) {
                val ratingChanges = ratingChangeRepo.findAllByEventId(eventId)
                val totalsByPlayer: Map<UUID, Int> = ratingChanges
                    .filter { it.playerId != null }
                    .groupBy { it.playerId!! }
                    .mapValues { (_, list) -> list.sumOf { it.delta } }
                val playersById = playerRepo.findAllById(totalsByPlayer.keys).associateBy { it.id!! }
                val top = totalsByPlayer.entries
                    .sortedByDescending { it.value }
                    .take(3)
                    .mapNotNull { (pid, delta) ->
                        playersById[pid]?.let { FinishTopDto(name = it.name, delta = delta) }
                    }

                // Полная таблица лидеров по очкам (как в UI Modal «Таблица лидеров»).
                val playerIds = regRepo.findAllByEventIdAndStatus(eventId).mapNotNull { it.playerId }
                val standings = computeTournamentStandings(eventId, playerIds, event.scoringMode)
                val playersForBoard = playerRepo.findAllById(standings.keys).associateBy { it.id!! }
                val leaderboard = standings.entries
                    .sortedWith(compareByDescending<Map.Entry<UUID, Int>> { it.value }
                        .thenBy { playersForBoard[it.key]?.name?.lowercase() ?: "" })
                    .mapNotNull { (pid, pts) ->
                        playersForBoard[pid]?.let { LeaderboardEntry(name = it.name, points = pts) }
                    }

                val payload = EventFinishedNotify(
                    eventId = eventId,
                    ownerUserId = ownerId,
                    title = event.title,
                    date = event.date,
                    startTime = event.startTime,
                    endTime = event.endTime,
                    courtsCount = event.courtsCount,
                    top = top,
                    leaderboard = leaderboard,
                    matchCount = finishedMatches.size
                )
                runAfterCommit {
                    try { botClient.notifyEventFinished(payload) }
                    catch (e: Exception) { log.warn("Failed to notify bot about FINISHED: {}", e.message) }
                }
            }
        } catch (e: Exception) {
            log.warn("Failed to compute Telegram FINISHED payload: {}", e.message)
        }
    }

    /** Завершает событие без проверки матчей (для обхода старой проверки "Not all matches are finished"). */
    @Transactional
    fun forceFinishEvent(eventId: UUID, userId: UUID) {
        val event = getEvent(eventId)
        requireAuthor(event, userId)
        if (event.status == EventStatus.FINISHED) return
        if (event.status != EventStatus.IN_PROGRESS) throw ApiException(HttpStatus.CONFLICT, "Event is not in progress")
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

    private fun recalculateMatchRatings(event: Event, match: Match, setEntities: List<MatchSetScore>) {
        val a1 = playerRepo.findById(match.teamAPlayer1Id!!).orElse(null) ?: return
        val a2 = playerRepo.findById(match.teamAPlayer2Id!!).orElse(null) ?: return
        val b1 = playerRepo.findById(match.teamBPlayer1Id!!).orElse(null) ?: return
        val b2 = playerRepo.findById(match.teamBPlayer2Id!!).orElse(null) ?: return

        ratingChangeRepo.deleteAllByMatchId(match.id!!)

        val teamARating = EloRating.teamRating(a1.rating, a2.rating)
        val teamBRating = EloRating.teamRating(b1.rating, b2.rating)
        val kTeam = ((
            EloRating.kFactor(a1.gamesPlayed) +
                EloRating.kFactor(a2.gamesPlayed) +
                EloRating.kFactor(b1.gamesPlayed) +
                EloRating.kFactor(b2.gamesPlayed)
            ) / 4.0).toInt()

        val scoreA = scoreAFromSets(event.scoringMode, setEntities)
        val (teamAPoints, teamBPoints, expectedTotal) = when (event.scoringMode) {
            ScoringMode.POINTS -> {
                val s1 = setEntities.first()
                Triple(s1.teamAGames, s1.teamBGames, event.pointsPerPlayerPerMatch * 4)
            }
            ScoringMode.SETS -> {
                val totalA = setEntities.sumOf { it.teamAGames }
                val totalB = setEntities.sumOf { it.teamBGames }
                val maxGames = (event.gamesPerSet * event.setsPerMatch) * 2
                Triple(totalA, totalB, maxOf(maxGames, 1))
            }
        }

        val marginMult = EloRating.marginMultiplier(teamAPoints, teamBPoints, expectedTotal)
        val baseDelta = EloRating.teamDelta(teamARating, teamBRating, kTeam, scoreA)
        val deltaTeamA = (baseDelta * marginMult).roundToInt()

        val calibrationByPlayer = mapOf(
            a1.id!! to (userRepo.findByPlayerId(a1.id!!)?.calibrationMatchesRemaining ?: 0),
            a2.id!! to (userRepo.findByPlayerId(a2.id!!)?.calibrationMatchesRemaining ?: 0),
            b1.id!! to (userRepo.findByPlayerId(b1.id!!)?.calibrationMatchesRemaining ?: 0),
            b2.id!! to (userRepo.findByPlayerId(b2.id!!)?.calibrationMatchesRemaining ?: 0)
        )

        applyDelta(event.id!!, match.id!!, a1, a2, deltaTeamA, calibrationByPlayer)
        applyDelta(event.id!!, match.id!!, b1, b2, -deltaTeamA, calibrationByPlayer)

        playerRepo.saveAll(listOf(a1, a2, b1, b2))
    }

    private fun applyDelta(
        eventId: UUID,
        matchId: UUID,
        p1: Player,
        p2: Player,
        deltaTeam: Int,
        calibrationByPlayer: Map<UUID, Int>,
        normByPlayer: Map<UUID, Double> = emptyMap()
    ) {
        // делим нечетный delta "в пользу" игрока с меньшим количеством игр (чтобы новичков быстрее калибровало)
        val firstGetsMore = p1.gamesPlayed <= p2.gamesPlayed
        val d1 = deltaTeam / 2 + if (deltaTeam % 2 != 0 && firstGetsMore) deltaTeam.sign() else 0
        val d2 = deltaTeam - d1

        val m1 = if ((calibrationByPlayer[p1.id] ?: 0) > 0) 1.5 else 1.0
        val m2 = if ((calibrationByPlayer[p2.id] ?: 0) > 0) 1.5 else 1.0
        val n1 = normByPlayer[p1.id] ?: 1.0
        val n2 = normByPlayer[p2.id] ?: 1.0
        applyDeltaSingle(eventId, matchId, p1, (d1 * m1 * n1).roundToInt())
        applyDeltaSingle(eventId, matchId, p2, (d2 * m2 * n2).roundToInt())
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
        // Берём только матчи игрока (а не findAll() по всей таблице) — иначе профиль тормозит.
        val my = matchRepo.findAllByPlayerParticipating(playerId)
        if (my.isEmpty()) return emptyList()

        val playerIds = my.flatMap {
            listOf(it.teamAPlayer1Id!!, it.teamAPlayer2Id!!, it.teamBPlayer1Id!!, it.teamBPlayer2Id!!)
        }.toSet()
        val playersById = playerRepo.findAllById(playerIds).associateBy { it.id!! }
        val roundIds = my.mapNotNull { it.roundId }.toSet()
        val rounds = roundRepo.findAllById(roundIds).associateBy { it.id!! }
        val eventIds = rounds.values.mapNotNull { it.eventId }.toSet()
        val events = eventRepo.findAllById(eventIds).associateBy { it.id!! }

        // Счёт и драфт-счёт по всем матчам одним запросом каждый вместо N+1 на каждый матч.
        val matchIds = my.mapNotNull { it.id }
        val scores = scoreRepo.findAllByMatchIdInOrderBySetNumberAsc(matchIds)
            .groupBy { it.matchId }
        val draftScores = draftScoreRepo.findAllByMatchIdIn(matchIds)
            .groupBy { it.matchId }
        val ratingByMatch = ratingChangeRepo.findAllByPlayerId(playerId)
            .filter { it.matchId != null }
            .groupBy { it.matchId!! }
            .mapValues { (_, v) -> v.sumOf { it.delta } }

        return my.mapNotNull { m ->
            val r = rounds[m.roundId] ?: return@mapNotNull null
            val e = events[r.eventId] ?: return@mapNotNull null
            val s = scores[m.id!!].orEmpty()
            val ds = draftScores[m.id!!].orEmpty()
            val teamAIds = listOf(m.teamAPlayer1Id!!, m.teamAPlayer2Id!!)
            val teamBIds = listOf(m.teamBPlayer1Id!!, m.teamBPlayer2Id!!)
            val teamA = teamAIds.mapNotNull { playersById[it]?.name }
            val teamB = teamBIds.mapNotNull { playersById[it]?.name }
            val isTeamA = m.teamAPlayer1Id == playerId || m.teamAPlayer2Id == playerId
            val teamText = if (isTeamA) teamA.joinToString(" + ") else teamB.joinToString(" + ")
            val opponentText = if (isTeamA) teamB.joinToString(" + ") else teamA.joinToString(" + ")
            val myIds = if (isTeamA) teamAIds else teamBIds
            val oppIds = if (isTeamA) teamBIds else teamAIds
            val teamPlayerInfos = myIds.mapNotNull { id -> playersById[id]?.let { MatchPlayerInfo(it.name, it.avatarUrl) } }
            val opponentPlayerInfos = oppIds.mapNotNull { id -> playersById[id]?.let { MatchPlayerInfo(it.name, it.avatarUrl) } }
            // Для POINTS-режима счёт может лежать либо в финальном MatchSetScore (после submitScore),
            // либо в драфте (до submitScore). После submitScore драфт удаляется (см. submitScore line ~998),
            // поэтому читаем MatchSetScore первым, иначе исторические матчи показывают «—».
            val pointsTeamA: Int? = if (e.scoringMode == com.padelgo.domain.ScoringMode.POINTS) {
                s.firstOrNull()?.teamAGames ?: ds.firstOrNull()?.teamAPoints
            } else null
            val pointsTeamB: Int? = if (e.scoringMode == com.padelgo.domain.ScoringMode.POINTS) {
                s.firstOrNull()?.teamBGames ?: ds.firstOrNull()?.teamBPoints
            } else null
            val scoreText = if (e.scoringMode == com.padelgo.domain.ScoringMode.POINTS) {
                if (pointsTeamA == null || pointsTeamB == null) null else "$pointsTeamA:$pointsTeamB"
            } else {
                if (s.isEmpty()) null else scoreToText(e.scoringMode, s)
            }
            val result = when {
                scoreText == null -> "—"
                e.scoringMode == com.padelgo.domain.ScoringMode.POINTS -> {
                    val myPoints = if (isTeamA) pointsTeamA!! else pointsTeamB!!
                    val oppPoints = if (isTeamA) pointsTeamB!! else pointsTeamA!!
                    when {
                        myPoints > oppPoints -> "Победа"
                        myPoints < oppPoints -> "Поражение"
                        else -> "Ничья"
                    }
                }
                else -> {
                    val scoreA = scoreAFromSets(e.scoringMode, s)
                    when {
                        scoreA == 0.5 -> "Ничья"
                        isTeamA && scoreA > 0.5 -> "Победа"
                        isTeamA && scoreA < 0.5 -> "Поражение"
                        !isTeamA && scoreA < 0.5 -> "Победа"
                        else -> "Поражение"
                    }
                }
            }
            PlayerMatchHistoryItem(
                eventId = e.id!!,
                eventTitle = e.title,
                eventDate = e.date,
                eventStartTime = e.startTime,
                eventEndTime = e.endTime,
                roundNumber = r.roundNumber,
                matchId = m.id!!,
                courtNumber = m.courtNumber,
                scoringMode = e.scoringMode.name,
                score = scoreText,
                status = m.status.name,
                ratingDelta = ratingByMatch[m.id!!],
                teamText = teamText,
                opponentText = opponentText,
                result = result,
                isTeamA = isTeamA,
                teamPlayers = teamPlayerInfos,
                opponentPlayers = opponentPlayerInfos
            )
        }.sortedWith(compareByDescending<PlayerMatchHistoryItem> { it.eventDate }.thenByDescending { it.roundNumber })
    }

    /**
     * Лучшие напарники игрока по win-rate. Напарник — игрок, стоявший с ним в одной команде
     * в сыгранном (с зафиксированным счётом) матче.
     *
     * Логика:
     *  - проходим по всем матчам игрока;
     *  - учитываем только матчи с записанным итоговым счётом (есть строки MatchSetScore) —
     *    у незавершённых матчей нет результата, win-rate по ним не имеет смысла;
     *  - для каждого такого матча определяем напарника и исход с точки зрения игрока
     *    (ничья считается как сыгранная игра, но не как победа);
     *  - агрегируем gamesTogether / winsTogether, winRate = winsTogether / gamesTogether.
     *
     * В выдачу попадают только напарники с >= [MIN_GAMES_TOGETHER] совместных игр,
     * и только откалиброванные (calibrationMatchesRemaining == 0): пока игрок калибруется,
     * его статистика ещё не показательна;
     * и только «активные» — хотя бы один совместный матч за последние [RECENT_DAYS] дней (от [today]).
     * Сортировка: score desc (баланс качества и наигранности, см. [partnerScore]), затем gamesTogether desc.
     */
    fun getTopPartners(
        playerId: UUID,
        limit: Int = DEFAULT_TOP_PARTNERS_LIMIT,
        today: LocalDate = LocalDate.now()
    ): List<com.padelgo.api.TopPartnerResponse> {
        // Берём только матчи игрока (а не findAll() по всей таблице) — иначе профиль тормозит.
        val my = matchRepo.findAllByPlayerParticipating(playerId)
        if (my.isEmpty()) return emptyList()

        val roundIds = my.mapNotNull { it.roundId }.toSet()
        val rounds = roundRepo.findAllById(roundIds).associateBy { it.id!! }
        val eventIds = rounds.values.mapNotNull { it.eventId }.toSet()
        val events = eventRepo.findAllById(eventIds).associateBy { it.id!! }
        // Счёт по всем матчам одним запросом вместо N+1 на каждый матч.
        val setsByMatch = scoreRepo.findAllByMatchIdInOrderBySetNumberAsc(my.mapNotNull { it.id })
            .groupBy { it.matchId }

        // partnerId -> (количество совместных игр, количество совместных побед)
        val gamesTogether = HashMap<UUID, Int>()
        val winsTogether = HashMap<UUID, Int>()
        // partnerId -> дата последнего совместного матча (для фильтра активности).
        val lastPlayedTogether = HashMap<UUID, LocalDate>()

        for (m in my) {
            val round = rounds[m.roundId] ?: continue
            val event = events[round.eventId] ?: continue
            val sets = setsByMatch[m.id].orEmpty()
            if (sets.isEmpty()) continue  // матч без счёта — в win-rate не учитываем

            val isTeamA = m.teamAPlayer1Id == playerId || m.teamAPlayer2Id == playerId
            val partnerId = (
                if (isTeamA) {
                    if (m.teamAPlayer1Id == playerId) m.teamAPlayer2Id else m.teamAPlayer1Id
                } else {
                    if (m.teamBPlayer1Id == playerId) m.teamBPlayer2Id else m.teamBPlayer1Id
                }
                ) ?: continue

            val scoreA = scoreAFromSets(event.scoringMode, sets)
            val playerScore = if (isTeamA) scoreA else 1.0 - scoreA

            gamesTogether[partnerId] = (gamesTogether[partnerId] ?: 0) + 1
            if (playerScore > 0.5) winsTogether[partnerId] = (winsTogether[partnerId] ?: 0) + 1
            val prev = lastPlayedTogether[partnerId]
            if (prev == null || event.date.isAfter(prev)) lastPlayedTogether[partnerId] = event.date
        }

        val qualified = gamesTogether.filterValues { it >= MIN_GAMES_TOGETHER }
        if (qualified.isEmpty()) return emptyList()

        // Фильтр активности: последняя совместная игра — не позднее RECENT_DAYS назад.
        val cutoff = today.minusDays(RECENT_DAYS)
        val recent = qualified.filterKeys { pid ->
            lastPlayedTogether[pid]?.isBefore(cutoff) == false
        }
        if (recent.isEmpty()) return emptyList()

        // В ТОП попадают только откалиброванные напарники (calibrationMatchesRemaining == 0).
        // Партнёр без аккаунта (нет UserAccount) калибровку пройти не мог — исключаем.
        val calibratedPlayerIds = userRepo.findAllByPlayerIdIn(recent.keys)
            .filter { it.calibrationMatchesRemaining == 0 }
            .mapNotNull { it.playerId }
            .toSet()
        val eligible = recent.filterKeys { it in calibratedPlayerIds }
        if (eligible.isEmpty()) return emptyList()

        val partners = playerRepo.findAllById(eligible.keys).associateBy { it.id!! }

        return eligible.entries.mapNotNull { (partnerId, games) ->
            val partner = partners[partnerId] ?: return@mapNotNull null
            val wins = winsTogether[partnerId] ?: 0
            com.padelgo.api.TopPartnerResponse(
                player = com.padelgo.api.PlayerShort.from(partner),
                gamesTogether = games,
                winsTogether = wins,
                winRate = wins.toDouble() / games,
                // Сортируем по баллу-балансу качества и наигранности (см. partnerScore),
                // а не по сырому winRate: частые успешные напарники должны быть выше редких.
                score = partnerScore(wins, games)
            )
        }.sortedWith(
            compareByDescending<com.padelgo.api.TopPartnerResponse> { it.score }
                .thenByDescending { it.gamesTogether }
        ).take(limit)
    }

    fun getMatchesForPlayerInEvent(playerId: UUID, eventId: UUID): List<PlayerMatchHistoryItem> {
        return getMatchesForPlayer(playerId).filter { it.eventId == eventId }
    }

    fun getEventHistoryForPlayer(playerId: UUID): List<PlayerEventHistoryItem> {
        val matches = getMatchesForPlayer(playerId)
        if (matches.isEmpty()) return emptyList()

        val eventIds = matches.map { it.eventId }.toSet()
        val events = eventRepo.findAllById(eventIds).associateBy { it.id!! }
        val ratingChanges = ratingChangeRepo.findAllByPlayerId(playerId)
        val ratingDeltas = ratingChanges.groupBy { it.eventId }.mapValues { (_, v) -> v.sumOf { it.delta } }
        val finishedAtByEvent = ratingChanges.groupBy { it.eventId }.mapValues { (_, v) -> v.maxOfOrNull { it.createdAt!! } }

        val scoresByMatch = matches.associate { m ->
            m.matchId to scoreRepo.findAllByMatchIdOrderBySetNumberAsc(m.matchId)
        }
        val draftScoresByMatch = matches.associate { m ->
            m.matchId to (draftScoreRepo.findByMatchId(m.matchId)?.let { listOf(it) } ?: emptyList())
        }

        val participantsByEvent = eventIds.associateWith { eid ->
            val regs = regRepo.findAllByEventIdAndStatus(eid)
            val pids = regs.mapNotNull { it.playerId }
            val players = playerRepo.findAllById(pids)
            players.map { it.name }.sorted()
        }

        return matches
            .groupBy { it.eventId }
            .mapNotNull { (eventId, items) ->
                val e = events[eventId] ?: return@mapNotNull null
                val totalPoints = if (e.scoringMode == ScoringMode.POINTS) {
                    items.sumOf { item ->
                        // Сначала пытаемся прочитать финальный счёт (MatchSetScore), потом fallback на драфт —
                        // иначе после submitScore (драфт удалён) totalPoints не считается.
                        val finalScores = scoresByMatch[item.matchId].orEmpty()
                        val draftScores = draftScoresByMatch[item.matchId].orEmpty()
                        val match = matchRepo.findById(item.matchId).orElse(null) ?: return@sumOf 0
                        val isTeamA = match.teamAPlayer1Id == playerId || match.teamAPlayer2Id == playerId
                        val finalScore = finalScores.firstOrNull()
                        if (finalScore != null) {
                            if (isTeamA) finalScore.teamAGames else finalScore.teamBGames
                        } else {
                            draftScores.firstOrNull()?.let { ds ->
                                if (isTeamA) ds.teamAPoints else ds.teamBPoints
                            } ?: 0
                        }
                    }
                } else {
                    null
                }
                PlayerEventHistoryItem(
                    eventId = eventId,
                    eventTitle = e.title,
                    eventDate = e.date,
                    eventStartTime = e.startTime,
                    eventEndTime = e.endTime,
                    participants = participantsByEvent[eventId] ?: emptyList(),
                    finishedAt = finishedAtByEvent[eventId],
                    matchesCount = items.size,
                    totalPoints = totalPoints,
                    ratingDelta = ratingDeltas[eventId] ?: 0
                )
            }
            .sortedWith(
                compareByDescending<PlayerEventHistoryItem> { it.finishedAt != null }
                    .thenByDescending { it.finishedAt ?: java.time.Instant.EPOCH }
                    .thenByDescending { it.eventDate }
            )
    }

    fun getRatingHistoryForPlayer(playerId: UUID): List<RatingHistoryPoint> {
        val changes = ratingChangeRepo.findAllByPlayerIdOrderByCreatedAtAsc(playerId)
        if (changes.isEmpty()) {
            val player = playerRepo.findById(playerId).orElse(null) ?: return emptyList()
            return listOf(
                RatingHistoryPoint(
                    date = java.time.Instant.now().toString(),
                    rating = player.rating,
                    delta = null,
                    eventId = null
                )
            )
        }
        val eventIds = changes.mapNotNull { it.eventId }.toSet()
        val events = eventRepo.findAllById(eventIds).associateBy { it.id!! }
        val byEvent = changes.groupBy { it.eventId!! }.mapValues { (_, list) -> list.maxByOrNull { it.createdAt!! }!! }
        val sortedEvents = byEvent.keys.sortedBy { events[it]?.date }
        val result = mutableListOf<RatingHistoryPoint>()
        val first = byEvent[sortedEvents.first()]!!
        result.add(
            RatingHistoryPoint(
                date = events[first.eventId]?.date?.toString() ?: first.createdAt!!.toString(),
                rating = first.oldRating,
                delta = null,
                eventId = null
            )
        )
        sortedEvents.forEach { eid ->
            val c = byEvent[eid]!!
            result.add(
                RatingHistoryPoint(
                    date = events[eid]?.date?.toString() ?: c.createdAt!!.toString(),
                    rating = c.newRating,
                    delta = c.delta,
                    eventId = c.eventId
                )
            )
        }
        return result
    }

    private fun scoreToText(mode: com.padelgo.domain.ScoringMode, sets: List<com.padelgo.domain.MatchSetScore>): String =
        if (mode == com.padelgo.domain.ScoringMode.POINTS) {
            val s1 = sets.first()
            "${s1.teamAGames}:${s1.teamBGames}"
        } else {
            sets.sortedBy { it.setNumber }.joinToString(" ") { "${it.teamAGames}:${it.teamBGames}" }
        }

    private fun scoreToTextPoints(draftScores: List<com.padelgo.domain.MatchDraftScore>): String =
        draftScores.firstOrNull()?.let { "${it.teamAPoints}:${it.teamBPoints}" } ?: ""
}

@Schema(description = "Игрок в матче (краткая информация)")
data class MatchPlayerInfo(
    @Schema(description = "Имя игрока")
    val name: String,
    @Schema(description = "URL аватара или null")
    val avatarUrl: String? = null
)

@Schema(description = "Один матч из истории игрока")
data class PlayerMatchHistoryItem(
    @Schema(description = "UUID игры")
    val eventId: UUID,
    @Schema(description = "Название игры")
    val eventTitle: String,
    @Schema(description = "Дата игры")
    val eventDate: java.time.LocalDate,
    @Schema(description = "Время начала игры")
    val eventStartTime: java.time.LocalTime? = null,
    @Schema(description = "Время окончания игры")
    val eventEndTime: java.time.LocalTime? = null,
    @Schema(description = "Номер раунда")
    val roundNumber: Int,
    @Schema(description = "UUID матча")
    val matchId: UUID,
    @Schema(description = "Номер корта")
    val courtNumber: Int,
    @Schema(description = "Система счёта: SETS или POINTS")
    val scoringMode: String,
    @Schema(description = "Счёт в виде строки, например «16:8» или «6:4, 4:6, 7:5». null — счёт не введён")
    val score: String?,
    @Schema(description = "Статус матча: SCHEDULED или FINISHED")
    val status: String,
    @Schema(description = "Изменение рейтинга за этот матч. null — рейтинг не пересчитывался")
    val ratingDelta: Int?,
    @Schema(description = "Партнёры по команде через запятую")
    val teamText: String,
    @Schema(description = "Соперники через запятую")
    val opponentText: String,
    @Schema(description = "Результат: WIN / LOSS / DRAW")
    val result: String,
    @Schema(description = "true — игрок был в команде A, false — в команде B")
    val isTeamA: Boolean = true,
    @Schema(description = "Игроки своей команды")
    val teamPlayers: List<MatchPlayerInfo> = emptyList(),
    @Schema(description = "Игроки команды соперника")
    val opponentPlayers: List<MatchPlayerInfo> = emptyList()
)

@Schema(description = "Точка графика изменения рейтинга")
data class RatingHistoryPoint(
    @Schema(description = "Дата в формате YYYY-MM-DD")
    val date: String,
    @Schema(description = "Рейтинг после события")
    val rating: Int,
    @Schema(description = "Изменение рейтинга (положительное — рост). null для начальной точки")
    val delta: Int?,
    @Schema(description = "UUID игры, после которой изменился рейтинг. null для начальной точки")
    val eventId: UUID?
)

@Schema(description = "Игра из истории игрока (краткий итог)")
data class PlayerEventHistoryItem(
    @Schema(description = "UUID игры")
    val eventId: UUID,
    @Schema(description = "Название игры")
    val eventTitle: String,
    @Schema(description = "Дата игры")
    val eventDate: java.time.LocalDate,
    @Schema(description = "Время начала")
    val eventStartTime: java.time.LocalTime? = null,
    @Schema(description = "Время окончания")
    val eventEndTime: java.time.LocalTime? = null,
    @Schema(description = "Имена других участников игры")
    val participants: List<String> = emptyList(),
    @Schema(description = "Время завершения игры (UTC). null — игра ещё не завершена")
    val finishedAt: java.time.Instant? = null,
    @Schema(description = "Количество матчей сыгранных игроком в этой игре")
    val matchesCount: Int,
    @Schema(description = "Сумма очков игрока за все матчи (при scoringMode=POINTS). null при scoringMode=SETS")
    val totalPoints: Int?,
    @Schema(description = "Суммарное изменение рейтинга за игру")
    val ratingDelta: Int
)

