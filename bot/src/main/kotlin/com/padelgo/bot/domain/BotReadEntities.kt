package com.padelgo.bot.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

/**
 * Минимальные read-only представления сущностей из api-схемы, нужные боту:
 * — Event для reminder cron и для рендера сообщений
 * — Player для имени в напоминаниях
 * — Registration для списка участников
 *
 * Bot не пишет в эти таблицы (за исключением `events.reminder_sent_at`, который ставит сам).
 */
enum class EventStatus { DRAFT, OPEN_FOR_REGISTRATION, REGISTRATION_CLOSED, IN_PROGRESS, FINISHED, CANCELLED }
enum class RegistrationStatus { REGISTERED, CANCELLED }

@Entity
@Table(name = "events")
class BotEvent(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    @Column(name = "title", nullable = false)
    var title: String = "",

    @Column(name = "event_date", nullable = false)
    var date: LocalDate = LocalDate.now(),

    @Column(name = "start_time", nullable = false)
    var startTime: LocalTime = LocalTime.of(19, 0),

    @Column(name = "end_time", nullable = false)
    var endTime: LocalTime = LocalTime.of(21, 0),

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    var status: EventStatus = EventStatus.OPEN_FOR_REGISTRATION,

    @Column(name = "courts_count", nullable = false)
    var courtsCount: Int = 2,

    @Column(name = "created_by_user_id")
    var createdByUserId: UUID? = null,

    /** FK на event_series.id, если ивент материализован из серии. */
    @Column(name = "series_id")
    var seriesId: UUID? = null,

    @Column(name = "reminder_sent_at")
    var reminderSentAt: Instant? = null
)

/**
 * Read-only слепок event_series — нужен боту, чтобы найти per-series override
 * настроек уведомлений (pin_announcement, reminder_hours). Bot НЕ обновляет эту
 * таблицу — управление через api.
 */
@Entity
@Table(name = "event_series")
class BotEventSeries(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    /** Per-series override. null → использовать глобальный telegram_user_settings. */
    @Column(name = "reminder_hours")
    var reminderHours: Int? = null,

    @Column(name = "pin_announcement")
    var pinAnnouncement: Boolean? = null
)

@Entity
@Table(name = "players")
class BotPlayer(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    @Column(name = "name", nullable = false)
    var name: String = ""
)

@Entity
@Table(name = "users")
class BotUser(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    @Column(name = "player_id", nullable = false)
    var playerId: UUID? = null
)

@Entity
@Table(name = "registrations")
class BotRegistration(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    @Column(name = "event_id", nullable = false)
    var eventId: UUID? = null,

    @Column(name = "player_id", nullable = false)
    var playerId: UUID? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    var status: RegistrationStatus = RegistrationStatus.REGISTERED
)
