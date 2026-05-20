package com.padelgo.bot.api

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.web.servlet.FilterRegistrationBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

// Bot — internal-only сервис. Все эндпойнты под /api требуют header X-Internal-Secret,
// совпадающий с app.internal.secret. Это защищает bot от прямых обращений в обход api.
// На user-facing эндпойнтах api дополнительно прокидывает X-User-Id после JWT-проверки.
@Component
class InternalAuthFilter(
    @Value("\${app.internal.secret}") private val expectedSecret: String
) : OncePerRequestFilter() {
    private val log = LoggerFactory.getLogger(InternalAuthFilter::class.java)

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain
    ) {
        val path = request.requestURI ?: ""
        // Actuator / health пускаем без проверки (если будет позже).
        if (!path.startsWith("/api/")) {
            filterChain.doFilter(request, response)
            return
        }
        if (expectedSecret.isBlank()) {
            log.error("app.internal.secret is empty — refusing all requests")
            response.status = HttpStatus.SERVICE_UNAVAILABLE.value()
            response.writer.write("internal secret not configured")
            return
        }
        val provided = request.getHeader("X-Internal-Secret")
        if (provided != expectedSecret) {
            response.status = HttpStatus.FORBIDDEN.value()
            response.writer.write("forbidden")
            return
        }
        filterChain.doFilter(request, response)
    }
}

@Configuration
class InternalAuthFilterConfig {
    @Bean
    fun internalAuthFilterRegistration(filter: InternalAuthFilter): FilterRegistrationBean<InternalAuthFilter> =
        FilterRegistrationBean(filter).apply {
            order = 1
        }
}
