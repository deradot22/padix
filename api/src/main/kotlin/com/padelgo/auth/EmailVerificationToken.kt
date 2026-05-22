package com.padelgo.auth

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UuidGenerator
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import java.time.Instant
import java.util.UUID

/**
 * Одноразовый токен подтверждения email. На клиент уходит сырой token (32 байта base64url),
 * в БД лежит только SHA-256 хэш — если БД утечёт, токены не используются.
 *
 * Lifecycle:
 *  - create() в [EmailVerificationService] при register / resend / смене email в профиле
 *  - consume() при клике юзера на ссылку из письма
 *  - истекшие подчищаются по cron (или просто игнорируются при consume)
 */
@Entity
@Table(name = "email_verification_tokens")
class EmailVerificationToken(
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    @Column(name = "user_id", nullable = false)
    var userId: UUID,

    @Column(name = "token_hash", nullable = false, length = 64)
    var tokenHash: String,

    /** REGISTRATION | EMAIL_CHANGE | RESEND. См. enum [EmailVerificationPurpose]. */
    @Column(name = "purpose", nullable = false, length = 32)
    var purpose: String = EmailVerificationPurpose.REGISTRATION.name,

    /**
     * Email на момент создания токена. При consume сверяем с текущим email юзера —
     * если юзер уже сменил email, старый токен не должен «подтверждать» новый адрес.
     */
    @Column(name = "email", nullable = false, length = 255)
    var email: String,

    @Column(name = "expires_at", nullable = false)
    var expiresAt: Instant,

    @Column(name = "used_at")
    var usedAt: Instant? = null,

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant? = null,
)

enum class EmailVerificationPurpose { REGISTRATION, EMAIL_CHANGE, RESEND }

interface EmailVerificationTokenRepository : JpaRepository<EmailVerificationToken, UUID> {
    fun findByTokenHash(tokenHash: String): EmailVerificationToken?

    @Modifying
    @Query("update EmailVerificationToken t set t.usedAt = :now where t.userId = :userId and t.usedAt is null")
    fun markAllActiveAsUsed(userId: UUID, now: Instant): Int
}
