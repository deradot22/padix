package com.padelgo.api

import com.padelgo.service.BotClient
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.client.RestClientResponseException
import java.util.UUID

// Proxy для user-facing endpoints под /api/telegram. Api валидирует JWT, достаёт userId
// и пробрасывает запрос в bot с заголовками X-Internal-Secret + X-User-Id.
// Bot сам не знает про JWT — он доверяет X-User-Id после успешной проверки секрета.
@Tag(name = "Telegram", description = "Прокси к bot-микросервису: привязка чатов и настройки уведомлений")
@SecurityRequirement(name = "BearerAuth")
@RestController
@RequestMapping("/api/telegram")
class TelegramProxyController(
    private val botClient: BotClient
) {
    private val log = LoggerFactory.getLogger(TelegramProxyController::class.java)

    @Operation(summary = "Статус интеграции")
    @GetMapping("/status")
    fun status(): ResponseEntity<String> = proxy("GET", "/status", userId = null)

    @Operation(summary = "Сгенерировать одноразовый токен для привязки чата")
    @PostMapping("/link-token")
    fun createLinkToken(): ResponseEntity<String> =
        proxy("POST", "/link-token", userId = principalUserId())

    @Operation(summary = "Список привязанных Telegram-чатов")
    @GetMapping("/chats")
    fun listChats(): ResponseEntity<String> =
        proxy("GET", "/chats", userId = principalUserId())

    @Operation(summary = "Отвязать Telegram-чат")
    @DeleteMapping("/chats/{chatId}")
    fun unlinkChat(@PathVariable chatId: UUID): ResponseEntity<String> =
        proxy("DELETE", "/chats/$chatId", userId = principalUserId())

    @Operation(summary = "Настройки уведомлений юзера")
    @GetMapping("/settings")
    fun getSettings(): ResponseEntity<String> =
        proxy("GET", "/settings", userId = principalUserId())

    @Operation(summary = "Обновить настройки уведомлений")
    @PatchMapping("/settings")
    fun updateSettings(@RequestBody body: Map<String, Any?>): ResponseEntity<String> =
        proxy("PATCH", "/settings", userId = principalUserId(), body = body)

    @Operation(summary = "Per-chat предпочтения уведомлений")
    @PatchMapping("/chats/{chatId}/preferences")
    fun updateChatPreferences(
        @PathVariable chatId: UUID,
        @RequestBody body: Map<String, Any?>
    ): ResponseEntity<String> =
        proxy("PATCH", "/chats/$chatId/preferences", userId = principalUserId(), body = body)

    // ---------- helpers ----------

    private fun proxy(
        method: String,
        subPath: String,
        userId: UUID?,
        body: Any? = null
    ): ResponseEntity<String> {
        if (!botClient.isConfigured()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body("{\"message\":\"bot not configured\"}")
        }
        return try {
            val spec = botClient.proxy(method, subPath, userId, body)
            val entity = spec.retrieve().toEntity(String::class.java)
            val rawBody = entity.body ?: ""
            ResponseEntity.status(entity.statusCode)
                .header("Content-Type", "application/json")
                .body(rawBody)
        } catch (e: RestClientResponseException) {
            log.warn("bot proxy {} {} → {} {}", method, subPath, e.statusCode.value(), e.responseBodyAsString)
            ResponseEntity.status(e.statusCode)
                .header("Content-Type", "application/json")
                .body(e.responseBodyAsString.ifEmpty { "{\"message\":\"bot error\"}" })
        } catch (e: Exception) {
            log.warn("bot proxy {} {} failed: {}", method, subPath, e.message)
            ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body("{\"message\":\"bot unreachable: ${e.message}\"}")
        }
    }

    private fun principalUserId(): UUID {
        val p = org.springframework.security.core.context.SecurityContextHolder.getContext().authentication?.principal
        if (p is com.padelgo.auth.JwtPrincipal) return p.userId
        throw ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized")
    }
}
