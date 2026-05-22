package com.padelgo.auth

import com.padelgo.api.ApiException
import jakarta.transaction.Transactional
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Base64
import java.util.UUID

/**
 * Создаёт и потребляет токены подтверждения email.
 *
 * Безопасность:
 *  - Сырой токен (32 байта base64url) уходит только в URL письма; на сервере хранится sha256-хэш.
 *  - Срок жизни — 24 часа.
 *  - При успешном consume помечается used_at, повторное использование отвергается.
 *  - При создании нового токена все предыдущие активные токены юзера маркируются used,
 *    чтобы старая ссылка из старого письма перестала работать.
 *  - Сверяем email из токена с текущим email юзера — если он сменил адрес, старый токен мёртв.
 */
@Service
class EmailVerificationService(
    private val tokenRepo: EmailVerificationTokenRepository,
    private val userRepo: UserRepository,
    private val mail: MailService,
    @Value("\${app.public-base-url:http://localhost:8083}") private val publicBaseUrl: String,
) {
    private val log = LoggerFactory.getLogger(EmailVerificationService::class.java)
    private val rng = SecureRandom()

    /**
     * Создать токен и отправить письмо. Все предыдущие активные токены этого юзера деактивируются.
     * Если отправка не удалась — токен всё равно создан (юзер может нажать «выслать ещё раз»).
     */
    @Transactional
    fun sendVerificationEmail(user: UserAccount, name: String, purpose: EmailVerificationPurpose) {
        val userId = user.id ?: error("UserAccount must be persisted before sending verification")
        val email = user.email
        if (email.isNullOrBlank()) {
            // OAuth-only юзер (Telegram-логин и т.п.) ещё не привязал email — нечего верифицировать.
            log.debug("Skip sending verification for user {} — no email set", userId)
            return
        }
        val now = Instant.now()
        tokenRepo.markAllActiveAsUsed(userId, now)

        val rawToken = generateToken()
        val token = EmailVerificationToken(
            userId = userId,
            tokenHash = sha256(rawToken),
            purpose = purpose.name,
            email = email,
            expiresAt = now.plus(24, ChronoUnit.HOURS),
        )
        tokenRepo.save(token)

        val verifyUrl = "${publicBaseUrl.trimEnd('/')}/verify-email?token=$rawToken"
        try {
            mail.sendEmailVerification(toEmail = email, toName = name, verifyUrl = verifyUrl)
        } catch (e: Exception) {
            log.error("Failed to send verification email to {}", email, e)
        }
    }

    /**
     * Проверить токен, пометить email юзера как подтверждённый.
     * Возвращает userId если токен валиден; иначе кидает ApiException 400.
     */
    @Transactional
    fun consume(rawToken: String): UUID {
        if (rawToken.isBlank()) throw ApiException(HttpStatus.BAD_REQUEST, "Token is required")
        val token = tokenRepo.findByTokenHash(sha256(rawToken))
            ?: throw ApiException(HttpStatus.BAD_REQUEST, "Invalid or expired verification token")
        val now = Instant.now()
        if (token.usedAt != null) {
            throw ApiException(HttpStatus.BAD_REQUEST, "This verification link has already been used")
        }
        if (token.expiresAt.isBefore(now)) {
            throw ApiException(HttpStatus.BAD_REQUEST, "Verification link expired. Please request a new one.")
        }
        val user = userRepo.findById(token.userId).orElseThrow {
            ApiException(HttpStatus.BAD_REQUEST, "User no longer exists")
        }
        // Email мог поменяться между созданием токена и кликом — тогда токен невалиден.
        // Или email вообще убрали (теоретически) — тоже невалидно.
        val currentEmail = user.email
        if (currentEmail == null || !currentEmail.equals(token.email, ignoreCase = true)) {
            throw ApiException(HttpStatus.BAD_REQUEST, "Verification link no longer matches current email")
        }
        user.emailVerifiedAt = now
        token.usedAt = now
        userRepo.save(user)
        tokenRepo.save(token)
        return user.id!!
    }

    private fun generateToken(): String {
        val bytes = ByteArray(32)
        rng.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    private fun sha256(s: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        val bytes = md.digest(s.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
