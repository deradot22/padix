package com.padelgo.auth

import com.padelgo.api.ApiException
import com.padelgo.service.EventService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
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

@Tag(name = "Auth", description = "Регистрация и вход. Токен из login передаётся во все защищённые эндпоинты.")
@RestController
@RequestMapping("/api/auth")
class AuthController(
    private val auth: AuthService
) {
    @Operation(summary = "Регистрация нового пользователя")
    @PostMapping("/register")
    fun register(@Valid @RequestBody req: RegisterRequest): AuthResponse = auth.register(req)

    @Operation(summary = "Вход. Возвращает JWT токен")
    @PostMapping("/login")
    fun login(@Valid @RequestBody req: LoginRequest): AuthResponse = auth.login(req)
}

@Tag(name = "Profile", description = "Профиль текущего авторизованного пользователя")
@SecurityRequirement(name = "BearerAuth")
@RestController
@RequestMapping("/api/me")
class MeController(
    private val auth: AuthService,
    private val events: EventService,
    private val ratingNotificationRepo: com.padelgo.repo.UserRatingNotificationRepository
) {
    @Operation(summary = "Получить профиль текущего пользователя")
    @GetMapping
    fun me(): MeResponse = auth.me(principal())

    @Operation(summary = "Обновить аватар (base64 data URL)")
    @PatchMapping("/avatar")
    fun updateAvatar(@RequestBody req: UpdateAvatarRequest): MeResponse = auth.updateAvatar(principal(), req)

    @Operation(summary = "Обновить профиль (имя / email / пароль / пол)")
    @PatchMapping("/profile")
    fun updateProfile(@RequestBody req: UpdateProfileRequest): MeResponse = auth.updateProfile(principal(), req)

    @Operation(summary = "История игр (список событий с итогами)")
    @GetMapping("/history")
    fun history(): List<com.padelgo.service.PlayerEventHistoryItem> = events.getEventHistoryForPlayer(principal().playerId)

    @Operation(summary = "Детали матчей в конкретной игре из истории")
    @GetMapping("/history/{eventId}")
    fun historyEvent(@PathVariable eventId: java.util.UUID): List<com.padelgo.service.PlayerMatchHistoryItem> =
        events.getMatchesForPlayerInEvent(principal().playerId, eventId)

    @Operation(summary = "История изменений рейтинга (точки для графика)")
    @GetMapping("/rating-history")
    fun ratingHistory(): List<com.padelgo.service.RatingHistoryPoint> =
        events.getRatingHistoryForPlayer(principal().playerId)

    @Operation(
        summary = "Последнее непрочитанное уведомление об изменении рейтинга",
        description = "Возвращает одно уведомление или null. Показывай pop-up после игры. После показа — вызови /seen."
    )
    @GetMapping("/rating-notification")
    fun ratingNotification(): com.padelgo.domain.UserRatingNotification? =
        ratingNotificationRepo.findFirstByUserIdAndSeenAtIsNullOrderByCreatedAtDesc(principal().userId)

    @Operation(summary = "Отметить уведомление о рейтинге как прочитанное")
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
