package com.padelgo.service

/**
 * Уровень — подпись к рейтингу, на расчёт не влияет. Границы подобраны по игрокам с
 * известным уровнем (2026-10): полшага ≈ 250 очков. Дублируется в web/src/lib/rating.ts
 * и в Android (ProfileFragment.NtrpProgress) — менять синхронно.
 */
object Ntrp {
    fun fromRating(rating: Int): String = when {
        rating < 610 -> "1.0"
        rating < 870 -> "1.5"
        rating < 1130 -> "2.0"
        rating < 1350 -> "2.5"
        rating < 1650 -> "3.0"
        rating < 1900 -> "3.5"
        rating < 2150 -> "4.0"
        rating < 2400 -> "4.5"
        else -> "5.0+"
    }
}
