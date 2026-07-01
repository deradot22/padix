package com.padelgo.service

import com.padelgo.api.ApiException
import com.padelgo.domain.Event
import com.padelgo.domain.EventStatus
import com.padelgo.domain.Player
import com.padelgo.domain.Registration
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import java.util.Optional
import java.util.UUID

/**
 * Юнит-тесты ограничения по рейтингу при регистрации (задача #9).
 * Все репозитории замоканы. Гейт применяется только к самозаписи не-автора и когда
 * вызов не помечен bypassRatingGate.
 */
class EventRegisterRatingLimitTest {

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
    private val strangerUserId = UUID.randomUUID()
    private val playerId = UUID.randomUUID()

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

    private fun event(min: Int? = null, max: Int? = null) = Event(
        id = eventId,
        title = "Test",
        status = EventStatus.OPEN_FOR_REGISTRATION,
        createdByUserId = ownerUserId,
        minRating = min,
        maxRating = max
    )

    private fun stub(ev: Event, rating: Int) {
        whenever(eventRepo.findById(eventId)).thenReturn(Optional.of(ev))
        whenever(playerRepo.findById(playerId)).thenReturn(Optional.of(Player(id = playerId, name = "P", rating = rating)))
    }

    /** Достраивает моки для успешного прохождения регистрации до конца. */
    private fun stubHappyPath() {
        whenever(userRepo.findByPlayerId(playerId)).thenReturn(null)
        whenever(regRepo.countByEventIdAndStatus(eventId)).thenReturn(0L)
        whenever(regRepo.findByEventIdAndPlayerId(eventId, playerId)).thenReturn(null)
        whenever(regRepo.save(any<Registration>())).thenAnswer { it.arguments[0] as Registration }
    }

    @Test
    fun `below minRating is rejected for self-registration`() {
        stub(event(min = 1000), rating = 900)
        val ex = assertThrows(ApiException::class.java) {
            service.register(eventId, playerId, byUserId = strangerUserId)
        }
        assertTrue(ex.message!!.contains("ниже минимального"), "message was: ${ex.message}")
    }

    @Test
    fun `above maxRating is rejected for self-registration`() {
        stub(event(max = 1200), rating = 1300)
        val ex = assertThrows(ApiException::class.java) {
            service.register(eventId, playerId, byUserId = strangerUserId)
        }
        assertTrue(ex.message!!.contains("выше максимального"), "message was: ${ex.message}")
    }

    @Test
    fun `within range is allowed`() {
        stub(event(min = 1000, max = 1200), rating = 1100)
        stubHappyPath()
        val reg = service.register(eventId, playerId, byUserId = strangerUserId)
        assertEquals(playerId, reg.playerId)
    }

    @Test
    fun `author can add out-of-range player (override)`() {
        stub(event(min = 1000), rating = 500)
        stubHappyPath()
        val reg = service.register(eventId, playerId, byUserId = ownerUserId)
        assertEquals(playerId, reg.playerId)
    }

    @Test
    fun `bypassRatingGate skips the check`() {
        stub(event(min = 1000, max = 1200), rating = 3000)
        stubHappyPath()
        val reg = service.register(eventId, playerId, bypassRatingGate = true)
        assertEquals(playerId, reg.playerId)
    }

    @Test
    fun `no limit allows any rating`() {
        stub(event(), rating = 1)
        stubHappyPath()
        val reg = service.register(eventId, playerId, byUserId = strangerUserId)
        assertEquals(playerId, reg.playerId)
    }

    @Test
    fun `rating exactly at min boundary is allowed (inclusive)`() {
        stub(event(min = 1000), rating = 1000)
        stubHappyPath()
        val reg = service.register(eventId, playerId, byUserId = strangerUserId)
        assertEquals(playerId, reg.playerId)
    }

    @Test
    fun `rating exactly at max boundary is allowed (inclusive)`() {
        stub(event(max = 1200), rating = 1200)
        stubHappyPath()
        val reg = service.register(eventId, playerId, byUserId = strangerUserId)
        assertEquals(playerId, reg.playerId)
    }

    @Test
    fun `bot self-registration (default args) is gated`() {
        // Бот вызывает register(eventId, playerId) — перегрузка с byUserId=null, bypassRatingGate=false.
        stub(event(min = 1000), rating = 900)
        val ex = assertThrows(ApiException::class.java) {
            service.register(eventId, playerId)
        }
        assertTrue(ex.message!!.contains("ниже минимального"), "message was: ${ex.message}")
    }
}
