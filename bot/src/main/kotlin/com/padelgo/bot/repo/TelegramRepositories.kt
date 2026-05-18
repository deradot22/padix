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
}

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
}
