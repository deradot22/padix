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
import java.security.SecureRandom
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Base64
import java.util.UUID

/**
 * Авторизация через бота — без OAuth, без формы с телефоном.
 *
 * Поток:
 *  1. Фронт: POST /api/auth/telegram/bot-login/start → {token, deepLink}
 *  2. Фронт открывает deepLink (`https://t.me/<bot>?start=auth_<token>`)
 *  3. Юзер тапает Start в боте; бот получает /start auth_<token>
 *  4. Бот вызывает [registerStart] — токен переходит в AWAITING_APPROVAL,
 *     заполняются данные юзера, бот отправляет inline-кнопки
 *  5. Юзер тапает «Подтвердить» в боте; бот вызывает [approve]
 *  6. Фронт всё это время поллит /api/auth/telegram/bot-login/status?token=…
 *     → видит APPROVED → POST /complete (с опц. email) → получает JWT
 */
@Service
class TelegramBotLoginService(
    private val tokenRepo: TelegramAuthTokenRepository,
    private val users: UserRepository,
    private val players: PlayerRepository,
    private val jwt: JwtService,
    @Value("\${app.telegram.bot-username:}") private val botUsername: String,
) {
    private val log = LoggerFactory.getLogger(TelegramBotLoginService::class.java)
    private val rng = SecureRandom()

    /** Шаг 1: фронт запрашивает токен. */
    @Transactional
    fun start(): BotLoginStartResult {
        if (botUsername.isBlank()) {
            throw ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Telegram bot login is not configured")
        }
        val token = randomToken()
        tokenRepo.save(
            TelegramAuthToken(
                token = token,
                status = TelegramAuthTokenStatus.PENDING.name,
                expiresAt = Instant.now().plus(5, ChronoUnit.MINUTES),
            )
        )
        return BotLoginStartResult(
            token = token,
            deepLink = "https://t.me/$botUsername?start=auth_$token",
            botUsername = botUsername,
        )
    }

    /**
     * Шаг 4: бот получил /start, теперь знает кто пытается войти. Помечаем токен AWAITING_APPROVAL
     * и сохраняем данные юзера (но JWT пока не выдаём — ждём явного подтверждения).
     * Вызывается ботом по internal-api.
     */
    @Transactional
    fun registerStart(req: BotLoginRegisterStartRequest): TelegramAuthToken {
        val tok = tokenRepo.findById(req.token).orElseThrow {
            ApiException(HttpStatus.NOT_FOUND, "Token not found")
        }
        if (tok.expiresAt.isBefore(Instant.now())) {
            throw ApiException(HttpStatus.GONE, "Token expired")
        }
        if (tok.status == TelegramAuthTokenStatus.APPROVED.name) {
            throw ApiException(HttpStatus.CONFLICT, "Token already approved")
        }
        tok.telegramUserId = req.telegramUserId
        tok.telegramUsername = req.username
        tok.firstName = req.firstName
        tok.lastName = req.lastName
        tok.photoUrl = req.photoUrl
        tok.status = TelegramAuthTokenStatus.AWAITING_APPROVAL.name
        return tokenRepo.save(tok)
    }

    /** Шаг 5: юзер тапнул «Подтвердить» в боте. */
    @Transactional
    fun approve(token: String): TelegramAuthToken {
        val tok = tokenRepo.findById(token).orElseThrow {
            ApiException(HttpStatus.NOT_FOUND, "Token not found")
        }
        if (tok.expiresAt.isBefore(Instant.now())) {
            throw ApiException(HttpStatus.GONE, "Token expired")
        }
        if (tok.telegramUserId == null) {
            throw ApiException(HttpStatus.CONFLICT, "Token not bound to a Telegram user yet")
        }
        tok.status = TelegramAuthTokenStatus.APPROVED.name
        tok.approvedAt = Instant.now()
        return tokenRepo.save(tok)
    }

    /** Шаг 5b: юзер отказался. */
    @Transactional
    fun reject(token: String) {
        val tok = tokenRepo.findById(token).orElse(null) ?: return
        tok.status = TelegramAuthTokenStatus.REJECTED.name
        tokenRepo.save(tok)
    }

    /** Шаг 6 (poll): фронт смотрит статус. */
    fun status(token: String): BotLoginStatus {
        val tok = tokenRepo.findById(token).orElseThrow {
            ApiException(HttpStatus.NOT_FOUND, "Token not found")
        }
        val effectiveStatus = if (tok.expiresAt.isBefore(Instant.now()) &&
            tok.status in listOf(TelegramAuthTokenStatus.PENDING.name, TelegramAuthTokenStatus.AWAITING_APPROVAL.name)
        ) "EXPIRED" else tok.status

        val displayName = listOfNotNull(tok.firstName?.trim()?.ifBlank { null }, tok.lastName?.trim()?.ifBlank { null })
            .joinToString(" ")
            .ifBlank { tok.telegramUsername }

        return BotLoginStatus(
            status = effectiveStatus,
            telegramName = displayName,
            telegramUsername = tok.telegramUsername,
            photoUrl = tok.photoUrl,
            // Только если уже подтверждено — заранее говорим юзер существующий или новый
            existingUser = if (effectiveStatus == TelegramAuthTokenStatus.APPROVED.name) {
                tok.telegramUserId?.let { users.findByTelegramUserId(it) != null }
            } else null,
        )
    }

    /** Шаг 6 (complete): обмен токена на JWT. Создаёт юзера если его нет. */
    @Transactional
    fun complete(req: BotLoginCompleteRequest): AuthResponse {
        val tok = tokenRepo.findById(req.token).orElseThrow {
            ApiException(HttpStatus.NOT_FOUND, "Token not found")
        }
        if (tok.consumedAt != null) {
            throw ApiException(HttpStatus.CONFLICT, "Token already used")
        }
        if (tok.status != TelegramAuthTokenStatus.APPROVED.name) {
            throw ApiException(HttpStatus.CONFLICT, "Token not approved yet (status=${tok.status})")
        }
        if (tok.expiresAt.isBefore(Instant.now())) {
            throw ApiException(HttpStatus.GONE, "Token expired")
        }
        val tgUserId = tok.telegramUserId
            ?: throw ApiException(HttpStatus.CONFLICT, "Missing telegram user data")

        // 1) Уже зарегистрированный юзер? — Логиним.
        val existing = users.findByTelegramUserId(tgUserId)
        if (existing != null) {
            tok.consumedAt = Instant.now()
            tokenRepo.save(tok)
            return AuthResponse(jwt.createToken(existing.id!!, existing.email, existing.playerId!!, false))
        }

        // 2) Новый юзер — создаём аккаунт с данными от Telegram + опц. поля от фронта.
        val displayName = req.name?.trim()?.ifBlank { null }
            ?: listOfNotNull(tok.firstName?.trim()?.ifBlank { null }, tok.lastName?.trim()?.ifBlank { null })
                .joinToString(" ").ifBlank { null }
            ?: tok.telegramUsername
            ?: "tg-$tgUserId"

        val player = players.save(
            Player(
                name = uniquePlayerName(displayName),
                rating = 1000,
                ntrp = Ntrp.fromRating(1000),
                gamesPlayed = 0,
                avatarUrl = tok.photoUrl,
            )
        )
        val user = users.save(
            UserAccount(
                email = req.email?.trim()?.lowercase()?.ifBlank { null },
                passwordHash = null,
                playerId = player.id!!,
                publicId = generatePublicId(),
                telegramUserId = tgUserId,
                telegramUsername = tok.telegramUsername,
                telegramPhotoUrl = tok.photoUrl,
            )
        )
        tok.consumedAt = Instant.now()
        tokenRepo.save(tok)
        return AuthResponse(jwt.createToken(user.id!!, user.email, user.playerId!!, false))
    }

    private fun randomToken(): String {
        val bytes = ByteArray(24)
        rng.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    private fun uniquePlayerName(base: String): String {
        if (players.findByNameIgnoreCase(base) == null) return base
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
}

data class BotLoginStartResult(val token: String, val deepLink: String, val botUsername: String)

data class BotLoginRegisterStartRequest(
    val token: String,
    val telegramUserId: Long,
    val username: String?,
    val firstName: String?,
    val lastName: String?,
    val photoUrl: String?,
)

data class BotLoginStatus(
    val status: String,
    val telegramName: String?,
    val telegramUsername: String?,
    val photoUrl: String?,
    val existingUser: Boolean?,
)

data class BotLoginCompleteRequest(
    val token: String,
    /** Имя игрока. Может быть null — возьмём first_name+last_name от Telegram. */
    val name: String?,
    /** Опциональный email — юзер может задать сразу или пропустить и добавить позже. */
    val email: String?,
)
