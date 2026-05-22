package com.padelgo.auth

import io.github.bucket4j.Bandwidth
import io.github.bucket4j.Bucket
import io.github.bucket4j.ConsumptionProbe
import io.github.bucket4j.Refill
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap

/**
 * Простой in-memory rate limiter на IP. Не выживает рестарт api и не шардится между подами —
 * для одного пода Spring Boot этого достаточно. Если api начнём масштабировать —
 * заменим на `bucket4j-redis` с общим хранилищем.
 *
 * Лимиты сейчас умышленно мягкие, чтобы не блокировать семьи за одним NAT:
 *   - register:                5 / час  на IP
 *   - login:                  10 / 5 минут на IP
 *   - resend-verification:     3 / 15 минут на IP
 */
@Component
class RateLimiter {
    // Ключ = "policy|ip", чтобы одно и то же IP могло иметь разные бакеты для разных эндпоинтов.
    private val buckets = ConcurrentHashMap<String, Bucket>()

    /**
     * @return ConsumptionProbe.isConsumed=true если запрос разрешён,
     *         иначе getNanosToWaitForRefill() — сколько ждать до следующего токена.
     */
    fun tryConsume(policy: RateLimitPolicy, ip: String): ConsumptionProbe {
        val key = "${policy.name}|$ip"
        val bucket = buckets.computeIfAbsent(key) { newBucket(policy) }
        return bucket.tryConsumeAndReturnRemaining(1)
    }

    private fun newBucket(policy: RateLimitPolicy): Bucket =
        Bucket.builder()
            .addLimit(
                Bandwidth.classic(
                    policy.capacity.toLong(),
                    Refill.intervally(policy.capacity.toLong(), policy.window),
                ),
            )
            .build()
}

/** Конфигурация лимитов в одном месте — удобно менять при тюнинге. */
enum class RateLimitPolicy(val capacity: Int, val window: Duration) {
    REGISTER(capacity = 5, window = Duration.ofHours(1)),
    LOGIN(capacity = 10, window = Duration.ofMinutes(5)),
    RESEND_VERIFICATION(capacity = 3, window = Duration.ofMinutes(15)),
}

/**
 * Фильтр перед SecurityConfig'овским JwtAuthFilter. Срабатывает только на нужные пути,
 * остальные запросы проходят без проверки.
 *
 * Реальный IP берём из заголовков (Cloudflare → CF-Connecting-IP, иначе X-Forwarded-For),
 * иначе `request.remoteAddr`. Прокси-доверие настроено в SecurityConfig (cors)
 * и Tomcat-уровне (server.forward-headers-strategy=framework — Spring Boot дефолт).
 */
class RateLimitFilter(private val limiter: RateLimiter) : OncePerRequestFilter() {
    private val log = LoggerFactory.getLogger(RateLimitFilter::class.java)

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val policy = policyForRequest(request)
        if (policy == null) {
            chain.doFilter(request, response)
            return
        }
        val ip = clientIp(request)
        val probe = limiter.tryConsume(policy, ip)
        if (probe.isConsumed) {
            chain.doFilter(request, response)
            return
        }
        val retryAfterSec = (probe.nanosToWaitForRefill / 1_000_000_000L).coerceAtLeast(1)
        log.info("[RATE-LIMIT] {} blocked for ip={} policy={} retryAfter={}s", request.requestURI, ip, policy.name, retryAfterSec)
        response.status = HttpStatus.TOO_MANY_REQUESTS.value()
        response.setHeader("Retry-After", retryAfterSec.toString())
        response.contentType = "application/json"
        val message = when (policy) {
            RateLimitPolicy.REGISTER -> "Слишком много регистраций с этого IP. Попробуйте через ${formatDuration(retryAfterSec)}."
            RateLimitPolicy.LOGIN -> "Слишком много попыток входа. Попробуйте через ${formatDuration(retryAfterSec)}."
            RateLimitPolicy.RESEND_VERIFICATION -> "Слишком частые запросы на отправку письма. Попробуйте через ${formatDuration(retryAfterSec)}."
        }
        response.writer.write(
            """{"status":429,"error":"Too Many Requests","message":${jsonString(message)}}""",
        )
    }

    private fun policyForRequest(request: HttpServletRequest): RateLimitPolicy? {
        if (request.method != "POST") return null
        val path = request.requestURI
        return when {
            path == "/api/auth/register" -> RateLimitPolicy.REGISTER
            path == "/api/auth/login" -> RateLimitPolicy.LOGIN
            path == "/api/me/resend-verification" -> RateLimitPolicy.RESEND_VERIFICATION
            else -> null
        }
    }

    private fun clientIp(request: HttpServletRequest): String {
        // Cloudflare кладёт реальный IP сюда.
        request.getHeader("CF-Connecting-IP")?.takeIf { it.isNotBlank() }?.let { return it.trim() }
        // X-Forwarded-For: "client, proxy1, proxy2" — берём первого (client).
        request.getHeader("X-Forwarded-For")?.takeIf { it.isNotBlank() }?.let {
            return it.split(",").first().trim()
        }
        return request.remoteAddr ?: "unknown"
    }

    private fun formatDuration(seconds: Long): String = when {
        seconds < 60 -> "$seconds сек"
        seconds < 3600 -> "${seconds / 60} мин"
        else -> "${seconds / 3600} ч"
    }

    private fun jsonString(s: String): String =
        "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
}
