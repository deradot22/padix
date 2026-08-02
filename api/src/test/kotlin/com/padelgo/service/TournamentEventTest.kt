package com.padelgo.service

import com.padelgo.api.ApiException
import com.padelgo.api.PointsScoreRequest
import com.padelgo.api.SubmitScoreRequest
import com.padelgo.domain.Event
import com.padelgo.domain.EventKind
import com.padelgo.domain.EventStatus
import com.padelgo.domain.Match
import com.padelgo.domain.MatchSetScore
import com.padelgo.domain.MatchStatus
import com.padelgo.domain.Player
import com.padelgo.domain.Registration
import com.padelgo.domain.Round
import com.padelgo.domain.ScoringMode
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import org.springframework.http.HttpStatus
import java.util.Optional
import java.util.UUID

/**
 * Турнир (kind=TOURNAMENT) не влияет на рейтинг:
 *  - finishEvent не пишет rating_changes, не трогает gamesPlayed/рейтинг и не создаёт
 *    рейтинг-нотификаций, но телеграм-сводку с таблицей шлёт;
 *  - правка счёта завершённого турнира не пересчитывает рейтинг, но обновляет пост;
 *  - глобальный пересчёт (recomputeAllRatings) турниры не реплеит.
 * Гости (Player.isGuest) допускаются только в турниры.
 */
class TournamentEventTest {

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
    private val match1Id = UUID.randomUUID()
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

        whenever(eventRepo.save(any())).thenAnswer { it.arguments[0] }
        whenever(regRepo.findAllByEventIdAndStatus(eq(eventId), any())).doReturn(emptyList())
    }

    private fun tournament(status: EventStatus = EventStatus.IN_PROGRESS) = Event(
        id = eventId,
        title = "Турнир",
        status = status,
        kind = EventKind.TOURNAMENT,
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

    private fun wire(ev: Event, players: Map<UUID, Player>) {
        whenever(eventRepo.findById(eventId)).doReturn(Optional.of(ev))
        whenever(roundRepo.findAllByEventIdOrderByRoundNumberAsc(eventId)).doReturn(
            listOf(Round(id = round1Id, eventId = eventId, roundNumber = 1))
        )
        whenever(matchRepo.findAllByEventId(eventId)).doReturn(listOf(match(match1Id, round1Id)))
        whenever(scoreRepo.findAllByMatchIdOrderBySetNumberAsc(match1Id)).doReturn(
            listOf(MatchSetScore(matchId = match1Id, setNumber = 1, teamAGames = 16, teamBGames = 8))
        )
        whenever(playerRepo.findAllById(any())).doReturn(players.values.toList())
        whenever(userRepo.findAllByPlayerIdIn(any())).doReturn(emptyList())
    }

    @Test
    fun `finishEvent турнира не пишет rating_changes и не шлёт рейтинг-нотификаций, но шлёт сводку боту`() {
        val players = playerIds.associateWith { Player(id = it, name = "p$it", rating = 1400, gamesPlayed = 10) }
        val ev = tournament()
        wire(ev, players)

        service.finishEvent(eventId, ownerUserId)

        assertEquals(EventStatus.FINISHED, ev.status)
        verify(ratingChangeRepo, never()).save(any())
        verify(ratingChangeRepo, never()).saveAll(any<Iterable<com.padelgo.domain.RatingChange>>())
        verify(ratingNotificationRepo, never()).save(any())
        // Рейтинг и наигранность не изменились.
        players.values.forEach { p ->
            assertEquals(1400, p.rating)
            assertEquals(10, p.gamesPlayed)
        }
        verify(botClient).notifyEventFinished(any())
    }

    @Test
    fun `правка счёта завершённого турнира не трогает рейтинг, но обновляет телеграм-пост`() {
        val players = playerIds.associateWith { Player(id = it, name = "p$it", rating = 1400, gamesPlayed = 10) }
        val ev = tournament(EventStatus.FINISHED)
        wire(ev, players)
        whenever(matchRepo.findById(match1Id)).doReturn(Optional.of(match(match1Id, round1Id)))
        whenever(roundRepo.findById(round1Id))
            .doReturn(Optional.of(Round(id = round1Id, eventId = eventId, roundNumber = 1)))
        whenever(ratingChangeRepo.findAllByEventId(eventId)).doReturn(emptyList())

        service.submitScore(
            match1Id, ownerUserId,
            SubmitScoreRequest(points = PointsScoreRequest(teamAPoints = 8, teamBPoints = 16))
        )

        verify(ratingChangeRepo, never()).save(any())
        verify(ratingChangeRepo, never()).saveAll(any<Iterable<com.padelgo.domain.RatingChange>>())
        verify(playerRepo, never()).saveAll(any<Iterable<Player>>())
        verify(botClient).notifyEventResultsUpdated(any())
    }

    @Test
    fun `recomputeAllRatings не реплеит турниры`() {
        whenever(ratingChangeRepo.findAll()).doReturn(emptyList())
        whenever(eventRepo.findAll()).doReturn(listOf(tournament(EventStatus.FINISHED)))
        whenever(playerRepo.findAllById(any())).doReturn(emptyList())
        whenever(userRepo.findAllByPlayerIdIn(any())).doReturn(emptyList())
        whenever(playerRepo.findAll()).doReturn(emptyList())

        val summary = service.recomputeAllRatings()

        assertEquals(0, summary.eventsReplayed)
        verify(matchRepo, never()).findAllByEventId(any())
    }

    @Test
    fun `addGuest создаёт гостя и регистрирует его`() {
        val ev = tournament(EventStatus.OPEN_FOR_REGISTRATION)
        whenever(eventRepo.findById(eventId)).doReturn(Optional.of(ev))
        whenever(playerRepo.findByNameIgnoreCase("Дима Т.")).doReturn(null)
        whenever(playerRepo.save(any())).thenAnswer {
            (it.arguments[0] as Player).apply { id = UUID.randomUUID() }
        }
        val savedRegs = mutableListOf<Registration>()
        whenever(regRepo.save(any())).thenAnswer {
            val r = it.arguments[0] as Registration
            savedRegs.add(r)
            r
        }

        val guest = service.addGuest(eventId, ownerUserId, "  Дима Т.  ")

        assertTrue(guest.isGuest)
        assertEquals("Дима Т.", guest.name)
        assertEquals(1, savedRegs.size)
        assertEquals(guest.id, savedRegs.first().playerId)
    }

    @Test
    fun `addGuest уникализирует занятое имя суффиксом`() {
        val ev = tournament(EventStatus.OPEN_FOR_REGISTRATION)
        whenever(eventRepo.findById(eventId)).doReturn(Optional.of(ev))
        // Базовое имя занято, любые кандидаты с суффиксом свободны.
        whenever(playerRepo.findByNameIgnoreCase(any())).thenAnswer { inv ->
            val name = inv.arguments[0] as String
            if (name == "Вася") Player(id = UUID.randomUUID(), name = "Вася") else null
        }
        whenever(playerRepo.save(any())).thenAnswer {
            (it.arguments[0] as Player).apply { id = UUID.randomUUID() }
        }
        whenever(regRepo.save(any())).thenAnswer { it.arguments[0] }

        val guest = service.addGuest(eventId, ownerUserId, "Вася")

        assertTrue(guest.name.startsWith("Вася #"), "имя с суффиксом: ${guest.name}")
    }

    @Test
    fun `addGuest в обычную игру запрещён`() {
        val regular = Event(
            id = eventId,
            title = "Игра",
            status = EventStatus.OPEN_FOR_REGISTRATION,
            kind = EventKind.REGULAR,
            createdByUserId = ownerUserId
        )
        whenever(eventRepo.findById(eventId)).doReturn(Optional.of(regular))

        val ex = assertThrows<ApiException> { service.addGuest(eventId, ownerUserId, "Гость") }
        assertEquals(HttpStatus.BAD_REQUEST, ex.status)
    }

    @Test
    fun `addGuest может только организатор`() {
        val ev = tournament(EventStatus.OPEN_FOR_REGISTRATION)
        whenever(eventRepo.findById(eventId)).doReturn(Optional.of(ev))

        val stranger = UUID.randomUUID()
        val ex = assertThrows<ApiException> { service.addGuest(eventId, stranger, "Гость") }
        assertEquals(HttpStatus.FORBIDDEN, ex.status)
    }

    @Test
    fun `register гостя в обычную игру запрещён`() {
        val regular = Event(
            id = eventId,
            title = "Игра",
            status = EventStatus.OPEN_FOR_REGISTRATION,
            kind = EventKind.REGULAR,
            createdByUserId = ownerUserId
        )
        val guestId = UUID.randomUUID()
        whenever(eventRepo.findById(eventId)).doReturn(Optional.of(regular))
        whenever(playerRepo.findById(guestId)).doReturn(
            Optional.of(Player(id = guestId, name = "Гость #1234", isGuest = true))
        )

        val ex = assertThrows<ApiException> { service.register(eventId, guestId, ownerUserId) }
        assertEquals(HttpStatus.BAD_REQUEST, ex.status)
    }

    @Test
    fun `гости не попадают в общий рейтинг-лидерборд`() {
        whenever(playerRepo.findAll()).doReturn(
            listOf(
                Player(id = UUID.randomUUID(), name = "Обычный", rating = 1200),
                Player(id = UUID.randomUUID(), name = "Гость #1234", rating = 1000, isGuest = true)
            )
        )

        val board = service.listPlayersByRating()

        assertEquals(listOf("Обычный"), board.map { it.name })
    }
}
