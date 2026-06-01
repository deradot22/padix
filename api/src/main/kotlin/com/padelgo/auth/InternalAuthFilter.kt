package com.padelgo.auth

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpStatus
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.filter.OncePerRequestFilter

/**
 * Для путей /api/internal/... валидирует `X-Internal-Secret`. Если совпадает —
 * ставит в SecurityContext anon-principal, чтобы запрос считался аутентифицированным
 * и проходил `.anyRequest().authenticated()`. Иначе отвечает 401.
 *
 * Используется bot → api направлением (например, регистрация юзера на игру по callback
 * inline-кнопки в Telegram).
 */
class InternalAuthFilter(
    private val expectedSecret: String
) : OncePerRequestFilter() {

    override fun shouldNotFilter(request: HttpServletRequest): Boolean =
        !request.requestURI.startsWith("/api/internal/")

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain
    ) {
        if (expectedSecret.isBlank()) {
            // Защита от деплоя без секрета.
            respondUnauthorized(response, "Internal secret not configured")
            return
        }
        val provided = request.getHeader("X-Internal-Secret")
        if (provided != expectedSecret) {
            respondUnauthorized(response, "Invalid X-Internal-Secret")
            return
        }
        // Ставим минимальный principal "internal" чтобы прошли authenticated()-чекеры.
        val auth = UsernamePasswordAuthenticationToken("internal", null, emptyList())
        SecurityContextHolder.getContext().authentication = auth
        filterChain.doFilter(request, response)
    }

    private fun respondUnauthorized(response: HttpServletResponse, message: String) {
        response.status = HttpStatus.UNAUTHORIZED.value()
        response.contentType = "application/json"
        response.writer.write("""{"status":401,"error":"Unauthorized","message":"$message"}""")
    }
}
