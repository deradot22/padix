package com.padelgo.service

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.MediaType
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientResponseException
import org.springframework.web.client.body
import java.net.http.HttpClient
import java.time.Duration
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

/**
 * HTTP-клиент api → bot. Все вызовы идут с заголовком `X-Internal-Secret`,
 * который bot валидирует своим [com.padelgo.bot.api.InternalAuthFilter].
 *
 * Все методы fire-and-forget с защитой от исключений: проблемы с ботом не должны
 * валить транзакции api (создание игры, обновление и т.п.).
 */

data class EventCreatedNotify(
    val eventId: UUID,
    val ownerUserId: UUID,
    val chatIds: List<UUID>,
    val title: String,
    val date: LocalDate,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val courtsCount: Int,
    val registeredCount: Int
)

data class EventUpdatedNotify(
    val eventId: UUID,
    val ownerUserId: UUID,
    val title: String,
    val date: LocalDate,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val courtsCount: Int,
    val changes: List<String>
)

data class FinishTopDto(val name: String, val delta: Int)

/** Финальная таблица лидеров по очкам, сыгранным в эвенте. */
data class LeaderboardEntry(val name: String, val points: Int)

data class EventFinishedNotify(
    val eventId: UUID,
    val ownerUserId: UUID,
    val title: String,
    val date: LocalDate,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val courtsCount: Int,
    val top: List<FinishTopDto>,           // deprecated — топ-3 по приросту рейтинга, оставлен для bw-compat
    val leaderboard: List<LeaderboardEntry> = emptyList(),  // отсортированная по очкам полная таблица
    val matchCount: Int
)

data class RosterChangedNotify(
    val eventId: UUID,
    val ownerUserId: UUID,
    val title: String,
    val date: LocalDate,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val courtsCount: Int,
    val oldCount: Int,
    val newCount: Int,
    val capacity: Int
)

/**
 * Уведомление админа о новом тикете обратной связи.
 * Бот находит PRIVATE-чат для adminUserId в `telegram_chat`, отправляет туда текст
 * и, при наличии, прикреплённое медиа. Если у adminUserId нет привязанного private —
 * вернёт sent=0 (no-op).
 */
data class AdminFeedbackNotify(
    val adminUserId: UUID,
    val ticketId: UUID,
    val authorName: String,
    val category: String,
    val message: String,
    /** data URL вложения. null — без вложения. */
    val attachmentDataUrl: String? = null,
    val attachmentMime: String? = null
)

data class PrepareCancellationRequest(
    val eventId: UUID,
    val ownerUserId: UUID,
    val title: String
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class CancellationOriginalPost(
    val tgChatId: Long,
    val messageId: Long,
    val pinnedMessageId: Long?
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class CancellationPlan(
    val title: String,
    val targetTgChatIds: List<Long>,
    val originalPosts: List<CancellationOriginalPost> = emptyList()
)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class NotifyResult(val sent: Int = 0)

@Configuration
class BotClientConfig {
    @Bean(name = ["botRestClient"])
    fun botRestClient(): RestClient {
        val http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build()
        val factory = JdkClientHttpRequestFactory(http).apply {
            setReadTimeout(Duration.ofSeconds(20))
        }
        return RestClient.builder().requestFactory(factory).build()
    }
}

@Component
class BotClient(
    private val botRestClient: RestClient,
    @Value("\${app.bot.base-url:}") private val baseUrl: String,
    @Value("\${app.internal.secret:}") private val secret: String
) {
    private val log = LoggerFactory.getLogger(BotClient::class.java)

    fun isConfigured(): Boolean = baseUrl.isNotBlank() && secret.isNotBlank()

    // ---------- Notify эндпойнты ----------

    fun notifyEventCreated(payload: EventCreatedNotify): Int =
        post("/api/internal/telegram/notify/event-created", payload)

    fun notifyEventUpdated(payload: EventUpdatedNotify): Int =
        post("/api/internal/telegram/notify/event-updated", payload)

    fun prepareCancellation(payload: PrepareCancellationRequest): CancellationPlan? {
        if (!isConfigured()) return null
        return try {
            botRestClient.post()
                .uri("$baseUrl/api/internal/telegram/notify/prepare-cancellation")
                .header("X-Internal-Secret", secret)
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .retrieve()
                .body<CancellationPlan>()
        } catch (e: Exception) {
            log.warn("bot prepareCancellation failed: {}", e.message)
            null
        }
    }

    fun sendCancellation(plan: CancellationPlan): Int =
        post("/api/internal/telegram/notify/event-cancelled", plan)

    fun notifyEventFinished(payload: EventFinishedNotify): Int =
        post("/api/internal/telegram/notify/event-finished", payload)

    fun notifyRosterChanged(payload: RosterChangedNotify): Int =
        post("/api/internal/telegram/notify/roster-changed", payload)

    fun notifyAdminFeedback(payload: AdminFeedbackNotify): Int =
        post("/api/internal/telegram/notify/admin-feedback", payload)

    // ---------- Прокси для user-facing /api/telegram/* ----------

    fun proxy(
        method: String,
        subPath: String,
        userId: UUID?,
        body: Any? = null
    ): RestClient.RequestHeadersSpec<*> {
        val url = "$baseUrl/api/telegram$subPath"
        val req = when (method.uppercase()) {
            "GET" -> botRestClient.get().uri(url)
            "POST" -> {
                val r = botRestClient.post().uri(url).contentType(MediaType.APPLICATION_JSON)
                if (body != null) r.body(body) else r
            }
            "PATCH" -> {
                val r = botRestClient.patch().uri(url).contentType(MediaType.APPLICATION_JSON)
                if (body != null) r.body(body) else r
            }
            "DELETE" -> botRestClient.delete().uri(url)
            else -> throw IllegalArgumentException("unsupported method $method")
        }
        req.header("X-Internal-Secret", secret)
        if (userId != null) req.header("X-User-Id", userId.toString())
        return req
    }

    // ---------- internal ----------

    private fun post(path: String, payload: Any): Int {
        if (!isConfigured()) {
            log.debug("bot not configured, skipping {}", path)
            return 0
        }
        return try {
            val res = botRestClient.post()
                .uri("$baseUrl$path")
                .header("X-Internal-Secret", secret)
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .retrieve()
                .body<NotifyResult>()
            res?.sent ?: 0
        } catch (e: RestClientResponseException) {
            log.warn("bot {} failed: HTTP {} {}", path, e.statusCode.value(), e.responseBodyAsString)
            0
        } catch (e: Exception) {
            log.warn("bot {} failed: {}", path, e.message)
            0
        }
    }

    /** Возвращает chat UUIDы всех групп/каналов, привязанных к юзеру. Пустой список если не настроено. */
    fun getOwnerGroupChats(userId: UUID): List<UUID> {
        if (!isConfigured()) return emptyList()
        return try {
            val res = botRestClient.get()
                .uri("$baseUrl/api/internal/telegram/owner-group-chats/$userId")
                .header("X-Internal-Secret", secret)
                .retrieve()
                .body<List<UUID>>()
            res ?: emptyList()
        } catch (e: Exception) {
            log.warn("bot owner-group-chats for {} failed: {}", userId, e.message)
            emptyList()
        }
    }
}
