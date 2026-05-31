package com.padelgo.auth

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import java.time.Instant

/**
 * Одноразовый токен для «логина через бота». Lifecycle:
 *
 *  PENDING → бэк создал, фронт открыл deep-link, ждёт бота.
 *  AWAITING_APPROVAL → бот получил /start, заполнил данные юзера, ждёт inline-кнопки.
 *  APPROVED → юзер тапнул «Подтвердить» в боте, можно конвертить в JWT.
 *  REJECTED → юзер тапнул «Отмена» или бот отверг.
 *  EXPIRES → не использован за 5 минут.
 */
enum class TelegramAuthTokenStatus {
    PENDING,
    AWAITING_APPROVAL,
    APPROVED,
    /**
     * Юзер на /complete вбил email, который уже есть у другого юзера. Шлём ему confirm-link
     * на этот email; он кликает → линкуем Telegram к существующему аккаунту → JWT.
     */
    AWAITING_EMAIL_CONFIRM,
    REJECTED,
}

@Entity
@Table(name = "telegram_auth_token")
class TelegramAuthToken(
    @Id
    @Column(name = "token", length = 64)
    var token: String = "",

    @Column(name = "status", length = 32, nullable = false)
    var status: String = TelegramAuthTokenStatus.PENDING.name,

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

    /** SHA-256 хэш короткого confirm-секрета (сырой шлётся в URL письма). */
    @Column(name = "email_confirm_token_hash", length = 64)
    var emailConfirmTokenHash: String? = null,

    /** Кому привязать Telegram при успешном confirm'е (UUID существующего юзера). */
    @Column(name = "email_confirm_target_user_id")
    var emailConfirmTargetUserId: java.util.UUID? = null,

    /** На какой email мы отправили подтверждение (для отображения «письмо отправлено на ...»). */
    @Column(name = "email_confirm_sent_to", length = 255)
    var emailConfirmSentTo: String? = null,

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant? = null,
)

interface TelegramAuthTokenRepository : JpaRepository<TelegramAuthToken, String> {
    @Modifying
    @Query("update TelegramAuthToken t set t.status = 'REJECTED' where t.expiresAt < :now and t.status in ('PENDING','AWAITING_APPROVAL','AWAITING_EMAIL_CONFIRM')")
    fun expireOld(now: Instant): Int

    fun findByEmailConfirmTokenHash(hash: String): TelegramAuthToken?
}
