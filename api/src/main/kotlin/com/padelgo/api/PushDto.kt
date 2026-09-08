package com.padelgo.api

import com.padelgo.domain.PushPlatform
import com.padelgo.domain.PushToken
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant
import java.util.UUID

/**
 * Всё, кроме token и platform, необязательно: старый клиент, который пришлёт только
 * их, продолжит работать. Присланные поля устройства сохраняются как «паспорт» —
 * в момент рассылки клиента рядом не будет и спросить его будет неоткуда.
 */
@Schema(description = "Регистрация push-токена устройства (FCM)")
data class RegisterPushTokenRequest(
    @field:NotBlank
    @field:Size(max = 512)
    @Schema(
        description = "Регистрационный токен FCM, полученный на устройстве (getToken / onNewToken)",
        example = "fMEP0vJqS0y...:APA91bH9x1c..."
    )
    val token: String,

    @Schema(
        description = "Платформа устройства",
        example = "ANDROID",
        allowableValues = ["ANDROID", "IOS", "WEB"]
    )
    val platform: PushPlatform,

    @field:Size(max = 128)
    @Schema(
        description = "Стабильный идентификатор установки приложения. Если прислан — " +
            "прошлый токен этого же устройства удаляется, чтобы не копить мёртвые записи.",
        example = "8f1c0c9e-2f3a-4f26-9a0b-6d1a1f0c2b77",
        nullable = true
    )
    val deviceId: String? = null,

    @field:Size(max = 32)
    @Schema(description = "Версия приложения — для диагностики рассылок", example = "1.0.0", nullable = true)
    val appVersion: String? = null,

    @field:Size(max = 128)
    @Schema(description = "Модель устройства", example = "Pixel 8 Pro", nullable = true)
    val deviceModel: String? = null,

    @field:Size(max = 32)
    @Schema(description = "Имя ОС (для web — браузер)", example = "Android", nullable = true)
    val osName: String? = null,

    @field:Size(max = 32)
    @Schema(description = "Версия ОС", example = "14", nullable = true)
    val osVersion: String? = null,

    @field:Size(max = 16)
    @Schema(description = "Язык устройства — на нём будет текст пуша", example = "ru-RU", nullable = true)
    val locale: String? = null,

    @field:Size(max = 64)
    @Schema(
        description = "IANA-таймзона устройства — чтобы не слать пуш ночью по местному времени",
        example = "Europe/Moscow",
        nullable = true
    )
    val timezone: String? = null,
)

@Schema(description = "Сохранённый push-токен устройства")
data class PushTokenResponse(
    @Schema(description = "Внутренний ID записи токена")
    val id: UUID?,

    @Schema(description = "Внутренний ID пользователя-владельца")
    val userId: UUID,

    @Schema(description = "Платформа устройства")
    val platform: PushPlatform,

    @Schema(description = "Идентификатор установки, если был прислан", nullable = true)
    val deviceId: String?,

    @Schema(description = "Версия приложения", nullable = true)
    val appVersion: String?,

    @Schema(description = "Модель устройства", nullable = true)
    val deviceModel: String?,

    @Schema(description = "Имя ОС", nullable = true)
    val osName: String?,

    @Schema(description = "Версия ОС", nullable = true)
    val osVersion: String?,

    @Schema(description = "Язык устройства", nullable = true)
    val locale: String?,

    @Schema(description = "Таймзона устройства", nullable = true)
    val timezone: String?,

    @Schema(description = "Когда токен зарегистрирован впервые")
    val createdAt: Instant?,

    @Schema(description = "Время последнего обновления записи (последняя перерегистрация токена)")
    val updatedAt: Instant?,
) {
    companion object {
        // Сам токен намеренно не возвращаем: клиент его и так знает,
        // а в логах и снапшотах ответов ему делать нечего.
        fun from(e: PushToken) = PushTokenResponse(
            id = e.id,
            userId = e.userId,
            platform = e.platform,
            deviceId = e.deviceId,
            appVersion = e.appVersion,
            deviceModel = e.deviceModel,
            osName = e.osName,
            osVersion = e.osVersion,
            locale = e.locale,
            timezone = e.timezone,
            createdAt = e.createdAt,
            updatedAt = e.updatedAt,
        )
    }
}
