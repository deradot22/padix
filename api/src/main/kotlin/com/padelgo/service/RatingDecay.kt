package com.padelgo.service

import com.padelgo.domain.RatingChange
import com.padelgo.domain.RatingChangeKind
import com.padelgo.repo.PlayerRepository
import com.padelgo.repo.RatingChangeRepository
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Duration
import java.time.Instant
import kotlin.math.min

/**
 * Политика неактивности (полный пакет, дизайн 2026-07-03):
 * — после 90 дней без матчей игрок попадает на ПОВТОРНУЮ КАЛИБРОВКУ
 *   (calibrationMatchesRemaining = 30 заново): рейтинг виден, но с «вопросиком»,
 *   правила как на калибровке (×1.5 к дельтам, исключён из фильтра «откалиброванные»);
 * — параллельно рейтинг затухает ВНИЗ к target (медиана рейтинга опытных игроков):
 *   1 очко в день, общий decay ограничен 30% от (baseline − target). Калибровка
 *   от decay НЕ защищает — неактивность горит очками для всех;
 * — после 180 дней (полгода) рейтинг СКРЫВАЕТСЯ из публичных мест (лидерборд и т.п.,
 *   `ratingHidden` в DTO) до первого сыгранного матча;
 * — расчёт decay идёт от БАЗЫ (рейтинг на момент последнего матча из rating_changes),
 *   а не от текущего рейтинга — ежедневные прогоны идемпотентны и не компаундятся.
 */
object RatingDecay {
    /** Цель, если не из кого посчитать медиану (пустая/молодая база). */
    const val FALLBACK_TARGET = 1500
    const val INACTIVE_DAYS_THRESHOLD = 90L
    const val DECAY_PER_DAY = 1.0
    const val MAX_DECAY_FRACTION = 0.30

    /** Сколько калибровочных матчей выдаётся заново при уходе в неактив (>90 дней). */
    const val RECALIBRATION_MATCHES = 30

    /** После скольких дней простоя рейтинг скрывается из публичных мест. */
    const val HIDDEN_AFTER_DAYS = 180L

    /** Минимум сыгранных игр, чтобы рейтинг игрока участвовал в расчёте target-медианы. */
    const val TARGET_MIN_GAMES = 10

    /** true — игрок не играл больше полугода, его рейтинг скрыт из публичных мест. */
    fun isRatingHidden(lastMatchAt: Instant?, now: Instant): Boolean {
        if (lastMatchAt == null) return false
        return Duration.between(lastMatchAt, now).toDays() > HIDDEN_AFTER_DAYS
    }

    /**
     * Рейтинг игрока с учётом decay на дату [now]. Идемпотентна: считает от
     * [baselineRating] (рейтинг на момент последнего матча), а не от текущего.
     * Decay только вниз: baseline ≤ target не трогается.
     */
    fun decayedRating(baselineRating: Int, targetRating: Int, lastMatchAt: Instant?, now: Instant): Int {
        if (lastMatchAt == null) return baselineRating
        if (baselineRating <= targetRating) return baselineRating

        val days = Duration.between(lastMatchAt, now).toDays()
        if (days <= INACTIVE_DAYS_THRESHOLD) return baselineRating

        val daysOver = days - INACTIVE_DAYS_THRESHOLD
        val maxDecay = (baselineRating - targetRating) * MAX_DECAY_FRACTION
        val decay = min(daysOver * DECAY_PER_DAY, maxDecay)
        return (baselineRating - decay).toInt()
    }

    /** Медиана рейтингов опытных игроков — цель decay. */
    fun targetRating(experiencedRatings: List<Int>): Int =
        if (experiencedRatings.isEmpty()) FALLBACK_TARGET
        else experiencedRatings.sorted()[experiencedRatings.size / 2]
}

@Component
class RatingDecayJob(
    private val playerRepo: PlayerRepository,
    private val ratingChangeRepo: RatingChangeRepository,
    private val userRepo: com.padelgo.auth.UserRepository
) {
    private val log = LoggerFactory.getLogger(RatingDecayJob::class.java)

    /**
     * Запускается раз в сутки в 03:00 UTC. Два паса:
     *
     * 1. ПОВТОРНАЯ КАЛИБРОВКА: игрокам с простоем >90 дней calibrationMatchesRemaining
     *    поднимается до 30 (заново). На лидерборде у них появляется «вопросик», правила
     *    как на калибровке. Идемпотентно: у уже поднятых до 30 ничего не меняется.
     *
     * 2. DECAY: идемпотентен — каждый прогон вычисляет рейтинг заново от базы (рейтинг
     *    на момент последнего МАТЧА), повторные запуски не компаундятся. Пишет запись
     *    в историю (kind=DECAY), хвостовая переписывается каждый прогон. Калибровка от
     *    decay НЕ защищает: неактивные теряют очки независимо от статуса калибровки.
     */
    // @Scheduled требует метод строго без аргументов (Kotlin-дефолт для Spring — всё
    // равно параметр, контекст падает на старте) — поэтому no-arg обёртка.
    @Scheduled(cron = "0 0 3 * * *", zone = "UTC")
    fun applyDecay() = applyDecay(Instant.now())

    fun applyDecay(now: Instant) {
        val players = playerRepo.findAll()

        val target = RatingDecay.targetRating(
            players.filter { it.gamesPlayed >= RatingDecay.TARGET_MIN_GAMES }.map { it.rating }
        )

        // Пас 1: повторная калибровка неактивных (>90 дней, играл хоть раз, есть аккаунт).
        val accountByPlayerId = userRepo.findAll()
            .filter { it.playerId != null }
            .associateBy { it.playerId!! }
        val recalibrated = mutableListOf<com.padelgo.auth.UserAccount>()
        for (p in players) {
            val pid = p.id ?: continue
            val last = p.lastMatchAt ?: continue
            if (Duration.between(last, now).toDays() <= RatingDecay.INACTIVE_DAYS_THRESHOLD) continue
            val acc = accountByPlayerId[pid] ?: continue
            if (acc.calibrationMatchesRemaining < RatingDecay.RECALIBRATION_MATCHES) {
                acc.calibrationMatchesRemaining = RatingDecay.RECALIBRATION_MATCHES
                recalibrated.add(acc)
            }
        }
        if (recalibrated.isNotEmpty()) {
            userRepo.saveAll(recalibrated)
            log.info("[INACTIVITY] на повторную калибровку отправлено {} игроков", recalibrated.size)
        }

        // Пас 2: decay.
        var affected = 0
        for (p in players) {
            val pid = p.id ?: continue
            if (p.lastMatchAt == null) continue

            val lastMatch = ratingChangeRepo.findFirstByPlayerIdAndMatchIdIsNotNullOrderByCreatedAtDesc(pid)
                ?: continue
            val baseline = lastMatch.newRating
            val decayed = RatingDecay.decayedRating(baseline, target, p.lastMatchAt, now)

            // Хвостовая decay-запись = самая свежая, если она типа DECAY (после посл. матча).
            val latest = ratingChangeRepo.findFirstByPlayerIdOrderByCreatedAtDesc(pid)
            val trailingDecay = latest?.takeIf { it.kind == RatingChangeKind.DECAY }

            if (decayed == baseline) {
                // Decay не применяется — снимаем хвостовую запись и возвращаем базу, если нужно.
                if (trailingDecay != null) ratingChangeRepo.delete(trailingDecay)
                if (p.rating != baseline) {
                    p.rating = baseline; p.ntrp = Ntrp.fromRating(baseline); playerRepo.save(p); affected++
                }
                continue
            }

            trailingDecay?.let { ratingChangeRepo.delete(it) }
            ratingChangeRepo.save(
                RatingChange(
                    eventId = null,
                    matchId = null,
                    kind = RatingChangeKind.DECAY,
                    playerId = pid,
                    oldRating = baseline,
                    delta = decayed - baseline,
                    newRating = decayed
                )
            )
            p.rating = decayed
            p.ntrp = Ntrp.fromRating(decayed)
            playerRepo.save(p)
            affected++
        }
        if (affected > 0) log.info("[DECAY] target={} — затронуто {} игроков", target, affected)
    }
}
