package com.padelgo.service

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
     * Возвращает delta для команды A (для команды B будет -delta).
     *
     * scoreA: 1.0 win, 0.5 draw, 0.0 loss
     */
    fun teamDelta(teamARating: Int, teamBRating: Int, k: Int, scoreA: Double): Int {
        val expected = expectedScore(teamARating, teamBRating)
        return (k * (scoreA - expected)).roundToInt()
    }
}

