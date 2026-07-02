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
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import java.util.Optional
import java.util.UUID

/**
 * Юнит-тесты боевого пути начисления рейтинга — finishEvent.
 *
 * Проверяемые инварианты (фиксы 2026-07-02):
 *  - каждый игрок пары получает ПОЛНУЮ командную дельту (без дележа пополам);
 *  - сумма дельт матча без калибровки = 0 (zero-sum);
 *  - калибровка ×1.5 действует ровно до исчерпания calibrationMatchesRemaining,
 *    даже если оно случилось в середине эвента;
 *  - finishEvent → recomputeFinishedEvent на тех же данных — no-op (факторы
 *    k/calib/norm сохраняются в rating_changes и воспроизводятся пересчётом).
 */
class FinishEventRatingTest {

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

    private val eventId = UUID.randomUUID()
    private val ownerUserId = UUID.randomUUID()
    private val round1Id = UUID.randomUUID()
    private val round2Id = UUID.randomUUID()
    private val match1Id = UUID.randomUUID()
    private val match2Id = UUID.randomUUID()
    private val a1 = UUID.randomUUID()
    private val a2 = UUID.randomUUID()
    private val b1 = UUID.randomUUID()
    private val b2 = UUID.randomUUID()
    private val playerIds = listOf(a1, a2, b1, b2)
    private val userIdByPlayer: Map<UUID, UUID> = playerIds.associateWith { UUID.randomUUID() }

    /** Все RatingChange, записанные через save() (finishEvent) и saveAll() (recompute). */
    private val savedChanges = mutableListOf<RatingChange>()

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

        savedChanges.clear()
        whenever(ratingChangeRepo.save(any())).thenAnswer {
            val c = it.arguments[0] as RatingChange
            savedChanges.add(c)
            c
        }
        whenever(ratingChangeRepo.saveAll(any<Iterable<RatingChange>>())).thenAnswer { inv ->
            @Suppress("UNCHECKED_CAST")
            val list = (inv.arguments[0] as Iterable<RatingChange>).toList()
            savedChanges.addAll(list)
            list
        }
        // saveAll получает Collection (players.values) — приводим к List, иначе CCE в моке.
        whenever(playerRepo.saveAll(any<Iterable<Player>>())).thenAnswer { inv ->
            @Suppress("UNCHECKED_CAST")
            (inv.arguments[0] as Iterable<Player>).toList()
        }
        whenever(userRepo.saveAll(any<Iterable<UserAccount>>())).thenAnswer { inv ->
            @Suppress("UNCHECKED_CAST")
            (inv.arguments[0] as Iterable<UserAccount>).toList()
        }
        whenever(regRepo.findAllByEventIdAndStatus(eq(eventId), any())).doReturn(emptyList())
        whenever(ratingNotificationRepo.findByUserIdAndEventId(any(), eq(eventId))).doReturn(null)
    }

    private fun event(status: EventStatus = EventStatus.IN_PROGRESS) = Event(
        id = eventId,
        title = "Test",
        status = status,
        scoringMode = ScoringMode.POINTS,
        pointsPerPlayerPerMatch = 6,
        courtsCount = 1,
        createdByUserId = ownerUserId
    )

    private fun match(id: UUID, roundId: UUID) = Match(
        id = id,
        roundId = roundId,
        courtNumber = 1,
        teamAPlayer1Id = a1,
        teamAPlayer2Id = a2,
        teamBPlayer1Id = b1,
        teamBPlayer2Id = b2,
        status = MatchStatus.FINISHED
    )

    private fun wire(
        players: Map<UUID, Player>,
        matches: List<Match>,
        scoresByMatch: Map<UUID, Pair<Int, Int>>,
        calibrationByPlayer: Map<UUID, Int> = emptyMap()
    ): Event {
        val ev = event()
        whenever(eventRepo.findById(eventId)).doReturn(Optional.of(ev))
        whenever(eventRepo.save(any())).thenAnswer { it.arguments[0] }
        whenever(roundRepo.findAllByEventIdOrderByRoundNumberAsc(eventId)).doReturn(
            listOf(
                Round(id = round1Id, eventId = eventId, roundNumber = 1),
                Round(id = round2Id, eventId = eventId, roundNumber = 2)
            )
        )
        whenever(matchRepo.findAllByEventId(eventId)).doReturn(matches)
        scoresByMatch.forEach { (mid, score) ->
            whenever(scoreRepo.findAllByMatchIdOrderBySetNumberAsc(mid)).doReturn(
                listOf(MatchSetScore(matchId = mid, setNumber = 1, teamAGames = score.first, teamBGames = score.second))
            )
        }
        whenever(playerRepo.findAllById(any())).doReturn(players.values.toList())
        whenever(userRepo.findAllByPlayerIdIn(any())).doReturn(
            playerIds.map {
                UserAccount(
                    id = userIdByPlayer[it]!!,
                    playerId = it,
                    calibrationMatchesRemaining = calibrationByPlayer[it] ?: 0
                )
            }
        )
        return ev
    }

    @Test
    fun `апсет - каждый игрок получает полную командную дельту, сумма матча ноль`() {
        // A (1300+1300) обыгрывает B (1700+1700) 16:8. Все опытные (K=20).
        val players = mapOf(
            a1 to Player(id = a1, name = "a1", rating = 1300, gamesPlayed = 50),
            a2 to Player(id = a2, name = "a2", rating = 1300, gamesPlayed = 50),
            b1 to Player(id = b1, name = "b1", rating = 1700, gamesPlayed = 50),
            b2 to Player(id = b2, name = "b2", rating = 1700, gamesPlayed = 50)
        )
        wire(players, listOf(match(match1Id, round1Id)), mapOf(match1Id to (16 to 8)))

        service.finishEvent(eventId, ownerUserId)

        assertEquals(4, savedChanges.size)
        // Полная командная дельта: round(20 × (1 − 1/11) × margin(16:8)) = 19 каждому.
        val expected = kotlin.math.round(
            EloRating.teamDelta(1300, 1700, 20.0, 1.0) * EloRating.marginMultiplier(16, 8, 24)
        ).toInt()
        assertTrue(expected >= 19, "полная дельта апсета, а не половина: $expected")
        listOf(a1, a2).forEach { pid ->
            assertEquals(expected, savedChanges.first { it.playerId == pid }.delta, "победитель $pid")
        }
        listOf(b1, b2).forEach { pid ->
            assertEquals(-expected, savedChanges.first { it.playerId == pid }.delta, "проигравший $pid")
        }
        assertEquals(0, savedChanges.sumOf { it.delta }, "zero-sum")
        // Рейтинги применены.
        assertEquals(1300 + expected, players[a1]!!.rating)
        assertEquals(1700 - expected, players[b1]!!.rating)
    }

    @Test
    fun `калибровка перестаёт действовать после исчерпания в середине эвента`() {
        // a1 калибруется с остатком 1: матч 1 — ×1.5, матч 2 — уже ×1.0.
        val players = playerIds.associateWith { Player(id = it, name = "p", rating = 1400, gamesPlayed = 50) }
        wire(
            players,
            listOf(match(match1Id, round1Id), match(match2Id, round2Id)),
            mapOf(match1Id to (16 to 8), match2Id to (8 to 16)),
            calibrationByPlayer = mapOf(a1 to 1)
        )

        service.finishEvent(eventId, ownerUserId)

        val a1Match1 = savedChanges.first { it.playerId == a1 && it.matchId == match1Id }
        val a1Match2 = savedChanges.first { it.playerId == a1 && it.matchId == match2Id }
        assertEquals(EloRating.CALIBRATION_MULTIPLIER, a1Match1.calibMult)
        assertEquals(1.0, a1Match2.calibMult)
        // У остальных множитель 1.0 всегда.
        assertTrue(savedChanges.filter { it.playerId != a1 }.all { it.calibMult == 1.0 })
    }

    @Test
    fun `finish затем recompute тех же данных - no-op`() {
        // Разные K (a1 новичок: 8 игр → K=48, остальные 50 → K=20) + калибровка a1.
        // После finishEvent gamesPlayed a1 = 10 (уже другой K-бакет), калибровка исчерпана —
        // recompute обязан взять сохранённые факторы, а не выводить заново.
        val players = mapOf(
            a1 to Player(id = a1, name = "a1", rating = 1250, gamesPlayed = 8),
            a2 to Player(id = a2, name = "a2", rating = 1450, gamesPlayed = 50),
            b1 to Player(id = b1, name = "b1", rating = 1500, gamesPlayed = 50),
            b2 to Player(id = b2, name = "b2", rating = 1350, gamesPlayed = 50)
        )
        val ev = wire(
            players,
            listOf(match(match1Id, round1Id), match(match2Id, round2Id)),
            mapOf(match1Id to (14 to 10), match2Id to (5 to 19)),
            calibrationByPlayer = mapOf(a1 to 1)
        )

        service.finishEvent(eventId, ownerUserId)
        assertEquals(EventStatus.FINISHED, ev.status)

        val finishChanges = savedChanges.toList()
        val ratingsAfterFinish = playerIds.associateWith { players[it]!!.rating }

        // Пересчёт без правки счёта: старые changes = то, что записал finishEvent.
        savedChanges.clear()
        whenever(ratingChangeRepo.findAllByEventId(eventId)).doReturn(finishChanges)
        service.recomputeFinishedEvent(ev)

        playerIds.forEach { pid ->
            assertEquals(
                ratingsAfterFinish[pid], players[pid]!!.rating,
                "recompute не должен сдвигать рейтинг $pid"
            )
        }
        // И новые changes поматчево совпадают со старыми.
        val recomputed = savedChanges.toList()
        assertEquals(finishChanges.size, recomputed.size)
        finishChanges.forEach { old ->
            val new = recomputed.first { it.playerId == old.playerId && it.matchId == old.matchId }
            assertEquals(old.delta, new.delta, "delta ${old.playerId} ${old.matchId}")
            assertEquals(old.kFactor, new.kFactor)
            assertEquals(old.calibMult, new.calibMult)
            assertEquals(old.normFactor, new.normFactor)
        }
    }

    @Test
    fun `победа при большом разрыве не даёт победителю ноль, пока дельта не меньше 0_5`() {
        // Разрыв 400: фаворит выигрывает — дельта мала, но одинакова у обоих партнёров
        // (раньше делёж нечётной дельты давал одному из пары 0).
        val players = mapOf(
            a1 to Player(id = a1, name = "a1", rating = 1700, gamesPlayed = 50),
            a2 to Player(id = a2, name = "a2", rating = 1700, gamesPlayed = 50),
            b1 to Player(id = b1, name = "b1", rating = 1300, gamesPlayed = 50),
            b2 to Player(id = b2, name = "b2", rating = 1300, gamesPlayed = 50)
        )
        wire(players, listOf(match(match1Id, round1Id)), mapOf(match1Id to (13 to 11)))

        service.finishEvent(eventId, ownerUserId)

        val d1 = savedChanges.first { it.playerId == a1 }.delta
        val d2 = savedChanges.first { it.playerId == a2 }.delta
        assertEquals(d1, d2, "оба партнёра получают одинаково")
        assertTrue(d1 >= 2, "победа фаворита при разрыве 400 всё ещё даёт очки: $d1")
    }
}
