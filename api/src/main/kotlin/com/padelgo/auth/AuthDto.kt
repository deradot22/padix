package com.padelgo.auth

import com.fasterxml.jackson.annotation.JsonProperty
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank

@Schema(description = "Запрос на регистрацию")
data class RegisterRequest(
    @field:Email
    @field:NotBlank
    @Schema(description = "Email (используется как логин)", example = "player@example.com")
    val email: String,

    @field:NotBlank
    @Schema(description = "Пароль (минимум 6 символов)", example = "secret123")
    val password: String,

    @field:NotBlank
    @Schema(description = "Имя игрока (отображается в интерфейсе)", example = "Алексей Иванов")
    val name: String,

    @Schema(description = "Пол: M — мужской, F — женский. null — не указан", example = "M")
    val gender: String? = null
)

@Schema(description = "Запрос на вход")
data class LoginRequest(
    @field:Email
    @field:NotBlank
    @Schema(description = "Email", example = "player@example.com")
    val email: String,

    @field:NotBlank
    @Schema(description = "Пароль", example = "secret123")
    val password: String
)

@Schema(description = "Ответ при успешной аутентификации")
data class AuthResponse(
    @Schema(description = "JWT токен. Передавать в заголовке: Authorization: Bearer <token>")
    val token: String
)

@Schema(description = "Профиль текущего пользователя")
data class MeResponse(
    @Schema(description = "Email. null — у OAuth-only юзеров без привязанного email (например, Telegram-логин).")
    val email: String?,

    @Schema(description = "UUID связанного игрока (используется при регистрации на игру)")
    val playerId: java.util.UUID,

    @Schema(description = "Имя игрока")
    val name: String,

    @Schema(description = "Рейтинг ELO")
    val rating: Int,

    @Schema(description = "Уровень NTRP: 1.0 / 1.5 / 2.0 / 2.5 / 3.0 / 3.5 / 4.0 / 4.5 / 5.0+")
    val ntrp: String,

    @Schema(description = "Всего сыграно матчей")
    val gamesPlayed: Int,

    @Schema(description = "Публичный ID для добавления в друзья, формат «#123456789»")
    val publicId: String,

    @Schema(description = "true — пользователь прошёл анкету и видит все разделы приложения")
    val surveyCompleted: Boolean,

    @Schema(description = "Уровень игры из анкеты (0.5–5.0) или null если анкета не пройдена")
    val surveyLevel: Double?,

    @Schema(description = "Устаревшее поле, использовать calibrationMatchesRemaining", deprecated = true)
    val calibrationEventsRemaining: Int,

    @Schema(description = "Осталось матчей до конца калибровки. 0 — калибровка завершена. В период калибровки рейтинг меняется быстрее (×1.5)")
    val calibrationMatchesRemaining: Int,

    @Schema(description = "true — не играл больше полугода, рейтинг скрыт из публичных мест до первого матча")
    val ratingHidden: Boolean = false,

    @Schema(description = "URL аватара или null")
    val avatarUrl: String? = null,

    @Schema(description = "Пол: M / F / null")
    val gender: String? = null,

    @Schema(description = "Показывать шансы выигрыша перед матчем (полоска и метка в модале раундов). По умолчанию false.")
    val showWinProbability: Boolean = false,

    @Schema(description = "true — email подтверждён по ссылке из письма")
    val emailVerified: Boolean = false,

    @Schema(description = "true — у юзера задан пароль (можно входить по паролю)")
    val hasPassword: Boolean = false,

    @Schema(description = "Какие OAuth-провайдеры привязаны к аккаунту. Используется на странице Настроек.")
    val authProviders: AuthProvidersInfo = AuthProvidersInfo()
)

@Schema(description = "Ответ /api/me/auth/twitter/link/start — URL для редиректа на Twitter (linkUserId уже привязан к state)")
data class OAuthLinkStartResponse(
    @Schema(description = "URL на x.com/i/oauth2/authorize. Фронт делает window.location.href = url.")
    val url: String,
)

@Schema(description = "Установка или смена пароля. Если у юзера уже задан пароль — нужен currentPassword.")
data class SetPasswordRequest(
    @Schema(description = "Текущий пароль. Обязателен если у юзера уже есть пароль; для OAuth-only можно опустить.")
    val currentPassword: String? = null,
    @field:NotBlank
    @Schema(description = "Новый пароль (минимум 6 символов).")
    val newPassword: String,
)

@Schema(description = "Какие способы входа доступны юзеру")
data class AuthProvidersInfo(
    @Schema(description = "true — привязан Telegram (логин через Telegram Login Widget)")
    val telegram: Boolean = false,
    @Schema(description = "true — привязан Google")
    val google: Boolean = false,
    @Schema(description = "true — привязан Facebook")
    val facebook: Boolean = false,
    @Schema(description = "true — привязан Twitter/X")
    val twitter: Boolean = false,
)

@Schema(description = "Публичный конфиг авторизации — какие OAuth-кнопки рендерить на /login.")
data class AuthConfigResponse(
    @Schema(description = "@username бота для Telegram Login. null — Telegram-логин выключен на этом сервере.")
    val telegramBotUsername: String? = null,
    @Schema(description = "Числовой ID бота (префикс токена до ':'). Используется для redirect-flow на oauth.telegram.org.")
    val telegramBotId: Long? = null,
    @Schema(description = "Google OAuth2 Client ID. null — Google-логин выключен.")
    val googleClientId: String? = null,
    @Schema(description = "Facebook App ID. null — Facebook-логин выключен.")
    val facebookAppId: String? = null,
    @Schema(description = "Twitter/X OAuth2 Client ID. null — Twitter-логин выключен.")
    val twitterClientId: String? = null,
)

@Schema(description = "Запрос на подтверждение email по ссылке из письма")
data class VerifyEmailRequest(
    @field:NotBlank
    @Schema(description = "Токен из ссылки /verify-email?token=...")
    val token: String
)

@Schema(description = "ID-токен от Google Identity Services. Это поле `credential` в callback'е google.accounts.id.")
data class GoogleAuthRequest(
    @field:NotBlank
    @Schema(description = "JWT ID-токен, подписанный Google. Бэк верифицирует через oauth2.googleapis.com/tokeninfo.")
    val idToken: String
)

@Schema(description = "Подтверждение привязки Telegram по ссылке из письма")
data class ConfirmTelegramLinkRequest(
    @field:NotBlank
    @Schema(description = "Сырой confirm-токен из URL")
    val confirm: String,
)

@Schema(description = "Access token от Facebook JS SDK после FB.login()")
data class FacebookAuthRequest(
    @field:NotBlank
    @Schema(description = "User access token из response.authResponse.accessToken. Бэк проверяет через Graph API.")
    val accessToken: String
)

@Schema(description = "Payload от Telegram Login Widget. Все поля приходят как есть из callback'а виджета (snake_case).")
data class TelegramAuthRequest(
    @Schema(description = "Числовой ID юзера в Telegram", example = "12345678")
    val id: Long,
    @JsonProperty("first_name")
    @Schema(description = "Имя из профиля Telegram", example = "Алексей")
    val firstName: String? = null,
    @JsonProperty("last_name")
    @Schema(description = "Фамилия из профиля Telegram (опционально)", example = "Иванов")
    val lastName: String? = null,
    @Schema(description = "@username (без @). Может быть null если юзер не задал.", example = "alexivanov")
    val username: String? = null,
    @JsonProperty("photo_url")
    @Schema(description = "URL аватара (если у юзера есть public profile photo).", example = "https://t.me/i/userpic/...")
    val photoUrl: String? = null,
    @JsonProperty("auth_date")
    @Schema(description = "Unix timestamp когда юзер авторизовался в виджете. Проверяется на свежесть (24ч).", example = "1735000000")
    val authDate: Long,
    @Schema(description = "HMAC-SHA256 подпись данных. Проверяется по bot_token (см. core.telegram.org/widgets/login).")
    val hash: String,
)

@Schema(description = "Запрос на обновление профиля. Передавай только поля, которые нужно изменить")
data class UpdateProfileRequest(
    @Schema(description = "Новое имя", example = "Алексей Петров")
    val name: String? = null,

    @Schema(description = "Новый email", example = "new@example.com")
    val email: String? = null,

    @Deprecated("Используйте POST /api/me/auth/password — там требуется текущий пароль для смены.")
    @Schema(description = "DEPRECATED: смена пароля через /profile больше не работает. Используйте /api/me/auth/password.", deprecated = true)
    val password: String? = null,

    @Schema(description = "Пол: M / F", example = "M")
    val gender: String? = null,

    @Schema(description = "Тоггл «Показывать шансы выигрыша» в модале «Раунды». null — не менять.")
    val showWinProbability: Boolean? = null
)

@Schema(description = "Запрос на обновление аватара")
data class UpdateAvatarRequest(
    @Schema(description = "Data URL изображения (base64), например: data:image/jpeg;base64,... Передай null чтобы удалить аватар")
    val avatarDataUrl: String?
)
