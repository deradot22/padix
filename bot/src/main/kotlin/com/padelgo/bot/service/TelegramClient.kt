package com.padelgo.bot.service

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.MediaType
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import org.springframework.web.client.body
import java.net.http.HttpClient
import java.time.Duration

@ConfigurationProperties(prefix = "app.telegram")
data class TelegramProps(
    var enabled: Boolean = false,
    var botToken: String = "",
    var botUsername: String = "",
    var apiBaseUrl: String = "https://api.telegram.org",
    var pollingTimeoutSeconds: Int = 30,
    /** Если true — sendMessage / editMessageText / pin / unpin не делают реальный HTTP
     *  в Telegram API, возвращают фейковый успех. Используется только в smoke-тестах,
     *  чтобы прогнать notifyEventCreated/Updated с фейк-чатом и спровоцировать
     *  настоящую запись event_telegram_post (= проверка afterCommit race condition). */
    var dryRun: Boolean = false
)

@Configuration
class TelegramConfig {
    @Bean
    fun telegramRestClient(props: TelegramProps): RestClient {
        val readTimeout = Duration.ofSeconds(props.pollingTimeoutSeconds.toLong() + 30)
        val http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build()
        val factory = JdkClientHttpRequestFactory(http).apply { setReadTimeout(readTimeout) }
        return RestClient.builder()
            .requestFactory(factory)
            .build()
    }
}

@JsonIgnoreProperties(ignoreUnknown = true)
data class TgResponse<T>(
    val ok: Boolean,
    val result: T? = null,
    @JsonProperty("error_code") val errorCode: Int? = null,
    val description: String? = null
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class TgUser(
    val id: Long,
    @JsonProperty("is_bot") val isBot: Boolean = false,
    @JsonProperty("first_name") val firstName: String? = null,
    val username: String? = null
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class TgChat(
    val id: Long,
    val type: String,
    val title: String? = null,
    val username: String? = null,
    @JsonProperty("first_name") val firstName: String? = null,
    @JsonProperty("last_name") val lastName: String? = null
) {
    fun displayTitle(): String {
        return title
            ?: listOfNotNull(firstName, lastName).joinToString(" ").ifBlank { username ?: "Chat #$id" }
    }
}

@JsonIgnoreProperties(ignoreUnknown = true)
data class TgMessage(
    @JsonProperty("message_id") val messageId: Long,
    val from: TgUser? = null,
    val chat: TgChat,
    val date: Long = 0,
    val text: String? = null
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class TgUpdate(
    @JsonProperty("update_id") val updateId: Long,
    val message: TgMessage? = null,
    @JsonProperty("channel_post") val channelPost: TgMessage? = null
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class TgSentMessage(
    @JsonProperty("message_id") val messageId: Long,
    val chat: TgChat
)

class TelegramApiException(message: String, val errorCode: Int? = null) : RuntimeException(message)

@Component
class TelegramClient(
    private val restClient: RestClient,
    private val props: TelegramProps
) {
    private val log = LoggerFactory.getLogger(TelegramClient::class.java)

    fun isConfigured(): Boolean = props.enabled && props.botToken.isNotBlank()

    private fun baseUrl(): String = "${props.apiBaseUrl}/bot${props.botToken}"

    fun getMe(): TgUser {
        val resp = restClient.get()
            .uri("${baseUrl()}/getMe")
            .retrieve()
            .body<TgResponse<TgUser>>()
            ?: throw TelegramApiException("getMe: empty response")
        if (!resp.ok || resp.result == null) {
            throw TelegramApiException("getMe failed: ${resp.description}", resp.errorCode)
        }
        return resp.result
    }

    fun getUpdates(offset: Long, timeoutSeconds: Int): List<TgUpdate> {
        val allowed = java.net.URLEncoder.encode("[\"message\",\"channel_post\"]", "UTF-8")
        val url = "${baseUrl()}/getUpdates?offset=$offset&timeout=$timeoutSeconds&allowed_updates=$allowed"
        val resp = restClient.get()
            .uri(url)
            .retrieve()
            .body<TgResponse<List<TgUpdate>>>()
            ?: throw TelegramApiException("getUpdates: empty response")
        if (!resp.ok) {
            throw TelegramApiException("getUpdates failed: ${resp.description}", resp.errorCode)
        }
        return resp.result ?: emptyList()
    }

    /**
     * Редактирует ранее отправленное сообщение. Не возвращает ошибку, если контент
     * не изменился (Bot API сам игнорирует такие запросы) — но кидает исключение
     * на любую другую ошибку.
     */
    fun editMessageText(
        chatId: Long,
        messageId: Long,
        text: String,
        parseMode: String? = "HTML",
        disableWebPagePreview: Boolean = false,
        replyMarkup: Map<String, Any>? = null
    ) {
        if (props.dryRun) return  // dry-run: noop
        val body = mutableMapOf<String, Any>(
            "chat_id" to chatId,
            "message_id" to messageId,
            "text" to text,
            "disable_web_page_preview" to disableWebPagePreview
        )
        if (parseMode != null) body["parse_mode"] = parseMode
        if (replyMarkup != null) body["reply_markup"] = replyMarkup

        val resp = restClient.post()
            .uri("${baseUrl()}/editMessageText")
            .contentType(MediaType.APPLICATION_JSON)
            .body(body)
            .retrieve()
            .body<TgResponse<Any>>()
            ?: throw TelegramApiException("editMessageText: empty response")
        if (!resp.ok) {
            // "message is not modified" — нормально для нашего use-case, не шумим.
            val desc = resp.description.orEmpty()
            if (desc.contains("message is not modified", ignoreCase = true)) return
            throw TelegramApiException("editMessageText for $chatId/$messageId failed: $desc", resp.errorCode)
        }
    }

    fun sendMessage(
        chatId: Long,
        text: String,
        parseMode: String? = "HTML",
        disableWebPagePreview: Boolean = false,
        replyMarkup: Map<String, Any>? = null
    ): TgSentMessage {
        if (props.dryRun) {
            // DRY-RUN: возвращаем фейковый успех без реального TG-вызова, чтобы
            // вышестоящий код дошёл до INSERT event_telegram_post (smoke-тест).
            val fakeMsgId = System.currentTimeMillis() and 0x7FFF_FFFFL
            return TgSentMessage(messageId = fakeMsgId, chat = TgChat(id = chatId, type = "group"))
        }
        val body = mutableMapOf<String, Any>(
            "chat_id" to chatId,
            "text" to text,
            "disable_web_page_preview" to disableWebPagePreview
        )
        if (parseMode != null) body["parse_mode"] = parseMode
        if (replyMarkup != null) body["reply_markup"] = replyMarkup

        val resp = restClient.post()
            .uri("${baseUrl()}/sendMessage")
            .contentType(MediaType.APPLICATION_JSON)
            .body(body)
            .retrieve()
            .body<TgResponse<TgSentMessage>>()
            ?: throw TelegramApiException("sendMessage: empty response")
        if (!resp.ok || resp.result == null) {
            throw TelegramApiException("sendMessage to $chatId failed: ${resp.description}", resp.errorCode)
        }
        return resp.result
    }

    /**
     * Закрепить сообщение в чате.
     * disableNotification = true — pin без шумного уведомления.
     */
    fun pinChatMessage(chatId: Long, messageId: Long, disableNotification: Boolean = true) {
        if (props.dryRun) return
        val resp = restClient.post()
            .uri("${baseUrl()}/pinChatMessage")
            .contentType(MediaType.APPLICATION_JSON)
            .body(mapOf(
                "chat_id" to chatId,
                "message_id" to messageId,
                "disable_notification" to disableNotification
            ))
            .retrieve()
            .body<TgResponse<Any>>()
            ?: throw TelegramApiException("pinChatMessage: empty response")
        if (!resp.ok) {
            throw TelegramApiException("pinChatMessage chat=$chatId msg=$messageId failed: ${resp.description}", resp.errorCode)
        }
    }

    /**
     * Открепить конкретное сообщение. Если messageId не передан — открепляется последнее
     * закрепленное в чате (Telegram-семантика).
     */
    fun unpinChatMessage(chatId: Long, messageId: Long?) {
        if (props.dryRun) return
        val body = mutableMapOf<String, Any>("chat_id" to chatId)
        if (messageId != null) body["message_id"] = messageId
        val resp = restClient.post()
            .uri("${baseUrl()}/unpinChatMessage")
            .contentType(MediaType.APPLICATION_JSON)
            .body(body)
            .retrieve()
            .body<TgResponse<Any>>()
            ?: throw TelegramApiException("unpinChatMessage: empty response")
        if (!resp.ok) {
            // "message to unpin not found" — бывает если уже откреплено вручную; не критично.
            val desc = resp.description.orEmpty()
            if (desc.contains("not found", ignoreCase = true) ||
                desc.contains("message to unpin", ignoreCase = true)) return
            throw TelegramApiException("unpinChatMessage chat=$chatId msg=$messageId failed: $desc", resp.errorCode)
        }
    }
}

/** Билдеры для Bot API inline keyboard. */
object TelegramInlineKeyboard {
    fun urlButton(text: String, url: String): Map<String, Any> = mapOf(
        "inline_keyboard" to listOf(
            listOf(mapOf("text" to text, "url" to url))
        )
    )
}
