package com.padelgo.service

import com.padelgo.domain.Event
import com.padelgo.domain.EventSeries
import com.padelgo.repo.EventRepository
import com.padelgo.repo.EventSeriesRepository
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

/**
 * Cron-материализатор для EventSeries: раз в час проходит по активным сериям и создаёт
 * обычные Event'ы заранее (за `materializeHoursBefore` часов до фактической даты игры).
 *
 * Идемпотентен: `last_materialized_for` в EventSeries хранит последнюю созданную дату.
 */
@Component
class EventSeriesMaterializer(
    private val seriesRepo: EventSeriesRepository,
    private val eventRepo: EventRepository,
    private val eventService: EventService,
    private val botClient: BotClient
) {
    private val log = LoggerFactory.getLogger(EventSeriesMaterializer::class.java)

    @Scheduled(cron = "0 5 * * * *")  // каждый час в 5 минут (даёт зазор после старта приложения)
    @Transactional
    fun tick() {
        val now = LocalDateTime.now(ZoneId.of("UTC"))
        val active = seriesRepo.findAllByActiveTrue()
        if (active.isEmpty()) return
        log.debug("Materializer tick: {} active series", active.size)
        for (s in active) {
            try {
                materializeIfDue(s, now.toInstant(java.time.ZoneOffset.UTC))
            } catch (e: Exception) {
                log.warn("Materialize failed for series {}: {}", s.id, e.message)
            }
        }
    }

    private fun materializeIfDue(s: EventSeries, nowUtcInstant: java.time.Instant) {
        val tz = try { ZoneId.of(s.timezone) } catch (_: Exception) { ZoneId.of("UTC") }
        val ownerId = s.createdByUserId ?: return
        val days = EventSeriesService.parseDays(s.daysOfWeek)
        if (days.isEmpty()) return

        val nowLocal = nowUtcInstant.atZone(tz).toLocalDateTime()

        when (s.materializeMode) {
            "WEEKLY_SUNDAY" -> materializeWeeklySunday(s, ownerId, days, nowUtcInstant, nowLocal, tz)
            else -> materializeHoursBefore(s, ownerId, days, nowUtcInstant, nowLocal, tz)
        }
    }

    /** Старое поведение: материализуем за `materializeHoursBefore` часов до игры. */
    private fun materializeHoursBefore(
        s: EventSeries,
        ownerId: java.util.UUID,
        days: Set<java.time.DayOfWeek>,
        nowUtcInstant: java.time.Instant,
        nowLocal: LocalDateTime,
        tz: ZoneId,
    ) {
        // Окно материализации: текущий час должен быть >= materializeAtTime, иначе ждём.
        // Без этого ограничения cron создал бы анонсы в случайное время суток (в т.ч. ночью).
        // Cron бежит раз в час — фактическая материализация произойдёт в первый тик после
        // materializeAtTime, т.е. в пределах часа.
        if (nowLocal.toLocalTime().isBefore(s.materializeAtTime)) return

        val startFromDate = (s.lastMaterializedFor ?: nowLocal.toLocalDate().minusDays(1)).plusDays(1)

        // Перебираем дни вперёд, материализуем все, попадающие в окно
        // [сейчас .. сейчас + materializeHoursBefore]. Останавливаемся, как только
        // следующая кандидат-дата позже окна.
        var probe: LocalDate = startFromDate
        val horizon = nowUtcInstant.plus(Duration.ofHours(s.materializeHoursBefore.toLong()))
        var lastMaterialized: LocalDate? = null
        while (probe.isBefore(nowLocal.toLocalDate().plusDays(30))) {
            val dow = probe.dayOfWeek
            if (dow in days) {
                val startInstant = LocalDateTime.of(probe, s.startTime).atZone(tz).toInstant()
                if (startInstant.isBefore(nowUtcInstant)) {
                    // дата уже прошла — пропускаем
                } else if (startInstant.isAfter(horizon)) {
                    // ещё рано материализовать
                    break
                } else {
                    materialize(s, probe, ownerId)
                    lastMaterialized = probe
                }
            }
            probe = probe.plusDays(1)
        }

        if (lastMaterialized != null) {
            s.lastMaterializedFor = lastMaterialized
            seriesRepo.save(s)
        }
    }

    /**
     * Режим "в конце недели": материализовать в воскресенье в `materializeAtTime` для всех игр
     * следующей недели (Понедельник..Воскресенье).
     *
     * Initial phase: если серия только что создана (`lastMaterializedFor == null`), а ближайшая
     * игра наступает ДО следующего воскресенья — материализуем её сразу. Иначе уведомление
     * молча сгорело бы (например, серия "по четвергам" создана в среду — игра завтра, а
     * следующее воскресенье уже после игры).
     */
    private fun materializeWeeklySunday(
        s: EventSeries,
        ownerId: java.util.UUID,
        days: Set<java.time.DayOfWeek>,
        nowUtcInstant: java.time.Instant,
        nowLocal: LocalDateTime,
        tz: ZoneId,
    ) {
        val today = nowLocal.toLocalDate()
        val nowTime = nowLocal.toLocalTime()
        val isInitial = s.lastMaterializedFor == null

        // Ближайшее воскресенье включительно (если сегодня воскресенье — это сегодня).
        val daysUntilSunday = (7 - today.dayOfWeek.value) % 7   // Sun(7)→0, Mon(1)→6, Sat(6)→1
        val upcomingSunday = today.plusDays(daysUntilSunday.toLong())

        // Это "регулярный тик в воскресенье после materializeAtTime"?
        val isSundayTrigger = today.dayOfWeek == java.time.DayOfWeek.SUNDAY &&
            !nowTime.isBefore(s.materializeAtTime)

        // Если не initial и не воскресный тик — нечего делать.
        if (!isInitial && !isSundayTrigger) return

        // Стартовая дата перебора.
        val startFromDate = (s.lastMaterializedFor?.plusDays(1)) ?: today
        // Горизонт: следующее воскресенье + 7 дней (т.е. вся следующая неделя).
        val horizonDate = upcomingSunday.plusDays(7)

        var probe: LocalDate = startFromDate
        var lastMaterialized: LocalDate? = null

        while (!probe.isAfter(horizonDate)) {
            val dow = probe.dayOfWeek
            if (dow in days) {
                val startInstant = LocalDateTime.of(probe, s.startTime).atZone(tz).toInstant()
                if (startInstant.isBefore(nowUtcInstant)) {
                    // Уже прошла.
                } else {
                    val shouldMaterialize = if (isInitial && !isSundayTrigger) {
                        // Initial-фаза среди недели: материализуем только до ближайшего
                        // воскресенья включительно (срочные игры). Игры после воскресенья
                        // обработаются обычным воскресным тиком.
                        !probe.isAfter(upcomingSunday)
                    } else {
                        // Воскресный тик: материализуем всю следующую неделю.
                        // Если воскресенье ещё не наступило для какой-то игры этой недели —
                        // тоже включаем (на случай если series создана в субботу и
                        // ближайшее "сегодня воскресенье" — это и есть isSundayTrigger).
                        true
                    }
                    if (shouldMaterialize) {
                        materialize(s, probe, ownerId)
                        lastMaterialized = probe
                    }
                }
            }
            probe = probe.plusDays(1)
        }

        if (lastMaterialized != null) {
            s.lastMaterializedFor = lastMaterialized
            seriesRepo.save(s)
        }
    }

    private fun materialize(s: EventSeries, date: LocalDate, ownerId: java.util.UUID) {
        // Защита от дубликата: если по этой серии и дате уже есть Event — не создаём ещё.
        val existing = eventRepo.findAllBySeriesId(s.id!!).any { it.date == date }
        if (existing) return

        val ev = Event(
            title = s.title,
            date = date,
            startTime = s.startTime,
            endTime = s.endTime,
            pairingMode = s.pairingMode,
            courtsCount = s.courtsCount,
            roundsPlanned = s.roundsPlanned,
            autoRounds = s.autoRounds,
            scoringMode = s.scoringMode,
            pointsPerPlayerPerMatch = s.pointsPerPlayerPerMatch,
            setsPerMatch = s.setsPerMatch,
            gamesPerSet = s.gamesPerSet,
            tiebreakEnabled = s.tiebreakEnabled,
            visibility = s.visibility,
            seriesId = s.id
        )
        val created = eventService.createEvent(ev, ownerId)
        log.info("Materialized series {} → event {} on {}", s.id, created.id, date)

        // Анонс в Telegram: посылаем во все привязанные к юзеру групповые чаты, чтобы
        // подписчики увидели открывшуюся регистрацию. Личные чаты автора не трогаем —
        // он сам создал серию и про материализацию знать необязательно.
        val groupChatIds = try { botClient.getOwnerGroupChats(ownerId) } catch (e: Exception) {
            log.warn("getOwnerGroupChats failed for {}: {}", ownerId, e.message)
            emptyList()
        }
        if (groupChatIds.isNotEmpty()) {
            try {
                botClient.notifyEventCreated(
                    EventCreatedNotify(
                        eventId = created.id!!,
                        ownerUserId = ownerId,
                        chatIds = groupChatIds,
                        title = created.title,
                        date = created.date,
                        startTime = created.startTime,
                        endTime = created.endTime,
                        courtsCount = created.courtsCount,
                        registeredCount = 0
                    )
                )
            } catch (e: Exception) {
                log.warn("notifyEventCreated for materialized {} failed: {}", created.id, e.message)
            }
        }
    }
}
