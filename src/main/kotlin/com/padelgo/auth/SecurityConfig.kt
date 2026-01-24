package com.padelgo.auth

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter
import org.springframework.web.filter.OncePerRequestFilter

@Configuration
@EnableMethodSecurity
class SecurityConfig(
    private val jwtService: JwtService,
    private val userRepo: UserRepository
) {
    @Bean
    fun passwordEncoder(): PasswordEncoder = BCryptPasswordEncoder()

    @Bean
    fun filterChain(http: HttpSecurity): SecurityFilterChain {
        http.csrf { it.disable() }
        http.sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }

        http.authorizeHttpRequests { auth ->
            auth
                .requestMatchers(
                    "/api/auth/**",
                    "/api/players/rating",
                    "/swagger-ui.html",
                    "/swagger-ui/**",
                    "/v3/api-docs/**"
                ).permitAll()
                .anyRequest().authenticated()
        }

        http.addFilterBefore(JwtAuthFilter(jwtService), UsernamePasswordAuthenticationFilter::class.java)
        http.addFilterAfter(SurveyGateFilter(userRepo), JwtAuthFilter::class.java)
        return http.build()
    }
}

class JwtAuthFilter(
    private val jwtService: JwtService
) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain
    ) {
        val header = request.getHeader(HttpHeaders.AUTHORIZATION)
        if (header != null && header.startsWith("Bearer ")) {
            val token = header.removePrefix("Bearer ").trim()
            try {
                val principal = jwtService.parse(token)
                val auth = UsernamePasswordAuthenticationToken(principal, null, emptyList())
                SecurityContextHolder.getContext().authentication = auth
            } catch (_: Exception) {
                response.status = HttpStatus.UNAUTHORIZED.value()
                response.contentType = "application/json"
                response.writer.write("""{"status":401,"error":"Unauthorized","message":"Invalid token"}""")
                return
            }
        }
        filterChain.doFilter(request, response)
    }
}

/**
 * Server-side gate:
 * Before survey is completed, the user can only access:
 * - /api/me and /api/me/...
 * - /api/survey/...
 * - /api/auth/...
 * - public rating
 */
class SurveyGateFilter(
    private val userRepo: UserRepository
) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain
    ) {
        val path = request.requestURI
        val principal = SecurityContextHolder.getContext().authentication?.principal
        if (principal is JwtPrincipal) {
            val user = userRepo.findById(principal.userId).orElse(null)
            val completed = user?.surveyCompleted == true
            val allowed = path.startsWith("/api/auth/") ||
                path == "/api/players/rating" ||
                path.startsWith("/api/survey/") ||
                path == "/api/me" ||
                path.startsWith("/api/me/")
            if (!completed && !allowed) {
                response.status = HttpStatus.FORBIDDEN.value()
                response.contentType = "application/json"
                response.writer.write("""{"status":403,"error":"Forbidden","message":"Survey is required"}""")
                return
            }
        }
        filterChain.doFilter(request, response)
    }
}
