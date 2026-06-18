package com.padelgo.bot.service

import com.padelgo.bot.domain.EventStatus
import com.padelgo.bot.repo.BotEventRepository
import com.padelgo.bot.repo.BotPlayerRepository
import com.padelgo.bot.repo.BotRegistrationRepository
import com.padelgo.bot.repo.EventTelegramPostRepository
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.time.Duration
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId

@Component
class TelegramReminderService(
    private val eventRepo: BotEventRepository,
    private val regRepo: BotRegistrationRepository,
    private val playerRepo: BotPlayerRepository,
    private val postRepo: EventTelegramPostRepository,
    private val telegramService: TelegramService,
    private val seriesRepo: com.padelgo.bot.repo.BotEventSeriesRepository
) {
    private val log = LoggerFactory.getLogger(TelegramReminderService::class.java)

    @Scheduled(cron = "0 */5 * * * *")
    @Transactional
    fun tick() {
        if (!telegramService.isEnabled()) return
        val now = Instant.now()
        val today = LocalDateTime.now(ZoneId.of("UTC")).toLocalDate()
        val candidates = eventRepo.findAllByDateBetween(today.minusDays(1), today.plusDays(2))
        for (event in candidates) {
            try {
                val eventId = event.id ?: continue
                if (event.reminderSentAt != null) continue
                if (event.status !in REMINDABLE_STATUSES) continue
                val ownerId = event.createdByUserId ?: continue
                // Напоминание имеет смысл только если игру анонсировали в TG (ANNOUNCE-пост).
                if (postRepo.findAllByEventIdAndPostKind(eventId, "ANNOUNCE").isEmpty()) continue

                val settings = telegramService.getOrCreateSettings(ownerId)
                if (!settings.enabled) continue

                // Per-series override (если игра из серии и там указан reminder_hours) →
                // используется он. Иначе — глобальный telegram_user_settings.reminder_hours.
                val seriesId = event.seriesId
                val seriesReminder = if (seriesId != null) {
                    seriesRepo.findById(seriesId).orElse(null)?.reminderHours
                } else null
                val reminderHours = seriesReminder ?: settings.reminderHours
                if (reminderHours <= 0) continue

                val tz = try { ZoneId.of(settings.timezone) } catch (_: Exception) { ZoneId.of("UTC") }
                val startInstant = LocalDateTime.of(event.date, event.startTime).atZone(tz).toInstant()
                val reminderInstant = startInstant.minus(Duration.ofHours(reminderHours.toLong()))

                if (now.isBefore(reminderInstant)) continue
                if (!now.isBefore(startInstant)) continue

                val participants = regRepo.findAllByEventIdAndStatus(eventId)
                    .mapNotNull { it.playerId }
                    .let { playerRepo.findAllById(it) }
                    .sortedBy { it.name.lowercase() }

                // Reminder приходит лично каждому участнику в его PRIVATE-чат,
                // а не в групповые чаты, куда был отправлен анонс.
                val sent = telegramService.postEventReminderToParticipants(
                    event = event,
                    hoursBeforeStart = reminderHours,
                    participants = participants
                )
                if (sent > 0) {
                    event.reminderSentAt = now
                    eventRepo.save(event)
                    log.info("Sent reminder for event {} to {} chats", eventId, sent)
                }
            } catch (e: Exception) {
                log.warn("Reminder tick failed for event {}: {}", event.id, e.message)
            }
        }
    }

    companion object {
        private val REMINDABLE_STATUSES = setOf(
            EventStatus.OPEN_FOR_REGISTRATION,
            EventStatus.REGISTRATION_CLOSED,
            EventStatus.IN_PROGRESS
        )
    }
}
