package com.padelgo.bot.service

import com.padelgo.bot.api.BotApiException
import com.padelgo.bot.domain.BotEvent
import com.padelgo.bot.domain.BotPlayer
import com.padelgo.bot.domain.EventTelegramPost
import com.padelgo.bot.domain.TelegramChat
import com.padelgo.bot.domain.TelegramChatType
import com.padelgo.bot.domain.TelegramLinkToken
import com.padelgo.bot.domain.TelegramUserSettings
import com.padelgo.bot.repo.BotUserRepository
import com.padelgo.bot.repo.EventTelegramPostRepository
import com.padelgo.bot.repo.TelegramChatRepository
import com.padelgo.bot.repo.TelegramLinkTokenRepository
import com.padelgo.bot.repo.TelegramUserSettingsRepository
import jakarta.transaction.Transactional
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import java.security.SecureRandom
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Base64
import java.util.Locale
import java.util.UUID

data class LinkTokenInfo(
    val token: String,
    val botUsername: String,
    val deeplink: String,
    val linkCommand: String,
    val expiresAt: Instant
)

data class TelegramChatInfo(
    val id: UUID,
    val chatType: String,
    val title: String,
    val linkedAt: Instant?,
    val notifyUpdated: Boolean,
    val notifyFinished: Boolean,
    val notifyReminder: Boolean
)

data class TelegramUserSettingsInfo(
    val enabled: Boolean,
    val reminderHours: Int,
    val quietHoursStart: LocalTime?,
    val quietHoursEnd: LocalTime?,
    val timezone: String,
    val pinAnnouncement: Boolean
)

data class UpdateTelegramSettingsRequest(
    val enabled: Boolean? = null,
    val reminderHours: Int? = null,
    val quietHoursStart: LocalTime? = null,
    val quietHoursEnd: LocalTime? = null,
    val quietHoursDisabled: Boolean? = null,
    val timezone: String? = null,
    val pinAnnouncement: Boolean? = null
)

data class UpdateTelegramChatPreferencesRequest(
    val notifyUpdated: Boolean? = null,
    val notifyFinished: Boolean? = null,
    val notifyReminder: Boolean? = null
)

data class FinishTopPlayer(
    val name: String,
    val delta: Int
)

data class FinishLeaderboardEntry(
    val name: String,
    val points: Int
)

data class TelegramCancellationPlan(
    val title: String,
    val targetTgChatIds: List<Long>,
    /** Исходные CREATED-посты (chat_id + message_id + pinned_message_id). Снимаем пин,
     *  редактируем сообщение в «отменено», чтобы исходный закреплённый анонс
     *  не оставался жить в чате без статуса. */
    val originalPosts: List<TelegramCancellationOriginalPost> = emptyList()
)

data class TelegramCancellationOriginalPost(
    val tgChatId: Long,
    val messageId: Long,
    val pinnedMessageId: Long?
)

@Service
class TelegramService(
    private val client: TelegramClient,
    private val props: TelegramProps,
    private val tokenRepo: TelegramLinkTokenRepository,
    private val chatRepo: TelegramChatRepository,
    private val postRepo: EventTelegramPostRepository,
    private val settingsRepo: TelegramUserSettingsRepository,
    private val userRepo: BotUserRepository,
    private val seriesRepo: com.padelgo.bot.repo.BotEventSeriesRepository,
    private val eventRepo: com.padelgo.bot.repo.BotEventRepository,
    private val regRepo: com.padelgo.bot.repo.BotRegistrationRepository,
    private val authTokenRepo: com.padelgo.bot.domain.BotTelegramAuthTokenRepository,
) {
    private val log = LoggerFactory.getLogger(TelegramService::class.java)
    private val random = SecureRandom()
    private val tokenTtl: Duration = Duration.ofMinutes(15)

    @Value("\${app.public-base-url}")
    private lateinit var publicBaseUrl: String

    fun isEnabled(): Boolean = client.isConfigured() && props.botUsername.isNotBlank()

    fun botUsernameOrEmpty(): String = props.botUsername

    // ---------- Привязка ----------

    @Transactional
    fun createLinkToken(userId: UUID): LinkTokenInfo {
        check(isEnabled()) { "Telegram integration is disabled" }
        val bytes = ByteArray(20)
        random.nextBytes(bytes)
        val token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        val expiresAt = Instant.now().plus(tokenTtl)
        tokenRepo.save(TelegramLinkToken(token = token, userId = userId, expiresAt = expiresAt))
        return LinkTokenInfo(
            token = token,
            botUsername = props.botUsername,
            deeplink = "https://t.me/${props.botUsername}?start=$token",
            linkCommand = "/link $token",
            expiresAt = expiresAt
        )
    }

    fun listChats(userId: UUID): List<TelegramChatInfo> =
        chatRepo.findAllByUserIdOrderByLinkedAtAsc(userId).map { it.toInfo() }

    @Transactional
    fun unlinkChat(userId: UUID, chatId: UUID) {
        val chat = chatRepo.findByIdAndUserId(chatId, userId)
            ?: throw BotApiException(HttpStatus.NOT_FOUND, "Chat link not found")
        chatRepo.delete(chat)
    }

    private fun TelegramChat.toInfo(): TelegramChatInfo = TelegramChatInfo(
        id = id!!,
        chatType = chatType,
        title = title,
        linkedAt = linkedAt,
        notifyUpdated = notifyUpdated,
        notifyFinished = notifyFinished,
        notifyReminder = notifyReminder
    )

    // ---------- Настройки уведомлений ----------

    @Transactional
    fun getOrCreateSettings(userId: UUID): TelegramUserSettings =
        settingsRepo.findById(userId).orElseGet {
            settingsRepo.save(TelegramUserSettings(userId = userId))
        }

    @Transactional
    fun getSettingsInfo(userId: UUID): TelegramUserSettingsInfo {
        val s = getOrCreateSettings(userId)
        return TelegramUserSettingsInfo(
            enabled = s.enabled,
            reminderHours = s.reminderHours,
            quietHoursStart = s.quietHoursStart,
            quietHoursEnd = s.quietHoursEnd,
            timezone = s.timezone,
            pinAnnouncement = s.pinAnnouncement
        )
    }

    @Transactional
    fun updateSettings(userId: UUID, req: UpdateTelegramSettingsRequest): TelegramUserSettingsInfo {
        val s = getOrCreateSettings(userId)
        req.enabled?.let { s.enabled = it }
        req.reminderHours?.let {
            if (it < 0 || it > 168) throw BotApiException(HttpStatus.BAD_REQUEST, "reminderHours must be 0..168")
            s.reminderHours = it
        }
        if (req.quietHoursDisabled == true) {
            s.quietHoursStart = null
            s.quietHoursEnd = null
        } else {
            req.quietHoursStart?.let { s.quietHoursStart = it }
            req.quietHoursEnd?.let { s.quietHoursEnd = it }
        }
        req.timezone?.let {
            try { ZoneId.of(it) } catch (e: Exception) {
                throw BotApiException(HttpStatus.BAD_REQUEST, "Unknown timezone: $it")
            }
            s.timezone = it
        }
        req.pinAnnouncement?.let { s.pinAnnouncement = it }
        settingsRepo.save(s)
        return TelegramUserSettingsInfo(
            enabled = s.enabled,
            reminderHours = s.reminderHours,
            quietHoursStart = s.quietHoursStart,
            quietHoursEnd = s.quietHoursEnd,
            timezone = s.timezone,
            pinAnnouncement = s.pinAnnouncement
        )
    }

    @Transactional
    fun updateChatPreferences(
        userId: UUID,
        chatId: UUID,
        req: UpdateTelegramChatPreferencesRequest
    ): TelegramChatInfo {
        val chat = chatRepo.findByIdAndUserId(chatId, userId)
            ?: throw BotApiException(HttpStatus.NOT_FOUND, "Chat link not found")
        req.notifyUpdated?.let { chat.notifyUpdated = it }
        req.notifyFinished?.let { chat.notifyFinished = it }
        req.notifyReminder?.let { chat.notifyReminder = it }
        chatRepo.save(chat)
        return chat.toInfo()
    }

    private fun isQuietNow(s: TelegramUserSettings): Boolean {
        val start = s.quietHoursStart
        val end = s.quietHoursEnd
        if (start == null || end == null || start == end) return false
        val tz = try { ZoneId.of(s.timezone) } catch (_: Exception) { ZoneId.of("UTC") }
        val now = LocalTime.now(tz)
        return if (start.isBefore(end)) {
            !now.isBefore(start) && now.isBefore(end)
        } else {
            !now.isBefore(start) || now.isBefore(end)
        }
    }

    // ---------- Обработка update'ов от polling ----------

    @Transactional
    fun handleUpdate(update: TgUpdate) {
        // 1) Inline-кнопки бот-логина — отдельный путь без message.
        update.callbackQuery?.let { cb ->
            val data = cb.data.orEmpty()
            if (data.startsWith("padix_auth:")) {
                handleAuthCallback(cb, data)
            } else {
                // Неизвестный callback — отвечаем чтобы спиннер у юзера не висел.
                runCatching { client.answerCallbackQuery(cb.id) }
            }
            return
        }

        val message = update.message ?: update.channelPost ?: return
        val text = message.text?.trim() ?: return
        val chat = message.chat
        val chatType = parseChatType(chat.type)

        when {
            text.startsWith("/start") && chatType == TelegramChatType.PRIVATE -> {
                handleStartInPrivate(text, message)
            }

            text.startsWith("/link") -> {
                handleLinkCommand(text, chat, chatType)
            }

            text.startsWith("/help") || text.startsWith("/start") -> {
                replySafely(chat.id, helpText())
            }
        }
    }

    private fun handleStartInPrivate(text: String, message: TgMessage) {
        val parts = text.split(Regex("\\s+"), limit = 2)
        val payload = parts.getOrNull(1)?.trim().orEmpty()
        val chat = message.chat
        val fromName = message.from?.firstName ?: chat.firstName ?: "друг"

        // Бот-логин: токен с префиксом "auth_" — отдельный поток (заполняем данные юзера
        // и шлём inline-кнопки подтверждения вместо привязки чата).
        if (payload.startsWith("auth_")) {
            handleAuthStart(payload.removePrefix("auth_"), message)
            return
        }

        if (payload.isBlank()) {
            replySafely(
                chat.id,
                "Привет, $fromName! 👋\n\n" +
                    "Это бот Padix для отправки приглашений на игры в ваши Telegram-чаты.\n\n" +
                    "Чтобы привязать этот чат — откройте профиль в Padix → «Интеграции» → " +
                    "«Привязать Telegram» и нажмите кнопку для лички.\n\n" +
                    "Чтобы привязать группу — добавьте меня туда и отправьте там команду " +
                    "<code>/link &lt;токен&gt;</code> с токеном из Padix."
            )
            return
        }

        val title = chat.displayTitle()
        val linked = tryLinkByToken(payload, chat.id, TelegramChatType.PRIVATE, title)
        if (linked) {
            replySafely(
                chat.id,
                "Готово, $fromName! ✅\nЭтот чат привязан к вашему профилю Padix. " +
                    "Теперь при создании игры вы сможете отправлять приглашения сюда."
            )
        } else {
            replySafely(
                chat.id,
                "Не удалось привязать: токен недействителен или истёк. " +
                    "Сгенерируйте новый в Padix → Профиль → Интеграции."
            )
        }
    }

    private fun handleLinkCommand(text: String, chat: TgChat, chatType: TelegramChatType) {
        val parts = text.split(Regex("\\s+"), limit = 2)
        val payload = parts.getOrNull(1)?.trim().orEmpty()
        if (payload.isBlank()) {
            replySafely(
                chat.id,
                "Использование: <code>/link &lt;токен&gt;</code>\n" +
                    "Токен можно получить в Padix → Профиль → Интеграции → «Привязать Telegram»."
            )
            return
        }
        val title = chat.displayTitle()
        val linked = tryLinkByToken(payload, chat.id, chatType, title)
        if (linked) {
            replySafely(
                chat.id,
                "Готово ✅\nЧат <b>${escapeHtml(title)}</b> привязан к Padix. " +
                    "Сюда будут приходить анонсы новых игр."
            )
        } else {
            replySafely(
                chat.id,
                "Токен недействителен или истёк. Сгенерируйте новый в Padix."
            )
        }
    }

    /**
     * Бот-логин шаг 1 («auth_»): юзер открыл бота через deep-link с auth-токеном.
     * Заполняем данные юзера в таблице и шлём inline-кнопки подтверждения.
     */
    @Transactional
    private fun handleAuthStart(token: String, message: TgMessage) {
        val chat = message.chat
        val from = message.from
        if (from == null) {
            replySafely(chat.id, "Не удалось определить вашего пользователя. Попробуйте ещё раз.")
            return
        }
        val tok = authTokenRepo.findById(token).orElse(null)
        if (tok == null) {
            replySafely(chat.id, "Токен входа не найден. Откройте Padix и начните вход заново.")
            return
        }
        if (tok.expiresAt.isBefore(Instant.now())) {
            replySafely(chat.id, "⌛ Токен истёк (живёт 5 минут). Откройте Padix и начните вход заново.")
            return
        }
        if (tok.status == "APPROVED" || tok.status == "REJECTED" || tok.consumedAt != null) {
            replySafely(chat.id, "Этот токен уже использован. Откройте Padix и начните вход заново.")
            return
        }

        tok.telegramUserId = from.id
        tok.telegramUsername = from.username
        tok.firstName = from.firstName
        tok.lastName = from.lastName
        tok.status = "AWAITING_APPROVAL"
        authTokenRepo.save(tok)

        val displayName = listOfNotNull(from.firstName, from.lastName).joinToString(" ").ifBlank {
            from.username ?: "Пользователь"
        }
        val text = "🔐 <b>Вход в Padix</b>\n\n" +
            "Сайт padix.club хочет войти как <b>${escapeHtml(displayName)}</b>" +
            (from.username?.let { " (@${escapeHtml(it)})" } ?: "") + ".\n\n" +
            "Подтвердить?"

        val markup = TelegramInlineKeyboard.callbackKeyboard(
            listOf(
                listOf(
                    "✅ Войти" to "padix_auth:yes:$token",
                    "❌ Отмена" to "padix_auth:no:$token",
                )
            )
        )
        client.sendMessage(chat.id, text, replyMarkup = markup)
    }

    /** Бот-логин шаг 2: юзер нажал inline-кнопку. */
    @Transactional
    private fun handleAuthCallback(cb: TgCallbackQuery, data: String) {
        // Формат: padix_auth:yes:<token>  |  padix_auth:no:<token>
        val parts = data.split(":")
        if (parts.size != 3) {
            runCatching { client.answerCallbackQuery(cb.id, "Некорректный запрос") }
            return
        }
        val action = parts[1]
        val token = parts[2]
        val tok = authTokenRepo.findById(token).orElse(null)
        if (tok == null) {
            runCatching { client.answerCallbackQuery(cb.id, "Токен не найден") }
            return
        }
        if (tok.expiresAt.isBefore(Instant.now())) {
            runCatching { client.answerCallbackQuery(cb.id, "Токен истёк") }
            return
        }
        // Защита от подмены: callback мог прийти от другого юзера через переслав сообщение.
        // Сверяем что from.id из callback совпадает с тем, кому изначально предложили логин.
        if (tok.telegramUserId != null && tok.telegramUserId != cb.from.id) {
            runCatching { client.answerCallbackQuery(cb.id, "Это не ваш запрос на вход") }
            return
        }

        val now = Instant.now()
        val newText: String
        val tooltipText: String
        when (action) {
            "yes" -> {
                tok.status = "APPROVED"
                tok.approvedAt = now
                authTokenRepo.save(tok)
                newText = "✅ <b>Вход подтверждён</b>\n\nВернитесь на padix.club — вы уже залогинены."
                tooltipText = "Готово"
            }
            "no" -> {
                tok.status = "REJECTED"
                authTokenRepo.save(tok)
                newText = "❌ <b>Вход отменён</b>\n\nЕсли это были не вы — игнорируйте."
                tooltipText = "Отменено"
            }
            else -> {
                runCatching { client.answerCallbackQuery(cb.id, "Неизвестное действие") }
                return
            }
        }

        runCatching { client.answerCallbackQuery(cb.id, tooltipText) }
        val msg = cb.message
        if (msg != null) {
            runCatching {
                client.editMessageText(msg.chat.id, msg.messageId, newText)
            }
        }
    }

    @Transactional
    fun tryLinkByToken(
        token: String,
        chatId: Long,
        chatType: TelegramChatType,
        title: String
    ): Boolean {
        val record = tokenRepo.findById(token).orElse(null) ?: return false
        if (record.expiresAt.isBefore(Instant.now())) {
            tokenRepo.delete(record)
            return false
        }
        val userId = record.userId ?: return false
        val existing = chatRepo.findByUserIdAndChatId(userId, chatId)
        if (existing != null) {
            existing.title = title
            existing.chatType = chatType.name
            chatRepo.save(existing)
        } else {
            chatRepo.save(
                TelegramChat(
                    userId = userId,
                    chatId = chatId,
                    chatType = chatType.name,
                    title = title
                )
            )
        }
        tokenRepo.delete(record)
        return true
    }

    private fun parseChatType(raw: String): TelegramChatType = when (raw.lowercase(Locale.ROOT)) {
        "private" -> TelegramChatType.PRIVATE
        "group" -> TelegramChatType.GROUP
        "supergroup" -> TelegramChatType.SUPERGROUP
        "channel" -> TelegramChatType.CHANNEL
        else -> TelegramChatType.PRIVATE
    }

    private fun helpText(): String =
        "Команды:\n" +
            "<code>/link &lt;токен&gt;</code> — привязать этот чат к Padix (токен из веб-приложения)\n\n" +
            "Веб: $publicBaseUrl"

    // ---------- Постинг анонсов ----------

    @Transactional
    fun postEventCreated(
        event: BotEvent,
        ownerUserId: UUID,
        chatIds: List<UUID>,
        registeredCount: Int
    ): Int {
        if (chatIds.isEmpty()) return 0
        if (!isReadyToSend(ownerUserId)) return 0
        val eventId = event.id ?: return 0
        // Анонс в личный чат автора не имеет смысла — он сам создал игру.
        // Также это предохраняет от того, что UPDATED/FINISHED/CANCELLED-уведомления
        // потом полетят автору в личку (т.к. они идут в те же чаты, где был CREATED).
        val chats = chatIds.distinct()
            .mapNotNull { chatRepo.findByIdAndUserId(it, ownerUserId) }
            .filter { it.chatType != TelegramChatType.PRIVATE.name }
        if (chats.isEmpty()) return 0

        val cta = cta(eventId, "📝 Зарегистрироваться")
        val text = renderEventCreated(event, registeredCount) + cta.textSuffix
        // Закрепляем анонс только если включено. Приоритет: per-series override → глобальный.
        // Перед pin снимаем предыдущий pin Padix в каждом чате.
        val shouldPin = resolvePinAnnouncement(event, ownerUserId)
        return sendAndRecord(chats, text, eventId, cta.replyMarkup, pinAfterSend = shouldPin)
    }

    /**
     * Определяет, надо ли закреплять анонс этого события.
     * Если событие из серии и у серии задан override `pin_announcement` — используем его.
     * Иначе — глобальная настройка владельца.
     */
    private fun resolvePinAnnouncement(event: BotEvent, ownerUserId: UUID): Boolean {
        val seriesId = event.seriesId
        if (seriesId != null) {
            val series = seriesRepo.findById(seriesId).orElse(null)
            val override = series?.pinAnnouncement
            if (override != null) return override
        }
        return getOrCreateSettings(ownerUserId).pinAnnouncement
    }

    @Transactional
    fun postEventUpdated(event: BotEvent, ownerUserId: UUID, changes: List<String>): Int {
        val eventId = event.id ?: return 0
        if (changes.isEmpty()) return 0
        if (!isReadyToSend(ownerUserId)) return 0
        val targets = targetChatsForEvent(eventId, ownerUserId) { it.notifyUpdated }
        if (targets.isEmpty()) return 0

        var actions = 0

        // 1) Редактируем исходные CREATED-сообщения (включая закреплённое) — чтобы шапка
        // со статус-баром, временем, названием отражала актуальное состояние. Подгружаем
        // живой BotEvent из БД, чтобы получить настоящий pairingMode и т.п. (в payload
        // от api приходит обрезанная версия без pairingMode).
        val fullEvent = eventRepo.findById(eventId).orElse(null) ?: event
        val capacity = fullEvent.courtsCount * 4
        val registered = regRepo.countByEventIdAndStatus(eventId).toInt().coerceAtMost(capacity)
        val posts = postRepo.findAllByEventId(eventId)
        if (posts.isNotEmpty()) {
            val chatById = chatRepo.findAllByUserIdOrderByLinkedAtAsc(ownerUserId).associateBy { it.id!! }
            val ctaCreated = cta(eventId, "📝 Зарегистрироваться")
            val text = renderEventCreated(fullEvent, registered) + ctaCreated.textSuffix
            for (post in posts) {
                val chat = chatById[post.telegramChatId] ?: continue
                try {
                    client.editMessageText(chat.chatId, post.messageId, text, replyMarkup = ctaCreated.replyMarkup)
                    actions++
                } catch (e: Exception) {
                    log.warn("Edit original CREATED message {} in chat {} on update failed: {}", post.messageId, chat.chatId, e.message)
                }
            }
        }

        // 2) Дополнительно — отдельное сообщение со списком изменений, чтобы подписчики
        // увидели уведомление в ленте, а не только редакцию закреплённого поста.
        val ctaInfo = cta(eventId, "🔍 Открыть игру")
        actions += sendAndRecord(targets, renderEventUpdated(fullEvent, changes) + ctaInfo.textSuffix, null, ctaInfo.replyMarkup)
        return actions
    }

    @Transactional
    fun prepareCancellation(eventId: UUID, ownerUserId: UUID, title: String): TelegramCancellationPlan {
        if (!isReadyToSend(ownerUserId)) return TelegramCancellationPlan(title, emptyList())
        // Собираем посты ДО удаления — event_telegram_post каскадно удалится с events,
        // и потом мы не сможем узнать какие сообщения были закреплены / какие надо открепить.
        val posts = postRepo.findAllByEventId(eventId)
        val chatById = chatRepo.findAllByUserIdOrderByLinkedAtAsc(ownerUserId).associateBy { it.id!! }
        val originalPosts = posts.mapNotNull { p ->
            val chat = chatById[p.telegramChatId] ?: return@mapNotNull null
            TelegramCancellationOriginalPost(
                tgChatId = chat.chatId,
                messageId = p.messageId,
                pinnedMessageId = p.pinnedMessageId
            )
        }
        val targets = targetChatsForEvent(eventId, ownerUserId) { it.notifyUpdated }
        return TelegramCancellationPlan(title, targets.map { it.chatId }, originalPosts)
    }

    fun sendCancellation(plan: TelegramCancellationPlan): Int {
        var actions = 0
        // 1) Открепляем и редактируем исходные CREATED-сообщения (включая закреплённое),
        // чтобы они не висели в чате со статус-баром «1/8» как будто игра ещё идёт.
        val cancelledHeader = renderEventCancelledOriginal(plan.title)
        for (orig in plan.originalPosts) {
            if (orig.pinnedMessageId != null) {
                try {
                    client.unpinChatMessage(orig.tgChatId, orig.pinnedMessageId)
                } catch (e: Exception) {
                    log.warn("Unpin {} in chat {} on cancellation failed: {}", orig.pinnedMessageId, orig.tgChatId, e.message)
                }
            }
            try {
                // Убираем inline-кнопку «Зарегистрироваться» — игры больше нет.
                client.editMessageText(orig.tgChatId, orig.messageId, cancelledHeader, replyMarkup = null)
                actions++
            } catch (e: Exception) {
                log.warn("Edit cancelled message {} in chat {} failed: {}", orig.messageId, orig.tgChatId, e.message)
            }
        }

        // 2) Шлём отдельное уведомление «❌ Игра X отменена» в каждый целевой чат.
        if (plan.targetTgChatIds.isNotEmpty()) {
            val text = renderEventCancelled(plan.title)
            for (chatId in plan.targetTgChatIds) {
                try {
                    client.sendMessage(chatId, text)
                    actions++
                } catch (e: Exception) {
                    log.warn("Failed to send cancellation to {}: {}", chatId, e.message)
                }
            }
        }
        return actions
    }

    @Transactional
    fun postEventFinished(
        event: BotEvent,
        ownerUserId: UUID,
        top: List<FinishTopPlayer>,
        leaderboard: List<FinishLeaderboardEntry>,
        matchCount: Int
    ): Int {
        val eventId = event.id ?: return 0
        if (!isReadyToSend(ownerUserId)) return 0
        val targets = targetChatsForEvent(eventId, ownerUserId) { it.notifyFinished }
        if (targets.isEmpty()) return 0
        val cta = cta(eventId, "📊 Результаты")
        // Передаём recordForEventId=null — это финал, не CREATED-пост, его не нужно
        // потом редактировать при roster change.
        return sendAndRecord(targets, renderEventFinished(event, top, leaderboard, matchCount) + cta.textSuffix, null, cta.replyMarkup)
    }

    /**
     * Реагирует на изменение состава: обновляет «Мест: N/M» в исходных CREATED-постах
     * (через editMessageText) и при переходе через границу capacity шлёт отдельное
     * сообщение «Комплект собран» / «Открыт набор».
     */
    @Transactional
    fun handleRosterChanged(
        event: BotEvent,
        ownerUserId: UUID,
        oldCount: Int,
        newCount: Int,
        capacity: Int
    ): Int {
        val eventId = event.id ?: return 0
        if (!isReadyToSend(ownerUserId)) return 0

        var actions = 0

        // 1) editMessageText на каждом исходном CREATED-сообщении
        val posts = postRepo.findAllByEventId(eventId)
        if (posts.isNotEmpty()) {
            val chatById = chatRepo.findAllByUserIdOrderByLinkedAtAsc(ownerUserId).associateBy { it.id!! }
            val ctaData = cta(eventId, "📝 Зарегистрироваться")
            val text = renderEventCreated(event, newCount) + ctaData.textSuffix
            for (post in posts) {
                val chat = chatById[post.telegramChatId] ?: continue
                try {
                    client.editMessageText(chat.chatId, post.messageId, text, replyMarkup = ctaData.replyMarkup)
                    actions++
                } catch (e: Exception) {
                    log.warn("Edit message {} in chat {} failed: {}", post.messageId, chat.chatId, e.message)
                }
            }
        }

        // 2) Переход через capacity-границу — отдельное сообщение
        val transitionText = when {
            oldCount < capacity && newCount >= capacity -> renderRosterFilled(event, capacity)
            oldCount >= capacity && newCount < capacity -> renderRosterReopened(event, newCount, capacity)
            else -> null
        }
        if (transitionText != null) {
            val ctaData = cta(eventId, "🔍 Открыть игру")
            val targets = targetChatsForEvent(eventId, ownerUserId) { it.notifyUpdated }
            if (targets.isNotEmpty()) {
                // Не сохраняем как «новый CREATED»: следующие edit'ы должны редактировать
                // первоначальный пост, а не это объявление.
                actions += sendToChatsRaw(targets, transitionText + ctaData.textSuffix, ctaData.replyMarkup)
            }
        }
        return actions
    }

    private fun sendToChatsRaw(
        chats: List<TelegramChat>,
        text: String,
        replyMarkup: Map<String, Any>?
    ): Int {
        var posted = 0
        for (chat in chats) {
            try {
                client.sendMessage(chat.chatId, text, replyMarkup = replyMarkup)
                posted++
            } catch (e: Exception) {
                log.warn("Failed to post to chat {}: {}", chat.chatId, e.message)
            }
        }
        return posted
    }

    /**
     * Напоминание о игре идёт ЛИЧНО каждому участнику в его привязанный PRIVATE-чат
     * (если у участника он есть и включён notify_reminder). В группах reminder не дублируется.
     * Тихие часы и общий toggle проверяются у каждого участника отдельно.
     */
    @Transactional
    fun postEventReminderToParticipants(
        event: BotEvent,
        hoursBeforeStart: Int,
        participants: List<BotPlayer>
    ): Int {
        val eventId = event.id ?: return 0
        if (!client.isConfigured()) return 0
        if (participants.isEmpty()) return 0

        val playerIds = participants.mapNotNull { it.id }
        val users = userRepo.findAllByPlayerIdIn(playerIds)
        if (users.isEmpty()) return 0

        val ctaData = cta(eventId, "🔍 Открыть игру")
        val text = renderEventReminder(event, hoursBeforeStart, participants) + ctaData.textSuffix

        var sent = 0
        for (user in users) {
            val userId = user.id ?: continue
            val settings = getOrCreateSettings(userId)
            if (!settings.enabled) continue
            if (isQuietNow(settings)) continue

            val privateChats = chatRepo.findAllByUserIdOrderByLinkedAtAsc(userId)
                .filter { it.chatType == TelegramChatType.PRIVATE.name && it.notifyReminder }
            for (chat in privateChats) {
                try {
                    client.sendMessage(chat.chatId, text, replyMarkup = ctaData.replyMarkup)
                    sent++
                } catch (e: Exception) {
                    log.warn("Failed to DM reminder to chat {}: {}", chat.chatId, e.message)
                }
            }
        }
        return sent
    }

    private fun isReadyToSend(ownerUserId: UUID): Boolean {
        if (!client.isConfigured()) return false
        val settings = getOrCreateSettings(ownerUserId)
        return settings.enabled
    }

    private fun targetChatsForEvent(
        eventId: UUID,
        ownerUserId: UUID,
        predicate: (TelegramChat) -> Boolean
    ): List<TelegramChat> {
        val posts = postRepo.findAllByEventId(eventId)
        if (posts.isEmpty()) return emptyList()
        val chatById = chatRepo.findAllByUserIdOrderByLinkedAtAsc(ownerUserId).associateBy { it.id!! }
        return posts.mapNotNull { chatById[it.telegramChatId] }
            .distinctBy { it.id }
            .filter(predicate)
    }

    private fun sendAndRecord(
        chats: List<TelegramChat>,
        text: String,
        recordForEventId: UUID?,
        replyMarkup: Map<String, Any>? = null,
        pinAfterSend: Boolean = false
    ): Int {
        var posted = 0
        for (chat in chats) {
            try {
                val sent = client.sendMessage(chat.chatId, text, replyMarkup = replyMarkup)
                var pinnedMsgId: Long? = null
                if (pinAfterSend) {
                    val chatInternalId = chat.id
                    if (chatInternalId != null) {
                        unpinPreviousAnnouncementsInChat(chat.chatId, chatInternalId)
                    }
                    try {
                        client.pinChatMessage(chat.chatId, sent.messageId, disableNotification = true)
                        pinnedMsgId = sent.messageId
                    } catch (e: Exception) {
                        log.warn("Pin failed for chat {} msg {}: {}", chat.chatId, sent.messageId, e.message)
                    }
                }
                if (recordForEventId != null) {
                    postRepo.save(
                        EventTelegramPost(
                            eventId = recordForEventId,
                            telegramChatId = chat.id,
                            messageId = sent.messageId,
                            pinnedMessageId = pinnedMsgId
                        )
                    )
                }
                posted++
            } catch (e: Exception) {
                log.warn("Failed to post to chat {}: {}", chat.chatId, e.message)
            }
        }
        return posted
    }

    /** Снимает все ранее закреплённые анонсы Padix в этом чате и обнуляет pinned_message_id. */
    private fun unpinPreviousAnnouncementsInChat(telegramChatId: Long, internalChatId: UUID) {
        val previous = postRepo.findAllByTelegramChatIdAndPinnedMessageIdIsNotNull(internalChatId)
        for (prev in previous) {
            val prevMsgId = prev.pinnedMessageId ?: continue
            try {
                client.unpinChatMessage(telegramChatId, prevMsgId)
            } catch (e: Exception) {
                log.warn("Unpin previous {} in chat {} failed: {}", prevMsgId, telegramChatId, e.message)
            }
            prev.pinnedMessageId = null
            postRepo.save(prev)
        }
    }

    /**
     * CTA для сообщения: либо inline-кнопка с URL (если URL публичный), либо хвост
     * с plain-text URL. Telegram отказывается рендерить inline-кнопки с localhost / private IP
     * (Bad Request: Wrong HTTP URL), а в plain-text такие ссылки видны как кликабельные
     * у автора и просто текст у всех остальных.
     */
    private data class Cta(val replyMarkup: Map<String, Any>?, val textSuffix: String)

    private fun cta(eventId: UUID, buttonText: String): Cta {
        val url = eventUrl(eventId)
        return if (isPublicHttpUrl(url)) {
            Cta(TelegramInlineKeyboard.urlButton(buttonText, url), "")
        } else {
            Cta(null, "\n\n$url")
        }
    }

    private fun isPublicHttpUrl(url: String): Boolean {
        val host = try {
            java.net.URI(url).host?.lowercase() ?: return false
        } catch (_: Exception) {
            return false
        }
        if (host == "localhost") return false
        if (host.startsWith("127.")) return false
        if (host.startsWith("10.")) return false
        if (host.startsWith("192.168.")) return false
        val parts = host.split(".")
        if (parts.size >= 2 && parts[0] == "172") {
            val second = parts[1].toIntOrNull()
            if (second != null && second in 16..31) return false
        }
        // host без точки (например docker-имя "bot") тоже не подходит для inline-кнопки.
        if (!host.contains(".")) return false
        return true
    }

    private fun renderEventCreated(event: BotEvent, registeredCount: Int): String {
        val capacity = event.courtsCount * 4
        val timeFmt = DateTimeFormatter.ofPattern("HH:mm")
        val dateStr = formatDate(event.date)
        val sb = StringBuilder()
        sb.append("🎾 <b>").append(escapeHtml(event.title)).append("</b>\n\n")
        sb.append("🗓  ").append(dateStr)
            .append(" · ").append(formatTime(event.startTime, timeFmt))
            .append("–").append(formatTime(event.endTime, timeFmt)).append("\n")
        sb.append("🏟  ").append(event.courtsCount).append(" ").append(courtsPlural(event.courtsCount)).append("\n")
        sb.append("🎯  ").append(pairingModeLabel(event.pairingMode)).append("\n\n")
        // Тонкая полоска заполнения: filled/empty rectangles. Жирное N/M справа.
        sb.append(progressBar(registeredCount, capacity))
            .append("  <b>").append(registeredCount).append("/").append(capacity).append("</b>")
        return sb.toString()
    }

    /**
     * Прогресс-бар из символов ▰ (заполнено) и ▱ (пусто) — тонкая полоса,
     * читается на мобильном лучше эмодзи-квадратов. Фиксированная длина 8 сегментов.
     */
    private fun progressBar(filled: Int, total: Int): String {
        if (total <= 0) return ""
        val segments = 8
        val safeFilled = filled.coerceIn(0, total)
        val full = if (safeFilled == 0) 0
            else ((safeFilled * segments * 2 + total) / (total * 2)).coerceIn(0, segments)
        return "▰".repeat(full) + "▱".repeat(segments - full)
    }

    private fun courtsPlural(n: Int): String {
        val mod10 = n % 10
        val mod100 = n % 100
        return when {
            mod10 == 1 && mod100 != 11 -> "корт"
            mod10 in 2..4 && mod100 !in 12..14 -> "корта"
            else -> "кортов"
        }
    }

    private fun pairingModeLabel(mode: String): String = when (mode.uppercase()) {
        "BALANCED" -> "Равный бой"
        else -> "Каждый с каждым"
    }

    private fun renderEventUpdated(event: BotEvent, changes: List<String>): String {
        val sb = StringBuilder()
        sb.append("🔄 <b>").append(escapeHtml(event.title)).append("</b> — обновлено\n")
        changes.forEachIndexed { idx, change ->
            sb.append("• ").append(escapeHtml(change))
            if (idx < changes.size - 1) sb.append("\n")
        }
        return sb.toString()
    }

    private fun renderEventCancelled(title: String): String =
        "❌ Игра <b>${escapeHtml(title)}</b> отменена."

    /**
     * Текст для editMessageText на исходном CREATED-посте при отмене игры:
     * заменяет шапку со статус-баром на короткое «отменено», чтобы старое сообщение
     * не оставалось висеть в чате с «1/8» как будто игра ещё открыта.
     */
    private fun renderEventCancelledOriginal(title: String): String =
        "❌ <b>${escapeHtml(title)}</b>\n\nИгра отменена."

    private fun renderRosterFilled(event: BotEvent, capacity: Int): String =
        "✅ <b>${escapeHtml(event.title)}</b> — комплект собран!\n" +
            "Все $capacity мест заняты, до встречи на корте."

    private fun renderRosterReopened(event: BotEvent, newCount: Int, capacity: Int): String =
        "⚠️ <b>${escapeHtml(event.title)}</b> — освободилось место\n" +
            "Сейчас $newCount/$capacity. Регистрация снова открыта."

    private fun renderEventFinished(
        event: BotEvent,
        top: List<FinishTopPlayer>,
        leaderboard: List<FinishLeaderboardEntry>,
        matchCount: Int
    ): String {
        val sb = StringBuilder()
        sb.append("🏁 <b>").append(escapeHtml(event.title)).append("</b> завершена\n")
        sb.append("Матчей сыграно: ").append(matchCount).append("\n")

        // Основной блок — таблица лидеров по очкам (как «Таблица лидеров» в UI).
        // Если leaderboard пуст (старая api-версия / нет POINTS-режима) — fallback на топ-3
        // по приросту рейтинга, чтобы сохранить читаемое сообщение.
        if (leaderboard.isNotEmpty()) {
            sb.append("\n<b>Таблица лидеров</b>\n")
            val medals = listOf("🥇", "🥈", "🥉")
            leaderboard.forEachIndexed { idx, p ->
                val prefix = medals.getOrElse(idx) { "${idx + 1}." }
                sb.append(prefix).append(" ").append(escapeHtml(p.name))
                    .append(" — <b>").append(p.points).append("</b>\n")
            }
        } else if (top.isNotEmpty()) {
            sb.append("\nТоп по росту рейтинга:\n")
            val medals = listOf("🥇", "🥈", "🥉")
            top.take(3).forEachIndexed { idx, p ->
                val deltaStr = if (p.delta >= 0) "+${p.delta}" else "${p.delta}"
                sb.append(medals.getOrElse(idx) { "•" })
                    .append(" ").append(escapeHtml(p.name))
                    .append(" (").append(deltaStr).append(")\n")
            }
        }
        return sb.toString().trimEnd()
    }

    private fun renderEventReminder(
        event: BotEvent,
        hoursBeforeStart: Int,
        participants: List<BotPlayer>
    ): String {
        val sb = StringBuilder()
        val timeFmt = DateTimeFormatter.ofPattern("HH:mm")
        val timeWord = pluralizeHours(hoursBeforeStart)
        sb.append("⏰ Через ").append(hoursBeforeStart).append(" ").append(timeWord)
            .append(" — игра <b>").append(escapeHtml(event.title)).append("</b>\n")
        sb.append("📅 ").append(formatDate(event.date))
            .append(", ").append(event.startTime.format(timeFmt)).append("\n")
        if (participants.isNotEmpty()) {
            sb.append("\nСостав (").append(participants.size).append("):\n")
            participants.take(20).forEachIndexed { idx, p ->
                sb.append("• ").append(escapeHtml(p.name))
                if (idx < minOf(participants.size, 20) - 1) sb.append("\n")
            }
            if (participants.size > 20) sb.append("\n…")
        }
        return sb.toString()
    }

    private fun pluralizeHours(n: Int): String {
        val mod10 = n % 10
        val mod100 = n % 100
        return when {
            mod10 == 1 && mod100 != 11 -> "час"
            mod10 in 2..4 && mod100 !in 12..14 -> "часа"
            else -> "часов"
        }
    }

    private fun formatTime(time: LocalTime, fmt: DateTimeFormatter): String = time.format(fmt)

    private fun formatDate(date: LocalDate): String {
        val months = listOf(
            "января", "февраля", "марта", "апреля", "мая", "июня",
            "июля", "августа", "сентября", "октября", "ноября", "декабря"
        )
        val month = months[date.monthValue - 1]
        return "${date.dayOfMonth} $month ${date.year}"
    }

    private fun eventUrl(eventId: UUID): String =
        "${publicBaseUrl.trimEnd('/')}/events/$eventId"

    private fun escapeHtml(s: String): String =
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    private fun replySafely(chatId: Long, text: String) {
        try {
            client.sendMessage(chatId, text)
        } catch (e: Exception) {
            log.warn("Failed to send reply to chat {}: {}", chatId, e.message)
        }
    }

    @Scheduled(cron = "0 0 * * * *")
    @Transactional
    fun purgeExpiredTokens() {
        tokenRepo.deleteAllByExpiresAtBefore(Instant.now())
    }
}
