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
 * Затухание рейтинга при бездействии:
 * — после 90 дней без матчей рейтинг медленно сдвигается ВНИЗ к target
 *   (медиана рейтинга опытных игроков; неактивность не может ПОДНЯТЬ рейтинг —
 *   раньше drift вверх к 1500 выводил неиграющих в топ лидерборда);
 * — 1 очко в день, общий decay ограничен 30% от (baseline − target);
 * — расчёт идёт от БАЗЫ (рейтинг на момент последнего матча из rating_changes),
 *   а не от текущего рейтинга — ежедневные прогоны идемпотентны и не компаундятся
 *   (раньше повторное применение к уже задекеенному рейтингу ускорялось
 *   квадратично и сводило всех к 1500 за недели);
 * — калибрующиеся игроки не трогаются.
 */
object RatingDecay {
    /** Цель, если не из кого посчитать медиану (пустая/молодая база). */
    const val FALLBACK_TARGET = 1500
    const val INACTIVE_DAYS_THRESHOLD = 90L
    const val DECAY_PER_DAY = 1.0
    const val MAX_DECAY_FRACTION = 0.30

    /** Минимум сыгранных игр, чтобы рейтинг игрока участвовал в расчёте target-медианы. */
    const val TARGET_MIN_GAMES = 10

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
     * Запускается раз в сутки в 03:00 UTC. Идемпотентен: каждый прогон вычисляет рейтинг
     * заново от базы (рейтинг на момент последнего МАТЧА), поэтому повторные запуски не
     * компаундятся. Decay пишет отдельную запись в историю (kind=DECAY) — на графике
     * рейтинга виден спад после последнего матча. Хвостовая decay-запись (после последнего
     * матча) при каждом прогоне переписывается, так что она одна на текущий период простоя.
     * Калибрующиеся игроки (calibrationMatchesRemaining > 0) пропускаются.
     */
    @Scheduled(cron = "0 0 3 * * *", zone = "UTC")
    fun applyDecay() {
        val now = Instant.now()
        val players = playerRepo.findAll()

        val target = RatingDecay.targetRating(
            players.filter { it.gamesPlayed >= RatingDecay.TARGET_MIN_GAMES }.map { it.rating }
        )
        val calibratingPlayerIds = userRepo.findAll()
            .filter { it.calibrationMatchesRemaining > 0 }
            .mapNotNull { it.playerId }
            .toSet()

        var affected = 0
        for (p in players) {
            val pid = p.id ?: continue
            if (pid in calibratingPlayerIds) continue
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
