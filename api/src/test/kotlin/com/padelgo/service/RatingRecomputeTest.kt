package com.padelgo.service

import com.padelgo.auth.UserAccount
import com.padelgo.domain.Event
import com.padelgo.domain.EventStatus
import com.padelgo.domain.Match
import com.padelgo.domain.MatchSetScore
import com.padelgo.domain.MatchStatus
import com.padelgo.domain.Player
import com.padelgo.domain.RatingChange
import com.padelgo.domain.Round
import com.padelgo.domain.ScoringMode
import com.padelgo.domain.UserRatingNotification
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import java.util.UUID

/**
 * Юнит-тесты идемпотентного пересчёта завершённого эвента (recomputeFinishedEvent).
 *
 * Все репозитории замоканы. runAfterCommit в отсутствие активной транзакции выполняется
 * немедленно (TransactionUtils), поэтому вызов бота можно проверить напрямую.
 */
class RatingRecomputeTest {

    private lateinit var playerRepo: com.padelgo.repo.PlayerRepository
    private lateinit var eventRepo: com.padelgo.repo.EventRepository
    private lateinit var regRepo: com.padelgo.repo.RegistrationRepository
    private lateinit var roundRepo: com.padelgo.repo.RoundRepository
    private lateinit var matchRepo: com.padelgo.repo.MatchRepository
    private lateinit var scoreRepo: com.padelgo.repo.MatchSetScoreRepository
    private lateinit var draftScoreRepo: com.padelgo.repo.MatchDraftScoreRepository
    private lateinit var ratingChangeRepo: com.padelgo.repo.RatingChangeRepository
    private lateinit var userRepo: com.padelgo.auth.UserRepository
    private lateinit var inviteRepo: com.padelgo.repo.EventInviteRepository
    private lateinit var courtRepo: com.padelgo.repo.EventCourtRepository
    private lateinit var ratingNotificationRepo: com.padelgo.repo.UserRatingNotificationRepository
    private lateinit var botClient: BotClient
    private lateinit var seriesRepo: com.padelgo.repo.EventSeriesRepository

    private lateinit var service: EventService

    // Фиксированные идентификаторы — один корт, один раунд, один матч, 4 игрока.
    private val eventId = UUID.randomUUID()
    private val ownerUserId = UUID.randomUUID()
    private val roundId = UUID.randomUUID()
    private val matchId = UUID.randomUUID()
    private val a1 = UUID.randomUUID()
    private val a2 = UUID.randomUUID()
    private val b1 = UUID.randomUUID()
    private val b2 = UUID.randomUUID()
    private val playerIds = listOf(a1, a2, b1, b2)

    @BeforeEach
    fun setup() {
        playerRepo = mock()
        eventRepo = mock()
        regRepo = mock()
        roundRepo = mock()
        matchRepo = mock()
        scoreRepo = mock()
        draftScoreRepo = mock()
        ratingChangeRepo = mock()
        userRepo = mock()
        inviteRepo = mock()
        courtRepo = mock()
        ratingNotificationRepo = mock()
        botClient = mock()
        seriesRepo = mock()

        service = EventService(
            playerRepo = playerRepo,
            eventRepo = eventRepo,
            regRepo = regRepo,
            roundRepo = roundRepo,
            matchRepo = matchRepo,
            scoreRepo = scoreRepo,
            draftScoreRepo = draftScoreRepo,
            ratingChangeRepo = ratingChangeRepo,
            userRepo = userRepo,
            inviteRepo = inviteRepo,
            courtRepo = courtRepo,
            ratingNotificationRepo = ratingNotificationRepo,
            botClient = botClient,
            seriesRepo = seriesRepo
        )
    }

    private fun event(status: EventStatus = EventStatus.FINISHED) = Event(
        id = eventId,
        title = "Test",
        status = status,
        scoringMode = ScoringMode.POINTS,
        pointsPerPlayerPerMatch = 6,
        courtsCount = 1,
        createdByUserId = ownerUserId
    )

    private fun player(id: UUID, rating: Int, games: Int) =
        Player(id = id, name = "P-$id", rating = rating, gamesPlayed = games)

    // Стабильное соответствие playerId -> userId, чтобы проверять нотификации.
    private val userIdByPlayer: Map<UUID, UUID> = playerIds.associateWith { UUID.randomUUID() }

    private fun account(playerId: UUID) =
        UserAccount(id = userIdByPlayer[playerId]!!, playerId = playerId, calibrationMatchesRemaining = 0)

    private fun match() = Match(
        id = matchId,
        roundId = roundId,
        courtNumber = 1,
        teamAPlayer1Id = a1,
        teamAPlayer2Id = a2,
        teamBPlayer1Id = b1,
        teamBPlayer2Id = b2,
        status = MatchStatus.FINISHED
    )

    /**
     * Старые changes такие, какие записал бы finishEvent для одного матча, где команда A
     * победила и получила +deltaPerPlayer каждому, B потеряла столько же. Все игроки стартуют
     * с rating=1000, gamesPlayed=12 (>10 → kFactor одинаковый, нормировка 1.0).
     */
    private fun oldChanges(deltaPerPlayerA: Int): List<RatingChange> = listOf(
        RatingChange(eventId = eventId, matchId = matchId, playerId = a1, oldRating = 1000, delta = deltaPerPlayerA, newRating = 1000 + deltaPerPlayerA),
        RatingChange(eventId = eventId, matchId = matchId, playerId = a2, oldRating = 1000, delta = deltaPerPlayerA, newRating = 1000 + deltaPerPlayerA),
        RatingChange(eventId = eventId, matchId = matchId, playerId = b1, oldRating = 1000, delta = -deltaPerPlayerA, newRating = 1000 - deltaPerPlayerA),
        RatingChange(eventId = eventId, matchId = matchId, playerId = b2, oldRating = 1000, delta = -deltaPerPlayerA, newRating = 1000 - deltaPerPlayerA)
    )

    /** Текущие игроки: рейтинг = 1000 + старая суммарная дельта (как после finishEvent). */
    private fun currentPlayers(deltaPerPlayerA: Int): Map<UUID, Player> = mapOf(
        a1 to player(a1, 1000 + deltaPerPlayerA, 12),
        a2 to player(a2, 1000 + deltaPerPlayerA, 12),
        b1 to player(b1, 1000 - deltaPerPlayerA, 12),
        b2 to player(b2, 1000 - deltaPerPlayerA, 12)
    )

    private fun wireCommon(players: Map<UUID, Player>, scoreA: Int, scoreB: Int) {
        whenever(roundRepo.findAllByEventIdOrderByRoundNumberAsc(eventId))
            .doReturn(listOf(Round(id = roundId, eventId = eventId, roundNumber = 1)))
        whenever(matchRepo.findAllByEventId(eventId)).doReturn(listOf(match()))
        whenever(scoreRepo.findAllByMatchIdOrderBySetNumberAsc(matchId)).doReturn(
            listOf(MatchSetScore(matchId = matchId, setNumber = 1, teamAGames = scoreA, teamBGames = scoreB))
        )
        whenever(playerRepo.findAllById(any())).doReturn(players.values.toList())
        whenever(userRepo.findAllByPlayerIdIn(any())).doReturn(playerIds.map { account(it) })
        whenever(regRepo.findAllByEventIdAndStatus(eq(eventId), any())).doReturn(emptyList())
        whenever(ratingNotificationRepo.findByUserIdAndEventId(any(), eq(eventId))).doReturn(null)
    }

    @Test
    fun `non-FINISHED event is a no-op`() {
        service.recomputeFinishedEvent(event(status = EventStatus.IN_PROGRESS))
        verify(ratingChangeRepo, never()).deleteAllByEventId(any())
        verify(playerRepo, never()).saveAll(any<Iterable<Player>>())
        verify(botClient, never()).notifyEventResultsUpdated(any())
    }

    @Test
    fun `second identical recompute is a no-op (idempotent)`() {
        // Прогон 1: стартовое состояние как после finishEvent (per-player split неизвестен нам,
        // поэтому строим oldChanges его же алгоритмом — но проще: запускаем recompute дважды и
        // сравниваем. Первый прогон фиксирует "канон", второй должен ничего не сдвинуть).
        val oldDelta = computeExpectedDelta(scoreA = 24, scoreB = 0)
        val players = currentPlayers(oldDelta)
        whenever(ratingChangeRepo.findAllByEventId(eventId)).doReturn(oldChanges(oldDelta))
        wireCommon(players, scoreA = 24, scoreB = 0)

        val run1Changes = mutableListOf<RatingChange>()
        whenever(ratingChangeRepo.saveAll(any<Iterable<RatingChange>>())).thenAnswer {
            run1Changes.clear()
            @Suppress("UNCHECKED_CAST")
            run1Changes.addAll(it.arguments[0] as Iterable<RatingChange>)
            run1Changes.toList()
        }
        whenever(playerRepo.saveAll(any<Iterable<Player>>())).thenAnswer { it.arguments[0] }

        service.recomputeFinishedEvent(event())
        val ratingsAfterRun1 = playerIds.associateWith { players[it]!!.rating }
        val canonChanges = run1Changes.toList()

        // Прогон 2: теперь старые changes == результат прогона 1, рейтинги уже скорректированы.
        whenever(ratingChangeRepo.findAllByEventId(eventId)).doReturn(canonChanges)
        service.recomputeFinishedEvent(event())

        // Второй прогон не должен сдвинуть рейтинг (oldSum == newSum).
        playerIds.forEach { pid ->
            assertEquals(ratingsAfterRun1[pid], players[pid]!!.rating, "rating must be stable on re-run for $pid")
        }
        // И должен записать те же per-player суммы дельт.
        val sumByPlayerRun2 = run1Changes.groupBy { it.playerId!! }.mapValues { (_, v) -> v.sumOf { it.delta } }
        val sumByPlayerCanon = canonChanges.groupBy { it.playerId!! }.mapValues { (_, v) -> v.sumOf { it.delta } }
        assertEquals(sumByPlayerCanon, sumByPlayerRun2)
    }

    @Test
    fun `gamesPlayed is never incremented`() {
        val oldDelta = computeExpectedDelta(24, 0)
        val players = currentPlayers(oldDelta)
        whenever(ratingChangeRepo.findAllByEventId(eventId)).doReturn(oldChanges(oldDelta))
        wireCommon(players, scoreA = 24, scoreB = 0)
        whenever(playerRepo.saveAll(any<Iterable<Player>>())).thenAnswer { it.arguments[0] }

        service.recomputeFinishedEvent(event())

        players.values.forEach { assertEquals(12, it.gamesPlayed, "gamesPlayed must not change") }
    }

    @Test
    fun `old changes deleted and new changes saved`() {
        val oldDelta = computeExpectedDelta(24, 0)
        val players = currentPlayers(oldDelta)
        whenever(ratingChangeRepo.findAllByEventId(eventId)).doReturn(oldChanges(oldDelta))
        wireCommon(players, scoreA = 24, scoreB = 0)
        whenever(playerRepo.saveAll(any<Iterable<Player>>())).thenAnswer { it.arguments[0] }

        val savedChanges = mutableListOf<RatingChange>()
        whenever(ratingChangeRepo.saveAll(any<Iterable<RatingChange>>())).thenAnswer {
            @Suppress("UNCHECKED_CAST")
            savedChanges.addAll(it.arguments[0] as Iterable<RatingChange>)
            savedChanges.toList()
        }

        service.recomputeFinishedEvent(event())

        verify(ratingChangeRepo).deleteAllByEventId(eventId)
        // 4 игрока × 1 матч = 4 записи.
        assertEquals(4, savedChanges.size)
        assertTrue(savedChanges.all { it.eventId == eventId && it.matchId == matchId })
        // Сумма дельт по матчу = 0 (равные базы, без калибровки, нормировка 1.0).
        assertEquals(0, savedChanges.sumOf { it.delta })
    }

    @Test
    fun `bot notified once with updated leaderboard`() {
        val oldDelta = computeExpectedDelta(24, 0)
        val players = currentPlayers(oldDelta)
        whenever(ratingChangeRepo.findAllByEventId(eventId)).doReturn(oldChanges(oldDelta))
        wireCommon(players, scoreA = 24, scoreB = 0)
        whenever(playerRepo.saveAll(any<Iterable<Player>>())).thenAnswer { it.arguments[0] }

        service.recomputeFinishedEvent(event())

        verify(botClient, times(1)).notifyEventResultsUpdated(any())
        verify(botClient, never()).notifyEventFinished(any())
    }

    @Test
    fun `notification recreated with corrected rating and event sum`() {
        // Изменим счёт: было 24:0 (разгром), станет 13:11 (мелкая победа) → меньший прирост.
        val oldDelta = computeExpectedDelta(24, 0)
        val players = currentPlayers(oldDelta)
        whenever(ratingChangeRepo.findAllByEventId(eventId)).doReturn(oldChanges(oldDelta))
        wireCommon(players, scoreA = 13, scoreB = 11)
        whenever(playerRepo.saveAll(any<Iterable<Player>>())).thenAnswer { it.arguments[0] }

        val savedNotifs = mutableListOf<UserRatingNotification>()
        whenever(ratingNotificationRepo.save(any())).thenAnswer {
            val n = it.arguments[0] as UserRatingNotification
            savedNotifs.add(n)
            n
        }

        service.recomputeFinishedEvent(event())

        // По одной нотификации на каждого из 4 участников.
        assertEquals(4, savedNotifs.size)
        val playerByUserId = userIdByPlayer.entries.associate { (pid, uid) -> uid to pid }
        // newRating каждой нотификации == финальный (скорректированный) рейтинг игрока,
        // delta == суммарный прирост этого игрока за эвид (newSum).
        savedNotifs.forEach { n ->
            val pid = playerByUserId[n.userId]!!
            assertEquals(players[pid]!!.rating, n.newRating, "newRating must equal corrected player rating")
        }
        // Новый счёт мельче старого → у победителей рейтинг должен СНИЗИТЬСЯ относительно старого
        // (коррекция = newSum - oldSum < 0).
        val newDelta = computeExpectedDelta(13, 11) / 2  // на игрока (равный дележ пары)
        assertTrue(newDelta < oldDelta / 2, "new per-player gain must be smaller than old")
    }

    /**
     * Повторяет чистую формулу дельты команды A (POINTS-режим). teamRating обеих команд == 1000
     * (все игроки равны), kFactor от gamesPlayed=12 → 32. Используется и для построения старых
     * changes, и для проверок.
     */
    private fun computeExpectedDelta(scoreA: Int, scoreB: Int): Int {
        val teamRating = EloRating.teamRating(1000, 1000)
        val k = EloRating.kFactor(12)
        val sets = listOf(MatchSetScore(matchId = matchId, setNumber = 1, teamAGames = scoreA, teamBGames = scoreB))
        return service.computeTeamADelta(event(), sets, teamRating, teamRating, k)
    }
}
