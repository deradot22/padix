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
import java.util.UUID

/**
 * Хранение state и PKCE code_verifier между шагами OAuth Authorization Code Flow.
 * Сейчас используется только Twitter, но таблица универсальная (поле `provider`).
 *
 * Безопасность:
 *  - state — random 32 байта base64url, ключ который Twitter возвращает в callback. Защита от CSRF.
 *  - code_verifier хранится в БД, не в URL/cookie — frontend не должен ничего о нём знать.
 *  - TTL 10 минут — после истечения запись игнорируется при consume.
 */
@Entity
@Table(name = "oauth_state")
class OAuthState(
    @Id
    @Column(name = "state", nullable = false, length = 64)
    var state: String = "",

    @Column(name = "provider", nullable = false, length = 16)
    var provider: String = "",

    @Column(name = "code_verifier", nullable = false, length = 128)
    var codeVerifier: String = "",

    /** Если задан — это flow привязки к существующему юзеру (а не login). null = login/register. */
    @Column(name = "link_user_id")
    var linkUserId: UUID? = null,

    @Column(name = "expires_at", nullable = false)
    var expiresAt: Instant = Instant.now(),

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant? = null,
)

interface OAuthStateRepository : JpaRepository<OAuthState, String> {
    @Modifying
    @Query("delete from OAuthState s where s.expiresAt < :now")
    fun deleteExpired(now: Instant): Int
}
