package com.padelgo.auth

import com.padelgo.api.ApiException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import org.springframework.security.crypto.password.PasswordEncoder
import java.util.Optional
import java.util.UUID

/**
 * Тесты setPassword: установка пароля OAuth-only юзеру (без текущего)
 * и смена пароля с обязательной проверкой текущего.
 */
class AuthServiceSetPasswordTest {

    private lateinit var users: UserRepository
    private lateinit var encoder: PasswordEncoder
    private lateinit var service: AuthService

    @BeforeEach
    fun setup() {
        users = mock()
        encoder = mock()
        service = AuthService(
            users = users,
            players = mock(),
            encoder = encoder,
            jwt = mock(),
            emailVerification = mock(),
            disposableEmailChecker = mock(),
        )
    }

    private fun principal(uid: UUID) = JwtPrincipal(userId = uid, email = "a@b.com", playerId = UUID.randomUUID())

    @Test
    fun `rejects too short password`() {
        val uid = UUID.randomUUID()
        assertThrows(ApiException::class.java) {
            service.setPassword(principal(uid), null, "12345") // 5 chars
        }
    }

    @Test
    fun `oauth-only user can set password without current`() {
        val uid = UUID.randomUUID()
        // passwordHash == null → OAuth-only, текущий пароль не требуется.
        val user = UserAccount(id = uid, email = "a@b.com", passwordHash = null, playerId = UUID.randomUUID(), telegramUserId = 1L)
        whenever(users.findById(uid)).doReturn(Optional.of(user))
        whenever(encoder.encode(any())).doReturn("new-hash")
        whenever(users.save(any<UserAccount>())).doAnswer { it.arguments[0] as UserAccount }

        service.setPassword(principal(uid), null, "newsecret")

        assertEquals("new-hash", user.passwordHash)
    }

    @Test
    fun `user with password must provide current password`() {
        val uid = UUID.randomUUID()
        val user = UserAccount(id = uid, email = "a@b.com", passwordHash = "old-hash", playerId = UUID.randomUUID())
        whenever(users.findById(uid)).doReturn(Optional.of(user))

        assertThrows(ApiException::class.java) {
            service.setPassword(principal(uid), null, "newsecret") // current missing
        }
    }

    @Test
    fun `wrong current password is rejected`() {
        val uid = UUID.randomUUID()
        val user = UserAccount(id = uid, email = "a@b.com", passwordHash = "old-hash", playerId = UUID.randomUUID())
        whenever(users.findById(uid)).doReturn(Optional.of(user))
        whenever(encoder.matches("wrong", "old-hash")).doReturn(false)

        assertThrows(ApiException::class.java) {
            service.setPassword(principal(uid), "wrong", "newsecret")
        }
    }

    @Test
    fun `correct current password allows change`() {
        val uid = UUID.randomUUID()
        val user = UserAccount(id = uid, email = "a@b.com", passwordHash = "old-hash", playerId = UUID.randomUUID())
        whenever(users.findById(uid)).doReturn(Optional.of(user))
        whenever(encoder.matches("correct", "old-hash")).doReturn(true)
        whenever(encoder.encode("newsecret")).doReturn("brand-new-hash")
        whenever(users.save(any<UserAccount>())).doAnswer { it.arguments[0] as UserAccount }

        service.setPassword(principal(uid), "correct", "newsecret")

        assertEquals("brand-new-hash", user.passwordHash)
    }
}
