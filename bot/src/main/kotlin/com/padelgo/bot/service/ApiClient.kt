package com.padelgo.bot.service

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
import java.util.UUID

/**
 * HTTP-клиент bot → api. Использует тот же `X-Internal-Secret`, что и api → bot
 * (валидируется на api стороне в InternalAuthFilter).
 *
 * Сейчас используется только для регистрации юзера на игру по тапу inline-кнопки
 * «📝 Зарегистрироваться» из Telegram (callback_query handler).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class RegisterUserResult(
    /** OK | NOT_LINKED | NOT_FOUND | CLOSED | FULL | ALREADY | ERROR */
    val status: String = "ERROR",
    val message: String = ""
)

@Configuration
class ApiClientConfig {
    @Bean(name = ["apiRestClient"])
    fun apiRestClient(): RestClient {
        val http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build()
        val factory = JdkClientHttpRequestFactory(http).apply {
            setReadTimeout(Duration.ofSeconds(15))
        }
        return RestClient.builder().requestFactory(factory).build()
    }
}

@Component
class ApiClient(
    @org.springframework.beans.factory.annotation.Qualifier("apiRestClient")
    private val apiRestClient: RestClient,
    @Value("\${app.api.base-url:}") private val baseUrl: String,
    @Value("\${app.internal.secret:}") private val secret: String
) {
    private val log = LoggerFactory.getLogger(ApiClient::class.java)

    fun isConfigured(): Boolean = baseUrl.isNotBlank() && secret.isNotBlank()

    fun registerUser(tgUserId: Long, eventId: UUID): RegisterUserResult {
        if (!isConfigured()) {
            log.warn("ApiClient not configured (base-url or secret blank)")
            return RegisterUserResult("ERROR", "Сервис временно недоступен.")
        }
        val body = mapOf("tgUserId" to tgUserId, "eventId" to eventId.toString())
        return try {
            apiRestClient.post()
                .uri("$baseUrl/api/internal/bot/register-user")
                .header("X-Internal-Secret", secret)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body<RegisterUserResult>()
                ?: RegisterUserResult("ERROR", "Пустой ответ api.")
        } catch (e: RestClientResponseException) {
            log.warn("api register-user failed: HTTP {} {}", e.statusCode.value(), e.responseBodyAsString)
            RegisterUserResult("ERROR", "Ошибка api (${e.statusCode.value()}).")
        } catch (e: Exception) {
            log.warn("api register-user failed: {}", e.message)
            RegisterUserResult("ERROR", "Ошибка связи с api.")
        }
    }
}
