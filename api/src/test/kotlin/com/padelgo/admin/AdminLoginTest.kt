package com.padelgo.admin

import com.padelgo.api.ApiException
import com.padelgo.auth.JwtService
import com.padelgo.auth.Totp
import com.padelgo.auth.UserAccount
import com.padelgo.auth.UserRepository
import com.padelgo.service.AdminLoginNotify
import com.padelgo.service.BotClient
import jakarta.servlet.http.HttpServletRequest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import org.springframework.http.HttpStatus
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import java.util.UUID

/**
 * Вход в админку: пароль (открытый и bcrypt), второй фактор TOTP, TTL токена и алерты в Telegram.
 */
class AdminLoginTest {
    private val encoder = BCryptPasswordEncoder()
    private val users: UserRepository = mock()
    private val jwt: JwtService = mock()
    private val bot: BotClient = mock()
    private val request: HttpServletRequest = mock()
    private val totpSecret = Totp.generateSecret()
    private val fixedNow = 1_700_000_000L

    private val feedbackAdmin = UserAccount(email = "owner@test.local", passwordHash = "x", playerId = UUID.randomUUID(), publicId = 123456789L)
        .also { it.id = UUID.randomUUID(); it.isFeedbackAdmin = true }

    private fun controller(password: String, totp: String = ""): AdminController {
        whenever(request.getHeader("CF-Connecting-IP")).thenReturn("203.0.113.7")
        whenever(bot.isConfigured()).thenReturn(true)
        whenever(users.findAllByIsFeedbackAdminTrue()).thenReturn(listOf(feedbackAdmin))
        whenever(jwt.createAdminToken(any(), anyOrNull())).thenReturn("admin-token")
        return object : AdminController(
            users = users, players = mock(), encoder = encoder, jwt = jwt, eventService = mock(),
            roundRepo = mock(), matchRepo = mock(), botClient = bot,
            adminUsername = "owner", adminPassword = password, adminTotpSecret = totp, adminTokenTtlSeconds = 43_200L
        ) {
            override fun nowSeconds(): Long = fixedNow
        }
    }

    @Test
    fun `plain and bcrypt passwords both work, token gets admin ttl`() {
        assertEquals("admin-token", controller("secret").login(AdminLoginRequest("owner", "secret"), request).token)
        assertEquals("admin-token", controller(encoder.encode("secret")).login(AdminLoginRequest(" owner ", "secret"), request).token)
        verify(jwt, org.mockito.kotlin.atLeastOnce()).createAdminToken(eq("owner"), eq(43_200L))
    }

    @Test
    fun `wrong password is 401 and alerts feedback admins`() {
        val ex = assertThrows(ApiException::class.java) {
            controller("secret").login(AdminLoginRequest("owner", "nope"), request)
        }
        assertEquals(HttpStatus.UNAUTHORIZED, ex.status)
        val captor = argumentCaptor<AdminLoginNotify>()
        verify(bot).notifyAdminLogin(captor.capture())
        assertFalse(captor.firstValue.success)
        assertEquals("203.0.113.7", captor.firstValue.ip)
        assertEquals(feedbackAdmin.id, captor.firstValue.adminUserId)
    }

    @Test
    fun `wrong username is 401 even with right password`() {
        val ex = assertThrows(ApiException::class.java) {
            controller("secret").login(AdminLoginRequest("admin228", "secret"), request)
        }
        assertEquals(HttpStatus.UNAUTHORIZED, ex.status)
        verify(jwt, never()).createAdminToken(any(), anyOrNull())
    }

    @Test
    fun `totp required when secret configured`() {
        val ex = assertThrows(ApiException::class.java) {
            controller("secret", totpSecret).login(AdminLoginRequest("owner", "secret"), request)
        }
        assertEquals(HttpStatus.UNAUTHORIZED, ex.status)
        assertEquals("TOTP_REQUIRED", ex.code)
        verify(bot, never()).notifyAdminLogin(any())
    }

    @Test
    fun `totp wrong code is 401 with alert, right code logs in`() {
        val c = controller("secret", totpSecret)
        val bad = assertThrows(ApiException::class.java) {
            c.login(AdminLoginRequest("owner", "secret", "000000"), request)
        }
        assertEquals("TOTP_INVALID", bad.code)

        val good = Totp.codeAt(totpSecret, fixedNow / Totp.STEP_SECONDS)
        assertEquals("admin-token", c.login(AdminLoginRequest("owner", "secret", good), request).token)
        val captor = argumentCaptor<AdminLoginNotify>()
        verify(bot, org.mockito.kotlin.times(2)).notifyAdminLogin(captor.capture())
        assertFalse(captor.firstValue.success)
        assertTrue(captor.secondValue.success)
    }
}
