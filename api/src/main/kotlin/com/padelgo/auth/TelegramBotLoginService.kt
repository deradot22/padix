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
    private val mail: MailService,
    @Value("\${app.telegram.bot-username:}") private val botUsername: String,
    @Value("\${app.public-base-url:http://localhost:8083}") private val publicBaseUrl: String,
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

    /** Шаг 6 (complete): обмен токена на JWT, ИЛИ отправка email-confirm письма при коллизии. */
    @Transactional
    fun complete(req: BotLoginCompleteRequest): BotLoginCompleteResponse {
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
            return BotLoginCompleteResponse(token = jwt.createToken(existing.id!!, existing.email, existing.playerId!!, false))
        }

        // 2) Email-collision flow: если юзер задал email который УЖЕ есть в БД, не блокируем
        // и не создаём дубль — шлём confirm-link на email. Это защита от хищения аккаунта:
        // мы не верим что юзер владеет email'ом, только владелец почтового ящика сможет открыть письмо.
        val email = req.email?.trim()?.lowercase()?.ifBlank { null }
        if (email != null) {
            val existingByEmail = users.findByEmailIgnoreCase(email)
            if (existingByEmail != null) {
                return sendEmailConfirmAndAbort(tok, existingByEmail, email)
            }
        }
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
        return BotLoginCompleteResponse(token = jwt.createToken(user.id!!, user.email, user.playerId!!, false))
    }

    /**
     * Email-collision flow: меняем статус токена, генерим короткий confirm-секрет,
     * шлём письмо с link'ом /auth/telegram-link-confirm?confirm=<секрет>.
     * Возвращаем фронту маркер «ждём подтверждения».
     */
    private fun sendEmailConfirmAndAbort(
        tok: TelegramAuthToken,
        existingUser: UserAccount,
        email: String,
    ): BotLoginCompleteResponse {
        val rawConfirm = randomToken()
        tok.emailConfirmTokenHash = sha256(rawConfirm)
        tok.emailConfirmTargetUserId = existingUser.id
        tok.emailConfirmSentTo = email
        tok.status = TelegramAuthTokenStatus.AWAITING_EMAIL_CONFIRM.name
        // Чуть продлеваем токен — юзер должен успеть открыть почту.
        tok.expiresAt = Instant.now().plus(30, ChronoUnit.MINUTES)
        tokenRepo.save(tok)

        val confirmUrl = "${publicBaseUrl.trimEnd('/')}/auth/telegram-link-confirm?confirm=$rawConfirm"
        val telegramDisplay = listOfNotNull(tok.firstName?.trim()?.ifBlank { null }, tok.lastName?.trim()?.ifBlank { null })
            .joinToString(" ")
            .ifBlank { tok.telegramUsername ?: "новый Telegram" }
        val recipientName = players.findById(existingUser.playerId!!).orElse(null)?.name ?: "игрок"

        try {
            mail.sendTelegramLinkConfirmation(email, recipientName, telegramDisplay, confirmUrl)
        } catch (e: Exception) {
            log.error("Failed to send tg-link confirmation to $email", e)
        }

        return BotLoginCompleteResponse(
            awaitingEmailConfirm = AwaitingEmailConfirmInfo(
                emailSentTo = maskEmail(email),
            ),
        )
    }

    /**
     * Шаг 7 (опц.): юзер кликнул по ссылке в письме. Линкуем Telegram к существующему юзеру,
     * выдаём JWT.
     */
    @Transactional
    fun confirmEmailLink(rawConfirm: String): AuthResponse {
        if (rawConfirm.isBlank()) throw ApiException(HttpStatus.BAD_REQUEST, "Confirm token required")
        val tok = tokenRepo.findByEmailConfirmTokenHash(sha256(rawConfirm))
            ?: throw ApiException(HttpStatus.BAD_REQUEST, "Ссылка не найдена или уже использована")
        if (tok.consumedAt != null) {
            throw ApiException(HttpStatus.CONFLICT, "Ссылка уже использована")
        }
        if (tok.status != TelegramAuthTokenStatus.AWAITING_EMAIL_CONFIRM.name) {
            throw ApiException(HttpStatus.CONFLICT, "Эта ссылка больше не действительна (статус=${tok.status})")
        }
        if (tok.expiresAt.isBefore(Instant.now())) {
            throw ApiException(HttpStatus.GONE, "Ссылка истекла")
        }
        val tgUserId = tok.telegramUserId
            ?: throw ApiException(HttpStatus.CONFLICT, "Нет данных Telegram")
        val targetUserId = tok.emailConfirmTargetUserId
            ?: throw ApiException(HttpStatus.CONFLICT, "Нет целевого аккаунта для привязки")

        val user = users.findById(targetUserId).orElseThrow {
            ApiException(HttpStatus.NOT_FOUND, "Целевой аккаунт не найден")
        }

        // Кто-то мог за это время уже привязать другой Telegram к этому аккаунту, либо этот же
        // telegram_user_id мог быть привязан к другому аккаунту. Проверим.
        if (user.telegramUserId != null && user.telegramUserId != tgUserId) {
            throw ApiException(HttpStatus.CONFLICT, "К этому аккаунту уже привязан другой Telegram")
        }
        val takenBy = users.findByTelegramUserId(tgUserId)
        if (takenBy != null && takenBy.id != user.id) {
            throw ApiException(HttpStatus.CONFLICT, "Этот Telegram уже привязан к другому аккаунту")
        }

        user.telegramUserId = tgUserId
        user.telegramUsername = tok.telegramUsername ?: user.telegramUsername
        user.telegramPhotoUrl = tok.photoUrl ?: user.telegramPhotoUrl
        // Раз юзер открыл письмо — фактически подтвердил владение email'ом.
        if (user.emailVerifiedAt == null) user.emailVerifiedAt = Instant.now()
        users.save(user)

        tok.consumedAt = Instant.now()
        tokenRepo.save(tok)

        return AuthResponse(jwt.createToken(user.id!!, user.email, user.playerId!!, false))
    }

    /** "alex@gmail.com" → "a***@g***.com" — для UI «письмо отправлено на ...» без полного раскрытия. */
    private fun maskEmail(email: String): String {
        val parts = email.split("@", limit = 2)
        if (parts.size != 2) return email
        val (local, domain) = parts
        val maskedLocal = if (local.length <= 2) local else local.first() + "***"
        val domainParts = domain.split(".")
        val maskedDomain = if (domainParts.first().length <= 1) domain
        else domainParts.first().first() + "***." + domainParts.drop(1).joinToString(".")
        return "$maskedLocal@$maskedDomain"
    }

    private fun sha256(s: String): String {
        val md = java.security.MessageDigest.getInstance("SHA-256")
        return md.digest(s.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
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

/**
 * Результат /complete: либо JWT (новый юзер создан или существующий по telegram_user_id залогинен),
 * либо awaitingEmailConfirm если фронт должен показать «проверь почту».
 */
data class BotLoginCompleteResponse(
    val token: String? = null,
    val awaitingEmailConfirm: AwaitingEmailConfirmInfo? = null,
)

data class AwaitingEmailConfirmInfo(
    /** Маскированный email типа "a***@g***.com" для отображения юзеру. */
    val emailSentTo: String,
)
