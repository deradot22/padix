package com.padelgo.service

import com.padelgo.domain.Player
import com.padelgo.repo.PlayerRepository
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Duration
import java.time.Instant
import kotlin.math.abs
import kotlin.math.min

/**
 * Затухание рейтинга при бездействии:
 * — после 90 дней без матчей рейтинг начинает медленно сдвигаться к 1500
 * — 1 очко в день
 * — общий decay ограничен 30% от разницы (rating − 1500)
 *   → игрок с 1750 не может упасть ниже 1675, игрок с 1200 не может подняться выше 1290
 * — калибрующиеся игроки не трогаются
 */
object RatingDecay {
    const val NEUTRAL_RATING = 1500
    const val INACTIVE_DAYS_THRESHOLD = 90L
    const val DECAY_PER_DAY = 1.0
    const val MAX_DECAY_FRACTION = 0.30

    /**
     * Возвращает целевой рейтинг игрока с учётом decay на дату [now].
     * Если decay не применим — возвращает текущий rating.
     */
    fun decayedRating(currentRating: Int, lastMatchAt: Instant?, now: Instant): Int {
        if (lastMatchAt == null) return currentRating
        if (currentRating == NEUTRAL_RATING) return currentRating

        val days = Duration.between(lastMatchAt, now).toDays()
        if (days <= INACTIVE_DAYS_THRESHOLD) return currentRating

        val daysOver = days - INACTIVE_DAYS_THRESHOLD
        val gap = abs(currentRating - NEUTRAL_RATING).toDouble()
        val maxDecay = gap * MAX_DECAY_FRACTION
        val decay = min(daysOver * DECAY_PER_DAY, maxDecay)

        return if (currentRating > NEUTRAL_RATING) {
            (currentRating - decay).toInt()
        } else {
            (currentRating + decay).toInt()
        }
    }
}

@Component
class RatingDecayJob(
    private val playerRepo: PlayerRepository,
    private val userRepo: com.padelgo.auth.UserRepository
) {
    private val log = LoggerFactory.getLogger(RatingDecayJob::class.java)

    /**
     * Запускается раз в сутки в 03:00 UTC. Применяет decay к рейтингам неактивных игроков.
     * Калибрующиеся игроки (calibrationMatchesRemaining > 0) пропускаются — их рейтинг
     * ещё неустоявшийся и сдвигать его без матчей бессмысленно.
     */
    @Scheduled(cron = "0 0 3 * * *", zone = "UTC")
    fun applyDecay() {
        val now = Instant.now()
        val players = playerRepo.findAll()
        var updated = 0
        for (p in players) {
            val accountCalibration = p.id?.let { userRepo.findByPlayerId(it)?.calibrationMatchesRemaining ?: 0 } ?: 0
            if (accountCalibration > 0) continue
            val newRating = RatingDecay.decayedRating(p.rating, p.lastMatchAt, now)
            if (newRating != p.rating) {
                p.rating = newRating
                p.ntrp = Ntrp.fromRating(newRating)
                updated++
            }
        }
        if (updated > 0) {
            playerRepo.saveAll(players)
            log.info("[DECAY] Применили decay к {} игрокам", updated)
        }
    }
}
