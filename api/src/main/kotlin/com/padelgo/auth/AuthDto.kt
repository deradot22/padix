package com.padelgo.auth

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
    @Schema(description = "Email")
    val email: String,

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

    @Schema(description = "URL аватара или null")
    val avatarUrl: String? = null,

    @Schema(description = "Пол: M / F / null")
    val gender: String? = null,

    @Schema(description = "Показывать шансы выигрыша перед матчем (полоска и метка в модале раундов). По умолчанию false.")
    val showWinProbability: Boolean = false,

    @Schema(description = "true — email подтверждён по ссылке из письма")
    val emailVerified: Boolean = false
)

@Schema(description = "Запрос на подтверждение email по ссылке из письма")
data class VerifyEmailRequest(
    @field:NotBlank
    @Schema(description = "Токен из ссылки /verify-email?token=...")
    val token: String
)

@Schema(description = "Запрос на обновление профиля. Передавай только поля, которые нужно изменить")
data class UpdateProfileRequest(
    @Schema(description = "Новое имя", example = "Алексей Петров")
    val name: String? = null,

    @Schema(description = "Новый email", example = "new@example.com")
    val email: String? = null,

    @Schema(description = "Новый пароль", example = "newpassword123")
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
