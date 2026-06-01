package com.padelgo.auth

import io.jsonwebtoken.ExpiredJwtException
import io.jsonwebtoken.JwtException
import io.jsonwebtoken.MalformedJwtException
import io.jsonwebtoken.UnsupportedJwtException
import io.jsonwebtoken.security.SignatureException
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.authentication.ProviderManager
import org.springframework.security.authentication.dao.DaoAuthenticationProvider
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.core.userdetails.User
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.provisioning.InMemoryUserDetailsManager
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.CorsConfigurationSource
import org.springframework.web.cors.UrlBasedCorsConfigurationSource
import org.springframework.web.filter.OncePerRequestFilter

@Configuration
@EnableMethodSecurity
class SecurityConfig(
    private val jwtService: JwtService,
    private val userRepo: UserRepository,
    private val rateLimiter: RateLimiter,
    @Value("\${app.swagger.username}") private val swaggerUsername: String,
    @Value("\${app.swagger.password}") private val swaggerPassword: String,
    @Value("\${app.internal.secret:}") private val internalSecret: String
) {
    @Bean
    fun passwordEncoder(): PasswordEncoder = BCryptPasswordEncoder()

    @Bean
    @Order(1)
    fun swaggerFilterChain(http: HttpSecurity): SecurityFilterChain {
        val userDetails = InMemoryUserDetailsManager(
            User.withUsername(swaggerUsername)
                .password("{noop}$swaggerPassword")
                .authorities(SimpleGrantedAuthority("ROLE_SWAGGER"))
                .build()
        )
        val provider = DaoAuthenticationProvider().also { it.setUserDetailsService(userDetails) }

        http
            .securityMatcher("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**")
            .csrf { it.disable() }
            .authorizeHttpRequests { it.anyRequest().authenticated() }
            .httpBasic { }
            .authenticationManager(ProviderManager(provider))
        return http.build()
    }

    @Bean
    @Order(2)
    fun filterChain(http: HttpSecurity): SecurityFilterChain {
        http.csrf { it.disable() }
        http.cors { }
        http.sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }

        http.authorizeHttpRequests { auth ->
            auth
                .requestMatchers(org.springframework.http.HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers(
                    "/api/auth/**",
                    "/api/admin/login",
                    "/api/players/rating"
                ).permitAll()
                .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/events/*", "/api/events/today", "/api/events/upcoming").permitAll()
                .anyRequest().authenticated()
        }

        http.exceptionHandling { handler ->
            handler.authenticationEntryPoint { _, response, _ ->
                response.status = HttpStatus.UNAUTHORIZED.value()
                response.contentType = "application/json"
                response.writer.write("""{"status":401,"error":"Unauthorized","message":"Unauthorized"}""")
            }
            handler.accessDeniedHandler { _, response, _ ->
                response.status = HttpStatus.FORBIDDEN.value()
                response.contentType = "application/json"
                response.writer.write("""{"status":403,"error":"Forbidden","message":"Access denied"}""")
            }
        }

        // Rate-limit фильтр перед JWT чтобы не делать лишней работы (парсинг токена)
        // если запрос всё равно будет отброшен по лимиту. Инстанцируем вручную (не bean),
        // чтобы Spring Boot не зарегистрировал его в глобальной servlet-цепочке дважды.
        val rateLimitFilter = RateLimitFilter(rateLimiter)
        http.addFilterBefore(rateLimitFilter, UsernamePasswordAuthenticationFilter::class.java)
        http.addFilterAfter(JwtAuthFilter(jwtService), RateLimitFilter::class.java)
        // InternalAuthFilter работает только на /api/internal/** (shouldNotFilter)
        // и валидирует X-Internal-Secret — используется bot → api направлением.
        http.addFilterAfter(InternalAuthFilter(internalSecret), JwtAuthFilter::class.java)
        http.addFilterAfter(SurveyGateFilter(userRepo), JwtAuthFilter::class.java)
        return http.build()
    }

    @Bean
    fun corsConfigurationSource(): CorsConfigurationSource {
        val config = CorsConfiguration()
        // Exact production origins
        config.allowedOrigins = listOf(
            "https://padix.club",
            "https://www.padix.club",
            "http://localhost:5173",
            "http://localhost:8081",
            "http://localhost:8083",
            // Локальный dev через hosts-трюк: padix.club → 127.0.0.1, чтобы Telegram-бот
            // использовал один и тот же домен в проде и в локалке.
            "http://padix.club:8083",
            "http://www.padix.club:8083"
        )
        // Patterns (allowedOriginPatterns supports wildcards, allowedOrigins does not).
        // Покрывает:
        //  - Cloudflare Pages preview (<hash>.padix.pages.dev)
        //  - lvh.me / nip.io — публичные DNS на 127.0.0.1, нужны для dev-тестов
        //    Telegram Login Widget (он не принимает "localhost" как домен бота)
        //  - ngrok-туннели
        config.allowedOriginPatterns = listOf(
            "https://*.padix.pages.dev",
            "http://*.lvh.me:*",
            "http://lvh.me:*",
            "http://*.nip.io:*",
            "https://*.ngrok-free.app",
            "https://*.ngrok.io"
        )
        config.allowedMethods = listOf("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
        config.allowedHeaders = listOf("*")
        config.allowCredentials = true
        val source = UrlBasedCorsConfigurationSource()
        source.registerCorsConfiguration("/**", config)
        return source
    }
}

class JwtAuthFilter(
    private val jwtService: JwtService
) : OncePerRequestFilter() {
    private val log = LoggerFactory.getLogger(JwtAuthFilter::class.java)

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain
    ) {
        val header = request.getHeader(HttpHeaders.AUTHORIZATION)
        if (header != null && header.startsWith("Bearer ")) {
            val token = header.removePrefix("Bearer ").trim()
            // Diagnostic: безопасный fingerprint для матчинга с клиентом без утечки секрета.
            val tokenInfo = "len=${token.length} dots=${token.count { it == '.' }} prefix=${token.take(12)} suffix=${token.takeLast(6)}"
            try {
                val principal = jwtService.parse(token)
                val auth = UsernamePasswordAuthenticationToken(principal, null, emptyList())
                SecurityContextHolder.getContext().authentication = auth
            } catch (e: ExpiredJwtException) {
                log.info("JWT expired for path={} {} cause={}", request.requestURI, tokenInfo, e.message)
                unauthorized(response, "Session expired")
                return
            } catch (e: SignatureException) {
                log.warn("JWT signature invalid for path={} {} cause={}", request.requestURI, tokenInfo, e.message)
                unauthorized(response, "Token signature invalid")
                return
            } catch (e: MalformedJwtException) {
                log.warn("JWT malformed for path={} {} cause={}", request.requestURI, tokenInfo, e.message)
                unauthorized(response, "Token malformed")
                return
            } catch (e: UnsupportedJwtException) {
                log.warn("JWT unsupported for path={} {} cause={}", request.requestURI, tokenInfo, e.message)
                unauthorized(response, "Token unsupported")
                return
            } catch (e: JwtException) {
                log.warn("JWT rejected for path={} {} cause={}", request.requestURI, tokenInfo, e.message)
                unauthorized(response, "Invalid token")
                return
            } catch (e: Exception) {
                log.error("JWT auth filter error path={} {}", request.requestURI, tokenInfo, e)
                unauthorized(response, "Invalid token")
                return
            }
        }
        filterChain.doFilter(request, response)
    }

    private fun unauthorized(response: HttpServletResponse, message: String) {
        response.status = HttpStatus.UNAUTHORIZED.value()
        response.contentType = "application/json"
        response.writer.write("""{"status":401,"error":"Unauthorized","message":"$message"}""")
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
            if (principal.isAdmin) {
                filterChain.doFilter(request, response)
                return
            }
            val user = userRepo.findById(principal.userId).orElse(null)
            if (user == null) {
                // Token references a user that no longer exists — clear auth and continue
                SecurityContextHolder.clearContext()
                filterChain.doFilter(request, response)
                return
            }
            if (user.disabled) {
                response.status = HttpStatus.FORBIDDEN.value()
                response.contentType = "application/json"
                response.writer.write("""{"status":403,"error":"Forbidden","message":"Account disabled"}""")
                return
            }
            val completed = user.surveyCompleted
            val allowed = path.startsWith("/api/auth/") ||
                path == "/api/players/rating" ||
                path.startsWith("/api/survey/") ||
                path == "/api/me" ||
                path.startsWith("/api/me/") ||
                // Feedback доступен и до прохождения анкеты — чтобы пожаловаться на сам онбординг.
                path.startsWith("/api/feedback") ||
                (path.startsWith("/api/events/") && (
                    path.endsWith("/invites") ||
                    path.endsWith("/invites/accept") ||
                    path.endsWith("/invites/decline") ||
                    path.endsWith("/rounds/add") ||
                    path.endsWith("/rounds/final")
                )) ||
                (path.startsWith("/api/events/matches/") && path.endsWith("/score"))
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
