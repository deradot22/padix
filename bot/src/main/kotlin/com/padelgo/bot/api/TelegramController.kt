package com.padelgo.bot.api

import com.padelgo.bot.service.LinkTokenInfo
import com.padelgo.bot.service.TelegramChatInfo
import com.padelgo.bot.service.TelegramService
import com.padelgo.bot.service.TelegramUserSettingsInfo
import com.padelgo.bot.service.UpdateTelegramChatPreferencesRequest
import com.padelgo.bot.service.UpdateTelegramSettingsRequest
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant
import java.time.LocalTime
import java.util.UUID

/**
 * User-facing API. Bot не работает с JWT — api валидирует токен и проксирует
 * запросы сюда с заголовком `X-User-Id`. Authentication уровня "запрос пришёл от api"
 * проверяет [InternalAuthFilter] через `X-Internal-Secret`.
 */
data class TelegramStatusResponse(val enabled: Boolean, val botUsername: String)

data class TelegramLinkTokenResponse(
    val token: String,
    val botUsername: String,
    val deeplink: String,
    val linkCommand: String,
    val expiresAt: Instant
) {
    companion object {
        fun from(info: LinkTokenInfo) = TelegramLinkTokenResponse(
            info.token, info.botUsername, info.deeplink, info.linkCommand, info.expiresAt
        )
    }
}

data class TelegramChatResponse(
    val id: UUID,
    val chatType: String,
    val title: String,
    val linkedAt: Instant?,
    val notifyUpdated: Boolean,
    val notifyFinished: Boolean,
    val notifyReminder: Boolean
) {
    companion object {
        fun from(c: TelegramChatInfo) = TelegramChatResponse(
            id = c.id,
            chatType = c.chatType,
            title = c.title,
            linkedAt = c.linkedAt,
            notifyUpdated = c.notifyUpdated,
            notifyFinished = c.notifyFinished,
            notifyReminder = c.notifyReminder
        )
    }
}

data class TelegramSettingsResponse(
    val enabled: Boolean,
    val reminderHours: Int,
    val quietHoursStart: LocalTime?,
    val quietHoursEnd: LocalTime?,
    val timezone: String,
    val pinAnnouncement: Boolean
) {
    companion object {
        fun from(s: TelegramUserSettingsInfo) = TelegramSettingsResponse(
            s.enabled, s.reminderHours, s.quietHoursStart, s.quietHoursEnd, s.timezone, s.pinAnnouncement
        )
    }
}

data class UpdateSettingsRequest(
    val enabled: Boolean? = null,
    val reminderHours: Int? = null,
    val quietHoursStart: LocalTime? = null,
    val quietHoursEnd: LocalTime? = null,
    val quietHoursDisabled: Boolean? = null,
    val timezone: String? = null,
    val pinAnnouncement: Boolean? = null
)

data class UpdateChatPreferencesRequest(
    val notifyUpdated: Boolean? = null,
    val notifyFinished: Boolean? = null,
    val notifyReminder: Boolean? = null
)

@RestController
@RequestMapping("/api/telegram")
class TelegramController(
    private val service: TelegramService
) {
    @GetMapping("/status")
    fun status(): TelegramStatusResponse =
        TelegramStatusResponse(enabled = service.isEnabled(), botUsername = service.botUsernameOrEmpty())

    @PostMapping("/link-token")
    fun createLinkToken(@RequestHeader("X-User-Id") userId: UUID): TelegramLinkTokenResponse {
        if (!service.isEnabled()) {
            throw BotApiException(HttpStatus.SERVICE_UNAVAILABLE, "Telegram интеграция не настроена на сервере")
        }
        return TelegramLinkTokenResponse.from(service.createLinkToken(userId))
    }

    @GetMapping("/chats")
    fun listChats(@RequestHeader("X-User-Id") userId: UUID): List<TelegramChatResponse> =
        service.listChats(userId).map { TelegramChatResponse.from(it) }

    @DeleteMapping("/chats/{chatId}")
    fun unlinkChat(@RequestHeader("X-User-Id") userId: UUID, @PathVariable chatId: UUID) {
        service.unlinkChat(userId, chatId)
    }

    @GetMapping("/settings")
    fun getSettings(@RequestHeader("X-User-Id") userId: UUID): TelegramSettingsResponse =
        TelegramSettingsResponse.from(service.getSettingsInfo(userId))

    @PatchMapping("/settings")
    fun updateSettings(
        @RequestHeader("X-User-Id") userId: UUID,
        @RequestBody req: UpdateSettingsRequest
    ): TelegramSettingsResponse {
        val updated = service.updateSettings(
            userId,
            UpdateTelegramSettingsRequest(
                enabled = req.enabled,
                reminderHours = req.reminderHours,
                quietHoursStart = req.quietHoursStart,
                quietHoursEnd = req.quietHoursEnd,
                quietHoursDisabled = req.quietHoursDisabled,
                timezone = req.timezone,
                pinAnnouncement = req.pinAnnouncement
            )
        )
        return TelegramSettingsResponse.from(updated)
    }

    @PatchMapping("/chats/{chatId}/preferences")
    fun updateChatPreferences(
        @RequestHeader("X-User-Id") userId: UUID,
        @PathVariable chatId: UUID,
        @RequestBody req: UpdateChatPreferencesRequest
    ): TelegramChatResponse {
        val updated = service.updateChatPreferences(
            userId,
            chatId,
            UpdateTelegramChatPreferencesRequest(
                notifyUpdated = req.notifyUpdated,
                notifyFinished = req.notifyFinished,
                notifyReminder = req.notifyReminder
            )
        )
        return TelegramChatResponse.from(updated)
    }
}
