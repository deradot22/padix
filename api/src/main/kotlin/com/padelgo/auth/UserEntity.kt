package com.padelgo.auth

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.annotations.UuidGenerator
import org.hibernate.type.SqlTypes
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "users")
class UserAccount(
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    /**
     * Email юзера. Nullable: при регистрации через Telegram email может отсутствовать —
     * Telegram такое поле не отдаёт. Юзер может добавить email позже через /settings,
     * это потребует подтверждения по ссылке.
     */
    @Column(name = "email", nullable = true, unique = true)
    var email: String? = null,

    /**
     * Bcrypt-хэш пароля. Nullable для OAuth-only юзеров (зарегались через Telegram/Google
     * и пароль не задавали). Логин по паролю для таких аккаунтов невозможен пока юзер
     * не задаст пароль через настройки.
     */
    @Column(name = "password_hash", nullable = true)
    var passwordHash: String? = null,

    @Column(name = "player_id", nullable = false, unique = true)
    var playerId: UUID? = null,

    @Column(name = "public_id", nullable = false, unique = true)
    var publicId: Long = 0,

    @Column(name = "survey_completed", nullable = false)
    var surveyCompleted: Boolean = false,

    @Column(name = "survey_level")
    var surveyLevel: Double? = null,

    @Column(name = "survey_version", nullable = false)
    var surveyVersion: Int = 1,

    @Column(name = "survey_payload", columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    var surveyPayload: String? = null,

    @Column(name = "disabled", nullable = false)
    var disabled: Boolean = false,

    @Column(name = "calibration_events_remaining", nullable = false)
    var calibrationEventsRemaining: Int = 0,

    @Column(name = "calibration_matches_remaining", nullable = false)
    var calibrationMatchesRemaining: Int = 0,

    @Column(name = "gender", length = 1)
    var gender: String? = null,

    /** Показывать шансы выигрыша в модале «Раунды» (фаза 1 — статичный Elo expectedScore). */
    @Column(name = "show_win_probability", nullable = false)
    var showWinProbability: Boolean = false,

    /**
     * Этот юзер получает TG-уведомления о новых тикетах обратной связи.
     * Назначается в /admin. Может быть несколько таких юзеров — нотификация летит каждому,
     * у кого привязан PRIVATE Telegram-чат.
     */
    @Column(name = "is_feedback_admin", nullable = false)
    var isFeedbackAdmin: Boolean = false,

    /**
     * Когда email был подтверждён по ссылке. null — email не подтверждён.
     * Существующим аккаунтам выставляется now() в миграции V37, чтобы текущие юзеры
     * не получали баннер «подтвердите email».
     */
    @Column(name = "email_verified_at")
    var emailVerifiedAt: Instant? = null,

    /**
     * Числовой ID пользователя в Telegram. Используется для логина через Telegram Login Widget.
     * Отдельно от существующего telegram_chat.chat_id, который хранит куда слать нотификации
     * (может быть группа или канал).
     */
    @Column(name = "telegram_user_id", unique = true)
    var telegramUserId: Long? = null,

    /** @username в Telegram (если у юзера выставлен). */
    @Column(name = "telegram_username", length = 64)
    var telegramUsername: String? = null,

    /** URL аватара из Telegram (если у юзера выставлен public profile photo). */
    @Column(name = "telegram_photo_url", length = 512)
    var telegramPhotoUrl: String? = null,

    /**
     * Google subject ID — стабильный уникальный идентификатор юзера в Google. Не меняется
     * при смене email/имени в Google-аккаунте. Из claim `sub` ID-токена при логине через Google.
     */
    @Column(name = "google_sub", length = 255, unique = true)
    var googleSub: String? = null,

    /**
     * Facebook user ID (т.н. ASID). Уникальный per-app, не меняется. Получается из /me?fields=id.
     */
    @Column(name = "facebook_sub", length = 64, unique = true)
    var facebookSub: String? = null,

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant? = null
)

