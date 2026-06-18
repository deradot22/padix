package com.padelgo.bot.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import org.hibernate.annotations.UuidGenerator
import java.time.Instant
import java.time.LocalTime
import java.util.UUID

enum class TelegramChatType { PRIVATE, GROUP, SUPERGROUP, CHANNEL }

@Entity
@Table(name = "telegram_link_token")
class TelegramLinkToken(
    @Id
    @Column(name = "token", nullable = false, length = 64)
    var token: String = "",

    @Column(name = "user_id", nullable = false)
    var userId: UUID? = null,

    @Column(name = "expires_at", nullable = false)
    var expiresAt: Instant = Instant.now(),

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant? = null
)

@Entity
@Table(name = "telegram_chat")
class TelegramChat(
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    @Column(name = "user_id", nullable = false)
    var userId: UUID? = null,

    @Column(name = "chat_id", nullable = false)
    var chatId: Long = 0L,

    @Column(name = "chat_type", nullable = false, length = 32)
    var chatType: String = TelegramChatType.PRIVATE.name,

    @Column(name = "title", nullable = false)
    var title: String = "",

    @CreationTimestamp
    @Column(name = "linked_at", nullable = false)
    var linkedAt: Instant? = null,

    @Column(name = "notify_updated", nullable = false)
    var notifyUpdated: Boolean = true,

    @Column(name = "notify_finished", nullable = false)
    var notifyFinished: Boolean = true,

    @Column(name = "notify_reminder", nullable = false)
    var notifyReminder: Boolean = true
)

@Entity
@Table(name = "telegram_user_settings")
class TelegramUserSettings(
    @Id
    @Column(name = "user_id", nullable = false)
    var userId: UUID? = null,

    @Column(name = "enabled", nullable = false)
    var enabled: Boolean = true,

    @Column(name = "reminder_hours", nullable = false)
    var reminderHours: Int = 2,

    @Column(name = "quiet_hours_start")
    var quietHoursStart: LocalTime? = null,

    @Column(name = "quiet_hours_end")
    var quietHoursEnd: LocalTime? = null,

    @Column(name = "timezone", nullable = false, length = 64)
    var timezone: String = "UTC",

    /** Закреплять анонс новой игры в группах (с silent notification). */
    @Column(name = "pin_announcement", nullable = false)
    var pinAnnouncement: Boolean = false,

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant? = null,

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant? = null
)

@Entity
@Table(name = "event_telegram_post")
class EventTelegramPost(
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    @Column(name = "event_id", nullable = false)
    var eventId: UUID? = null,

    @Column(name = "telegram_chat_id", nullable = false)
    var telegramChatId: UUID? = null,

    @Column(name = "message_id", nullable = false)
    var messageId: Long = 0L,

    /** Если сообщение было закреплено — TG message id (= messageId), иначе null. */
    @Column(name = "pinned_message_id")
    var pinnedMessageId: Long? = null,

    /**
     * Тип поста: 'ANNOUNCE' — CREATED-анонс (редактируется при roster change, пиннится,
     * снимается при отмене); 'RESULTS' — итоговый пост о завершённой игре
     * (редактируется через updateEventResults при пересчёте результатов).
     * Логика анонса/пина/отмены работает ТОЛЬКО с ANNOUNCE-постами.
     */
    @Column(name = "post_kind", nullable = false, length = 16)
    var postKind: String = "ANNOUNCE",

    @CreationTimestamp
    @Column(name = "posted_at", nullable = false)
    var postedAt: Instant? = null
)

@Entity
@Table(name = "telegram_polling_state")
class TelegramPollingState(
    @Id
    @Column(name = "id", nullable = false)
    var id: Short = 1,

    @Column(name = "last_update_id", nullable = false)
    var lastUpdateId: Long = 0L,

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now()
)
