package com.padelgo.api

import com.padelgo.domain.EventSeries
import com.padelgo.domain.EventVisibility
import com.padelgo.domain.PairingMode
import com.padelgo.domain.ScoringMode
import com.padelgo.service.CreateEventSeriesRequest
import com.padelgo.service.EventSeriesMaterializer
import com.padelgo.service.EventSeriesService
import com.padelgo.service.UpdateEventSeriesRequest
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.*
import java.time.LocalTime
import java.util.UUID

@Tag(name = "EventSeries", description = "Серии регулярных игр (шаблоны), из которых cron автоматически создаёт обычные events")
@SecurityRequirement(name = "BearerAuth")
@RestController
@RequestMapping("/api/event-series")
class EventSeriesController(
    private val service: EventSeriesService,
    private val materializer: EventSeriesMaterializer
) {
    @Operation(summary = "Создать серию")
    @PostMapping
    fun create(@Valid @RequestBody req: CreateEventSeriesBody): EventSeriesResponse {
        val saved = service.create(
            principalUserId(),
            CreateEventSeriesRequest(
                title = req.title,
                daysOfWeek = req.daysOfWeek,
                startTime = req.startTime,
                endTime = req.endTime,
                timezone = req.timezone ?: "Europe/Moscow",
                courtsCount = req.courtsCount ?: 2,
                roundsPlanned = req.roundsPlanned ?: 6,
                autoRounds = req.autoRounds ?: true,
                pairingMode = req.pairingMode ?: PairingMode.ROUND_ROBIN,
                scoringMode = req.scoringMode ?: ScoringMode.POINTS,
                pointsPerPlayerPerMatch = req.pointsPerPlayerPerMatch ?: 6,
                setsPerMatch = req.setsPerMatch ?: 1,
                gamesPerSet = req.gamesPerSet ?: 6,
                tiebreakEnabled = req.tiebreakEnabled ?: true,
                visibility = req.visibility ?: EventVisibility.PRIVATE,
                materializeHoursBefore = req.materializeHoursBefore ?: 168,
                materializeAtTime = req.materializeAtTime ?: LocalTime.of(9, 0),
                materializeMode = req.materializeMode ?: "HOURS_BEFORE",
                reminderHours = req.reminderHours,
                pinAnnouncement = req.pinAnnouncement,
                targetChatIds = req.targetChatIds ?: emptyList()
            )
        )
        // Initial phase: запускаем материализатор сразу, не ждём следующий cron. Это нужно
        // для срочных случаев (например, серия создана в среду — игра завтра, а следующий
        // cron только через час).
        try { materializer.tick() } catch (e: Exception) {
            // Не критично — если что-то упало здесь, следующий cron всё равно подберёт.
        }
        return EventSeriesResponse.from(saved)
    }

    @Operation(summary = "Мои серии")
    @GetMapping
    fun listMine(): List<EventSeriesResponse> =
        service.listMine(principalUserId()).map { EventSeriesResponse.from(it) }

    @Operation(summary = "Серия по ID (только своя)")
    @GetMapping("/{id}")
    fun get(@PathVariable id: UUID): EventSeriesResponse =
        EventSeriesResponse.from(service.get(id, principalUserId()))

    @Operation(summary = "Обновить серию")
    @PatchMapping("/{id}")
    fun update(@PathVariable id: UUID, @RequestBody req: UpdateEventSeriesBody): EventSeriesResponse {
        val updated = service.update(
            id, principalUserId(),
            UpdateEventSeriesRequest(
                title = req.title,
                daysOfWeek = req.daysOfWeek,
                startTime = req.startTime,
                endTime = req.endTime,
                timezone = req.timezone,
                courtsCount = req.courtsCount,
                pairingMode = req.pairingMode,
                scoringMode = req.scoringMode,
                pointsPerPlayerPerMatch = req.pointsPerPlayerPerMatch,
                visibility = req.visibility,
                materializeHoursBefore = req.materializeHoursBefore,
                materializeAtTime = req.materializeAtTime,
                materializeMode = req.materializeMode,
                reminderHours = req.reminderHours,
                pinAnnouncement = req.pinAnnouncement,
                clearPinAnnouncement = req.clearPinAnnouncement,
                clearReminderHours = req.clearReminderHours,
                targetChatIds = req.targetChatIds
            )
        )
        return EventSeriesResponse.from(updated)
    }

    @Operation(summary = "Поставить серию на паузу")
    @PostMapping("/{id}/pause")
    fun pause(@PathVariable id: UUID): EventSeriesResponse =
        EventSeriesResponse.from(service.setActive(id, principalUserId(), false))

    @Operation(summary = "Возобновить серию")
    @PostMapping("/{id}/resume")
    fun resume(@PathVariable id: UUID): EventSeriesResponse =
        EventSeriesResponse.from(service.setActive(id, principalUserId(), true))

    @Operation(summary = "Удалить серию (созданные ею игры остаются)")
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable id: UUID) {
        service.delete(id, principalUserId())
    }

    private fun principalUserId(): UUID {
        val p = org.springframework.security.core.context.SecurityContextHolder.getContext().authentication?.principal
        if (p is com.padelgo.auth.JwtPrincipal) return p.userId
        throw ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized")
    }
}

data class CreateEventSeriesBody(
    val title: String,
    val daysOfWeek: String,                   // "MON,WED,FRI"
    val startTime: LocalTime,
    val endTime: LocalTime,
    val timezone: String? = null,
    val courtsCount: Int? = null,
    val roundsPlanned: Int? = null,
    val autoRounds: Boolean? = null,
    val pairingMode: PairingMode? = null,
    val scoringMode: ScoringMode? = null,
    val pointsPerPlayerPerMatch: Int? = null,
    val setsPerMatch: Int? = null,
    val gamesPerSet: Int? = null,
    val tiebreakEnabled: Boolean? = null,
    val visibility: EventVisibility? = null,
    val materializeHoursBefore: Int? = null,
    val materializeAtTime: LocalTime? = null,
    val materializeMode: String? = null,
    // Per-series notifications (null → using global telegram_user_settings).
    val reminderHours: Int? = null,
    val pinAnnouncement: Boolean? = null,
    /** UUID telegram_chat для анонсов. Пустой → во все группы автора. */
    val targetChatIds: List<UUID>? = null
)

data class UpdateEventSeriesBody(
    val title: String? = null,
    val daysOfWeek: String? = null,
    val startTime: LocalTime? = null,
    val endTime: LocalTime? = null,
    val timezone: String? = null,
    val courtsCount: Int? = null,
    val pairingMode: PairingMode? = null,
    val scoringMode: ScoringMode? = null,
    val pointsPerPlayerPerMatch: Int? = null,
    val visibility: EventVisibility? = null,
    val materializeHoursBefore: Int? = null,
    val materializeAtTime: LocalTime? = null,
    val materializeMode: String? = null,
    val reminderHours: Int? = null,
    val pinAnnouncement: Boolean? = null,
    /** Если true — сбросить per-series pin override и использовать глобальное. */
    val clearPinAnnouncement: Boolean? = null,
    /** Если true — сбросить per-series reminder override и использовать глобальное. */
    val clearReminderHours: Boolean? = null,
    /** null → не менять; список → перезаписать; пустой список → fallback на все группы. */
    val targetChatIds: List<UUID>? = null
)

data class EventSeriesResponse(
    val id: UUID,
    val title: String,
    val daysOfWeek: String,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val timezone: String,
    val courtsCount: Int,
    val pairingMode: PairingMode,
    val scoringMode: ScoringMode,
    val pointsPerPlayerPerMatch: Int,
    val visibility: EventVisibility,
    val materializeHoursBefore: Int,
    val materializeAtTime: LocalTime,
    val materializeMode: String,
    /** Per-series override напоминания (null → используется глобальное). */
    val reminderHours: Int?,
    /** Per-series override закрепления анонса (null → используется глобальное). */
    val pinAnnouncement: Boolean?,
    /** Список UUID telegram_chat'ов, в которые шлёт анонс (пустой → все группы автора). */
    val targetChatIds: List<UUID>,
    val active: Boolean,
    val lastMaterializedFor: java.time.LocalDate?
) {
    companion object {
        fun from(s: EventSeries) = EventSeriesResponse(
            id = s.id!!,
            title = s.title,
            daysOfWeek = s.daysOfWeek,
            startTime = s.startTime,
            endTime = s.endTime,
            timezone = s.timezone,
            courtsCount = s.courtsCount,
            pairingMode = s.pairingMode,
            scoringMode = s.scoringMode,
            pointsPerPlayerPerMatch = s.pointsPerPlayerPerMatch,
            visibility = s.visibility,
            materializeHoursBefore = s.materializeHoursBefore,
            materializeAtTime = s.materializeAtTime,
            materializeMode = s.materializeMode,
            reminderHours = s.reminderHours,
            pinAnnouncement = s.pinAnnouncement,
            targetChatIds = s.targetChatIds.split(",").mapNotNull {
                it.trim().takeIf { t -> t.isNotBlank() }?.let { t -> runCatching { UUID.fromString(t) }.getOrNull() }
            },
            active = s.active,
            lastMaterializedFor = s.lastMaterializedFor
        )
    }
}
