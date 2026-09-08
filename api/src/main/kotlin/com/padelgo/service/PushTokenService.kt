package com.padelgo.service

import com.padelgo.api.PushTokenResponse
import com.padelgo.api.RegisterPushTokenRequest
import com.padelgo.domain.PushToken
import com.padelgo.repo.PushTokenRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

/**
 * Приём push-токенов устройств. Рассылка уведомлений здесь не живёт —
 * это отдельная задача, сейчас только сбор адресатов.
 *
 * Клиент вызывает регистрацию после логина и при каждой ротации токена в Firebase,
 * поэтому операция идемпотентна: повторный вызов с тем же токеном не плодит строки,
 * а лишь обновляет данные устройства и время.
 */
@Service
class PushTokenService(
    private val repo: PushTokenRepository,
) {
    private val log = LoggerFactory.getLogger(PushTokenService::class.java)

    @Transactional
    fun register(userId: UUID, req: RegisterPushTokenRequest): PushTokenResponse {
        val token = req.token.trim()
        val deviceId = req.deviceId.clean()

        // 1. Ротация токена на устройстве: Firebase выдал новый — старый уже не доставляет,
        //    держать его в базе значит вечно слать в никуда. Чистим только если клиент
        //    прислал deviceId, иначе связать старую строку с этим же телефоном нечем.
        if (deviceId != null) {
            val stale = repo.findAllByUserIdAndDeviceId(userId, deviceId).filter { it.token != token }
            if (stale.isNotEmpty()) {
                repo.deleteAll(stale)
                log.info("push token rotated: user={} device={} dropped={}", userId, deviceId, stale.size)
            }
        }

        // 2. Upsert по самому токену. Существующая строка может принадлежать другому
        //    пользователю — на устройстве сменили аккаунт; тогда токен переезжает,
        //    иначе прошлый владелец телефона продолжил бы получать чужие уведомления.
        val existing = repo.findByToken(token)
        val entity = existing ?: PushToken(userId = userId, token = token, platform = req.platform)
        entity.userId = userId
        entity.platform = req.platform
        // Пустое поле от клиента не затирает уже известные данные устройства:
        // старый билд, который их не шлёт, не должен обесценивать «паспорт» записи.
        deviceId?.let { entity.deviceId = it }
        req.appVersion.clean()?.let { entity.appVersion = it }
        req.deviceModel.clean()?.let { entity.deviceModel = it }
        req.osName.clean()?.let { entity.osName = it }
        req.osVersion.clean()?.let { entity.osVersion = it }
        req.locale.clean()?.let { entity.locale = it }
        req.timezone.clean()?.let { entity.timezone = it }
        if (existing != null) {
            // Явно двигаем время: если ничего из полей не изменилось, Hibernate счёл бы
            // сущность «чистой» и не сделал UPDATE — тогда @UpdateTimestamp не сработал бы,
            // и мы потеряли бы отметку «клиент подтвердил токен живым».
            entity.updatedAt = Instant.now()
        }

        val saved = repo.save(entity)
        log.info(
            "push token registered: user={} platform={} device={} model={} os={} {} new={}",
            userId, saved.platform, saved.deviceId, saved.deviceModel,
            saved.osName, saved.osVersion, existing == null,
        )
        return PushTokenResponse.from(saved)
    }

    /** Пробелы по краям и «пустая строка вместо null» — обычный мусор от клиентов. */
    private fun String?.clean(): String? = this?.trim()?.takeIf { it.isNotBlank() }
}
