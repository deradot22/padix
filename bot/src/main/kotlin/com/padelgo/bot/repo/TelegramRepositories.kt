package com.padelgo.bot.repo

import com.padelgo.bot.domain.BotEvent
import com.padelgo.bot.domain.BotPlayer
import com.padelgo.bot.domain.BotRegistration
import com.padelgo.bot.domain.BotUser
import com.padelgo.bot.domain.EventTelegramPost
import com.padelgo.bot.domain.RegistrationStatus
import com.padelgo.bot.domain.TelegramChat
import com.padelgo.bot.domain.TelegramLinkToken
import com.padelgo.bot.domain.TelegramPollingState
import com.padelgo.bot.domain.TelegramUserSettings
import org.springframework.data.jpa.repository.JpaRepository
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

interface TelegramLinkTokenRepository : JpaRepository<TelegramLinkToken, String> {
    fun deleteAllByExpiresAtBefore(now: Instant)
}

interface TelegramChatRepository : JpaRepository<TelegramChat, UUID> {
    fun findAllByUserIdOrderByLinkedAtAsc(userId: UUID): List<TelegramChat>
    fun findByUserIdAndChatId(userId: UUID, chatId: Long): TelegramChat?
    fun findByIdAndUserId(id: UUID, userId: UUID): TelegramChat?
}

interface EventTelegramPostRepository : JpaRepository<EventTelegramPost, UUID> {
    fun findAllByEventId(eventId: UUID): List<EventTelegramPost>

    /** Посты конкретного типа ('ANNOUNCE' / 'RESULTS') для события. */
    fun findAllByEventIdAndPostKind(eventId: UUID, postKind: String): List<EventTelegramPost>

    /** Все ранее закреплённые посты в этом telegram-чате (legacy: для unpin при новом анонсе). */
    fun findAllByTelegramChatIdAndPinnedMessageIdIsNotNull(telegramChatId: UUID): List<EventTelegramPost>

    /** Ранее закреплённый pin КОНКРЕТНОГО события в этом telegram-чате (для re-pin при ре-анонсе того же события — без сноса pin'ов других подписок). */
    fun findAllByEventIdAndTelegramChatIdAndPinnedMessageIdIsNotNull(eventId: UUID, telegramChatId: UUID): List<EventTelegramPost>

    /** Все посты, у которых есть pin (для cron-задачи: снимать pin прошедших игр). */
    fun findAllByPinnedMessageIdIsNotNull(): List<EventTelegramPost>
}

interface BotEventSeriesRepository : org.springframework.data.jpa.repository.JpaRepository<com.padelgo.bot.domain.BotEventSeries, UUID>

interface TelegramPollingStateRepository : JpaRepository<TelegramPollingState, Short>

interface TelegramUserSettingsRepository : JpaRepository<TelegramUserSettings, UUID>

interface BotEventRepository : JpaRepository<BotEvent, UUID> {
    fun findAllByDateBetween(from: LocalDate, to: LocalDate): List<BotEvent>
}

interface BotPlayerRepository : JpaRepository<BotPlayer, UUID>

interface BotUserRepository : JpaRepository<BotUser, UUID> {
    fun findAllByPlayerIdIn(playerIds: Collection<UUID>): List<BotUser>
}

interface BotRegistrationRepository : JpaRepository<BotRegistration, UUID> {
    fun findAllByEventIdAndStatus(
        eventId: UUID,
        status: RegistrationStatus = RegistrationStatus.REGISTERED
    ): List<BotRegistration>

    fun countByEventIdAndStatus(
        eventId: UUID,
        status: RegistrationStatus = RegistrationStatus.REGISTERED
    ): Long
}
