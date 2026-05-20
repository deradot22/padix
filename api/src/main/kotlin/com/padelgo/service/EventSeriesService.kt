package com.padelgo.service

import com.padelgo.api.ApiException
import com.padelgo.domain.EventSeries
import com.padelgo.domain.EventVisibility
import com.padelgo.domain.PairingMode
import com.padelgo.domain.ScoringMode
import com.padelgo.repo.EventSeriesRepository
import jakarta.transaction.Transactional
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.DayOfWeek
import java.time.LocalTime
import java.time.ZoneId
import java.util.UUID

/**
 * Серии игр: пользовательские шаблоны для регулярных игр (например «каждый вт+чт 19:00»).
 * Cron-материализатор (EventSeriesMaterializer) раз в час создаёт обычные Event по этим
 * шаблонам — за `materializeHoursBefore` часов до фактической даты.
 */
@Service
class EventSeriesService(
    private val repo: EventSeriesRepository
) {
    private val log = LoggerFactory.getLogger(EventSeriesService::class.java)

    @Transactional
    fun create(userId: UUID, req: CreateEventSeriesRequest): EventSeries {
        validate(req.title, req.daysOfWeek, req.startTime, req.endTime, req.timezone,
            req.materializeHoursBefore, req.materializeMode)
        val series = EventSeries(
            title = req.title.trim(),
            createdByUserId = userId,
            daysOfWeek = normalizeDays(req.daysOfWeek),
            startTime = req.startTime,
            endTime = req.endTime,
            timezone = req.timezone,
            courtsCount = req.courtsCount,
            roundsPlanned = req.roundsPlanned,
            autoRounds = req.autoRounds,
            pairingMode = req.pairingMode,
            scoringMode = req.scoringMode,
            pointsPerPlayerPerMatch = req.pointsPerPlayerPerMatch,
            setsPerMatch = req.setsPerMatch,
            gamesPerSet = req.gamesPerSet,
            tiebreakEnabled = req.tiebreakEnabled,
            visibility = req.visibility,
            materializeHoursBefore = req.materializeHoursBefore,
            materializeAtTime = req.materializeAtTime,
            materializeMode = req.materializeMode,
            reminderHours = req.reminderHours,
            pinAnnouncement = req.pinAnnouncement,
            active = true
        )
        return repo.save(series)
    }

    fun listMine(userId: UUID): List<EventSeries> =
        repo.findAllByCreatedByUserIdOrderByCreatedAtDesc(userId)

    fun get(id: UUID, userId: UUID): EventSeries {
        val s = repo.findById(id).orElseThrow { ApiException(HttpStatus.NOT_FOUND, "Series not found") }
        if (s.createdByUserId != userId) throw ApiException(HttpStatus.FORBIDDEN, "Not your series")
        return s
    }

    @Transactional
    fun update(id: UUID, userId: UUID, req: UpdateEventSeriesRequest): EventSeries {
        val s = get(id, userId)
        req.title?.let { s.title = it.trim().ifBlank { throw ApiException(HttpStatus.BAD_REQUEST, "Empty title") } }
        req.daysOfWeek?.let { s.daysOfWeek = normalizeDays(it) }
        req.startTime?.let { s.startTime = it }
        req.endTime?.let { s.endTime = it }
        req.timezone?.let {
            try { ZoneId.of(it) } catch (e: Exception) {
                throw ApiException(HttpStatus.BAD_REQUEST, "Unknown timezone: $it")
            }
            s.timezone = it
        }
        req.courtsCount?.let { s.courtsCount = it }
        req.pairingMode?.let { s.pairingMode = it }
        req.scoringMode?.let { s.scoringMode = it }
        req.pointsPerPlayerPerMatch?.let { s.pointsPerPlayerPerMatch = it }
        req.visibility?.let { s.visibility = it }
        req.materializeHoursBefore?.let { s.materializeHoursBefore = it }
        req.materializeAtTime?.let { s.materializeAtTime = it }
        req.materializeMode?.let { s.materializeMode = it }
        // Per-series override уведомлений.
        if (req.clearPinAnnouncement == true) s.pinAnnouncement = null
        else req.pinAnnouncement?.let { s.pinAnnouncement = it }
        if (req.clearReminderHours == true) s.reminderHours = null
        else req.reminderHours?.let {
            if (it < 0 || it > 168) throw ApiException(HttpStatus.BAD_REQUEST, "reminderHours must be 0..168")
            s.reminderHours = it
        }
        validate(s.title, s.daysOfWeek, s.startTime, s.endTime, s.timezone,
            s.materializeHoursBefore, s.materializeMode)
        return repo.save(s)
    }

    @Transactional
    fun setActive(id: UUID, userId: UUID, active: Boolean): EventSeries {
        val s = get(id, userId)
        s.active = active
        return repo.save(s)
    }

    @Transactional
    fun delete(id: UUID, userId: UUID) {
        val s = get(id, userId)
        repo.delete(s)
    }

    private fun validate(
        title: String,
        daysOfWeek: String,
        startTime: LocalTime,
        endTime: LocalTime,
        timezone: String,
        materializeHoursBefore: Int,
        materializeMode: String
    ) {
        if (title.isBlank()) throw ApiException(HttpStatus.BAD_REQUEST, "title is required")
        parseDays(daysOfWeek)  // выбросит 400 если невалидно
        try { ZoneId.of(timezone) } catch (e: Exception) {
            throw ApiException(HttpStatus.BAD_REQUEST, "Unknown timezone: $timezone")
        }
        if (materializeMode !in ALLOWED_MATERIALIZE_MODES) {
            throw ApiException(HttpStatus.BAD_REQUEST,
                "materializeMode must be one of: ${ALLOWED_MATERIALIZE_MODES.joinToString()}")
        }
        // Поле materializeHoursBefore валидируем только для режима HOURS_BEFORE — в WEEKLY_SUNDAY
        // оно не используется (но хранится: пользователь может переключиться обратно).
        if (materializeMode == "HOURS_BEFORE" && materializeHoursBefore !in 1..720) {
            throw ApiException(HttpStatus.BAD_REQUEST, "materializeHoursBefore must be 1..720")
        }
        if (!endTime.isAfter(startTime)) {
            // допускаем переход через полночь — Event тоже это поддерживает, но в серии для простоты запрещаем
            throw ApiException(HttpStatus.BAD_REQUEST, "endTime must be after startTime")
        }
    }

    private fun normalizeDays(csv: String): String {
        val days = parseDays(csv).toSortedSet()
        return days.joinToString(",") { it.name.substring(0, 3) }
    }

    companion object {
        val ALLOWED_MATERIALIZE_MODES = setOf("HOURS_BEFORE", "WEEKLY_SUNDAY")

        private val DAY_MAP = mapOf(
            "MON" to DayOfWeek.MONDAY,
            "TUE" to DayOfWeek.TUESDAY,
            "WED" to DayOfWeek.WEDNESDAY,
            "THU" to DayOfWeek.THURSDAY,
            "FRI" to DayOfWeek.FRIDAY,
            "SAT" to DayOfWeek.SATURDAY,
            "SUN" to DayOfWeek.SUNDAY
        )

        fun parseDays(csv: String): Set<DayOfWeek> {
            val tokens = csv.split(",").map { it.trim().uppercase() }.filter { it.isNotBlank() }
            if (tokens.isEmpty()) {
                throw ApiException(HttpStatus.BAD_REQUEST, "daysOfWeek must contain at least one day")
            }
            return tokens.map { tok ->
                DAY_MAP[tok] ?: throw ApiException(HttpStatus.BAD_REQUEST, "Unknown day: $tok (use MON,TUE,WED,THU,FRI,SAT,SUN)")
            }.toSet()
        }
    }
}

data class CreateEventSeriesRequest(
    val title: String,
    val daysOfWeek: String,                   // "MON,WED,FRI"
    val startTime: LocalTime,
    val endTime: LocalTime,
    val timezone: String = "Europe/Moscow",
    val courtsCount: Int = 2,
    val roundsPlanned: Int = 6,
    val autoRounds: Boolean = true,
    val pairingMode: PairingMode = PairingMode.ROUND_ROBIN,
    val scoringMode: ScoringMode = ScoringMode.POINTS,
    val pointsPerPlayerPerMatch: Int = 6,
    val setsPerMatch: Int = 1,
    val gamesPerSet: Int = 6,
    val tiebreakEnabled: Boolean = true,
    val visibility: EventVisibility = EventVisibility.PRIVATE,
    val materializeHoursBefore: Int = 168,   // за неделю до игры по умолчанию
    val materializeAtTime: LocalTime = LocalTime.of(9, 0), // в 09:00 локального времени автора
    val materializeMode: String = "HOURS_BEFORE",          // или "WEEKLY_SUNDAY" — "в конце недели"
    // Per-series override уведомлений; null → использовать глобальные telegram_user_settings.
    val reminderHours: Int? = null,
    val pinAnnouncement: Boolean? = null
)

data class UpdateEventSeriesRequest(
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
    // Для override: явный sentinel = передать null чтобы "сбросить", иначе not-in-request.
    // Используем Optional-style: ключ есть → применить. Здесь Kotlin nullable значит ровно
    // это (если поле не пришло в JSON — Jackson оставит null и мы пропустим), а если
    // пользователь хочет "сбросить" — он отправит -1 / clear-флаг. Для простоты сейчас:
    // null = не менять; если нужно "вернуть в глобал" — фронт шлёт "global" → парсим как
    // null (см. логику ниже).
    val reminderHours: Int? = null,
    val pinAnnouncement: Boolean? = null,
    /** Если true — pinAnnouncement сбрасывается в null (использовать глобальное). */
    val clearPinAnnouncement: Boolean? = null,
    /** Если true — reminderHours сбрасывается в null (использовать глобальное). */
    val clearReminderHours: Boolean? = null
)
