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
    private val events: EventService,
    private val ratingNotificationRepo: com.padelgo.repo.UserRatingNotificationRepository
) {
    @GetMapping
    fun me(): MeResponse = auth.me(principal())

    @PatchMapping("/avatar")
    fun updateAvatar(@RequestBody req: UpdateAvatarRequest): MeResponse = auth.updateAvatar(principal(), req)

    @PatchMapping("/profile")
    fun updateProfile(@RequestBody req: UpdateProfileRequest): MeResponse = auth.updateProfile(principal(), req)

    @GetMapping("/history")
    fun history(): List<com.padelgo.service.PlayerEventHistoryItem> = events.getEventHistoryForPlayer(principal().playerId)

    @GetMapping("/history/{eventId}")
    fun historyEvent(@PathVariable eventId: java.util.UUID): List<com.padelgo.service.PlayerMatchHistoryItem> =
        events.getMatchesForPlayerInEvent(principal().playerId, eventId)

    @GetMapping("/rating-history")
    fun ratingHistory(): List<com.padelgo.service.RatingHistoryPoint> =
        events.getRatingHistoryForPlayer(principal().playerId)

    @GetMapping("/rating-notification")
    fun ratingNotification(): com.padelgo.domain.UserRatingNotification? =
        ratingNotificationRepo.findFirstByUserIdAndSeenAtIsNullOrderByCreatedAtDesc(principal().userId)

    @PostMapping("/rating-notification/{id}/seen")
    fun markRatingNotificationSeen(@PathVariable id: java.util.UUID) {
        val n = ratingNotificationRepo.findById(id).orElse(null) ?: return
        if (n.userId != principal().userId) return
        n.seenAt = java.time.Instant.now()
        ratingNotificationRepo.save(n)
    }

    private fun principal(): JwtPrincipal {
        val p = SecurityContextHolder.getContext().authentication?.principal
        if (p is JwtPrincipal) return p
        throw ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized")
    }
}

