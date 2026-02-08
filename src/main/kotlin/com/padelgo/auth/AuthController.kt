package com.padelgo.auth

import com.padelgo.api.ApiException
import com.padelgo.service.EventService
import org.springframework.http.HttpStatus
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import jakarta.validation.Valid

@RestController
@RequestMapping("/api/auth")
class AuthController(
    private val auth: AuthService
) {
    @PostMapping("/register")
    fun register(@Valid @RequestBody req: RegisterRequest): AuthResponse = auth.register(req)

    @PostMapping("/login")
    fun login(@Valid @RequestBody req: LoginRequest): AuthResponse = auth.login(req)
}

@RestController
@RequestMapping("/api/me")
class MeController(
    private val auth: AuthService,
    private val events: EventService
) {
    @GetMapping
    fun me(): MeResponse = auth.me(principal())

    @PatchMapping("/avatar")
    fun updateAvatar(@RequestBody req: UpdateAvatarRequest): MeResponse = auth.updateAvatar(principal(), req)

    @GetMapping("/history")
    fun history(): List<com.padelgo.service.PlayerEventHistoryItem> = events.getEventHistoryForPlayer(principal().playerId)

    @GetMapping("/history/{eventId}")
    fun historyEvent(@PathVariable eventId: java.util.UUID): List<com.padelgo.service.PlayerMatchHistoryItem> =
        events.getMatchesForPlayerInEvent(principal().playerId, eventId)

    private fun principal(): JwtPrincipal {
        val p = SecurityContextHolder.getContext().authentication?.principal
        if (p is JwtPrincipal) return p
        throw ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized")
    }
}

