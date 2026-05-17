package com.padelgo.service

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * Тесты на алгоритм decay (затухания рейтинга при бездействии).
 */
class RatingDecayTest {

    private val now: Instant = Instant.parse("2026-05-14T12:00:00Z")

    private fun daysAgo(days: Long): Instant = now.minus(days, ChronoUnit.DAYS)

    @Test
    fun `decay - null lastMatchAt не меняет рейтинг`() {
        assertEquals(1750, RatingDecay.decayedRating(1750, null, now))
    }

    @Test
    fun `decay - игрок с нейтральным рейтингом 1500 не двигается`() {
        // У него нет куда сдвигаться
        assertEquals(1500, RatingDecay.decayedRating(1500, daysAgo(180), now))
    }

    @Test
    fun `decay - не применяется в первые 90 дней`() {
        assertEquals(1750, RatingDecay.decayedRating(1750, daysAgo(30), now))
        assertEquals(1750, RatingDecay.decayedRating(1750, daysAgo(89), now))
        assertEquals(1750, RatingDecay.decayedRating(1750, daysAgo(90), now))
    }

    @Test
    fun `decay - после 90 дней сдвигает рейтинг сильного игрока вниз`() {
        // 120 дней: 30 дней сверх лимита × 1 = -30
        assertEquals(1720, RatingDecay.decayedRating(1750, daysAgo(120), now))
    }

    @Test
    fun `decay - после 90 дней сдвигает рейтинг слабого игрока вверх`() {
        // 1200 < 1500: должен расти к нейтральному
        // gap=300, max decay=300*0.3=90, дней=30 → decay=30 (не достиг cap)
        assertEquals(1230, RatingDecay.decayedRating(1200, daysAgo(120), now))
    }

    @Test
    fun `decay - ограничен 30 процентами разницы с 1500`() {
        // 1800 - 1500 = 300, max decay = 90
        // 500 дней без матчей → попытка decay = 410, но cap 90
        val result = RatingDecay.decayedRating(1800, daysAgo(500), now)
        assertEquals(1710, result, "Должен остановиться на 1800-90=1710")
    }

    @Test
    fun `decay - игрок с 1750 не падает ниже 1675`() {
        // 1750 - 1500 = 250, max decay = 75
        val result = RatingDecay.decayedRating(1750, daysAgo(365 * 5), now)
        assertEquals(1675, result)
    }

    @Test
    fun `decay - последовательные применения каждый день сходятся к 1500`() {
        // Симуляция: каждый день запускаем decay job (lastMatchAt не меняется).
        // Каждый раз cap = 30% от ТЕКУЩЕЙ разницы с 1500 → рейтинг сходится к 1500.
        var rating = 1900
        var day = 91L
        val days = mutableListOf<Pair<Long, Int>>()
        while (day < 5000 && rating > 1505) {
            rating = RatingDecay.decayedRating(rating, daysAgo(day), now)
            if (day % 50L == 0L) days.add(day to rating)
            day++
        }
        // Через несколько сотен дней рейтинг падает к 1500
        assertTrue(rating <= 1505, "rating=$rating должен дойти до ~1500. Лог: $days")
    }

    @Test
    fun `decay - один прогон job ограничен 30 процентами текущей разницы`() {
        // За один запуск (с любым количеством дней) rating не может сдвинуться
        // больше чем на 30% от gap = |rating - 1500|.
        val gap1900 = 1900 - 1500  // 400
        val maxDecay = (gap1900 * 0.30).toInt()  // 120
        val result = RatingDecay.decayedRating(1900, daysAgo(100000), now)
        assertEquals(1900 - maxDecay, result)
    }

    @Test
    fun `decay - монотонно уменьшается с ростом дней неактивности`() {
        val r100 = RatingDecay.decayedRating(1800, daysAgo(100), now)
        val r150 = RatingDecay.decayedRating(1800, daysAgo(150), now)
        val r200 = RatingDecay.decayedRating(1800, daysAgo(200), now)
        assertTrue(r100 > r150, "100д ($r100) > 150д ($r150)")
        assertTrue(r150 > r200, "150д ($r150) > 200д ($r200)")
    }
}
