package com.padelgo.auth

import com.padelgo.api.ApiException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Optional
import java.util.UUID

class EmailVerificationServiceTest {

    private lateinit var tokenRepo: EmailVerificationTokenRepository
    private lateinit var userRepo: UserRepository
    private lateinit var mail: MailService
    private lateinit var service: EmailVerificationService

    @BeforeEach
    fun setup() {
        tokenRepo = mock()
        userRepo = mock()
        mail = mock()
        service = EmailVerificationService(tokenRepo, userRepo, mail, "http://localhost:8083")
    }

    private fun activeToken(userId: UUID, email: String) = EmailVerificationToken(
        userId = userId,
        tokenHash = "ignored-we-mock-findByTokenHash",
        email = email,
        expiresAt = Instant.now().plus(1, ChronoUnit.HOURS),
        usedAt = null,
    )

    private fun userWith(id: UUID, email: String) = UserAccount(
        id = id,
        email = email,
        playerId = UUID.randomUUID(),
    )

    @Test
    fun `consume valid token verifies email and marks token used`() {
        val uid = UUID.randomUUID()
        val token = activeToken(uid, "a@b.com")
        val user = userWith(uid, "a@b.com")
        whenever(tokenRepo.findByTokenHash(any())).doReturn(token)
        whenever(userRepo.findById(uid)).doReturn(Optional.of(user))
        whenever(userRepo.save(any<UserAccount>())).doAnswer { it.arguments[0] as UserAccount }
        whenever(tokenRepo.save(any<EmailVerificationToken>())).doAnswer { it.arguments[0] as EmailVerificationToken }

        val result = service.consume("raw-token")

        assertEquals(uid, result)
        assertNotNull(user.emailVerifiedAt, "email should be marked verified")
        assertNotNull(token.usedAt, "token should be marked used")
    }

    @Test
    fun `consume blank token throws`() {
        assertThrows(ApiException::class.java) { service.consume("") }
    }

    @Test
    fun `consume unknown token throws`() {
        whenever(tokenRepo.findByTokenHash(any())).doReturn(null)
        assertThrows(ApiException::class.java) { service.consume("nope") }
    }

    @Test
    fun `consume already-used token throws`() {
        val uid = UUID.randomUUID()
        val token = activeToken(uid, "a@b.com").apply { usedAt = Instant.now() }
        whenever(tokenRepo.findByTokenHash(any())).doReturn(token)
        assertThrows(ApiException::class.java) { service.consume("raw") }
    }

    @Test
    fun `consume expired token throws`() {
        val uid = UUID.randomUUID()
        val token = activeToken(uid, "a@b.com").apply { expiresAt = Instant.now().minus(1, ChronoUnit.HOURS) }
        whenever(tokenRepo.findByTokenHash(any())).doReturn(token)
        assertThrows(ApiException::class.java) { service.consume("raw") }
    }

    @Test
    fun `consume token for changed email throws`() {
        val uid = UUID.randomUUID()
        val token = activeToken(uid, "old@b.com")
        // Юзер сменил email после создания токена.
        val user = userWith(uid, "new@b.com")
        whenever(tokenRepo.findByTokenHash(any())).doReturn(token)
        whenever(userRepo.findById(uid)).doReturn(Optional.of(user))
        assertThrows(ApiException::class.java) { service.consume("raw") }
        assertNull(user.emailVerifiedAt)
    }

    @Test
    fun `sendVerificationEmail skips when user has no email`() {
        val user = UserAccount(id = UUID.randomUUID(), email = null, playerId = UUID.randomUUID())
        service.sendVerificationEmail(user, "Игрок", EmailVerificationPurpose.REGISTRATION)
        // Ни токен не создаётся, ни письмо не шлётся.
        verify(tokenRepo, never()).save(any())
        verify(mail, never()).sendEmailVerification(any(), any(), any())
    }

    @Test
    fun `sendVerificationEmail creates token and sends mail when email present`() {
        val user = userWith(UUID.randomUUID(), "a@b.com")
        whenever(tokenRepo.save(any<EmailVerificationToken>())).doAnswer { it.arguments[0] as EmailVerificationToken }
        service.sendVerificationEmail(user, "Игрок", EmailVerificationPurpose.REGISTRATION)
        verify(tokenRepo).save(any())
        verify(mail).sendEmailVerification(any(), any(), any())
    }
}
