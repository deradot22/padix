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
        const val RECENT_DAYS = 60L

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
        val minR = event.minRating
        val maxR = event.maxRating
        if (minR != null && minR < 0) throw ApiException(HttpStatus.BAD_REQUEST, "minRating must be >= 0")
        if (maxR != null && maxR < 0) throw ApiException(HttpStatus.BAD_REQUEST, "maxRating must be >= 0")
        if (minR != null && maxR != null && minR > maxR) {
            throw ApiException(HttpStatus.BAD_REQUEST, "minRating must be <= maxRating")
        }
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
    /**
     * @param count сколько раундов добавить за раз: 1 — кнопка «+Раунд», N — «серия»
     *   (повторить полный цикл, как при старте). Только для AMERICANA; Mexicano всегда 1
     *   (его раунды строятся по текущей таблице, серия не имеет смысла).
     */
    fun addRound(eventId: UUID, userId: UUID, count: Int = 1) {
        log.info("[ACTION] addRound called | eventId={} userId={} count={}", eventId, userId, count)
        val event = getEvent(eventId)
        requireAuthor(event, userId)
        if (event.status != EventStatus.IN_PROGRESS) throw ApiException(HttpStatus.CONFLICT, "Event is not in progress")

        // Mexicano: следующий раунд формируется по текущей таблице очков (не анти-повтором).
        if (event.format == com.padelgo.domain.EventFormat.MEXICANO) {
            planMexicanoNextRound(event)
            return
        }
        // Fixed pairs: round-robin формируется целиком на старте — доп. раунды не добавляются.
        if (event.format == com.padelgo.domain.EventFormat.FIXED_PAIRS) {
            throw ApiException(HttpStatus.CONFLICT, "Для фиксированных пар расписание round-robin формируется целиком на старте")
        }
        val roundsToAdd = count.coerceIn(1, 30)

        val regs = regRepo.findAllByEventIdAndStatus(eventId)
        val playerIds = regs.mapNotNull { it.playerId }
        val capacity = event.courtsCount * 4
        if (playerIds.size < capacity) {
            throw ApiException(HttpStatus.CONFLICT, "Нужно минимум $capacity игроков, сейчас ${playerIds.size}")
        }
        val players = playerRepo.findAllById(playerIds).associateBy { it.id!! }
        val ratings = players.mapValues { it.value.rating }
        val existingMatches = matchRepo.findAllByEventId(eventId)
        val seed = plannerSeed(eventId, playerIds, salt = existingMatches.size)
        log.info("[PAIRING] addRound | eventId={} mode={} players={} count={} seed={}", eventId, event.pairingMode, playerIds.size, roundsToAdd, seed)
        val planner = PairingPlanner(
            ratingByPlayer = ratings,
            courtsCount = event.courtsCount,
            pairingMode = event.pairingMode,
            // Cap передаём в ОБОИХ режимах: в ROUND_ROBIN он «мягкий» — balanceViolations
            // стоит ПОСЛЕ ротации и лишь отсеивает дико перекошенные матчи среди
            // ротационно-равных вариантов.
            maxTeamDiff = BALANCED_TEAM_DIFF_CAP,
            random = kotlin.random.Random(seed)
        )
        planner.seedFromMatches(existingMatches)
        val plannedRounds = planner.planRounds(playerIds, roundsToAdd)

        val lastRoundNumber = roundRepo.findAllByEventIdOrderByRoundNumberAsc(eventId)
            .maxByOrNull { it.roundNumber }?.roundNumber ?: 0
        plannedRounds.forEachIndexed { idx, planned ->
            val round = roundRepo.save(Round(eventId = eventId, roundNumber = lastRoundNumber + 1 + idx))
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
        val leaderboard = standingsLeaderboard(eventId, playerIds, event.scoringMode, lastRound?.roundNumber)
        log.info("[addFinalRound] leaderboard={}", leaderboard.take(capacity))
        buildSnakeRound(eventId, leaderboard, event.courtsCount, (lastRound?.roundNumber ?: 0) + 1)
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

    /** Игроки, отсортированные по текущей таблице очков (лучший→худший); тай-брейк рейтинг, имя. */
    private fun standingsLeaderboard(
        eventId: UUID,
        playerIds: List<UUID>,
        scoringMode: ScoringMode,
        maxRoundNumber: Int?
    ): List<UUID> {
        val points = computeTournamentStandings(eventId, playerIds, scoringMode, maxRoundNumber)
        val players = playerRepo.findAllById(playerIds).associateBy { it.id!! }
        return playerIds.sortedWith(
            compareByDescending<UUID> { points[it] ?: 0 }
                .thenByDescending { players[it]?.rating ?: 0 }
                .thenBy { players[it]?.name?.lowercase() ?: "" }
        )
    }

    /**
     * Строит один раунд «змейкой» из упорядоченного (лучший→худший) списка игроков:
     * четвёрка a,b,c,d → команда a+d против b+c (1+4 vs 2+3). Игроки сверх capacity
     * (courtsCount*4) в этот раунд не попадают. Используется Mexicano и «финальным раундом».
     */
    private fun buildSnakeRound(eventId: UUID, orderedPlayers: List<UUID>, courtsCount: Int, roundNumber: Int): Round {
        val round = roundRepo.save(Round(eventId = eventId, roundNumber = roundNumber))
        SnakePairing.round(orderedPlayers, courtsCount).forEach { pm ->
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
        return round
    }

    /** Mexicano: первый раунд формируется змейкой по рейтингу (таблицы очков ещё нет). */
    private fun planMexicanoInitialRound(event: Event, playerIds: List<UUID>) {
        val players = playerRepo.findAllById(playerIds).associateBy { it.id!! }
        val ordered = playerIds.sortedWith(
            compareByDescending<UUID> { players[it]?.rating ?: 0 }
                .thenBy { players[it]?.name?.lowercase() ?: "" }
        )
        buildSnakeRound(event.id!!, ordered, event.courtsCount, 1)
    }

    /**
     * Mexicano: следующий раунд формируется змейкой по ТЕКУЩЕЙ таблице очков. Требует, чтобы
     * предыдущий раунд был полностью сыгран (иначе пары считались бы по неполным данным).
     */
    private fun planMexicanoNextRound(event: Event) {
        val eventId = event.id!!
        val regs = regRepo.findAllByEventIdAndStatus(eventId)
        val playerIds = regs.mapNotNull { it.playerId }
        val capacity = event.courtsCount * 4
        if (playerIds.size < capacity) {
            throw ApiException(HttpStatus.CONFLICT, "Нужно минимум $capacity игроков, сейчас ${playerIds.size}")
        }
        val lastRound = roundRepo.findAllByEventIdOrderByRoundNumberAsc(eventId).maxByOrNull { it.roundNumber }
        if (lastRound != null) {
            val lastMatches = matchRepo.findAllByRoundIdOrderByCourtNumberAsc(lastRound.id!!)
            if (lastMatches.isNotEmpty() && lastMatches.any { it.status != MatchStatus.FINISHED }) {
                throw ApiException(HttpStatus.CONFLICT, "Сначала введите счёт всех матчей текущего раунда")
            }
        }
        val leaderboard = standingsLeaderboard(eventId, playerIds, event.scoringMode, lastRound?.roundNumber)

        // Честная ротация скамейки: если игроков больше вместимости, в раунд идут те, кто
        // сыграл МЕНЬШЕ раундов (при равенстве — выше по таблице). Иначе аутсайдер таблицы
        // сидел бы вечно: он не играет → не набирает очков → снова последний → снова сидит.
        val orderedForRound = SnakePairing.selectPlaying(
            leaderboard = leaderboard,
            playedRounds = playedRoundsByPlayer(eventId),
            capacity = event.courtsCount * 4
        )
        buildSnakeRound(eventId, orderedForRound, event.courtsCount, (lastRound?.roundNumber ?: 0) + 1)
    }

    /** Сколько раундов уже сыграл каждый игрок эвента (по всем его матчам). */
    private fun playedRoundsByPlayer(eventId: UUID): Map<UUID, Int> {
        val counts = mutableMapOf<UUID, Int>()
        matchRepo.findAllByEventId(eventId).forEach { m ->
            listOfNotNull(m.teamAPlayer1Id, m.teamAPlayer2Id, m.teamBPlayer1Id, m.teamBPlayer2Id)
                .forEach { counts[it] = (counts[it] ?: 0) + 1 }
        }
        return counts
    }

    /** Fixed pairs: собирает зарегистрированные пары (по общему team_id) в список (игрок1, игрок2). */
    private fun fixedPairsTeams(eventId: UUID): List<Pair<UUID, UUID>> {
        val regs = regRepo.findAllByEventIdAndStatus(eventId)
        return regs.filter { it.teamId != null && it.playerId != null }
            .groupBy { it.teamId!! }
            .values
            .mapNotNull { members -> if (members.size == 2) members[0].playerId!! to members[1].playerId!! else null }
    }

    /**
     * FIXED_PAIRS-каскад: если отменяемая регистрация [reg] несёт team_id (пара), переводит
     * в CANCELLED и вторую активную регистрацию с тем же team_id и eventId. Для одиночных
     * форматов (team_id=null) — no-op. Вызывается ПОСЛЕ сохранения основной отмены.
     */
    private fun cancelFixedPairPartner(event: Event, reg: Registration, now: java.time.LocalDateTime) {
        if (event.format != com.padelgo.domain.EventFormat.FIXED_PAIRS) return
        val teamId = reg.teamId ?: return
        val eventId = event.id ?: return
        val partners = regRepo.findAllByEventIdAndStatus(eventId)
            .filter { it.teamId == teamId && it.id != reg.id && it.status == RegistrationStatus.REGISTERED }
        partners.forEach { partner ->
            partner.status = RegistrationStatus.CANCELLED
            partner.cancelApproved = true
            partner.cancelRequested = false
            partner.cancelRequestedAt = now.toInstant(java.time.ZoneOffset.UTC)
            regRepo.save(partner)
        }
    }

    /**
     * Safety net для FIXED_PAIRS: все REGISTERED-игроки должны образовывать полные пары —
     * у каждого есть team_id и каждый team_id встречается ровно дважды. Иначе (осиротевший
     * игрок после частичной отмены) бросаем CONFLICT, чтобы избежать тихого дропа в fixedPairsTeams.
     */
    private fun assertFixedPairsComplete(eventId: UUID) {
        val regs = regRepo.findAllByEventIdAndStatus(eventId)
        if (regs.any { it.teamId == null }) {
            throw ApiException(HttpStatus.CONFLICT, "В паре остался один игрок — отмените или добавьте пару целиком")
        }
        val byTeam = regs.groupBy { it.teamId }
        if (byTeam.any { (_, members) -> members.size != 2 }) {
            throw ApiException(HttpStatus.CONFLICT, "В паре остался один игрок — отмените или добавьте пару целиком")
        }
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

    /**
     * Детерминированный seed планировщика от (eventId, состав, кол-во уже созданных
     * матчей). Превью и реальный план при неизменном составе дают ОДИН и тот же план
     * (раньше это были два независимых Random.Default-прогона: юзер подтверждал в
     * модалке одно число «хороших» раундов, а при старте получал другое). salt —
     * число существующих матчей: у каждого добавленного раунда своя перестановка.
     */
    private fun plannerSeed(eventId: UUID, playerIds: Collection<UUID>, salt: Int = 0): Int {
        var h = eventId.hashCode()
        playerIds.map { it.toString() }.sorted().forEach { h = 31 * h + it.hashCode() }
        return 31 * h + salt
    }

    private fun planSchedule(event: Event, playerIds: List<UUID>) {
        // Mexicano — инкрементальный формат: на старте создаём только первый раунд,
        // остальные организатор добавляет вручную кнопкой «+Раунд» (пары по текущей таблице).
        if (event.format == com.padelgo.domain.EventFormat.MEXICANO) {
            if (event.autoRounds) {
                val ratings = playerRepo.findAllById(playerIds).map { it.rating }
                event.roundsPlanned = computeAutoRounds(ratings) // мягкая цель, показываем в UI как «Раунд N из M»
                eventRepo.save(event)
            }
            planMexicanoInitialRound(event, playerIds)
            return
        }
        // Fixed pairs — round-robin между зарегистрированными парами; всё расписание на старте.
        if (event.format == com.padelgo.domain.EventFormat.FIXED_PAIRS) {
            val teams = fixedPairsTeams(event.id!!)
            val rounds = FixedPairsPairing.rounds(teams, event.courtsCount)
            if (rounds.isEmpty()) throw ApiException(HttpStatus.CONFLICT, "Нужно минимум 2 полные пары для старта")
            if (event.autoRounds) {
                event.roundsPlanned = rounds.size
                eventRepo.save(event)
            }
            rounds.forEachIndexed { idx, roundMatches ->
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
            return
        }
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
        // Cap передаём в ОБОИХ режимах: в BALANCED он определяет «хорошие» раунды,
        // в ROUND_ROBIN — «мягкий» (balanceViolations после ротации): среди
        // ротационно-равных вариантов планировщик избегает дико перекошенных матчей.
        val maxDiff = BALANCED_TEAM_DIFF_CAP
        val ratingMap = players.mapValues { it.value.rating }
        val seed = plannerSeed(event.id!!, playerIds)
        log.info("[PAIRING] planSchedule | eventId={} mode={} players={} seed={}", event.id, event.pairingMode, playerIds.size, seed)
        val planner = PairingPlanner(
            ratingByPlayer = ratingMap,
            courtsCount = event.courtsCount,
            pairingMode = event.pairingMode,
            maxTeamDiff = maxDiff,
            random = kotlin.random.Random(seed)
        )

        // В BALANCED берём только «хорошие» раунды (без повторов партнёрств и в пределах cap).
        // Юзер уже подтвердил это в модалке перед закрытием регистрации — если их меньше чем
        // requestedRounds, это и есть строгая семантика варианта B.
        val plannedRounds = if (event.pairingMode == com.padelgo.domain.PairingMode.BALANCED) {
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
    fun register(eventId: UUID, playerId: UUID, byUserId: UUID? = null, bypassRatingGate: Boolean = false): Registration {
        val event = getEvent(eventId)
        if (event.format == com.padelgo.domain.EventFormat.FIXED_PAIRS) {
            throw ApiException(HttpStatus.CONFLICT, "Эта игра — по фиксированным парам. Регистрируйтесь парой.")
        }
        if (event.status != EventStatus.OPEN_FOR_REGISTRATION) {
            throw ApiException(HttpStatus.CONFLICT, "Registration is closed (status=${event.status})")
        }
        val player = playerRepo.findById(playerId).orElseThrow { ApiException(HttpStatus.NOT_FOUND, "Player not found") }

        // Ограничение по рейтингу (задача #9). Организатор может добавить игрока
        // вне диапазона вручную (override), поэтому проверяем только когда регистрирует
        // не автор эвента и вызов не помечен как доверенный (admin / приглашение / добавление другом).
        val isOrganizer = byUserId != null && event.createdByUserId == byUserId
        if (!bypassRatingGate && !isOrganizer) {
            event.minRating?.let { min ->
                if (player.rating < min) throw ApiException(
                    HttpStatus.CONFLICT,
                    "Рейтинг ${player.rating} ниже минимального ($min) для этой игры"
                )
            }
            event.maxRating?.let { max ->
                if (player.rating > max) throw ApiException(
                    HttpStatus.CONFLICT,
                    "Рейтинг ${player.rating} выше максимального ($max) для этой игры"
                )
            }
        }

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

    /** Fixed pairs: организатор регистрирует пару игроков (общий team_id). */
    @Transactional
    fun registerPair(eventId: UUID, userId: UUID, player1Id: UUID, player2Id: UUID) {
        val event = getEvent(eventId)
        requireAuthor(event, userId)
        if (event.format != com.padelgo.domain.EventFormat.FIXED_PAIRS) {
            throw ApiException(HttpStatus.BAD_REQUEST, "Парная регистрация доступна только для формата «Фиксированные пары»")
        }
        if (event.status != EventStatus.OPEN_FOR_REGISTRATION) {
            throw ApiException(HttpStatus.CONFLICT, "Registration is closed (status=${event.status})")
        }
        if (player1Id == player2Id) throw ApiException(HttpStatus.BAD_REQUEST, "Игрок не может быть в паре сам с собой")
        playerRepo.findById(player1Id).orElseThrow { ApiException(HttpStatus.NOT_FOUND, "Player not found") }
        playerRepo.findById(player2Id).orElseThrow { ApiException(HttpStatus.NOT_FOUND, "Player not found") }

        val teamId = UUID.randomUUID()
        val before = regRepo.countByEventIdAndStatus(eventId).toInt()
        listOf(player1Id, player2Id).forEach { pid ->
            val existing = regRepo.findByEventIdAndPlayerId(eventId, pid)
            if (existing != null) {
                if (existing.status == RegistrationStatus.REGISTERED) {
                    throw ApiException(HttpStatus.CONFLICT, "Игрок уже зарегистрирован в этой игре")
                }
                existing.status = RegistrationStatus.REGISTERED
                existing.teamId = teamId
                existing.cancelRequested = false
                existing.cancelApproved = false
                existing.cancelRequestedAt = null
                regRepo.save(existing)
            } else {
                regRepo.save(Registration(eventId = eventId, playerId = pid, teamId = teamId))
            }
        }
        notifyRosterChanged(event, before)
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
            // FIXED_PAIRS: обе регистрации пары несут общий team_id — отменяем и партнёра,
            // иначе он остался бы осиротевшим REGISTERED (в матч не попадёт, но пройдёт capacity-проверку).
            cancelFixedPairPartner(event, reg, now)
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
        // FIXED_PAIRS: снимаем и партнёра по общему team_id, чтобы не осталось осиротевшего
        // REGISTERED (он не попал бы в матч, но прошёл бы capacity-проверку старта).
        cancelFixedPairPartner(event, reg, java.time.LocalDateTime.now())
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

        // FIXED_PAIRS: гарантируем, что все REGISTERED образуют полные пары (нет осиротков после
        // частичной отмены) — иначе fixedPairsTeams молча отбросил бы неполную пару.
        if (event.format == com.padelgo.domain.EventFormat.FIXED_PAIRS) {
            assertFixedPairsComplete(eventId)
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

        // Тот же seed, что и planSchedule при старте: превью == реальный план,
        // пока состав не изменился.
        val planner = PairingPlanner(
            ratingByPlayer = ratings,
            courtsCount = effectiveCourts,
            pairingMode = com.padelgo.domain.PairingMode.BALANCED,
            maxTeamDiff = maxDiff,
            random = kotlin.random.Random(plannerSeed(eventId, playerIds))
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
                // Свой же счёт участник может исправить, пока игра идёт (IN_PROGRESS — проверено выше).
                // Чужой счёт менять нельзя — только организатор.
                val existingSubmitter = existing.firstOrNull()?.submittedByUserId
                if (existingSubmitter == null || existingSubmitter != userId) {
                    throw ApiException(
                        HttpStatus.CONFLICT, "Счёт уже введён другим участником. Изменить может только организатор."
                    )
                }
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
            recomputeFinishedEvent(event)
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

        // Ядро начисления — общий проход для боевого финиша и глобального пересчёта.
        // Возвращает стартовые рейтинги для расчёта delta в нотификации.
        val ratingBefore: Map<UUID, Int> = try {
            applyEventRatingPass(event, finishedMatches, setsByMatch, players, accounts, matchTime = java.time.Instant.now())
        } finally {
            event.status = EventStatus.FINISHED
            eventRepo.save(event)
        }

        // Нотификации участникам — только боевой финиш (глобальный пересчёт их не шлёт).
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

        // Telegram: после успешного финиша шлём сводку — полная таблица лидеров
        // (по сумме очков игроков, как «Таблица лидеров» в UI). Топ-3 по приросту
        // рейтинга всё ещё кладём в payload для bw-compat, но bot использует
        // leaderboard как основной блок.
        try {
            val ownerId = event.createdByUserId
            if (ownerId != null) {
                val (top, leaderboard) = buildEventResultsPayload(event)
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

    /**
     * Ядро начисления рейтинга за один эвент — общий код для боевого [finishEvent] и
     * глобального [recomputeAllRatings]. Прогоняет finishedMatches (уже отсортированы по
     * round/court), пишет rating_changes, инкрементит gamesPlayed/lastMatchAt, живьём
     * декрементит калибровку. [players] — мутабельная мапа: объекты Player общие, поэтому
     * при глобальном пересчёте рейтинг переносится между эвентами. НЕ трогает статус
     * эвента, НЕ шлёт Telegram, НЕ пишет нотификации — это делают вызывающие.
     *
     * @param matchTime время, проставляемое в lastMatchAt (для боевого финиша — now,
     *   для пересчёта — реальное время эвента, иначе decay не сработает для неактивных).
     * @return стартовые рейтинги игроков (до прохода) — для расчёта delta в нотификации.
     */
    private fun applyEventRatingPass(
        event: Event,
        finishedMatches: List<Match>,
        setsByMatch: Map<UUID, List<MatchSetScore>>,
        players: MutableMap<UUID, Player>,
        accounts: List<com.padelgo.auth.UserAccount>,
        matchTime: java.time.Instant
    ): Map<UUID, Int> {
        val eventId = event.id!!
        val ratingBefore: Map<UUID, Int> = players.mapValues { (_, p) -> p.rating }

        // Живой счётчик калибровки: ×1.5 действует ровно до исчерпания
        // calibrationMatchesRemaining, даже если оно случилось в середине эвента.
        val calibRemaining: MutableMap<UUID, Int> =
            accounts.associate { it.playerId!! to it.calibrationMatchesRemaining }.toMutableMap()
        val accountByPlayerId = accounts.associateBy { it.playerId!! }

        // Нормализация по числу матчей в эвенте с клампом NORM_MIN..NORM_MAX.
        val matchCountByPlayer: Map<UUID, Int> = finishedMatches.flatMap {
            listOf(it.teamAPlayer1Id!!, it.teamAPlayer2Id!!, it.teamBPlayer1Id!!, it.teamBPlayer2Id!!)
        }.groupingBy { it }.eachCount()
        val avgMatches: Double = if (matchCountByPlayer.isEmpty()) 1.0 else matchCountByPlayer.values.average()
        val normByPlayer: Map<UUID, Double> = matchCountByPlayer.mapValues { (_, count) ->
            if (count == 0) 1.0
            else (avgMatches / count.toDouble()).coerceIn(EloRating.NORM_MIN, EloRating.NORM_MAX)
        }

        // K-фактор фиксируем от числа игр НА НАЧАЛО эвента.
        val gamesAtStart: Map<UUID, Int> = players.mapValues { (_, p) -> p.gamesPlayed }

        finishedMatches.forEach { m ->
            val sets = setsByMatch[m.id!!]?.sortedBy { it.setNumber } ?: return@forEach
            if (sets.isEmpty()) return@forEach
            val a1 = players[m.teamAPlayer1Id!!] ?: return@forEach
            val a2 = players[m.teamAPlayer2Id!!] ?: return@forEach
            val b1 = players[m.teamBPlayer1Id!!] ?: return@forEach
            val b2 = players[m.teamBPlayer2Id!!] ?: return@forEach

            val teamARating = EloRating.teamRating(a1.rating, a2.rating)
            val teamBRating = EloRating.teamRating(b1.rating, b2.rating)
            val kTeam = (
                EloRating.kFactor(gamesAtStart[a1.id] ?: 0) +
                    EloRating.kFactor(gamesAtStart[a2.id] ?: 0) +
                    EloRating.kFactor(gamesAtStart[b1.id] ?: 0) +
                    EloRating.kFactor(gamesAtStart[b2.id] ?: 0)
                ) / 4.0

            val deltaTeamA = computeTeamADelta(event, sets, teamARating, teamBRating, kTeam)

            val calibByPlayer: Map<UUID, Double> = listOf(a1, a2, b1, b2).associate { p ->
                p.id!! to if ((calibRemaining[p.id] ?: 0) > 0) EloRating.CALIBRATION_MULTIPLIER else 1.0
            }
            applyDelta(eventId, m.id!!, a1, a2, deltaTeamA, kTeam, calibByPlayer, normByPlayer)
            applyDelta(eventId, m.id!!, b1, b2, -deltaTeamA, kTeam, calibByPlayer, normByPlayer)

            listOf(a1, a2, b1, b2).forEach { p ->
                p.gamesPlayed += 1
                p.lastMatchAt = matchTime
                val rem = calibRemaining[p.id] ?: 0
                if (rem > 0) {
                    calibRemaining[p.id!!] = rem - 1
                    accountByPlayerId[p.id]?.calibrationMatchesRemaining = rem - 1
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
        return ratingBefore
    }

    /** Итог глобального пересчёта — для лога и верификации. */
    data class RecomputeAllSummary(
        val eventsReplayed: Int,
        val playersReplayed: Int,
        val changesWritten: Int,
        val orphansNormalized: Int
    )

    /**
     * ГЛОБАЛЬНЫЙ пересчёт рейтингов всех игроков «как будто новый алгоритм действовал
     * всегда»: сброс к стартовым рейтингам (oldRating первого матча) и реплей всех
     * FINISHED-эвентов в хронологии (date, startTime, createdAt) единым конвейером с
     * [finishEvent]. Одноразовая maintenance-операция (см. RecomputeAllRatingsRunner).
     *
     * Калибровка восстанавливается: surveyCompleted → 30 матчей / 3 эвента (для проды
     * это точно воспроизводит текущие остатки, т.к. 30 − сыгранные = остаток).
     * Сироты (игроки без единого FINISHED-матча) нормализуются: gamesPlayed=0, и если
     * рейтинг вне [400,2500] — сброс к 1000 (чистит мусорные тест-аккаунты).
     */
    @Transactional
    fun recomputeAllRatings(): RecomputeAllSummary {
        // 1. Стартовые рейтинги ДО удаления changes: oldRating самого раннего матча игрока.
        val allChanges = ratingChangeRepo.findAll()
        val startingByPlayer: Map<UUID, Int> = allChanges
            .filter { it.playerId != null && it.matchId != null }
            .groupBy { it.playerId!! }
            .mapValues { (_, list) ->
                list.minByOrNull { it.createdAt ?: java.time.Instant.MAX }!!.oldRating
            }

        // 2. FINISHED-эвенты в хронологии.
        val events = eventRepo.findAll()
            .filter { it.status == EventStatus.FINISHED }
            .sortedWith(
                compareBy<Event>({ it.date }, { it.startTime })
                    .thenBy { it.createdAt ?: java.time.Instant.EPOCH }
            )

        // 3. Резолвим finishedMatches + scores для каждого эвента; собираем участников.
        data class Prepared(val event: Event, val matches: List<Match>, val sets: Map<UUID, List<MatchSetScore>>)
        val prepared = events.mapNotNull { ev ->
            val matches = matchRepo.findAllByEventId(ev.id!!)
            val setsByMatch = matches.associate { m -> m.id!! to scoreRepo.findAllByMatchIdOrderBySetNumberAsc(m.id!!) }
            val finished = matches.filter { it.status == MatchStatus.FINISHED && !setsByMatch[it.id!!].isNullOrEmpty() }
            if (finished.isEmpty()) null else Prepared(ev, finished, setsByMatch)
        }
        val participantIds: Set<UUID> = prepared.flatMap { p ->
            p.matches.flatMap { listOf(it.teamAPlayer1Id!!, it.teamAPlayer2Id!!, it.teamBPlayer1Id!!, it.teamBPlayer2Id!!) }
        }.toSet()

        // 4. Загружаем участников + аккаунты, снапшотим текущий рейтинг (fallback стартового).
        val masterPlayers: MutableMap<UUID, Player> =
            playerRepo.findAllById(participantIds).associateBy { it.id!! }.toMutableMap()
        val accounts = userRepo.findAllByPlayerIdIn(participantIds.toList())
        val accountByPlayerId = accounts.associateBy { it.playerId!! }

        // 5. Сброс участников к стартовому состоянию.
        masterPlayers.values.forEach { p ->
            val start = startingByPlayer[p.id] ?: p.rating
            p.rating = start
            p.gamesPlayed = 0
            p.lastMatchAt = null
            p.ntrp = Ntrp.fromRating(start)
        }
        accounts.forEach { acc ->
            acc.calibrationMatchesRemaining = if (acc.surveyCompleted) 30 else 0
            acc.calibrationEventsRemaining = if (acc.surveyCompleted) 3 else 0
        }

        // 6. Стираем ВСЕ changes и реплеим эвенты по порядку.
        ratingChangeRepo.deleteAll()
        prepared.forEach { p ->
            val evPlayerIds = p.matches.flatMap {
                listOf(it.teamAPlayer1Id!!, it.teamAPlayer2Id!!, it.teamBPlayer1Id!!, it.teamBPlayer2Id!!)
            }.toSet()
            val evPlayers: MutableMap<UUID, Player> = evPlayerIds.associateWith { masterPlayers[it]!! }.toMutableMap()
            val evAccounts = evPlayerIds.mapNotNull { accountByPlayerId[it] }
            val matchTime = p.event.date.atTime(p.event.startTime).toInstant(java.time.ZoneOffset.UTC)
            applyEventRatingPass(p.event, p.matches, p.sets, evPlayers, evAccounts, matchTime)
        }

        // 7. Нормализация сирот (не участвуют ни в одном FINISHED-матче).
        val orphans = playerRepo.findAll().filter { it.id !in participantIds }
        var normalized = 0
        val orphansToSave = mutableListOf<Player>()
        orphans.forEach { p ->
            var touched = false
            if (p.gamesPlayed != 0) { p.gamesPlayed = 0; touched = true }
            if (p.rating < 400 || p.rating > 2500) {
                p.rating = 1000; p.ntrp = Ntrp.fromRating(1000); touched = true
                log.info("[RECOMPUTE] сирота с мусорным рейтингом сброшен к 1000: {} ({})", p.name, p.id)
            }
            if (touched) { orphansToSave.add(p); normalized++ }
        }
        if (orphansToSave.isNotEmpty()) playerRepo.saveAll(orphansToSave)

        val changesWritten = ratingChangeRepo.count().toInt()
        return RecomputeAllSummary(
            eventsReplayed = prepared.size,
            playersReplayed = masterPlayers.size,
            changesWritten = changesWritten,
            orphansNormalized = normalized
        )
    }

    /**
     * Считает блоки для Telegram-поста результатов эвента (одинаково для finishEvent и
     * recomputeFinishedEvent): топ-3 по приросту рейтинга (bw-compat) и полную таблицу
     * лидеров по очкам (как в UI «Таблица лидеров»). Без побочных эффектов.
     */
    private fun buildEventResultsPayload(event: Event): Pair<List<FinishTopDto>, List<LeaderboardEntry>> {
        val eventId = event.id!!
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
        return top to leaderboard
    }

    /**
     * Собирает актуальный payload результатов завершённой игры для разового backfill
     * Telegram-постов (см. [TelegramResultsBackfillRunner]) и РЕШАЕТ, нужно ли редактировать
     * сообщение. Возвращает null — «редактировать нечего», editMessageText звать не надо:
     *  - события нет / оно не FINISHED (счёт ещё не финальный);
     *  - у события нет владельца (некуда/незачем слать);
     *  - нет ни одного сыгранного матча со счётом (пустой пост).
     * Иначе возвращает [EventResultsUpdatedNotify] с текущими top/leaderboard — тем же
     * payload, что уходит боту при штатной правке счёта (recomputeFinishedEvent).
     *
     * Чистое чтение (без @Transactional, без сайд-эффектов) — безопасно гонять пачкой.
     */
    fun buildResultsUpdatePayload(eventId: UUID): EventResultsUpdatedNotify? {
        val event = eventRepo.findById(eventId).orElse(null) ?: return null
        if (event.status != EventStatus.FINISHED) return null
        val ownerId = event.createdByUserId ?: return null

        val matches = matchRepo.findAllByEventId(eventId)
        val setsByMatch = matches.associate { it.id!! to scoreRepo.findAllByMatchIdOrderBySetNumberAsc(it.id!!) }
        val finishedMatches = matches.filter {
            it.status == MatchStatus.FINISHED && !setsByMatch[it.id!!].isNullOrEmpty()
        }
        if (finishedMatches.isEmpty()) return null

        val (top, leaderboard) = buildEventResultsPayload(event)
        return EventResultsUpdatedNotify(
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

    /**
     * Идемпотентный ПОЛНЫЙ пересчёт уже завершённого (FINISHED) эвента.
     *
     * Вызывается при правке счёта организатором в завершённом эвенте. В отличие от
     * старого поматчевого пересчёта прогоняет ВСЕ матчи эвента в порядке
     * (round, court) от pre-event базы каждого игрока (восстановленной из старых
     * rating_changes), пересоздаёт rating_changes этого эвента и КОРРЕКТИРУЕТ текущий
     * рейтинг игрока на дельту (newSum - oldSum), не сбрасывая накопленный за другие
     * эвенты прогресс.
     *
     * Отличия от [finishEvent] (намеренные — иначе пересчёт был бы не идемпотентен):
     *  - НЕ инкрементит gamesPlayed / lastMatchAt / calibrationMatchesRemaining /
     *    calibrationEventsRemaining;
     *  - kFactor / калибровка / нормировка берутся из СОХРАНЁННЫХ факторов старых
     *    rating_changes (V48) — т.е. те же, что применил finishEvent; fallback для
     *    legacy-записей без факторов — вывод от текущего состояния игрока;
     *  - прогон идёт в локальной мапе workRating, player.rating меняется только финальной
     *    коррекцией.
     */
    @Transactional
    fun recomputeFinishedEvent(event: Event) {
        if (event.status != EventStatus.FINISHED) return
        val eventId = event.id!!

        // 1. Старые changes (ДО удаления) — нужны и для oldSum, и для восстановления pre-event базы.
        val oldChanges = ratingChangeRepo.findAllByEventId(eventId)
        val oldSumByPlayer: Map<UUID, Int> = oldChanges
            .filter { it.playerId != null }
            .groupBy { it.playerId!! }
            .mapValues { (_, list) -> list.sumOf { it.delta } }

        // Факторы оригинального расчёта (V48+): пересчёт воспроизводит их как есть,
        // не выводя заново от текущего (уже изменившегося) состояния игрока.
        val storedK: Map<UUID, Double> = oldChanges
            .filter { it.matchId != null && it.kFactor != null }
            .groupBy { it.matchId!! }
            .mapValues { (_, list) -> list.first().kFactor!! }
        val storedCalib: Map<Pair<UUID, UUID>, Double> = oldChanges
            .filter { it.matchId != null && it.playerId != null && it.calibMult != null }
            .associate { (it.matchId!! to it.playerId!!) to it.calibMult!! }
        val storedNorm: Map<Pair<UUID, UUID>, Double> = oldChanges
            .filter { it.matchId != null && it.playerId != null && it.normFactor != null }
            .associate { (it.matchId!! to it.playerId!!) to it.normFactor!! }

        // 2. FINISHED-матчи эвента в порядке (roundNumber, courtNumber).
        val rounds = roundRepo.findAllByEventIdOrderByRoundNumberAsc(eventId)
        val roundNumberById: Map<UUID, Int> = rounds.associate { it.id!! to it.roundNumber }
        val allMatches = matchRepo.findAllByEventId(eventId)
        val setsByMatch = allMatches.associate { m -> m.id!! to scoreRepo.findAllByMatchIdOrderBySetNumberAsc(m.id!!) }
        val finishedMatches = allMatches
            .filter { it.status == MatchStatus.FINISHED && !setsByMatch[it.id!!].isNullOrEmpty() }
            .sortedWith(
                compareBy<Match> { roundNumberById[it.roundId] ?: Int.MAX_VALUE }
                    .thenBy { it.courtNumber }
            )

        // Порядковый индекс матча в прогоне — для восстановления pre-event рейтинга
        // (рейтинг игрока перед ПЕРВЫМ его матчем в этом порядке).
        val matchOrder: Map<UUID, Int> = finishedMatches.mapIndexed { idx, m -> m.id!! to idx }.toMap()

        val playerIds = finishedMatches.flatMap {
            listOf(it.teamAPlayer1Id!!, it.teamAPlayer2Id!!, it.teamBPlayer1Id!!, it.teamBPlayer2Id!!)
        }.toSet()
        val players = playerRepo.findAllById(playerIds).associateBy { it.id!! }
        val accounts = userRepo.findAllByPlayerIdIn(playerIds.toList())
        val calibrationByPlayer = accounts.associate { it.playerId!! to it.calibrationMatchesRemaining }

        // 4. pre-event рейтинг = oldRating ПЕРВОГО (по порядку round,court) матча игрока из старых changes.
        // Старые changes сматчиваем с порядком матчей; если у игрока их нет — берём текущий player.rating.
        val workRating: MutableMap<UUID, Int> = HashMap()
        val changesByPlayer = oldChanges.filter { it.playerId != null }.groupBy { it.playerId!! }
        playerIds.forEach { pid ->
            val pChanges = changesByPlayer[pid]
            val preEvent = pChanges
                ?.filter { it.matchId != null && matchOrder.containsKey(it.matchId) }
                ?.minByOrNull { matchOrder[it.matchId]!! }
                ?.oldRating
                ?: pChanges?.minByOrNull { it.createdAt ?: java.time.Instant.MAX }?.oldRating
                ?: players[pid]?.rating
                ?: 1000
            workRating[pid] = preEvent
        }

        // 3+5. normByPlayer — точно как finishEvent (fallback для legacy-записей без факторов).
        val matchCountByPlayer: Map<UUID, Int> = finishedMatches.flatMap {
            listOf(it.teamAPlayer1Id!!, it.teamAPlayer2Id!!, it.teamBPlayer1Id!!, it.teamBPlayer2Id!!)
        }.groupingBy { it }.eachCount()
        val avgMatches: Double = if (matchCountByPlayer.isEmpty()) 1.0 else matchCountByPlayer.values.average()
        val normByPlayer: Map<UUID, Double> = matchCountByPlayer.mapValues { (_, count) ->
            if (count == 0) 1.0
            else (avgMatches / count.toDouble()).coerceIn(EloRating.NORM_MIN, EloRating.NORM_MAX)
        }

        // kFactor-fallback для legacy-записей: от текущего gamesPlayed (уже включает эвент).
        val gamesByPlayer: Map<UUID, Int> = playerIds.associateWith { players[it]?.gamesPlayed ?: 0 }

        val newChanges = mutableListOf<RatingChange>()
        val newSumByPlayer: MutableMap<UUID, Int> = HashMap()
        playerIds.forEach { newSumByPlayer[it] = 0 }

        finishedMatches.forEach { m ->
            val sets = setsByMatch[m.id!!]!!.sortedBy { it.setNumber }
            val a1 = m.teamAPlayer1Id!!
            val a2 = m.teamAPlayer2Id!!
            val b1 = m.teamBPlayer1Id!!
            val b2 = m.teamBPlayer2Id!!

            val teamARating = EloRating.teamRating(workRating[a1]!!, workRating[a2]!!)
            val teamBRating = EloRating.teamRating(workRating[b1]!!, workRating[b2]!!)
            val kTeam = storedK[m.id!!]
                ?: (
                    EloRating.kFactor(gamesByPlayer[a1] ?: 0) +
                        EloRating.kFactor(gamesByPlayer[a2] ?: 0) +
                        EloRating.kFactor(gamesByPlayer[b1] ?: 0) +
                        EloRating.kFactor(gamesByPlayer[b2] ?: 0)
                    ) / 4.0

            val deltaTeamA = computeTeamADelta(event, sets, teamARating, teamBRating, kTeam)

            applyDeltaWork(eventId, m.id!!, a1, a2, deltaTeamA, kTeam, calibrationByPlayer, normByPlayer, storedCalib, storedNorm, workRating, newChanges, newSumByPlayer)
            applyDeltaWork(eventId, m.id!!, b1, b2, -deltaTeamA, kTeam, calibrationByPlayer, normByPlayer, storedCalib, storedNorm, workRating, newChanges, newSumByPlayer)
        }

        // 6. Заменяем changes этого эвента.
        ratingChangeRepo.deleteAllByEventId(eventId)
        ratingChangeRepo.saveAll(newChanges)

        // 7. Коррекция текущего рейтинга: player.rating += (newSum - oldSum). НЕ сбрасываем на pre-event.
        val playersToSave = mutableListOf<Player>()
        playerIds.forEach { pid ->
            val p = players[pid] ?: return@forEach
            val newSum = newSumByPlayer[pid] ?: 0
            val oldSum = oldSumByPlayer[pid] ?: 0
            val corrected = (p.rating + (newSum - oldSum)).coerceAtLeast(0)
            p.rating = corrected
            p.ntrp = Ntrp.fromRating(corrected)
            playersToSave.add(p)
        }
        playerRepo.saveAll(playersToSave)

        // 8. Пересоздаём UserRatingNotification по этому эвенту: newRating = текущий рейтинг (после коррекции),
        // delta = newSum (суммарный прирост за эвент).
        accounts.forEach { acc ->
            val pid = acc.playerId ?: return@forEach
            val p = players[pid] ?: return@forEach
            val newSum = newSumByPlayer[pid] ?: 0
            val existing = ratingNotificationRepo.findByUserIdAndEventId(acc.id!!, eventId)
            val notif = existing ?: com.padelgo.domain.UserRatingNotification(userId = acc.id!!, eventId = eventId)
            notif.newRating = p.rating
            notif.delta = newSum
            notif.seenAt = null
            ratingNotificationRepo.save(notif)
        }

        // 9. Telegram: обновляем уже опубликованный пост результатов.
        val ownerId = event.createdByUserId
        if (ownerId != null) {
            try {
                val (top, leaderboard) = buildEventResultsPayload(event)
                val payload = EventResultsUpdatedNotify(
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
                    try { botClient.notifyEventResultsUpdated(payload) }
                    catch (e: Exception) { log.warn("Failed to notify bot about RESULTS UPDATED: {}", e.message) }
                }
            } catch (e: Exception) {
                log.warn("Failed to compute Telegram RESULTS UPDATED payload: {}", e.message)
            }
        }
    }

    /**
     * Чистый расчёт дельты команды A для матча (без побочных эффектов) — общий для
     * finishEvent и idempotent-пересчёта. Дробная: округление один раз в самом конце
     * конвейера (в applyDelta*, после калибровки и нормировки).
     */
    internal fun computeTeamADelta(
        event: Event,
        sets: List<MatchSetScore>,
        teamARating: Int,
        teamBRating: Int,
        kTeam: Double
    ): Double {
        val scoreA = scoreAFromSets(event.scoringMode, sets)
        val (teamAPoints, teamBPoints, expectedTotal) = when (event.scoringMode) {
            ScoringMode.POINTS -> {
                val s1 = sets.first()
                Triple(s1.teamAGames, s1.teamBGames, event.pointsPerPlayerPerMatch * 4)
            }
            ScoringMode.SETS -> {
                val totalA = sets.sumOf { it.teamAGames }
                val totalB = sets.sumOf { it.teamBGames }
                // Максимум геймов ОДНОЙ команды (а не обеих): раньше ×2 ограничивал
                // ratio ≤ 0.5, и margin-множитель в SETS не мог превысить 1.125.
                val maxGames = event.gamesPerSet * event.setsPerMatch
                Triple(totalA, totalB, maxOf(maxGames, 1))
            }
        }
        val marginMult = EloRating.marginMultiplier(teamAPoints, teamBPoints, expectedTotal)
        return EloRating.teamDelta(teamARating, teamBRating, kTeam, scoreA) * marginMult
    }

    /**
     * Аналог [applyDelta]/[applyDeltaSingle], но пишущий в локальную мапу workRating и
     * аккумулирующий новые RatingChange + newSum (не трогая player.rating). Множители
     * берутся из сохранённых факторов оригинального расчёта (storedCalib/storedNorm);
     * fallback для legacy-записей — вывод от текущего состояния игрока.
     */
    private fun applyDeltaWork(
        eventId: UUID,
        matchId: UUID,
        p1: UUID,
        p2: UUID,
        deltaTeam: Double,
        kTeam: Double,
        calibrationByPlayer: Map<UUID, Int>,
        normByPlayer: Map<UUID, Double>,
        storedCalib: Map<Pair<UUID, UUID>, Double>,
        storedNorm: Map<Pair<UUID, UUID>, Double>,
        workRating: MutableMap<UUID, Int>,
        newChanges: MutableList<RatingChange>,
        newSumByPlayer: MutableMap<UUID, Int>
    ) {
        listOf(p1, p2).forEach { pid ->
            val calib = storedCalib[matchId to pid]
                ?: if ((calibrationByPlayer[pid] ?: 0) > 0) EloRating.CALIBRATION_MULTIPLIER else 1.0
            val norm = storedNorm[matchId to pid] ?: normByPlayer[pid] ?: 1.0
            val delta = kotlin.math.round(deltaTeam * calib * norm).toInt()
            val old = workRating[pid] ?: 0
            val newRating = (old + delta).coerceAtLeast(0)
            workRating[pid] = newRating
            // Фактически применённая дельта (как в applyDeltaSingle) — old+delta == new.
            val applied = newRating - old
            newSumByPlayer[pid] = (newSumByPlayer[pid] ?: 0) + applied
            newChanges.add(
                RatingChange(
                    eventId = eventId,
                    matchId = matchId,
                    playerId = pid,
                    oldRating = old,
                    delta = applied,
                    newRating = newRating,
                    kFactor = kTeam,
                    calibMult = calib,
                    normFactor = norm
                )
            )
        }
    }

    private fun applyDelta(
        eventId: UUID,
        matchId: UUID,
        p1: Player,
        p2: Player,
        deltaTeam: Double,
        kTeam: Double,
        calibByPlayer: Map<UUID, Double>,
        normByPlayer: Map<UUID, Double>
    ) {
        // Каждый игрок пары получает ПОЛНУЮ командную дельту (классический team-Elo).
        // Старый делёж пополам занижал апсеты вдвое и рождал нули на нечётных дельтах.
        listOf(p1, p2).forEach { p ->
            val calib = calibByPlayer[p.id] ?: 1.0
            val norm = normByPlayer[p.id] ?: 1.0
            // round() — от нуля при .5 (roundToInt тянет к +∞: +2.5→3, но −2.5→−2,
            // что ломало симметрию победителей/проигравших).
            val delta = kotlin.math.round(deltaTeam * calib * norm).toInt()
            applyDeltaSingle(eventId, matchId, p, delta, kTeam, calib, norm)
        }
    }

    private fun applyDeltaSingle(
        eventId: UUID,
        matchId: UUID,
        p: Player,
        delta: Int,
        kTeam: Double,
        calib: Double,
        norm: Double
    ) {
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
                // Фактически применённая дельта: у пола 0 запрошенная и применённая
                // расходятся, а суммы по changes должны сходиться с рейтингом.
                delta = newRating - old,
                newRating = newRating,
                kFactor = kTeam,
                calibMult = calib,
                normFactor = norm
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
            val teamPlayerInfos = myIds.mapNotNull { id -> playersById[id]?.let { MatchPlayerInfo(it.name, com.padelgo.api.AvatarLinks.publicUrl(it.id, it.avatarUrl)) } }
            val opponentPlayerInfos = oppIds.mapNotNull { id -> playersById[id]?.let { MatchPlayerInfo(it.name, com.padelgo.api.AvatarLinks.publicUrl(it.id, it.avatarUrl)) } }
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

        // Батч вместо N+1: счёт и драфты всех матчей грузим двумя запросами, а не по одному на матч.
        val matchIds = matches.map { it.matchId }
        val scoresByMatch = scoreRepo.findAllByMatchIdInOrderBySetNumberAsc(matchIds).groupBy { it.matchId }
        val draftByMatch = draftScoreRepo.findAllByMatchIdIn(matchIds).associateBy { it.matchId }

        // Батч вместо N+1: регистрации всех эвентов одним запросом, имена игроков — одним.
        val regsByEvent = regRepo.findAllByEventIdInAndStatus(eventIds).groupBy { it.eventId }
        val regPlayersById = playerRepo
            .findAllById(regsByEvent.values.flatten().mapNotNull { it.playerId }.toSet())
            .associateBy { it.id!! }
        val participantsByEvent = eventIds.associateWith { eid ->
            regsByEvent[eid].orEmpty().mapNotNull { regPlayersById[it.playerId]?.name }.sorted()
        }

        return matches
            .groupBy { it.eventId }
            .mapNotNull { (eventId, items) ->
                val e = events[eventId] ?: return@mapNotNull null
                val totalPoints = if (e.scoringMode == ScoringMode.POINTS) {
                    items.sumOf { item ->
                        // Сначала пытаемся прочитать финальный счёт (MatchSetScore), потом fallback на драфт —
                        // иначе после submitScore (драфт удалён) totalPoints не считается.
                        // isTeamA уже посчитан в PlayerMatchHistoryItem — повторный matchRepo.findById не нужен.
                        val finalScore = scoresByMatch[item.matchId]?.firstOrNull()
                        val isTeamA = item.isTeamA
                        if (finalScore != null) {
                            if (isTeamA) finalScore.teamAGames else finalScore.teamBGames
                        } else {
                            draftByMatch[item.matchId]?.let { ds ->
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

        // Матчевые изменения сворачиваем в одну точку на эвент (последнее изменение эвента);
        // decay-изменения (kind=DECAY, eventId=null) идут отдельными точками. Сортируем всё
        // по createdAt — при глобальном пересчёте это порядок реплея (хронологический),
        // decay-записи всегда позже своих матчей.
        val matchChanges = changes.filter { it.eventId != null }
        val decayChanges = changes.filter { it.kind == com.padelgo.domain.RatingChangeKind.DECAY }

        data class Step(val at: java.time.Instant, val change: RatingChange, val isDecay: Boolean)
        val steps = mutableListOf<Step>()
        matchChanges.groupBy { it.eventId!! }.forEach { (_, list) ->
            val rep = list.maxByOrNull { it.createdAt ?: java.time.Instant.MIN }!!
            steps.add(Step(rep.createdAt ?: java.time.Instant.MIN, rep, isDecay = false))
        }
        decayChanges.forEach { c -> steps.add(Step(c.createdAt ?: java.time.Instant.MIN, c, isDecay = true)) }
        steps.sortBy { it.at }
        if (steps.isEmpty()) return emptyList()

        val result = mutableListOf<RatingHistoryPoint>()
        val firstChange = steps.first().change
        result.add(
            RatingHistoryPoint(
                date = events[firstChange.eventId]?.date?.toString() ?: firstChange.createdAt!!.toString(),
                rating = firstChange.oldRating,
                delta = null,
                eventId = null,
                kind = "MATCH"
            )
        )
        steps.forEach { s ->
            val c = s.change
            result.add(
                RatingHistoryPoint(
                    date = if (s.isDecay) (c.createdAt?.toString() ?: "")
                    else events[c.eventId]?.date?.toString() ?: c.createdAt!!.toString(),
                    rating = c.newRating,
                    delta = c.delta,
                    eventId = c.eventId,
                    kind = if (s.isDecay) "DECAY" else "MATCH"
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
    @Schema(description = "UUID игры, после которой изменился рейтинг. null для начальной точки и для decay")
    val eventId: UUID?,
    @Schema(description = "Тип точки: MATCH — начисление за игру, DECAY — затухание при простое")
    val kind: String = "MATCH"
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

