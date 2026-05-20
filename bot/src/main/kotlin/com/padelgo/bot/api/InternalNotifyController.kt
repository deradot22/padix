package com.padelgo.bot.api

import com.padelgo.bot.domain.BotEvent
import com.padelgo.bot.domain.EventStatus
import com.padelgo.bot.service.FinishTopPlayer
import com.padelgo.bot.service.TelegramCancellationOriginalPost
import com.padelgo.bot.service.TelegramCancellationPlan
import com.padelgo.bot.service.TelegramService
import com.padelgo.bot.domain.TelegramChatType
import com.padelgo.bot.repo.TelegramChatRepository
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

data class EventFinishedRequest(
    val eventId: UUID,
    val ownerUserId: UUID,
    val title: String,
    val date: LocalDate,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val courtsCount: Int,
    val top: List<FinishTopPlayerDto>,
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

data class NotifyResult(val sent: Int)

@RestController
@RequestMapping("/api/internal/telegram")
class InternalNotifyController(
    private val service: TelegramService,
    private val chatRepo: TelegramChatRepository
) {
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
        val sent = service.postEventFinished(ev, req.ownerUserId, top, req.matchCount)
        return NotifyResult(sent)
    }

    @PostMapping("/notify/roster-changed")
    fun rosterChanged(@RequestBody req: RosterChangedRequest): NotifyResult {
        val ev = req.toEvent()
        val sent = service.handleRosterChanged(ev, req.ownerUserId, req.oldCount, req.newCount, req.capacity)
        return NotifyResult(sent)
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
}
