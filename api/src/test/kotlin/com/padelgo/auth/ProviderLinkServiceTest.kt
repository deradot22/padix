package com.padelgo.auth

import com.padelgo.api.ApiException
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import java.util.Optional
import java.util.UUID

class ProviderLinkServiceTest {

    private lateinit var users: UserRepository
    private lateinit var authService: AuthService
    private lateinit var service: ProviderLinkService

    @BeforeEach
    fun setup() {
        users = mock()
        authService = mock()
        service = ProviderLinkService(
            users = users,
            telegramAuth = mock(),
            googleAuth = mock(),
            facebookAuth = mock(),
            authService = authService,
        )
    }

    private fun principal(uid: UUID) = JwtPrincipal(userId = uid, email = "a@b.com", playerId = UUID.randomUUID())

    private fun dummyMe() = MeResponse(
        email = "a@b.com",
        playerId = UUID.randomUUID(),
        name = "X",
        rating = 1000,
        ntrp = "3.0",
        gamesPlayed = 0,
        publicId = "#1",
        surveyCompleted = true,
        surveyLevel = null,
        calibrationEventsRemaining = 0,
        calibrationMatchesRemaining = 0,
    )

    @Test
    fun `cannot unlink the only auth method`() {
        val uid = UUID.randomUUID()
        // Юзер вошёл ТОЛЬКО через Telegram: нет пароля, нет других провайдеров.
        val user = UserAccount(id = uid, email = null, playerId = UUID.randomUUID(), telegramUserId = 12345L)
        whenever(users.findById(uid)).doReturn(Optional.of(user))

        assertThrows(ApiException::class.java) {
            service.unlink(principal(uid), ProviderLinkService.Provider.TELEGRAM)
        }
        // Привязка осталась — отвязка не прошла.
        assert(user.telegramUserId != null)
    }

    @Test
    fun `can unlink provider when password is set`() {
        val uid = UUID.randomUUID()
        val user = UserAccount(
            id = uid,
            email = "a@b.com",
            passwordHash = "bcrypt-hash",
            playerId = UUID.randomUUID(),
            telegramUserId = 12345L,
        )
        whenever(users.findById(uid)).doReturn(Optional.of(user))
        whenever(users.save(any<UserAccount>())).doAnswer { it.arguments[0] as UserAccount }
        whenever(authService.me(any())).doReturn(dummyMe())

        service.unlink(principal(uid), ProviderLinkService.Provider.TELEGRAM)

        assertNull(user.telegramUserId, "telegram should be unlinked")
    }

    @Test
    fun `can unlink one provider when two are linked`() {
        val uid = UUID.randomUUID()
        // Нет пароля, но привязаны Google + Telegram — отвязать один можно.
        val user = UserAccount(
            id = uid,
            email = "a@b.com",
            playerId = UUID.randomUUID(),
            telegramUserId = 12345L,
            googleSub = "google-sub-123",
        )
        whenever(users.findById(uid)).doReturn(Optional.of(user))
        whenever(users.save(any<UserAccount>())).doAnswer { it.arguments[0] as UserAccount }
        whenever(authService.me(any())).doReturn(dummyMe())

        service.unlink(principal(uid), ProviderLinkService.Provider.GOOGLE)

        assertNull(user.googleSub, "google should be unlinked")
        assert(user.telegramUserId != null) { "telegram should remain" }
    }
}
