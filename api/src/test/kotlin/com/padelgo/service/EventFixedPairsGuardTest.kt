package com.padelgo.service

import com.padelgo.api.ApiException
import com.padelgo.domain.Event
import com.padelgo.domain.EventFormat
import com.padelgo.domain.EventStatus
import com.padelgo.domain.Registration
import com.padelgo.domain.RegistrationStatus
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import org.springframework.http.HttpStatus
import java.util.Optional
import java.util.UUID

/**
 * Guard-тест FIX 1: в FIXED_PAIRS-эвенте осиротевший игрок (team_id встречается один раз)
 * не должен приводить к тихому дропу пары. startEvent обязан бросить CONFLICT.
 */
class EventFixedPairsGuardTest {

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

    private fun fixedPairsEvent() = Event(
        id = eventId,
        title = "FP",
        format = EventFormat.FIXED_PAIRS,
        status = EventStatus.REGISTRATION_CLOSED,
        courtsCount = 1, // capacity = 4
        createdByUserId = ownerUserId
    )

    private fun reg(teamId: UUID?): Registration = Registration(
        id = UUID.randomUUID(),
        eventId = eventId,
        playerId = UUID.randomUUID(),
        teamId = teamId,
        status = RegistrationStatus.REGISTERED
    )

    @Test
    fun `startEvent throws CONFLICT when a fixed pair is left with an orphan`() {
        val ev = fixedPairsEvent()
        whenever(eventRepo.findById(eventId)).thenReturn(Optional.of(ev))
        // startEvent авторизует через requireAuthor (event.createdByUserId == userId), userRepo не трогает.

        // 2 полные пары (4 игрока) + 1 осиротевший игрок с уникальным team_id = 5 REGISTERED.
        // capacity = 4, значит capacity-проверка проходит, но guard должен сработать.
        val teamA = UUID.randomUUID()
        val teamB = UUID.randomUUID()
        val teamOrphan = UUID.randomUUID()
        val regs = listOf(
            reg(teamA), reg(teamA),
            reg(teamB), reg(teamB),
            reg(teamOrphan) // осиротевший — team_id встречается один раз
        )
        whenever(regRepo.findAllByEventIdAndStatus(eq(eventId), any())).thenReturn(regs)

        val ex = assertThrows(ApiException::class.java) {
            service.startEvent(eventId, ownerUserId)
        }
        assertTrue(ex.message!!.contains("В паре остался один игрок"), "message was: ${ex.message}")
        assertTrue(ex.status == HttpStatus.CONFLICT, "status was: ${ex.status}")
    }
}
