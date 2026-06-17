package com.padelgo.bot.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.springframework.data.jpa.repository.JpaRepository
import java.time.Instant

/**
 * Bot-side представление таблицы `telegram_auth_token` (миграция V42 в api-модуле).
 * Бот пишет туда данные юзера когда тот тапнул /start и меняет статус когда тот подтвердил
 * (или отклонил) логин inline-кнопкой. Api читает статус через polling.
 *
 * Lifecycle (синхронизирован с api/TelegramAuthTokenStatus):
 *   PENDING (создан api'ем) → AWAITING_APPROVAL (бот видел /start от юзера) →
 *   APPROVED (юзер тапнул Yes) или REJECTED (Cancel / истёк / нет такого).
 */
@Entity
@Table(name = "telegram_auth_token")
class BotTelegramAuthToken(
    @Id
    @Column(name = "token", length = 64)
    var token: String = "",

    @Column(name = "status", length = 32, nullable = false)
    var status: String = "PENDING",

    @Column(name = "telegram_user_id")
    var telegramUserId: Long? = null,

    @Column(name = "telegram_username", length = 64)
    var telegramUsername: String? = null,

    @Column(name = "first_name", length = 255)
    var firstName: String? = null,

    @Column(name = "last_name", length = 255)
    var lastName: String? = null,

    @Column(name = "photo_url", length = 512)
    var photoUrl: String? = null,

    @Column(name = "expires_at", nullable = false)
    var expiresAt: Instant = Instant.now(),

    @Column(name = "approved_at")
    var approvedAt: Instant? = null,

    @Column(name = "consumed_at")
    var consumedAt: Instant? = null,

    @Column(name = "created_at")
    var createdAt: Instant? = null,

    /**
     * bot-link flow: какому юзеру привязать TG. Если != null — бот после approve
     * зовёт api `/api/internal/bot/finalize-link` для немедленной линковки
     * (чтобы юзер мог сразу регистрироваться на игры через callback в группе,
     * не возвращаясь на сайт).
     */
    @Column(name = "link_target_user_id")
    var linkTargetUserId: java.util.UUID? = null,
)

interface BotTelegramAuthTokenRepository : JpaRepository<BotTelegramAuthToken, String>
