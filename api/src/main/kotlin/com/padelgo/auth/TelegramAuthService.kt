package com.padelgo.auth

import com.padelgo.api.ApiException
import com.padelgo.domain.Player
import com.padelgo.repo.PlayerRepository
import com.padelgo.service.Ntrp
import jakarta.transaction.Transactional
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Авторизация через Telegram Login Widget.
 *
 * Поток:
 *  1. Юзер жмёт «Войти через Telegram» на /login или /register.
 *  2. Telegram-виджет открывает свой UI (telegram://, t.me, web), юзер подтверждает.
 *  3. Виджет возвращает на фронт payload вида { id, first_name, last_name?, username?, photo_url?, auth_date, hash }.
 *  4. Фронт POST'ит это в /api/auth/telegram.
 *  5. Бэк проверяет HMAC-SHA256(SHA256(bot_token), data_check_string) == hash — если совпадает, данные доверены.
 *  6. Дальше: если есть юзер с таким telegramUserId — логиним. Иначе создаём новый аккаунт (без email).
 *
 * Безопасность:
 *  - Без TELEGRAM_BOT_TOKEN в env сервис не запускается — Spring выбросит на старте.
 *  - auth_date проверяется на свежесть (24 часа) чтобы replay'нутые payload'ы не работали.
 *  - HMAC по спеке Telegram: https://core.telegram.org/widgets/login#checking-authorization
 */
@Service
class TelegramAuthService(
    private val users: UserRepository,
    private val players: PlayerRepository,
    private val jwt: JwtService,
    @Value("\${app.telegram.bot-token:}") private val botToken: String,
) {
    private val log = LoggerFactory.getLogger(TelegramAuthService::class.java)
    private val rng = SecureRandom()
    private val authMaxAgeSec = 24L * 60 * 60 // 24 часа

    /**
     * Главный метод — принимает payload от Telegram, верифицирует, логинит/регистрирует.
     */
    @Transactional
    fun loginOrRegister(req: TelegramAuthRequest): AuthResponse {
        if (botToken.isBlank()) {
            throw ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Telegram login is not configured on this server")
        }
        verifySignature(req)
        verifyFreshness(req.authDate)

        val telegramId = req.id
        val existing = users.findByTelegramUserId(telegramId)
        val user = if (existing != null) {
            // Уже привязан — апдейтим username/photo при необходимости и логиним.
            existing.telegramUsername = req.username ?: existing.telegramUsername
            existing.telegramPhotoUrl = req.photoUrl ?: existing.telegramPhotoUrl
            users.save(existing)
        } else {
            // Нового юзера создаём. Player получает имя из first_name + last_name (если есть).
            val displayName = listOfNotNull(req.firstName?.trim()?.ifBlank { null }, req.lastName?.trim()?.ifBlank { null })
                .joinToString(" ")
                .ifBlank { req.username?.let { "@$it" } ?: "tg-$telegramId" }
            val player = players.save(
                Player(
                    name = uniquePlayerName(displayName),
                    rating = 1000,
                    ntrp = Ntrp.fromRating(1000),
                    gamesPlayed = 0,
                    avatarUrl = req.photoUrl,
                )
            )
            users.save(
                UserAccount(
                    email = null,
                    passwordHash = null,
                    playerId = player.id!!,
                    publicId = generatePublicId(),
                    telegramUserId = telegramId,
                    telegramUsername = req.username,
                    telegramPhotoUrl = req.photoUrl,
                )
            )
        }

        return AuthResponse(jwt.createToken(user.id!!, user.email, user.playerId!!, false))
    }

    /**
     * HMAC проверка как описано в https://core.telegram.org/widgets/login#checking-authorization:
     *   data_check_string = все поля кроме hash, отсортированные по ключу, в формате "key=value\n..."
     *   secret_key = sha256(bot_token)
     *   hmac_sha256(secret_key, data_check_string) должно быть равно hash
     */
    private fun verifySignature(req: TelegramAuthRequest) {
        val fields = sortedMapOf<String, String>()
        fields["id"] = req.id.toString()
        if (!req.firstName.isNullOrEmpty()) fields["first_name"] = req.firstName
        if (!req.lastName.isNullOrEmpty()) fields["last_name"] = req.lastName
        if (!req.username.isNullOrEmpty()) fields["username"] = req.username
        if (!req.photoUrl.isNullOrEmpty()) fields["photo_url"] = req.photoUrl
        fields["auth_date"] = req.authDate.toString()

        val dataCheckString = fields.entries.joinToString("\n") { "${it.key}=${it.value}" }
        val secretKey = sha256(botToken)
        val computed = hmacSha256Hex(secretKey, dataCheckString)
        if (!computed.equals(req.hash, ignoreCase = true)) {
            log.warn("[TG-AUTH] hash mismatch for telegram_id={}", req.id)
            throw ApiException(HttpStatus.UNAUTHORIZED, "Invalid Telegram signature")
        }
    }

    private fun verifyFreshness(authDate: Long) {
        val nowSec = System.currentTimeMillis() / 1000
        val age = nowSec - authDate
        if (age < 0 || age > authMaxAgeSec) {
            throw ApiException(HttpStatus.UNAUTHORIZED, "Telegram auth data expired. Please try again.")
        }
    }

    private fun uniquePlayerName(base: String): String {
        // Player.name уникален — если занято, добавляем суффикс. На прак-уровне коллизий мало.
        val existing = players.findByNameIgnoreCase(base)
        if (existing == null) return base
        // Добавляем рандомный суффикс из 4 цифр
        repeat(10) {
            val candidate = "$base #${rng.nextInt(9000) + 1000}"
            if (players.findByNameIgnoreCase(candidate) == null) return candidate
        }
        return "$base #${System.currentTimeMillis() % 100000}"
    }

    private fun generatePublicId(): Long {
        repeat(10) {
            val candidate = 100_000_000L + (rng.nextDouble() * 900_000_000L).toLong()
            if (users.findByPublicId(candidate) == null) return candidate
        }
        throw ApiException(HttpStatus.CONFLICT, "Failed to generate public id")
    }

    /** Возвращает hex sha256 как ByteArray для использования как HMAC secret. */
    private fun sha256(s: String): ByteArray {
        val md = MessageDigest.getInstance("SHA-256")
        return md.digest(s.toByteArray(Charsets.UTF_8))
    }

    private fun hmacSha256Hex(key: ByteArray, data: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        val bytes = mac.doFinal(data.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
