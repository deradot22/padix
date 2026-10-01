package com.padelgo.auth

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import java.time.Instant
import java.util.Optional
import java.util.UUID

/** Принятие Условий и Политики: пишем дату и версию, старую версию поверх новой не пишем. */
class AuthServiceAcceptTermsTest {
    private val users = mock<UserRepository>()
    private val service =
        AuthService(
            users = users,
            players = mock(),
            encoder = mock(),
            jwt = mock(),
            emailVerification = mock(),
            disposableEmailChecker = mock(),
        )

    private fun user(version: Int? = null): UserAccount {
        val id = UUID.randomUUID()
        val account = UserAccount(id = id, termsVersion = version, termsAcceptedAt = version?.let { Instant.EPOCH })
        whenever(users.findById(id)).thenReturn(Optional.of(account))
        whenever(users.save(any<UserAccount>())).doAnswer { it.arguments[0] as UserAccount }
        return account
    }

    @Test
    fun `records the version and the time of acceptance`() {
        val account = user()

        service.acceptTerms(account.id!!, 1)

        assertEquals(1, account.termsVersion)
        assertNotNull(account.termsAcceptedAt)
    }

    @Test
    fun `an older version does not overwrite a newer acceptance`() {
        val account = user(version = 2)

        service.acceptTerms(account.id!!, 1)

        assertEquals(2, account.termsVersion)
        assertEquals(Instant.EPOCH, account.termsAcceptedAt)
    }

    @Test
    fun `accepting the same version again refreshes the date`() {
        val account = user(version = 1)

        service.acceptTerms(account.id!!, 1)

        assertEquals(1, account.termsVersion)
        assertEquals(true, account.termsAcceptedAt!!.isAfter(Instant.EPOCH))
    }

    @Test
    fun `new accounts start without acceptance`() {
        val account = UserAccount()
        assertNull(account.termsVersion)
        assertNull(account.termsAcceptedAt)
    }
}
