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
    private val auth: AuthService,
    private val emailVerification: EmailVerificationService,
    private val telegramAuth: TelegramAuthService,
    private val googleAuth: GoogleAuthService,
    private val facebookAuth: FacebookAuthService,
    private val twitterAuth: TwitterAuthService,
    @org.springframework.beans.factory.annotation.Value("\${app.telegram.bot-username:}") private val telegramBotUsername: String,
    // bot_id — числовой ID бота (первая часть TELEGRAM_BOT_TOKEN до ':'). Нужен фронту для redirect-flow
    // на oauth.telegram.org/auth?bot_id=... — это надёжнее iframe-виджета с попапами.
    @org.springframework.beans.factory.annotation.Value("\${app.telegram.bot-token:}") private val telegramBotToken: String,
    @org.springframework.beans.factory.annotation.Value("\${app.google.client-id:}") private val googleClientId: String,
    @org.springframework.beans.factory.annotation.Value("\${app.facebook.app-id:}") private val facebookAppId: String,
    @org.springframework.beans.factory.annotation.Value("\${app.twitter.client-id:}") private val twitterClientId: String,
) {
    @Operation(
        summary = "Публичный конфиг авторизации",
        description = "Возвращает какие OAuth-провайдеры включены на сервере. Фронт использует чтобы " +
            "понять, рендерить ли кнопки «Войти через Telegram/Google». Не требует авторизации."
    )
    @GetMapping("/config")
    fun config(): AuthConfigResponse {
        // Telegram bot_id — числовой префикс TELEGRAM_BOT_TOKEN до ':'.
        // Нужен фронту для redirect-flow на oauth.telegram.org/auth?bot_id=...
        // (вместо хрупкого iframe-виджета с попапами).
        val botId = telegramBotToken.substringBefore(":").trim().toLongOrNull()
        return AuthConfigResponse(
            telegramBotUsername = telegramBotUsername.ifBlank { null },
            telegramBotId = botId,
            googleClientId = googleClientId.ifBlank { null },
            facebookAppId = facebookAppId.ifBlank { null },
            twitterClientId = twitterClientId.ifBlank { null },
        )
    }

    @Operation(summary = "Регистрация нового пользователя")
    @PostMapping("/register")
    fun register(@Valid @RequestBody req: RegisterRequest): AuthResponse = auth.register(req)

    @Operation(summary = "Вход. Возвращает JWT токен")
    @PostMapping("/login")
    fun login(@Valid @RequestBody req: LoginRequest): AuthResponse = auth.login(req)

    @Operation(
        summary = "Подтвердить email по токену из письма",
        description = "Публичный эндпойнт. Юзер кликает по ссылке /verify-email?token=... — фронт шлёт сюда токен."
    )
    @PostMapping("/verify-email")
    fun verifyEmail(@Valid @RequestBody req: VerifyEmailRequest) {
        emailVerification.consume(req.token)
    }

    @Operation(
        summary = "Войти/зарегистрироваться через Telegram Login Widget",
        description = "Принимает payload от Telegram-виджета (id, hash, auth_date, first_name и т.д.), " +
            "верифицирует HMAC-подпись, логинит существующего юзера или создаёт нового. Возвращает JWT."
    )
    @PostMapping("/telegram")
    fun telegram(@RequestBody req: TelegramAuthRequest): AuthResponse = telegramAuth.loginOrRegister(req)

    @Operation(
        summary = "Войти/зарегистрироваться через Google Sign-In",
        description = "Принимает ID-токен от Google Identity Services (`credential` в callback'е), " +
            "верифицирует через Google tokeninfo endpoint, логинит существующего юзера (или авто-линкует " +
            "к аккаунту с тем же email если он verified в Google), либо создаёт нового. Возвращает JWT."
    )
    @PostMapping("/google")
    fun google(@Valid @RequestBody req: GoogleAuthRequest): AuthResponse = googleAuth.loginOrRegister(req.idToken)

    @Operation(
        summary = "Войти/зарегистрироваться через Facebook Login",
        description = "Принимает access_token от FB JS SDK. Бэк через Graph API верифицирует токен " +
            "и забирает профиль. Auto-link к существующему email-аккаунту аналогично Google."
    )
    @PostMapping("/facebook")
    fun facebook(@Valid @RequestBody req: FacebookAuthRequest): AuthResponse = facebookAuth.loginOrRegister(req.accessToken)

    @Operation(
        summary = "Старт Twitter/X OAuth — редирект на x.com/authorize",
        description = "Браузер ходит на этот эндпойнт напрямую (`window.location = ...`). Бэк генерит " +
            "state и PKCE, сохраняет в БД и 302-редиректит на Twitter."
    )
    @GetMapping("/twitter/start")
    fun twitterStart(response: jakarta.servlet.http.HttpServletResponse) {
        val url = twitterAuth.buildAuthorizeUrl()
        response.sendRedirect(url)
    }

    @Operation(
        summary = "Callback от Twitter/X после авторизации",
        description = "Twitter сам редиректит сюда с ?code=&state=. Бэк exchange'ит code, получает " +
            "профиль, делает login/register и 302-редиректит на фронт /auth/oauth-callback#token=<JWT>."
    )
    @GetMapping("/twitter/callback")
    fun twitterCallback(
        @org.springframework.web.bind.annotation.RequestParam(required = false) code: String?,
        @org.springframework.web.bind.annotation.RequestParam(required = false) state: String?,
        @org.springframework.web.bind.annotation.RequestParam(required = false) error: String?,
        response: jakarta.servlet.http.HttpServletResponse,
    ) {
        val url = twitterAuth.handleCallback(code = code, state = state, errorParam = error)
        response.sendRedirect(url)
    }
}

@Tag(name = "Profile", description = "Профиль текущего авторизованного пользователя")
@SecurityRequirement(name = "BearerAuth")
@RestController
@RequestMapping("/api/me")
class MeController(
    private val auth: AuthService,
    private val events: EventService,
    private val providerLink: ProviderLinkService,
    private val twitterAuth: TwitterAuthService,
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

    @Operation(
        summary = "Выслать ссылку подтверждения email повторно",
        description = "Только для текущего юзера, у которого email ещё не подтверждён. Старые ссылки деактивируются."
    )
    @PostMapping("/resend-verification")
    fun resendVerification() = auth.resendVerification(principal())

    @Operation(
        summary = "Установить/сменить пароль",
        description = "Если у юзера уже есть пароль — currentPassword обязателен. " +
            "Для OAuth-only юзеров (зарегались через Telegram/Google и т.п.) currentPassword можно опустить — " +
            "это первая установка пароля. Минимум 6 символов."
    )
    @PostMapping("/auth/password")
    fun setPassword(@Valid @RequestBody req: SetPasswordRequest): MeResponse {
        auth.setPassword(principal(), req.currentPassword, req.newPassword)
        return auth.me(principal())
    }

    @Operation(summary = "Привязать Google к текущему аккаунту")
    @PostMapping("/auth/google/link")
    fun linkGoogle(@Valid @RequestBody req: GoogleAuthRequest): MeResponse =
        providerLink.linkGoogle(principal(), req.idToken)

    @Operation(summary = "Привязать Facebook к текущему аккаунту")
    @PostMapping("/auth/facebook/link")
    fun linkFacebook(@Valid @RequestBody req: FacebookAuthRequest): MeResponse =
        providerLink.linkFacebook(principal(), req.accessToken)

    @Operation(summary = "Привязать Telegram к текущему аккаунту")
    @PostMapping("/auth/telegram/link")
    fun linkTelegram(@RequestBody req: TelegramAuthRequest): MeResponse =
        providerLink.linkTelegram(principal(), req)

    @Operation(
        summary = "Старт привязки Twitter — возвращает URL для window.location",
        description = "В отличие от других провайдеров, Twitter использует redirect flow. " +
            "Этот endpoint требует JWT, создаёт state с привязкой к текущему userId, возвращает URL. " +
            "Фронт делает window.location.href = url. После callback'а пользователь линкуется и " +
            "редиректится на /auth/oauth-callback с новым JWT."
    )
    @PostMapping("/auth/twitter/link/start")
    fun linkTwitterStart(): OAuthLinkStartResponse =
        OAuthLinkStartResponse(url = twitterAuth.buildAuthorizeUrl(linkUserId = principal().userId))

    @Operation(summary = "Отвязать провайдера от аккаунта")
    @org.springframework.web.bind.annotation.DeleteMapping("/auth/{provider}")
    fun unlinkProvider(@PathVariable provider: String): MeResponse {
        val enum = try {
            ProviderLinkService.Provider.valueOf(provider.uppercase())
        } catch (e: IllegalArgumentException) {
            throw ApiException(HttpStatus.BAD_REQUEST, "Unknown provider: $provider")
        }
        return providerLink.unlink(principal(), enum)
    }

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
