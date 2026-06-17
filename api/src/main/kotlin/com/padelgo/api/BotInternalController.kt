package com.padelgo.api

import com.padelgo.auth.TelegramAuthTokenRepository
import com.padelgo.auth.TelegramAuthTokenStatus
import com.padelgo.auth.UserRepository
import com.padelgo.service.EventService
import com.padelgo.repo.EventRepository
import com.padelgo.repo.RegistrationRepository
import com.padelgo.domain.EventStatus
import com.padelgo.domain.RegistrationStatus
import io.swagger.v3.oas.annotations.tags.Tag
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant
import java.util.UUID

/**
 * Endpoints используемые bot'ом для inline-callback'ов в Telegram. Защищены
 * `X-Internal-Secret` (см. InternalAuthFilter). НЕ Swagger-документированы:
 * это «внутреннее» API между микросервисами.
 *
 * Дизайн: bot получает callback_query (например, тап «📝 Зарегистрироваться»),
 * берёт из payload tg_user_id отправителя, шлёт сюда POST. api находит padix-юзера
 * по `users.telegram_user_id`, проверяет статус игры и регистрирует. Возвращает
 * статус-объект для отображения тостом в Telegram.
 */
@Tag(name = "BotInternal", description = "internal-эндпоинты bot → api (X-Internal-Secret)")
@RestController
@RequestMapping("/api/internal/bot")
class BotInternalController(
    private val eventService: EventService,
    private val eventRepo: EventRepository,
    private val regRepo: RegistrationRepository,
    private val userRepo: UserRepository,
    private val authTokenRepo: TelegramAuthTokenRepository,
) {
    private val log = LoggerFactory.getLogger(BotInternalController::class.java)

    @PostMapping("/register-user")
    fun registerUser(@RequestBody req: RegisterFromBotRequest): RegisterFromBotResponse {
        val user = userRepo.findByTelegramUserId(req.tgUserId)
            ?: return RegisterFromBotResponse(
                status = "NOT_LINKED",
                message = "Привяжи Telegram в Padix → Профиль → Интеграции."
            )
        val playerId = user.playerId
            ?: return RegisterFromBotResponse(
                status = "NOT_LINKED",
                message = "У аккаунта нет игрока. Открой Padix в браузере."
            )
        val event = eventRepo.findById(req.eventId).orElse(null)
            ?: return RegisterFromBotResponse(status = "NOT_FOUND", message = "Игра не найдена.")
        if (event.status != EventStatus.OPEN_FOR_REGISTRATION) {
            return RegisterFromBotResponse(
                status = "CLOSED",
                message = "Регистрация на эту игру закрыта."
            )
        }
        // Уже зарегистрирован?
        val existing = regRepo.findByEventIdAndPlayerId(req.eventId, playerId)
        if (existing != null && existing.status == RegistrationStatus.REGISTERED) {
            return RegisterFromBotResponse(status = "ALREADY", message = "Ты уже записан ✓")
        }
        // Вместимость?
        val capacity = event.courtsCount * 4
        val currentCount = regRepo.countByEventIdAndStatus(req.eventId).toInt()
        if (currentCount >= capacity) {
            return RegisterFromBotResponse(
                status = "FULL",
                message = "Места закончились ($currentCount/$capacity)."
            )
        }
        return try {
            eventService.register(req.eventId, playerId)
            RegisterFromBotResponse(status = "OK", message = "✅ Записан на игру!")
        } catch (e: ApiException) {
            log.info("register via bot rejected: {} for user {} event {}", e.message, user.id, req.eventId)
            RegisterFromBotResponse(
                status = if (e.status == HttpStatus.CONFLICT) "CLOSED" else "ERROR",
                message = e.message ?: "Не удалось зарегистрироваться."
            )
        } catch (e: Exception) {
            log.warn("register via bot failed: {}", e.message)
            RegisterFromBotResponse(status = "ERROR", message = "Не удалось зарегистрироваться.")
        }
    }

    /**
     * После того как юзер тапнул «✅ Войти» в боте (bot-link flow), бот зовёт этот
     * endpoint чтобы api сразу записал `users.telegram_user_id` для соответствующего
     * аккаунта. Без этого юзер с iPhone, который не возвращался на сайт после approve,
     * получал «нужно привязать аккаунт» при tap'е «📝 Зарегистрироваться» в группе.
     *
     * Идемпотентен: повторный вызов на уже-привязанном юзере = no-op. Конфликты
     * (другой TG уже привязан, этот TG у другого юзера) — возвращаем status, не падаем.
     */
    @PostMapping("/finalize-link")
    @Transactional
    fun finalizeLink(@RequestBody req: FinalizeLinkRequest): FinalizeLinkResponse {
        val tok = authTokenRepo.findById(req.token).orElse(null)
            ?: return FinalizeLinkResponse("TOKEN_NOT_FOUND")
        if (tok.expiresAt.isBefore(Instant.now())) return FinalizeLinkResponse("EXPIRED")
        if (tok.status != TelegramAuthTokenStatus.APPROVED.name) return FinalizeLinkResponse("NOT_APPROVED")
        val targetUserId = tok.linkTargetUserId ?: return FinalizeLinkResponse("NOT_LINK_TOKEN")
        val tgUserId = tok.telegramUserId ?: return FinalizeLinkResponse("NO_TG_USER")

        val user = userRepo.findById(targetUserId).orElse(null)
            ?: return FinalizeLinkResponse("USER_NOT_FOUND")
        if (user.telegramUserId == tgUserId) return FinalizeLinkResponse("ALREADY_LINKED")
        if (user.telegramUserId != null) return FinalizeLinkResponse("ANOTHER_TG_ALREADY_LINKED")
        val takenBy = userRepo.findByTelegramUserId(tgUserId)
        if (takenBy != null && takenBy.id != user.id) return FinalizeLinkResponse("TG_USED_BY_OTHER")

        user.telegramUserId = tgUserId
        user.telegramUsername = tok.telegramUsername ?: user.telegramUsername
        user.telegramPhotoUrl = tok.photoUrl ?: user.telegramPhotoUrl
        userRepo.save(user)
        log.info("finalize-link: telegram_user_id={} → user={}", tgUserId, user.id)
        return FinalizeLinkResponse("OK")
    }
}

data class RegisterFromBotRequest(
    /** Telegram user id того кто нажал кнопку (из callback_query.from.id). */
    val tgUserId: Long,
    val eventId: UUID
)

data class RegisterFromBotResponse(
    /** OK | NOT_LINKED | NOT_FOUND | CLOSED | FULL | ALREADY | ERROR */
    val status: String,
    /** Текст для отображения в answerCallbackQuery (тост / alert в Telegram). */
    val message: String
)

data class FinalizeLinkRequest(val token: String)
data class FinalizeLinkResponse(val status: String)
