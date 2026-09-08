package com.padelgo.service

import com.padelgo.api.RegisterPushTokenRequest
import com.padelgo.domain.PushPlatform
import com.padelgo.domain.PushToken
import com.padelgo.repo.PushTokenRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import java.time.Instant
import java.util.UUID

/**
 * Регистрация push-токена: идемпотентность, переезд токена между аккаунтами
 * и чистка прошлого токена того же устройства.
 */
class PushTokenServiceTest {

    private lateinit var repo: PushTokenRepository
    private lateinit var service: PushTokenService

    @BeforeEach
    fun setup() {
        repo = mock()
        // save() возвращает то, что ему передали — как настоящий JpaRepository.
        whenever(repo.save(any<PushToken>())).doAnswer { it.arguments[0] as PushToken }
        service = PushTokenService(repo)
    }

    private fun request(
        token: String = "fcm-token-1",
        platform: PushPlatform = PushPlatform.ANDROID,
        deviceId: String? = "device-1",
        appVersion: String? = "1.0.0",
        deviceModel: String? = "Pixel 8 Pro",
        osName: String? = "Android",
        osVersion: String? = "14",
        locale: String? = "ru-RU",
        timezone: String? = "Europe/Moscow",
    ) = RegisterPushTokenRequest(
        token = token,
        platform = platform,
        deviceId = deviceId,
        appVersion = appVersion,
        deviceModel = deviceModel,
        osName = osName,
        osVersion = osVersion,
        locale = locale,
        timezone = timezone,
    )

    @Test
    fun `новый токен сохраняется с внутренним id пользователя`() {
        val userId = UUID.randomUUID()
        whenever(repo.findAllByUserIdAndDeviceId(userId, "device-1")).doReturn(emptyList())
        whenever(repo.findByToken("fcm-token-1")).doReturn(null)

        val res = service.register(userId, request())

        val captor = argumentCaptor<PushToken>()
        verify(repo).save(captor.capture())
        assertEquals(userId, captor.firstValue.userId)
        assertEquals("fcm-token-1", captor.firstValue.token)
        assertEquals(PushPlatform.ANDROID, captor.firstValue.platform)
        assertEquals("device-1", captor.firstValue.deviceId)
        assertEquals("1.0.0", captor.firstValue.appVersion)
        assertEquals("Pixel 8 Pro", captor.firstValue.deviceModel)
        assertEquals("Android", captor.firstValue.osName)
        assertEquals("14", captor.firstValue.osVersion)
        assertEquals("ru-RU", captor.firstValue.locale)
        assertEquals("Europe/Moscow", captor.firstValue.timezone)
        assertEquals(userId, res.userId)
        assertEquals("ru-RU", res.locale)
        assertEquals("Europe/Moscow", res.timezone)
    }

    @Test
    fun `повторная регистрация того же токена не плодит строки и двигает updatedAt`() {
        val userId = UUID.randomUUID()
        val longAgo = Instant.now().minusSeconds(3600)
        val existing = PushToken(
            id = UUID.randomUUID(),
            userId = userId,
            token = "fcm-token-1",
            platform = PushPlatform.ANDROID,
            deviceId = "device-1",
            appVersion = "1.0.0",
            createdAt = longAgo,
            updatedAt = longAgo,
        )
        whenever(repo.findAllByUserIdAndDeviceId(userId, "device-1")).doReturn(listOf(existing))
        whenever(repo.findByToken("fcm-token-1")).doReturn(existing)

        val res = service.register(userId, request())

        verify(repo, never()).deleteAll(any())
        assertEquals(existing.id, res.id)
        assertNotNull(res.updatedAt)
        assertTrue(res.updatedAt!!.isAfter(longAgo), "updatedAt должен обновиться при перерегистрации")
        assertEquals(longAgo, res.createdAt, "createdAt при перерегистрации не меняется")
    }

    @Test
    fun `ротация токена удаляет прошлый токен того же устройства`() {
        val userId = UUID.randomUUID()
        val stale = PushToken(
            id = UUID.randomUUID(),
            userId = userId,
            token = "fcm-token-old",
            platform = PushPlatform.ANDROID,
            deviceId = "device-1",
        )
        whenever(repo.findAllByUserIdAndDeviceId(userId, "device-1")).doReturn(listOf(stale))
        whenever(repo.findByToken("fcm-token-new")).doReturn(null)

        service.register(userId, request(token = "fcm-token-new"))

        val captor = argumentCaptor<List<PushToken>>()
        verify(repo).deleteAll(captor.capture())
        assertEquals(listOf(stale), captor.firstValue)
    }

    @Test
    fun `токен переезжает на нового владельца при смене аккаунта на устройстве`() {
        val previousOwner = UUID.randomUUID()
        val newOwner = UUID.randomUUID()
        val existing = PushToken(
            id = UUID.randomUUID(),
            userId = previousOwner,
            token = "fcm-token-1",
            platform = PushPlatform.ANDROID,
            deviceId = "device-1",
        )
        whenever(repo.findAllByUserIdAndDeviceId(newOwner, "device-1")).doReturn(emptyList())
        whenever(repo.findByToken("fcm-token-1")).doReturn(existing)

        val res = service.register(newOwner, request())

        assertEquals(newOwner, res.userId)
        assertEquals(newOwner, existing.userId)
    }

    @Test
    fun `перерегистрация обновляет паспорт устройства`() {
        val userId = UUID.randomUUID()
        val existing = PushToken(
            id = UUID.randomUUID(),
            userId = userId,
            token = "fcm-token-1",
            platform = PushPlatform.ANDROID,
            deviceId = "device-1",
            appVersion = "1.0.0",
            deviceModel = "Pixel 7",
            osName = "Android",
            osVersion = "13",
            locale = "en-US",
            timezone = "Europe/Berlin",
        )
        whenever(repo.findAllByUserIdAndDeviceId(userId, "device-1")).doReturn(listOf(existing))
        whenever(repo.findByToken("fcm-token-1")).doReturn(existing)

        val res = service.register(
            userId,
            request(appVersion = "1.1.0", deviceModel = "Pixel 8 Pro", osVersion = "14", locale = "ru-RU"),
        )

        assertEquals("1.1.0", res.appVersion)
        assertEquals("Pixel 8 Pro", res.deviceModel)
        assertEquals("14", res.osVersion)
        assertEquals("ru-RU", res.locale)
        assertEquals("Europe/Moscow", res.timezone)
    }

    @Test
    fun `старый клиент без полей устройства не затирает уже собранный паспорт`() {
        val userId = UUID.randomUUID()
        val existing = PushToken(
            id = UUID.randomUUID(),
            userId = userId,
            token = "fcm-token-1",
            platform = PushPlatform.ANDROID,
            deviceId = "device-1",
            appVersion = "1.0.0",
            deviceModel = "Pixel 8 Pro",
            osName = "Android",
            osVersion = "14",
            locale = "ru-RU",
            timezone = "Europe/Moscow",
        )
        whenever(repo.findAllByUserIdAndDeviceId(userId, "device-1")).doReturn(listOf(existing))
        whenever(repo.findByToken("fcm-token-1")).doReturn(existing)

        val res = service.register(
            userId,
            request(appVersion = null, deviceModel = null, osName = null, osVersion = null, locale = "", timezone = null),
        )

        assertEquals("1.0.0", res.appVersion)
        assertEquals("Pixel 8 Pro", res.deviceModel)
        assertEquals("Android", res.osName)
        assertEquals("14", res.osVersion)
        assertEquals("ru-RU", res.locale)
        assertEquals("Europe/Moscow", res.timezone)
    }

    @Test
    fun `токен и deviceId обрезаются, пустой deviceId игнорируется`() {
        val userId = UUID.randomUUID()
        whenever(repo.findByToken("fcm-token-1")).doReturn(null)

        service.register(userId, request(token = "  fcm-token-1  ", deviceId = "   "))

        // Пустой deviceId — не за что зацепиться, чистку прошлых токенов не делаем.
        verify(repo, never()).findAllByUserIdAndDeviceId(any(), any())
        val captor = argumentCaptor<PushToken>()
        verify(repo).save(captor.capture())
        assertEquals("fcm-token-1", captor.firstValue.token)
        assertEquals(null, captor.firstValue.deviceId)
    }
}
