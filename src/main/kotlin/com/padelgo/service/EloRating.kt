package com.padelgo.service

import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

object EloRating {
    fun expectedScore(ratingA: Int, ratingB: Int): Double =
        1.0 / (1.0 + 10.0.pow((ratingB - ratingA) / 400.0))

    fun kFactor(gamesPlayed: Int): Int =
        when {
            gamesPlayed < 10 -> 48
            gamesPlayed < 30 -> 32
            else -> 20
        }

    /**
     * Командный рейтинг пары — взвешенное среднее с уклоном к слабому игроку (60/40).
     * Причина: в паддле «бьют по слабому», слабый партнёр — узкое горлышко.
     * Команда 1800+1400 (avg 1600) на деле слабее команды 1600+1600,
     * и weighted формула это отражает.
     */
    fun teamRating(p1Rating: Int, p2Rating: Int): Int {
        val weaker = min(p1Rating, p2Rating)
        val stronger = max(p1Rating, p2Rating)
        return (weaker * 0.6 + stronger * 0.4).roundToInt()
    }

    /**
     * Возвращает delta для команды A (для команды B будет -delta).
     *
     * scoreA: 1.0 win, 0.5 draw, 0.0 loss
     */
    fun teamDelta(teamARating: Int, teamBRating: Int, k: Int, scoreA: Double): Int {
        val expected = expectedScore(teamARating, teamBRating)
        return (k * (scoreA - expected)).roundToInt()
    }

    /**
     * Множитель за разницу счёта (margin of victory).
     * Квадратичная кривая: мелкие победы почти не усиливаются, разгромы — сильно.
     * multiplier = 1 + 0.5 * (margin/expectedTotal)^2, макс 1.5
     *
     * Примеры (expectedTotal=24):
     *   13:11 (margin=2)   → 1.003 (boring)
     *   16:8  (margin=8)   → 1.056
     *   20:4  (margin=16)  → 1.22 (умеренный разгром)
     *   22:2  (margin=20)  → 1.35
     *   24:0  (margin=24)  → 1.5 (полный шат-аут)
     */
    fun marginMultiplier(teamAPoints: Int, teamBPoints: Int, expectedTotal: Int): Double {
        if (expectedTotal <= 0) return 1.0
        val margin = kotlin.math.abs(teamAPoints - teamBPoints)
        val ratio = min(margin.toDouble() / expectedTotal, 1.0)
        return 1.0 + 0.5 * ratio * ratio
    }
}

