package com.padelgo.service

import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * Рейтинг v2 (2026-10). Разбор, бэктест на реальных матчах и мотивация констант —
 * docs/RATING_V2_2026-10.md.
 *
 * Дельта команды A за матч (команда B получает −delta):
 *   outcome = S − E,   E = 1 / (1 + 10^((B − A) / 300)),  S = 1 / 0.5 / 0
 *   share   = p − P,   P = 1 / (1 + 10^((B − A) / 1400)), p = очки A / все очки матча
 *   delta   = K × (0.5 × outcome + 0.5 × 3 × share)
 * Победитель не уходит в минус, проигравший — в плюс.
 */
object EloRating {
    /** Делитель шкалы исхода: разница 225 ≈ 85 % побед, 300 ≈ 91 %. Классические 400 недооценивали фаворита. */
    const val OUTCOME_SCALE = 300.0

    /** Делитель шкалы доли очков: при разнице 300 фаворит берёт ≈ 62 % очков (измерено по проду). */
    const val SHARE_SCALE = 1400.0

    const val OUTCOME_WEIGHT = 0.5

    /** Усиление доли очков: треть всех очков сверх ожидания стоит столько же, сколько сам исход. */
    const val SHARE_GAIN = 3.0

    /** Множитель дельты для калибрующегося игрока (calibrationMatchesRemaining > 0). */
    const val CALIBRATION_MULTIPLIER = 1.5

    fun expectedScore(ratingA: Int, ratingB: Int): Double =
        1.0 / (1.0 + 10.0.pow((ratingB - ratingA) / OUTCOME_SCALE))

    fun expectedShare(ratingA: Int, ratingB: Int): Double =
        1.0 / (1.0 + 10.0.pow((ratingB - ratingA) / SHARE_SCALE))

    fun kFactor(gamesPlayed: Int): Int =
        when {
            gamesPlayed < 10 -> 48
            gamesPlayed < 30 -> 32
            else -> 20
        }

    /**
     * Рейтинг пары — среднее. Прежний уклон к слабому (60/40) заставлял сильного игрока в
     * паре со слабыми держать завышенный рейтинг: его цифра входила в ожидание лишь на 40 %.
     */
    fun teamRating(p1Rating: Int, p2Rating: Int): Int = ((p1Rating + p2Rating) / 2.0).roundToInt()

    /**
     * Дельта команды A. scoreA: 1.0 победа / 0.5 ничья / 0.0 поражение;
     * pointsA/pointsB — очки (POINTS) или геймы за все сеты (SETS).
     *
     * Дробная: округление делается ОДИН раз в конце конвейера (после калибровки) —
     * каскад промежуточных округлений схлопывал мелкие дельты в 0 и ломал zero-sum.
     */
    fun teamDelta(
        teamARating: Int,
        teamBRating: Int,
        k: Double,
        scoreA: Double,
        pointsA: Int,
        pointsB: Int
    ): Double {
        val outcome = scoreA - expectedScore(teamARating, teamBRating)
        val total = pointsA + pointsB
        val share = if (total > 0) pointsA.toDouble() / total - expectedShare(teamARating, teamBRating) else 0.0
        val delta = k * (OUTCOME_WEIGHT * outcome + (1 - OUTCOME_WEIGHT) * SHARE_GAIN * share)
        return when {
            scoreA > 0.5 && delta < 0 -> 0.0
            scoreA < 0.5 && delta > 0 -> 0.0
            else -> delta
        }
    }
}
