package com.padelgo.api

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * Превращает «тяжёлый» avatarUrl (inline base64 data-URL) в ссылку на кешируемый
 * эндпоинт `GET /api/players/{id}/avatar`, чтобы списочные ответы (рейтинг игроков,
 * друзья, история матчей) не таскали по сотням КБ base64 в каждом JSON.
 *
 * Внешние URL (dicebear/telegram/...) и null остаются как есть.
 *
 * Безопасный фолбэк: если публичный базовый URL API не сконфигурирован как http(s)
 * (или указывает на localhost — дев), отдаём оригинальное значение. То есть фикс может
 * только улучшить ситуацию, но не сломать аватары при неверной конфигурации.
 */
object AvatarLinks {
    /** Базовый публичный URL API, напр. https://api.padix.club. Заполняется при старте. */
    @Volatile
    var apiBaseUrl: String = ""

    fun publicUrl(playerId: UUID?, stored: String?): String? {
        if (stored == null || playerId == null) return stored
        if (!stored.startsWith("data:")) return stored  // внешний URL — не трогаем
        val base = apiBaseUrl
        if (!base.startsWith("http") || base.contains("localhost")) return stored  // безопасный фолбэк
        return "$base/api/players/$playerId/avatar"
    }
}

/** Заполняет [AvatarLinks.apiBaseUrl] из конфигурации один раз при старте приложения. */
@Component
class AvatarLinksConfigurer(
    @Value("\${app.api-public-base-url:}") base: String
) {
    init {
        AvatarLinks.apiBaseUrl = base.trimEnd('/')
    }
}
