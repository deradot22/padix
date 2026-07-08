package com.padelgo.bot.api

import com.padelgo.bot.domain.BotEvent
import com.padelgo.bot.domain.EventStatus
import com.padelgo.bot.service.FinishLeaderboardEntry
import com.padelgo.bot.service.FinishTopPlayer
import com.padelgo.bot.service.TelegramCancellationOriginalPost
import com.padelgo.bot.service.TelegramCancellationPlan
import com.padelgo.bot.service.TelegramClient
import com.padelgo.bot.service.TelegramService
import com.padelgo.bot.domain.TelegramChatType
import com.padelgo.bot.repo.TelegramChatRepository
import org.slf4j.LoggerFactory
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

/**
 * Internal API для api → bot уведомлений. Все запросы должны нести `X-Internal-Secret`,
 * проверяется в [InternalAuthFilter]. Эндпойнты не сохраняют присланную игру в БД —
 * только используют поля для рендера и постинга.
 */
data class EventCreatedRequest(
    val eventId: UUID,
    val ownerUserId: UUID,
    val chatIds: List<UUID>,
    val title: String,
    val date: LocalDate,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val courtsCount: Int,
    val registeredCount: Int
)

data class EventUpdatedRequest(
    val eventId: UUID,
    val ownerUserId: UUID,
    val title: String,
    val date: LocalDate,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val courtsCount: Int,
    val changes: List<String>
)

data class PrepareCancellationRequest(
    val eventId: UUID,
    val ownerUserId: UUID,
    val title: String
)

data class CancellationOriginalPostDto(
    val tgChatId: Long,
    val messageId: Long,
    val pinnedMessageId: Long?
) {
    companion object {
        fun from(p: TelegramCancellationOriginalPost) =
            CancellationOriginalPostDto(p.tgChatId, p.messageId, p.pinnedMessageId)
    }

    fun toModel() = TelegramCancellationOriginalPost(tgChatId, messageId, pinnedMessageId)
}

data class CancellationPlanResponse(
    val title: String,
    val targetTgChatIds: List<Long>,
    val originalPosts: List<CancellationOriginalPostDto> = emptyList()
) {
    companion object {
        fun from(p: TelegramCancellationPlan) = CancellationPlanResponse(
            p.title,
            p.targetTgChatIds,
            p.originalPosts.map { CancellationOriginalPostDto.from(it) }
        )
    }

    fun toPlan() = TelegramCancellationPlan(
        title = title,
        targetTgChatIds = targetTgChatIds,
        originalPosts = originalPosts.map { it.toModel() }
    )
}

data class FinishTopPlayerDto(val name: String, val delta: Int)
data class LeaderboardEntryDto(val name: String, val points: Int, val played: Int = 0)

data class EventFinishedRequest(
    val eventId: UUID,
    val ownerUserId: UUID,
    val title: String,
    val date: LocalDate,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val courtsCount: Int,
    val top: List<FinishTopPlayerDto>,
    val leaderboard: List<LeaderboardEntryDto> = emptyList(),
    val matchCount: Int
)

/**
 * Зеркало [EventFinishedRequest]: api зовёт этот эндпойнт, когда у уже завершённой игры
 * пересчитались результаты (отредактировали счёт/добавили матч). Бот редактирует ранее
 * опубликованный RESULTS-пост вместо нового сообщения.
 */
data class EventResultsUpdatedRequest(
    val eventId: UUID,
    val ownerUserId: UUID,
    val title: String,
    val date: LocalDate,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val courtsCount: Int,
    val top: List<FinishTopPlayerDto>,
    val leaderboard: List<LeaderboardEntryDto> = emptyList(),
    val matchCount: Int
)

data class RosterChangedRequest(
    val eventId: UUID,
    val ownerUserId: UUID,
    val title: String,
    val date: LocalDate,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val courtsCount: Int,
    val oldCount: Int,
    val newCount: Int,
    val capacity: Int
)

data class AdminFeedbackRequest(
    val adminUserId: UUID,
    val ticketId: UUID,
    val authorName: String,
    val category: String,
    val message: String,
    val attachmentDataUrl: String? = null,
    val attachmentMime: String? = null
)

data class NotifyResult(val sent: Int)

@RestController
@RequestMapping("/api/internal/telegram")
class InternalNotifyController(
    private val service: TelegramService,
    private val chatRepo: TelegramChatRepository,
    private val telegramClient: TelegramClient
) {
    private val log = LoggerFactory.getLogger(InternalNotifyController::class.java)
    @GetMapping("/owner-group-chats/{ownerUserId}")
    fun ownerGroupChats(@PathVariable ownerUserId: UUID): List<UUID> =
        chatRepo.findAllByUserIdOrderByLinkedAtAsc(ownerUserId)
            .filter { it.chatType != TelegramChatType.PRIVATE.name }
            .mapNotNull { it.id }

    @PostMapping("/notify/event-created")
    fun eventCreated(@RequestBody req: EventCreatedRequest): NotifyResult {
        val ev = req.toEvent()
        val sent = service.postEventCreated(ev, req.ownerUserId, req.chatIds, req.registeredCount)
        return NotifyResult(sent)
    }

    @PostMapping("/notify/event-updated")
    fun eventUpdated(@RequestBody req: EventUpdatedRequest): NotifyResult {
        val ev = req.toEvent()
        val sent = service.postEventUpdated(ev, req.ownerUserId, req.changes)
        return NotifyResult(sent)
    }

    @PostMapping("/notify/prepare-cancellation")
    fun prepareCancellation(@RequestBody req: PrepareCancellationRequest): CancellationPlanResponse =
        CancellationPlanResponse.from(service.prepareCancellation(req.eventId, req.ownerUserId, req.title))

    @PostMapping("/notify/event-cancelled")
    fun eventCancelled(@RequestBody req: CancellationPlanResponse): NotifyResult {
        val sent = service.sendCancellation(req.toPlan())
        return NotifyResult(sent)
    }

    @PostMapping("/notify/event-finished")
    fun eventFinished(@RequestBody req: EventFinishedRequest): NotifyResult {
        val ev = req.toEvent()
        val top = req.top.map { FinishTopPlayer(it.name, it.delta) }
        val leaderboard = req.leaderboard.map { FinishLeaderboardEntry(it.name, it.points, it.played) }
        val sent = service.postEventFinished(ev, req.ownerUserId, top, leaderboard, req.matchCount)
        return NotifyResult(sent)
    }

    @PostMapping("/notify/event-results-updated")
    fun eventResultsUpdated(@RequestBody req: EventResultsUpdatedRequest): NotifyResult {
        val ev = req.toEvent()
        val top = req.top.map { FinishTopPlayer(it.name, it.delta) }
        val leaderboard = req.leaderboard.map { FinishLeaderboardEntry(it.name, it.points, it.played) }
        val sent = service.updateEventResults(ev, req.ownerUserId, top, leaderboard, req.matchCount)
        return NotifyResult(sent)
    }

    @PostMapping("/notify/roster-changed")
    fun rosterChanged(@RequestBody req: RosterChangedRequest): NotifyResult {
        val ev = req.toEvent()
        val sent = service.handleRosterChanged(ev, req.ownerUserId, req.oldCount, req.newCount, req.capacity)
        return NotifyResult(sent)
    }

    /**
     * Уведомление админа о новом тикете обратной связи.
     * Ищем PRIVATE-чат админа (берём самый ранний привязанный), отправляем туда текст
     * и, при наличии, вложение через sendPhoto/sendVideo (multipart upload).
     * Если у admin нет PRIVATE чата — sent=0 (no-op).
     */
    @PostMapping("/notify/admin-feedback")
    fun adminFeedback(@RequestBody req: AdminFeedbackRequest): NotifyResult {
        val privateChat = chatRepo.findAllByUserIdOrderByLinkedAtAsc(req.adminUserId)
            .firstOrNull { it.chatType == TelegramChatType.PRIVATE.name }
        if (privateChat == null) {
            log.warn("admin-feedback: no PRIVATE TG chat linked for admin user {}", req.adminUserId)
            return NotifyResult(0)
        }

        val categoryLabel = when (req.category.uppercase()) {
            "BUG" -> "🐞 Баг"
            "FEATURE" -> "💡 Идея"
            "QUESTION" -> "❓ Вопрос"
            else -> "💬 Другое"
        }
        // TG sendMessage limit = 4096; режем сообщение с запасом.
        val preview = req.message.take(3500)
        val text = buildString {
            append("<b>$categoryLabel</b> · от <b>")
            append(htmlEscape(req.authorName))
            append("</b>\n\n")
            append(htmlEscape(preview))
            if (req.message.length > preview.length) append("\n…")
            append("\n\n<i>ticket ")
            append(req.ticketId)
            append("</i>")
        }

        try {
            telegramClient.sendMessage(privateChat.chatId, text, parseMode = "HTML")
        } catch (e: Exception) {
            log.warn("admin-feedback: sendMessage failed for chat {}: {}", privateChat.chatId, e.message)
            return NotifyResult(0)
        }

        // Вложение, если есть. Не валим если не отправилось.
        val dataUrl = req.attachmentDataUrl
        val mime = req.attachmentMime
        if (!dataUrl.isNullOrBlank() && !mime.isNullOrBlank()) {
            try {
                val bytes = decodeDataUrl(dataUrl)
                val ext = mime.substringAfter('/', "bin").ifBlank { "bin" }
                val filename = "feedback-${req.ticketId}.$ext"
                when {
                    mime.startsWith("image/") -> telegramClient.sendPhoto(privateChat.chatId, bytes, filename)
                    mime.startsWith("video/") -> telegramClient.sendVideo(privateChat.chatId, bytes, filename)
                    else -> log.info("admin-feedback: unsupported mime {} for ticket {}", mime, req.ticketId)
                }
            } catch (e: Exception) {
                log.warn("admin-feedback: attachment send failed for ticket {}: {}", req.ticketId, e.message)
            }
        }

        return NotifyResult(1)
    }

    private fun htmlEscape(s: String): String =
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    private fun decodeDataUrl(dataUrl: String): ByteArray {
        val comma = dataUrl.indexOf(',')
        require(comma > 0) { "invalid data URL" }
        val payload = dataUrl.substring(comma + 1)
        return java.util.Base64.getDecoder().decode(payload)
    }

    private fun RosterChangedRequest.toEvent() = BotEvent(
        id = eventId,
        title = title,
        date = date,
        startTime = startTime,
        endTime = endTime,
        courtsCount = courtsCount,
        status = EventStatus.OPEN_FOR_REGISTRATION,
        createdByUserId = ownerUserId
    )

    private fun EventCreatedRequest.toEvent() = BotEvent(
        id = eventId,
        title = title,
        date = date,
        startTime = startTime,
        endTime = endTime,
        courtsCount = courtsCount,
        status = EventStatus.OPEN_FOR_REGISTRATION,
        createdByUserId = ownerUserId
    )

    private fun EventUpdatedRequest.toEvent() = BotEvent(
        id = eventId,
        title = title,
        date = date,
        startTime = startTime,
        endTime = endTime,
        courtsCount = courtsCount,
        status = EventStatus.OPEN_FOR_REGISTRATION,
        createdByUserId = ownerUserId
    )

    private fun EventFinishedRequest.toEvent() = BotEvent(
        id = eventId,
        title = title,
        date = date,
        startTime = startTime,
        endTime = endTime,
        courtsCount = courtsCount,
        status = EventStatus.FINISHED,
        createdByUserId = ownerUserId
    )

    private fun EventResultsUpdatedRequest.toEvent() = BotEvent(
        id = eventId,
        title = title,
        date = date,
        startTime = startTime,
        endTime = endTime,
        courtsCount = courtsCount,
        status = EventStatus.FINISHED,
        createdByUserId = ownerUserId
    )
}
